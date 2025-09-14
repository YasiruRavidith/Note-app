// mobile/app/home.js
import React from 'react';
import { View, Text, Button, SafeAreaView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const HomePage = () => {
  const router = useRouter();

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('authToken');
    router.replace('/'); // Go back to login and replace history
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Your Notes!</Text>
        <Button title="Logout" onPress={handleLogout} color="#F43F5E" />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1F2937' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, color: 'white', marginBottom: 20 }
})

export default HomePage;