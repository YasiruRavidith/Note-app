// mobile/src/services/SyncService.js
import { inMemoryStorage } from './InMemoryStorage';
import axiosClient from '../api/axiosClient';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { generateId } from '../utils/idGenerator';

class SyncService {
  constructor() {
    this.socket = null;
    this.isOnline = true;
    this.isSyncing = false;
    this.syncListeners = [];
    this.userId = null;
    this.deviceId = null;
    
    // Auto-sync configuration
    this.autoSyncEnabled = true;
    this.syncInterval = 30000; // 30 seconds
    this.syncTimer = null;
    
    this.initializeNetworkListener();
  }

  // ========== INITIALIZATION ==========

  async initialize(userId, deviceId) {
    console.log('🔧 Initializing SyncService for user:', userId);
    this.userId = userId;
    this.deviceId = deviceId || await this.getOrCreateDeviceId();
    
    await inMemoryStorage.initialize();
    console.log('📱 InMemoryStorage initialized');
    
    // Always initialize socket connection
    await this.initializeSocket();
    
    // Always try to perform initial sync
    console.log('🌐 Attempting initial sync...');
    try {
      await this.performFullSync();
      console.log('✅ Initial sync completed');
    } catch (error) {
      console.log('⚠️ Initial sync failed, will retry when online:', error.message);
    }
    
    this.startAutoSync();
    console.log('✅ Sync service initialized successfully');
  }

  async getOrCreateDeviceId() {
    let deviceId = await SecureStore.getItemAsync('deviceId');
    if (!deviceId) {
      deviceId = generateId();
      await SecureStore.setItemAsync('deviceId', deviceId);
    }
    return deviceId;
  }

  initializeNetworkListener() {
    // Simple network detection using Socket.IO connection status
    // This will be updated when socket connects/disconnects
    console.log('📶 Network listener initialized (Socket.IO based)');
    
    // Initial network state (assume online)
    this.isOnline = true;
    this.notifyListeners('network', { isOnline: this.isOnline });
  }

  // ========== SOCKET.IO REAL-TIME SYNC ==========

  async initializeSocket() {
    if (this.socket?.connected) return;

    try {
      // Disconnect existing socket if any
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }

      console.log('🔌 Creating new Socket.IO connection...');
      this.socket = io('http://192.168.1.103:3001', {
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        timeout: 5000
      });

      this.socket.on('connect', () => {
        console.log('🔗 Connected to real-time sync');
        const wasOffline = !this.isOnline;
        this.isOnline = true;
        this.notifyListeners('network', { isOnline: this.isOnline });
        
        if (wasOffline) {
          console.log('📶 Network reconnected via socket, starting sync...');
          this.performFullSync();
        }
        
        this.registerDevice();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('📴 Disconnected from real-time sync, reason:', reason);
        this.isOnline = false;
        this.notifyListeners('network', { isOnline: this.isOnline });
        
        // Try to reconnect after a delay if not manually disconnected
        if (reason !== 'io client disconnect') {
          console.log('🔄 Will attempt to reconnect...');
          setTimeout(() => {
            if (!this.socket?.connected) {
              console.log('🔄 Attempting socket reconnection...');
              this.initializeSocket();
            }
          }, 3000);
        }
      });

      // Listen for real-time note updates
      this.socket.on('note:created', this.handleRemoteNoteCreated.bind(this));
      this.socket.on('note:updated', this.handleRemoteNoteUpdated.bind(this));
      this.socket.on('note:deleted', this.handleRemoteNoteDeleted.bind(this));

      // Listen for sync responses
      this.socket.on('sync-response', this.handleSyncResponse.bind(this));
      
      // Listen for device updates
      this.socket.on('devices-updated', this.handleDevicesUpdated.bind(this));

      this.socket.on('error', (error) => {
        console.error('Socket error:', error);
      });

    } catch (error) {
      console.error('Failed to initialize socket:', error);
    }
  }

  registerDevice() {
    if (!this.socket || !this.userId) return;
    
    this.socket.emit('register-device', {
      userId: this.userId,
      deviceId: this.deviceId,
      deviceName: this.getDeviceName(),
      deviceType: 'mobile'
    });
  }

  getDeviceName() {
    // You can enhance this with actual device info
    return 'Mobile Device';
  }

  disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ========== REAL-TIME EVENT HANDLERS ==========

  async handleRemoteNoteCreated(data) {
    try {
      await inMemoryStorage.saveNote(data.note, 'synced');
      this.notifyListeners('noteCreated', data.note);
      console.log('📝 Remote note created:', data.note.title);
    } catch (error) {
      console.error('Failed to handle remote note creation:', error);
    }
  }

  async handleRemoteNoteUpdated(data) {
    try {
      const localNote = await inMemoryStorage.getNoteById(data.note.id);
      
      if (!localNote) {
        // Note doesn't exist locally, just save it
        await inMemoryStorage.saveNote(data.note, 'synced');
      } else if (localNote.syncStatus === 'pending') {
        // Local changes pending, mark as conflict
        await inMemoryStorage.markNoteConflicted(data.note.id);
        this.notifyListeners('conflict', { localNote, remoteNote: data.note });
        return;
      } else {
        // No local changes, apply remote update
        await inMemoryStorage.saveNote(data.note, 'synced');
      }
      
      this.notifyListeners('noteUpdated', data.note);
      console.log('✏️ Remote note updated:', data.note.title);
    } catch (error) {
      console.error('Failed to handle remote note update:', error);
    }
  }

  async handleRemoteNoteDeleted(data) {
    try {
      const localNote = await inMemoryStorage.getNoteById(data.noteId);
      
      if (localNote && localNote.syncStatus === 'pending') {
        // Local changes pending, mark as conflict
        await inMemoryStorage.markNoteConflicted(data.noteId);
        return;
      }
      
      await inMemoryStorage.deleteNote(data.noteId, true);
      await inMemoryStorage.markNoteSynced(data.noteId);
      this.notifyListeners('noteDeleted', data.noteId);
      console.log('🗑️ Remote note deleted');
    } catch (error) {
      console.error('Failed to handle remote note deletion:', error);
    }
  }

  async handleSyncResponse(data) {
    console.log(`🔄 Sync response: ${data.notes.length} notes received`);
    await this.applySyncResponse(data);
  }

  handleDevicesUpdated(data) {
    this.notifyListeners('devicesUpdated', data.devices);
  }

  // ========== OFFLINE OPERATIONS ==========

  async createNote(noteData) {
    const note = {
      id: generateId(),
      title: noteData.title || 'Untitled',
      content: noteData.content || '',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...noteData
    };

    // Save locally first
    await inMemoryStorage.saveNote(note, 'pending');
    
    if (this.isOnline) {
      // Try to sync immediately
      try {
        const response = await axiosClient.post('/notes', {
          id: note.id,
          title: note.title,
          content: note.content
        });
        
        // Update with server response
        await inMemoryStorage.saveNote(response.data, 'synced');
        this.notifyListeners('noteCreated', response.data);
        return response.data;
      } catch (error) {
        console.log('Failed to sync note creation, will retry later:', error.message);
        await inMemoryStorage.addToSyncQueue('create', note.id, note);
      }
    } else {
      // Add to sync queue for when we're back online
      await inMemoryStorage.addToSyncQueue('create', note.id, note);
    }
    
    this.notifyListeners('noteCreated', note);
    return note;
  }

  async updateNote(noteId, updates) {
    const localNote = await inMemoryStorage.getNoteById(noteId);
    if (!localNote) {
      throw new Error('Note not found');
    }

    const updatedNote = {
      ...localNote,
      ...updates,
      updatedAt: new Date().toISOString(),
      version: localNote.version + 1
    };

    // Save locally first
    await inMemoryStorage.saveNote(updatedNote, 'pending');

    if (this.isOnline) {
      // Try to sync immediately
      try {
        const response = await axiosClient.put(`/notes/${noteId}`, {
          title: updatedNote.title,
          content: updatedNote.content,
          clientVersion: localNote.version
        });
        
        await inMemoryStorage.saveNote(response.data, 'synced');
        this.notifyListeners('noteUpdated', response.data);
        return response.data;
      } catch (error) {
        if (error.response?.status === 409) {
          // Version conflict
          await inMemoryStorage.markNoteConflicted(noteId);
          this.notifyListeners('conflict', { 
            localNote: updatedNote, 
            remoteNote: error.response.data.serverNote 
          });
          return updatedNote;
        }
        
        console.log('Failed to sync note update, will retry later:', error.message);
        await inMemoryStorage.addToSyncQueue('update', noteId, updatedNote);
      }
    } else {
      // Add to sync queue
      await inMemoryStorage.addToSyncQueue('update', noteId, updatedNote);
    }

    this.notifyListeners('noteUpdated', updatedNote);
    return updatedNote;
  }

  async deleteNote(noteId) {
    const localNote = await inMemoryStorage.getNoteById(noteId);
    if (!localNote) return;

    // Mark as deleted locally
    await inMemoryStorage.deleteNote(noteId, true);

    if (this.isOnline) {
      // Try to sync immediately
      try {
        await axiosClient.delete(`/notes/${noteId}`);
        await inMemoryStorage.markNoteSynced(noteId);
      } catch (error) {
        console.log('Failed to sync note deletion, will retry later:', error.message);
        await inMemoryStorage.addToSyncQueue('delete', noteId, { id: noteId });
      }
    } else {
      // Add to sync queue
      await inMemoryStorage.addToSyncQueue('delete', noteId, { id: noteId });
    }

    this.notifyListeners('noteDeleted', noteId);
  }

  // ========== SYNC OPERATIONS ==========

  async performFullSync() {
    if (!this.isOnline || this.isSyncing) return;

    this.isSyncing = true;
    this.notifyListeners('syncStarted');

    try {
      console.log('🔄 Starting full sync...');
      
      // 1. Process pending sync queue
      await this.processSyncQueue();
      
      // 2. Request server sync with last sync time
      const lastSyncTime = await inMemoryStorage.getLastSyncTime();
      
      if (this.socket && this.socket.connected) {
        this.socket.emit('sync-request', {
          userId: this.userId,
          lastSyncTime
        });
      } else {
        // Fallback to HTTP sync
        await this.performHttpSync(lastSyncTime);
      }
      
      await inMemoryStorage.setLastSyncTime(new Date().toISOString());
      console.log('✅ Full sync completed');
      
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      this.notifyListeners('syncError', error);
    } finally {
      this.isSyncing = false;
      this.notifyListeners('syncCompleted');
    }
  }

  async applySyncResponse(data) {
    try {
      console.log(`📊 Processing ${data.notes.length} notes from sync response`);
      
      for (const serverNote of data.notes) {
        const localNote = await inMemoryStorage.getNoteById(serverNote.id);
        
        if (!localNote) {
          // New note from server
          console.log('📝 Adding new note from server:', serverNote.title);
          await inMemoryStorage.saveNote(serverNote, 'synced');
          this.notifyListeners('noteCreated', serverNote);
        } else if (localNote.syncStatus !== 'pending') {
          // Update existing note (no local changes)
          console.log('✏️ Updating existing note from server:', serverNote.title);
          await inMemoryStorage.saveNote(serverNote, 'synced');
          this.notifyListeners('noteUpdated', serverNote);
        } else {
          console.log('⏸️ Skipping note with pending changes:', serverNote.title);
        }
        // Skip notes with pending local changes to avoid conflicts
      }
      
      if (data.syncTime) {
        await inMemoryStorage.setLastSyncTime(data.syncTime);
      }
    } catch (error) {
      console.error('Failed to apply sync response:', error);
    }
  }

  async performHttpSync(lastSyncTime) {
    try {
      const response = await axiosClient.get('/notes', {
        params: lastSyncTime ? { since: lastSyncTime } : {}
      });
      
      await this.applySyncResponse({
        notes: response.data,
        syncTime: new Date().toISOString()
      });
    } catch (error) {
      console.error('HTTP sync failed:', error);
      throw error;
    }
  }

  async processSyncQueue() {
    const queueItems = await inMemoryStorage.getSyncQueue();
    
    for (const item of queueItems) {
      try {
        const data = JSON.parse(item.data);
        
        switch (item.operation_type) {
          case 'create':
            await axiosClient.post('/notes', {
              id: data.id,
              title: data.title,
              content: data.content
            });
            await inMemoryStorage.markNoteSynced(item.note_id);
            break;
            
          case 'update':
            await axiosClient.put(`/notes/${item.note_id}`, {
              title: data.title,
              content: data.content,
              clientVersion: data.version - 1
            });
            await inMemoryStorage.markNoteSynced(item.note_id);
            break;
            
          case 'delete':
            await axiosClient.delete(`/notes/${item.note_id}`);
            await inMemoryStorage.markNoteSynced(item.note_id);
            break;
        }
        
        await inMemoryStorage.markSyncItemCompleted(item.id);
        console.log(`✅ Synced ${item.operation_type} operation for note ${item.note_id}`);
        
      } catch (error) {
        console.error(`❌ Failed to sync ${item.operation_type} operation:`, error);
        await inMemoryStorage.markSyncItemFailed(item.id, item.retry_count);
      }
    }
  }

  // ========== AUTO SYNC ==========

  startAutoSync() {
    if (this.syncTimer) return;
    
    this.syncTimer = setInterval(() => {
      if (this.autoSyncEnabled && this.isOnline && !this.isSyncing) {
        this.performFullSync();
      }
    }, this.syncInterval);
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // ========== EVENT LISTENERS ==========

  addSyncListener(callback) {
    this.syncListeners.push(callback);
  }

  removeSyncListener(callback) {
    const index = this.syncListeners.indexOf(callback);
    if (index > -1) {
      this.syncListeners.splice(index, 1);
    }
  }

  notifyListeners(event, data) {
    this.syncListeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    });
  }

  // ========== PUBLIC API ==========

  async getAllNotes() {
    return await inMemoryStorage.getAllNotes();
  }

  // Force sync method for manual refresh
  async forcSync() {
    console.log('🔄 Force sync requested');
    await this.performFullSync();
  }

  // Force reconnection method
  async forceReconnect() {
    console.log('🔄 Force reconnection requested');
    this.disconnectSocket();
    await this.initializeSocket();
    
    // Attempt sync after reconnection
    setTimeout(async () => {
      if (this.socket?.connected) {
        console.log('🔄 Performing sync after reconnection');
        await this.performFullSync();
      }
    }, 1000);
  }

  // Check if service is initialized
  get isInitialized() {
    return !!this.userId && this.socket && this.socket.connected;
  }

  async getNoteById(id) {
    return await inMemoryStorage.getNoteById(id);
  }

  async getSyncStats() {
    const stats = await inMemoryStorage.getDatabaseStats();
    return {
      ...stats,
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: await inMemoryStorage.getLastSyncTime()
    };
  }

  // Cleanup
  async cleanup() {
    this.stopAutoSync();
    this.disconnectSocket();
    await inMemoryStorage.clearOldData();
  }
}

// Export singleton instance
export const syncService = new SyncService();
