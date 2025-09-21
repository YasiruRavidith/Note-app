// mobile/app/pin-setup.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Switch,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import axiosClient from '../src/api/axiosClient';
import crypto from 'crypto-js';

const PinSetupPage = () => {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [encryptionMode, setEncryptionMode] = useState('ui_lock'); // 'ui_lock' or 'zero_knowledge'
  const [isLoading, setIsLoading] = useState(false);
  const [pinStatus, setPinStatus] = useState(null);

  useEffect(() => {
    checkPinStatus();
  }, []);

  const checkPinStatus = async () => {
    try {
      const response = await axiosClient.get('/auth/pin/status');
      setPinStatus(response.data);
      if (response.data.encryptionMode) {
        setEncryptionMode(response.data.encryptionMode);
      }
    } catch (error) {
      console.error('Failed to check PIN status:', error);
    }
  };

  const handleSetupPin = async () => {
    if (!pin || !confirmPin) {
      Alert.alert('Error', 'Please enter and confirm your PIN');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('Error', 'PINs do not match');
      return;
    }

    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      Alert.alert('Error', 'PIN must be 4-6 digits');
      return;
    }

    if (encryptionMode === 'zero_knowledge') {
      Alert.alert(
        'Zero-Knowledge Encryption Warning',
        'With zero-knowledge encryption:\n\n• Your notes will be encrypted with your PIN\n• If you forget your PIN, your notes cannot be recovered\n• Even we cannot access your encrypted data\n\nAre you sure you want to continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'I Understand', onPress: () => setupPin() }
        ]
      );
    } else {
      setupPin();
    }
  };

  const setupPin = async () => {
    setIsLoading(true);
    try {
      let requestData = { pin, encryptionMode };

      // For zero-knowledge mode, generate a random salt
      if (encryptionMode === 'zero_knowledge') {
        const salt = crypto.lib.WordArray.random(32).toString();
        requestData.salt = salt;
        
        // Store PIN locally for client-side encryption
        await SecureStore.setItemAsync('userPIN', pin);
        await SecureStore.setItemAsync('encryptionSalt', salt);
      }

      const response = await axiosClient.post('/auth/pin/setup', requestData);
      
      console.log('✅ PIN setup successful:', response.data.message);
      
      Alert.alert(
        'Success', 
        response.data.message,
        [{ text: 'OK', onPress: () => router.replace('/home') }]
      );

    } catch (error) {
      console.error('PIN setup failed:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to setup PIN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip PIN Setup',
      'You can set up a PIN later in settings. Continue without PIN protection?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => router.replace('/home') }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Setup PIN</Text>
        <Text style={styles.subtitle}>
          {pinStatus?.hasPIN 
            ? 'Update your PIN and security settings'
            : 'Secure your notes with a PIN'
          }
        </Text>

        {/* Encryption Mode Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security Mode</Text>
          
          <TouchableOpacity 
            style={[styles.modeOption, encryptionMode === 'ui_lock' && styles.selectedMode]}
            onPress={() => setEncryptionMode('ui_lock')}
          >
            <View style={styles.modeContent}>
              <Text style={styles.modeTitle}>🔒 App Lock (Recommended)</Text>
              <Text style={styles.modeDescription}>
                PIN only locks the app interface. Notes are encrypted on our servers. 
                PIN can be reset via Google account recovery.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.modeOption, encryptionMode === 'zero_knowledge' && styles.selectedMode]}
            onPress={() => setEncryptionMode('zero_knowledge')}
          >
            <View style={styles.modeContent}>
              <Text style={styles.modeTitle}>🔐 Zero-Knowledge Encryption</Text>
              <Text style={styles.modeDescription}>
                Notes are encrypted with your PIN. Maximum security but PIN cannot be recovered if forgotten.
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* PIN Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Enter PIN (4-6 digits)</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            keyboardType="numeric"
            maxLength={6}
            secureTextEntry
            placeholder="Enter your PIN"
            placeholderTextColor="#6B7280"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Confirm PIN</Text>
          <TextInput
            style={styles.input}
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="numeric"
            maxLength={6}
            secureTextEntry
            placeholder="Confirm your PIN"
            placeholderTextColor="#6B7280"
          />
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={styles.setupButton}
          disabled={isLoading}
          onPress={handleSetupPin}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.setupButtonText}>
              {pinStatus?.hasPIN ? 'Update PIN' : 'Setup PIN'}
            </Text>
          )}
        </TouchableOpacity>

        {!pinStatus?.hasPIN && (
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 32,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1F2937',
    color: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modeOption: {
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#374151',
  },
  selectedMode: {
    borderColor: '#2563EB',
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  modeDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  setupButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  setupButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});

export default PinSetupPage;