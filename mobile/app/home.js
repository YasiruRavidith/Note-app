// mobile/app/home.js
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { syncService } from '../src/services/SyncService';
import axiosClient from '../src/api/axiosClient';
import { getCurrentUserId } from '../src/utils/authUtils';

const HomePage = () => {
  const router = useRouter();
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ isOnline: true, isSyncing: false });

  // Initialize sync service
  const initializeSyncService = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      if (!token) return false;

      // Get actual user ID from token
      const userId = await getCurrentUserId();
      if (!userId) {
        console.error('❌ Could not get user ID from token');
        return false;
      }
      
      console.log('🔧 Initializing sync service for user:', userId);
      await syncService.initialize(userId);
      
      // Set up sync event listeners
      syncService.addSyncListener((event, data) => {
        switch (event) {
          case 'noteCreated':
          case 'noteUpdated':
            loadNotesFromSync();
            break;
          case 'noteDeleted':
            setNotes(prev => prev.filter(note => note.id !== data));
            break;
          case 'syncStarted':
            setSyncStatus(prev => ({ ...prev, isSyncing: true }));
            break;
          case 'syncCompleted':
            setSyncStatus(prev => ({ ...prev, isSyncing: false }));
            loadNotesFromSync();
            break;
          case 'network':
            setSyncStatus(prev => ({ ...prev, isOnline: data.isOnline }));
            break;
          case 'conflict':
            Alert.alert(
              'Sync Conflict',
              'There are conflicting changes for a note. The local version has been preserved.',
              [{ text: 'OK' }]
            );
            break;
        }
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize sync service:', error);
      return false;
    }
  }, []);

  const loadNotesFromSync = async () => {
    try {
      const syncNotes = await syncService.getAllNotes();
      setNotes(syncNotes);
      console.log('📱 Loaded notes from sync service:', syncNotes.length);
    } catch (error) {
      console.error('❌ Failed to load notes from sync:', error);
    }
  };

  const fetchNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      await loadNotesFromSync();
    } catch (error) {
      console.error('❌ Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  // useFocusEffect is like useEffect, but it runs every time the screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      const checkAuthAndFetchNotes = async () => {
        try {
          // Check if we have an auth token
          const token = await SecureStore.getItemAsync('authToken');
          if (!token) {
            console.error('❌ No auth token found, redirecting to login');
            router.replace('/');
            return;
          }

          // Check if app is unlocked (if PIN is configured)
          const isUnlocked = await SecureStore.getItemAsync('appUnlocked');
          
          // Check PIN status to see if PIN is required
          try {
            const response = await axiosClient.get('/auth/pin/status');
            if (response.data.hasPIN && isUnlocked !== 'true') {
              console.log('🔒 PIN required, redirecting to unlock...');
              router.replace('/pin-unlock');
              return;
            }
          } catch (error) {
            console.error('Failed to check PIN status:', error);
          }

          console.log('🔐 Auth token found and app unlocked, initializing sync...');
          setIsLoading(true);
          
          // Initialize sync service instead of direct API call
          const syncInitialized = await initializeSyncService();
          if (syncInitialized) {
            console.log('✅ Sync service initialized, loading notes...');
            await fetchNotes();
          } else {
            console.log('⚠️ Sync service failed to initialize, falling back to direct API...');
            // Fallback to direct API call if sync service fails
            try {
              const response = await axiosClient.get('/notes');
              setNotes(response.data);
              console.log('✅ Notes fetched via fallback API:', response.data.length);
            } catch (error) {
              console.error('❌ Fallback API also failed:', error);
              alert('Could not load notes. Check your connection.');
            }
          }
        } catch (error) {
          console.error('❌ Error checking auth token:', error);
          router.replace('/');
        }
      };
      
      checkAuthAndFetchNotes();
    }, [router, initializeSyncService, fetchNotes])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (syncStatus.isOnline && syncService.isInitialized) {
        console.log('🔄 Manual refresh - forcing sync');
        await syncService.forcSync();
      } else if (!syncStatus.isOnline && syncService.userId) {
        console.log('🔄 Manual refresh - attempting reconnection');
        await syncService.forceReconnect();
        // Also load from local storage while reconnecting
        await fetchNotes();
      } else {
        console.log('📱 Manual refresh - loading from local storage');
        await fetchNotes();
      }
    } catch (error) {
      console.error('❌ Failed to refresh:', error);
      // Still try to load local notes on error
      await fetchNotes();
    } finally {
      setRefreshing(false);
    }
  }, [syncStatus.isOnline, fetchNotes]);
  
  const handleLogout = async () => {
    try {
      // Cleanup sync service
      if (syncService.isInitialized) {
        syncService.cleanup();
      }
      
      // Clear all stored data
      await SecureStore.deleteItemAsync('authToken');
      await SecureStore.deleteItemAsync('appUnlocked');
      await SecureStore.deleteItemAsync('userPIN');
      await SecureStore.deleteItemAsync('encryptionSalt');
      
      console.log('🔓 Logged out successfully');
      router.replace('/');
    } catch (error) {
      console.error('❌ Logout error:', error);
      router.replace('/');
    }
  };

  const renderNote = ({ item }) => (
    <TouchableOpacity 
      style={styles.noteCard}
      onPress={() => router.push({
        pathname: '/note-edit',
        params: { 
          noteId: item.id, 
          title: item.title, 
          content: item.content 
        }
      })}
    >
      <Text style={styles.noteTitle}>{item.title}</Text>
      <Text style={styles.noteContent} numberOfLines={3}>
        {item.content || 'No content'}
      </Text>
      <View style={styles.noteFooter}>
        <Text style={styles.noteDate}>
          {new Date(item.updatedAt || item.createdAt).toLocaleDateString()}
        </Text>
        <Text style={styles.editHint}>Tap to edit</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
         <View>
           <Text style={styles.headerTitle}>My Notes</Text>
           <View style={styles.syncStatus}>
             <View style={[styles.statusDot, { backgroundColor: syncStatus.isOnline ? '#10B981' : '#EF4444' }]} />
             <Text style={styles.syncStatusText}>
               {syncStatus.isSyncing ? 'Syncing...' : syncStatus.isOnline ? 'Online' : 'Offline'}
             </Text>
           </View>
         </View>
         <View style={styles.headerRight}>
           <TouchableOpacity 
             style={styles.addButton}
             onPress={() => router.push('/note-edit?noteId=new')}
           >
             <Text style={styles.addButtonText}>+ New</Text>
           </TouchableOpacity>
           <TouchableOpacity onPress={handleLogout}>
              <Text style={styles.logoutButton}>Logout</Text>
           </TouchableOpacity>
         </View>
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
  syncStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  syncStatusText: { fontSize: 12, color: '#9CA3AF' }, // text-gray-400
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  addButton: { 
    backgroundColor: '#3B82F6', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 6,
    marginRight: 12
  },
  addButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  logoutButton: { fontSize: 16, color: '#EF4444' }, // text-red-500
  listContainer: { paddingHorizontal: 16, paddingTop: 8 },
  noteCard: { 
    backgroundColor: '#1F2937', 
    padding: 16, 
    borderRadius: 8, 
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2
  },
  noteTitle: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 4 },
  noteContent: { fontSize: 14, color: '#D1D5DB', lineHeight: 20, marginBottom: 8 },
  noteFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151'
  },
  noteDate: { fontSize: 12, color: '#6B7280' },
  editHint: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  emptyText: { color: '#9CA3AF', textAlign: 'center', marginTop: 50 }, // text-gray-400
});

export default HomePage;