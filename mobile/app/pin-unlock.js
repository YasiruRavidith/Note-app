// mobile/app/pin-unlock.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import axiosClient from '../src/api/axiosClient';

const PinUnlockPage = () => {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [encryptionMode, setEncryptionMode] = useState(null);

  const checkPinStatus = useCallback(async () => {
    try {
      const response = await axiosClient.get('/auth/pin/status');
      setEncryptionMode(response.data.encryptionMode);
      
      if (!response.data.hasPIN) {
        // No PIN configured, go to home
        router.replace('/home');
      }
    } catch (error) {
      console.error('Failed to check PIN status:', error);
      // If we can't check status, assume they need to login again
      router.replace('/');
    }
  }, [router]);

  useEffect(() => {
    checkPinStatus();
  }, [checkPinStatus]);

  const handleUnlock = async () => {
    if (!pin) {
      Alert.alert('Error', 'Please enter your PIN');
      return;
    }

    setIsLoading(true);
    try {
      console.log('🔐 Attempting PIN verification...');
      const response = await axiosClient.post('/auth/pin/verify', { pin });
      
      if (response.data.success) {
        if (response.data.encryptionMode === 'zero_knowledge') {
          // Store the salt for client-side encryption/decryption
          if (response.data.salt) {
            await SecureStore.setItemAsync('encryptionSalt', response.data.salt);
            await SecureStore.setItemAsync('userPIN', pin);
          }
        }
        
        // Mark app as unlocked
        await SecureStore.setItemAsync('appUnlocked', 'true');
        
        console.log('✅ PIN verification successful');
        router.replace('/home');
      }
    } catch (error) {
      console.error('❌ PIN verification failed:', error);
      console.error('Response status:', error.response?.status);
      console.error('Response data:', error.response?.data);
      console.error('Full error:', error.message);
      
      let errorMessage = 'Invalid PIN';
      if (error.response?.status === 401) {
        errorMessage = 'Invalid PIN or no PIN configured';
      } else if (error.response?.status === 400) {
        errorMessage = error.response?.data?.message || 'Bad request';
      } else if (!error.response) {
        errorMessage = 'Network error - check your connection';
      }
      
      Alert.alert('PIN Error', errorMessage);
      setPin(''); // Clear PIN on failure
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? You will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            try {
              await SecureStore.deleteItemAsync('authToken');
              await SecureStore.deleteItemAsync('appUnlocked');
              await SecureStore.deleteItemAsync('userPIN');
              await SecureStore.deleteItemAsync('encryptionSalt');
              router.replace('/');
            } catch (error) {
              console.error('Logout error:', error);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>🔒</Text>
        <Text style={styles.subtitle}>Enter PIN to unlock</Text>
        
        {encryptionMode && (
          <Text style={styles.modeInfo}>
            {encryptionMode === 'zero_knowledge' 
              ? '🔐 Zero-knowledge encryption active'
              : '🔒 App lock active'
            }
          </Text>
        )}

        <TextInput
          style={styles.input}
          value={pin}
          onChangeText={setPin}
          keyboardType="numeric"
          maxLength={6}
          secureTextEntry
          placeholder="Enter your PIN"
          placeholderTextColor="#6B7280"
          autoFocus
        />

        <TouchableOpacity
          style={styles.unlockButton}
          disabled={isLoading || !pin}
          onPress={handleUnlock}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.unlockButtonText}>Unlock</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.setupButton} 
          onPress={() => router.replace('/pin-setup')}
        >
          <Text style={styles.setupButtonText}>Setup PIN Instead</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
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
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 64,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  modeInfo: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1F2937',
    color: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: '#374151',
    width: 200,
    marginBottom: 24,
  },
  unlockButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 120,
    marginBottom: 16,
  },
  unlockButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  setupButton: {
    backgroundColor: '#374151',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  setupButtonText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  logoutButtonText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});

export default PinUnlockPage;