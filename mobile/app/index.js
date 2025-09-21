import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

// This is a placeholder for your actual API client.
// In a real app, you would import this from a shared file like 'src/api/axiosClient.js'
// Mobile apps running on physical devices/emulators can't access localhost
// We need to use the network IP address for the mobile app
const apiClient = axios.create({
  baseURL: 'http://192.168.1.103:3001/api',
});

const LoginPage = () => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const router = useRouter();

  // Configure the native Google Sign-In library. This only needs to run once.
  useEffect(() => {
    try {
      GoogleSignin.configure({
        // This must be the WEB client ID from Firebase project
        webClientId: '78446388913-eb4vmk5tf4dgn439rmj549ogcl67bh0j.apps.googleusercontent.com',
        // Request ID token for backend verification
        offlineAccess: true,
        // Ensure we get fresh tokens
        forceCodeForRefreshToken: true,
      });
      console.log('✅ Google Sign-In configured with project 78446388913');
      console.log('🔑 Web Client ID: 78446388913-eb4vmk5tf4dgn439rmj549ogcl67bh0j.apps.googleusercontent.com');
    } catch (error) {
      console.error('❌ Failed to configure Google Sign-In:', error);
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      console.log('🔄 Starting Google Sign-In process...');
      
      // Check if the user has Google Play Services installed on their phone.
      await GoogleSignin.hasPlayServices();
      console.log('✅ Google Play Services available');

      // Sign out any existing user first to force account picker
      try {
        await GoogleSignin.signOut();
        console.log('🔄 Signed out previous user to force account picker');
      } catch (_signOutError) {
        // It's okay if there's no user to sign out
        console.log('ℹ️ No previous user to sign out');
      }

      // This opens the native Android account picker UI.
      const userInfo = await GoogleSignin.signIn();
      console.log('📱 Full sign-in response:', JSON.stringify(userInfo, null, 2));
      
      // Check multiple possible locations for the ID token
      const idToken = userInfo.idToken || 
                     userInfo.data?.idToken || 
                     userInfo.serverAuthCode ||
                     userInfo.user?.idToken;
      
      console.log('🔑 ID Token found:', !!idToken);
      console.log('🔍 Available properties:', Object.keys(userInfo));
      
      if (userInfo.user) {
        console.log('👤 User properties:', Object.keys(userInfo.user));
      }

      if (!idToken) {
        console.error('❌ No ID token found in response');
        console.error('Full userInfo object:', userInfo);
        throw new Error('Failed to get ID token from Google. Check Firebase configuration.');
      }

      console.log('📤 Sending token to backend...');
      // Send the token to your backend for verification and to create a session.
      const backendResponse = await apiClient.post(
        '/auth/google/mobile',
        { idToken }
      );

      console.log('✅ Backend response received');
      const { token } = backendResponse.data;
      await SecureStore.setItemAsync('authToken', token);

      console.log('🎉 Authentication successful! Navigating to home...');
      // If everything is successful, navigate to the main app screen.
      router.replace('/home');

    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled the login flow - this is not an actual error, so we do nothing.
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // Operation is in progress already.
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play services is not available or outdated.');
      } else {
        // For all other errors, log them and show a generic message to the user.
        console.error('Native Google Sign-In Error:', error);
        Alert.alert('Login Error', 'An error occurred during sign-in. Please try again.');
      }
    } finally {
      // Ensure the loading indicator is turned off regardless of success or failure.
      setIsAuthenticating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>My Notes App</Text>
        <Text style={styles.subtitle}>Your thoughts, organized and accessible.</Text>
        <TouchableOpacity
          style={styles.button}
          disabled={isAuthenticating}
          onPress={handleGoogleSignIn}
        >
          {isAuthenticating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign in with Google</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111827',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 40,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 18,
        color: '#9CA3AF',
        marginBottom: 32,
        textAlign: 'center',
    },
    button: {
        backgroundColor: '#2563EB',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 8,
        elevation: 5,
        minWidth: 220,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default LoginPage;