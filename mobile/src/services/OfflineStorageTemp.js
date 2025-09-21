// mobile/src/services/OfflineStorageTemp.js
// Temporary AsyncStorage-based offline storage while we set up SQLite properly

import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../utils/idGenerator';

class OfflineStorageTemp {
  constructor() {
    this.storageKeys = {
      notes: '@notes',
      syncQueue: '@syncQueue',
      lastSync: '@lastSync',
      metadata: '@metadata'
    };
  }

  // Initialize storage
  async initialize() {
    try {
      console.log('📱 Initializing temporary AsyncStorage-based offline storage...');
      
      // Ensure basic structure exists
      const notes = await this.getAllNotes();
      const syncQueue = await this.getSyncQueue();
      
      console.log('✅ Temporary offline storage initialized');
      console.log(`📊 Notes: ${notes.length}, Sync Queue: ${syncQueue.length}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize temporary offline storage:', error);
      throw error;
    }
  }

  // Note operations
  async createNote(noteData) {
    try {
      const note = {
        id: noteData.id || generateId(),
        title: noteData.title || 'Untitled',
        content: noteData.content || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        isDeleted: false,
        localOnly: true // Mark as local until synced
      };

      const notes = await this.getAllNotes();
      notes.push(note);
      await AsyncStorage.setItem(this.storageKeys.notes, JSON.stringify(notes));

      // Add to sync queue
      await this.addToSyncQueue({
        operation: 'create',
        noteId: note.id,
        data: note,
        timestamp: Date.now()
      });

      console.log('📝 Note created locally:', note.id);
      return note;
    } catch (error) {
      console.error('❌ Failed to create note:', error);
      throw error;
    }
  }

  async updateNote(noteId, updates) {
    try {
      const notes = await this.getAllNotes();
      const noteIndex = notes.findIndex(n => n.id === noteId);
      
      if (noteIndex === -1) {
        throw new Error(`Note not found: ${noteId}`);
      }

      const existingNote = notes[noteIndex];
      const updatedNote = {
        ...existingNote,
        ...updates,
        updatedAt: new Date().toISOString(),
        version: (existingNote.version || 1) + 1
      };

      notes[noteIndex] = updatedNote;
      await AsyncStorage.setItem(this.storageKeys.notes, JSON.stringify(notes));

      // Add to sync queue
      await this.addToSyncQueue({
        operation: 'update',
        noteId: noteId,
        data: updatedNote,
        timestamp: Date.now()
      });

      console.log('✏️ Note updated locally:', noteId);
      return updatedNote;
    } catch (error) {
      console.error('❌ Failed to update note:', error);
      throw error;
    }
  }

  async deleteNote(noteId) {
    try {
      const notes = await this.getAllNotes();
      const noteIndex = notes.findIndex(n => n.id === noteId);
      
      if (noteIndex === -1) {
        throw new Error(`Note not found: ${noteId}`);
      }

      // Mark as deleted instead of removing
      notes[noteIndex] = {
        ...notes[noteIndex],
        isDeleted: true,
        updatedAt: new Date().toISOString()
      };

      await AsyncStorage.setItem(this.storageKeys.notes, JSON.stringify(notes));

      // Add to sync queue
      await this.addToSyncQueue({
        operation: 'delete',
        noteId: noteId,
        timestamp: Date.now()
      });

      console.log('🗑️ Note deleted locally:', noteId);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete note:', error);
      throw error;
    }
  }

  async getNote(noteId) {
    try {
      const notes = await this.getAllNotes();
      const note = notes.find(n => n.id === noteId && !n.isDeleted);
      return note || null;
    } catch (error) {
      console.error('❌ Failed to get note:', error);
      return null;
    }
  }

  async getAllNotes() {
    try {
      const notesJson = await AsyncStorage.getItem(this.storageKeys.notes);
      const notes = notesJson ? JSON.parse(notesJson) : [];
      
      // Filter out deleted notes
      return notes.filter(note => !note.isDeleted);
    } catch (error) {
      console.error('❌ Failed to get all notes:', error);
      return [];
    }
  }

  // Sync queue operations
  async addToSyncQueue(operation) {
    try {
      const queue = await this.getSyncQueue();
      queue.push(operation);
      await AsyncStorage.setItem(this.storageKeys.syncQueue, JSON.stringify(queue));
    } catch (error) {
      console.error('❌ Failed to add to sync queue:', error);
    }
  }

  async getSyncQueue() {
    try {
      const queueJson = await AsyncStorage.getItem(this.storageKeys.syncQueue);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      console.error('❌ Failed to get sync queue:', error);
      return [];
    }
  }

  async clearSyncQueue() {
    try {
      await AsyncStorage.setItem(this.storageKeys.syncQueue, JSON.stringify([]));
    } catch (error) {
      console.error('❌ Failed to clear sync queue:', error);
    }
  }

  async removeFromSyncQueue(operationId) {
    try {
      const queue = await this.getSyncQueue();
      const filteredQueue = queue.filter((op, index) => index !== operationId);
      await AsyncStorage.setItem(this.storageKeys.syncQueue, JSON.stringify(filteredQueue));
    } catch (error) {
      console.error('❌ Failed to remove from sync queue:', error);
    }
  }

  // Server sync operations
  async syncNoteFromServer(serverNote) {
    try {
      const notes = await this.getAllNotes();
      const existingIndex = notes.findIndex(n => n.id === serverNote.id);

      const transformedNote = {
        id: serverNote.id,
        title: serverNote.title,
        content: serverNote.content,
        createdAt: serverNote.createdAt,
        updatedAt: serverNote.updatedAt,
        version: serverNote.version || 1,
        isDeleted: false,
        localOnly: false // Mark as synced
      };

      if (existingIndex >= 0) {
        notes[existingIndex] = transformedNote;
      } else {
        notes.push(transformedNote);
      }

      await AsyncStorage.setItem(this.storageKeys.notes, JSON.stringify(notes));
      console.log('🔄 Note synced from server:', serverNote.id);
      
      return transformedNote;
    } catch (error) {
      console.error('❌ Failed to sync note from server:', error);
      throw error;
    }
  }

  async markNoteSynced(noteId) {
    try {
      const notes = await this.getAllNotes();
      const noteIndex = notes.findIndex(n => n.id === noteId);
      
      if (noteIndex >= 0) {
        notes[noteIndex].localOnly = false;
        await AsyncStorage.setItem(this.storageKeys.notes, JSON.stringify(notes));
      }
    } catch (error) {
      console.error('❌ Failed to mark note as synced:', error);
    }
  }

  // Metadata operations
  async getLastSyncTime() {
    try {
      const lastSync = await AsyncStorage.getItem(this.storageKeys.lastSync);
      return lastSync ? parseInt(lastSync) : 0;
    } catch (error) {
      console.error('❌ Failed to get last sync time:', error);
      return 0;
    }
  }

  async setLastSyncTime(timestamp) {
    try {
      await AsyncStorage.setItem(this.storageKeys.lastSync, timestamp.toString());
    } catch (error) {
      console.error('❌ Failed to set last sync time:', error);
    }
  }

  // Cleanup
  async clearAllData() {
    try {
      await AsyncStorage.multiRemove([
        this.storageKeys.notes,
        this.storageKeys.syncQueue,
        this.storageKeys.lastSync,
        this.storageKeys.metadata
      ]);
      console.log('🧹 All offline data cleared');
    } catch (error) {
      console.error('❌ Failed to clear offline data:', error);
    }
  }
}

// Export singleton instance
export const offlineStorageTemp = new OfflineStorageTemp();