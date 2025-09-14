// mobile/app/index.js
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { useRouter } from 'expo-router';

// This ensures the in-app browser can close and return to the app.
WebBrowser.maybeCompleteAuthSession();

const LoginPage = () => {
  const router = useRouter();

  // The core of the auth flow
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    // Make sure to use your ANDROID Client ID here.
    androidClientId: '1014910278236-h1i4nacegbj5h9ens1q41lmir6gns78q.apps.googleusercontent.com',
    // You can add your iOS client ID here for iOS support
    // iosClientId: 'YOUR_IOS_CLIENT_ID_HERE',
  });

  // This effect runs when the 'response' object changes.
  useEffect(() => {
    const handleAuth = async () => {
      if (response?.type === 'success') {
        const { id_token } = response.params;

        try {
          // Send the Google ID token to your backend
          const backendResponse = await axios.post(
            // Use your computer's network IP for the emulator/phone, not localhost
            'http://192.168.1.100:3001/api/auth/google/mobile',
            { idToken: id_token }
          );

          const { token } = backendResponse.data;

          // Store the session token securely
          await SecureStore.setItemAsync('authToken', token);

          // Navigate to the home screen
          router.replace('/home');

        } catch (error) {
          console.error('Backend auth error:', error.response?.data || error.message);
          alert('Authentication failed. Please try again.');
        }
      }
    };

    handleAuth();
  }, [response]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>My Notes App</Text>
        <Text style={styles.subtitle}>Your thoughts, organized and accessible.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => promptAsync()} // This triggers the Google Sign-In popup
          disabled={!request}
        >
          <Text style={styles.buttonText}>Sign in with Google</Text>
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
    color: '#FFFFFF',
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
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LoginPage;