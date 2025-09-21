// mobile/app/home.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import axiosClient from '../src/api/axiosClient'; // Use our new client

const HomePage = () => {
  const router = useRouter();
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotes = async () => {
    try {
      console.log('📝 Fetching notes from backend...');
      const response = await axiosClient.get('/notes');
      console.log('✅ Notes fetched successfully:', response.data.length, 'notes');
      setNotes(response.data);
    } catch (error) {
      console.error('❌ Failed to fetch notes:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      alert('Could not fetch notes. Check console for details.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // useFocusEffect is like useEffect, but it runs every time the screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      const checkAuthAndFetchNotes = async () => {
        try {
          // Check if we have an auth token
          const token = await SecureStore.getItemAsync('authToken');
          if (token) {
            console.log('🔐 Auth token found, fetching notes...');
            setIsLoading(true);
            fetchNotes();
          } else {
            console.error('❌ No auth token found, redirecting to login');
            router.replace('/');
          }
        } catch (error) {
          console.error('❌ Error checking auth token:', error);
          router.replace('/');
        }
      };
      
      checkAuthAndFetchNotes();
    }, [router])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotes();
  };
  
  const handleLogout = () => {
    // We can't really log out, so just go back to the login screen for now.
    router.replace('/');
  };

  const renderNote = ({ item }) => (
    <View style={styles.noteCard}>
      <Text style={styles.noteTitle}>{item.title}</Text>
      <Text style={styles.noteContent}>{item.content}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
         <Text style={styles.headerTitle}>My Notes</Text>
         <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutButton}>Logout</Text>
         </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color="#FFFFFF" />
      ) : (
        <FlatList
          data={notes}
          renderItem={renderNote}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.emptyText}>No notes found. Create one on the web app!</Text>}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' }, // bg-gray-900
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  logoutButton: { fontSize: 16, color: '#3B82F6' }, // text-blue-500
  listContainer: { paddingHorizontal: 16, paddingTop: 8 },
  noteCard: { backgroundColor: '#1F2937', padding: 16, borderRadius: 8, marginBottom: 12 }, // bg-gray-800
  noteTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  noteContent: { fontSize: 14, color: '#D1D5DB', marginTop: 4 }, // text-gray-300
  emptyText: { color: '#9CA3AF', textAlign: 'center', marginTop: 50 }, // text-gray-400
});

export default HomePage;