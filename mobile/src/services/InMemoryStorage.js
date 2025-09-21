// mobile/src/services/InMemoryStorage.js
// Simple in-memory storage without native dependencies

import { generateId } from '../utils/idGenerator';

class InMemoryStorage {
  constructor() {
    this.notes = [];
    this.syncQueue = [];
    this.lastSync = 0;
    this.initialized = false;
  }

  // Initialize storage
  async initialize() {
    try {
      console.log('📱 Initializing in-memory storage (temporary)...');
      this.initialized = true;
      console.log('✅ In-memory storage initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize in-memory storage:', error);
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
        localOnly: true
      };

      this.notes.push(note);
      this.addToSyncQueue({
        operation: 'create',
        noteId: note.id,
        data: note,
        timestamp: Date.now()
      });

      console.log('📝 Note created in memory:', note.id);
      return note;
    } catch (error) {
      console.error('❌ Failed to create note:', error);
      throw error;
    }
  }

  async updateNote(noteId, updates) {
    try {
      const noteIndex = this.notes.findIndex(n => n.id === noteId);
      
      if (noteIndex === -1) {
        throw new Error(`Note not found: ${noteId}`);
      }

      const existingNote = this.notes[noteIndex];
      const updatedNote = {
        ...existingNote,
        ...updates,
        updatedAt: new Date().toISOString(),
        version: (existingNote.version || 1) + 1
      };

      this.notes[noteIndex] = updatedNote;
      this.addToSyncQueue({
        operation: 'update',
        noteId: noteId,
        data: updatedNote,
        timestamp: Date.now()
      });

      console.log('✏️ Note updated in memory:', noteId);
      return updatedNote;
    } catch (error) {
      console.error('❌ Failed to update note:', error);
      throw error;
    }
  }

  async deleteNote(noteId) {
    try {
      const noteIndex = this.notes.findIndex(n => n.id === noteId);
      
      if (noteIndex === -1) {
        throw new Error(`Note not found: ${noteId}`);
      }

      this.notes[noteIndex] = {
        ...this.notes[noteIndex],
        isDeleted: true,
        updatedAt: new Date().toISOString()
      };

      this.addToSyncQueue({
        operation: 'delete',
        noteId: noteId,
        timestamp: Date.now()
      });

      console.log('🗑️ Note deleted in memory:', noteId);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete note:', error);
      throw error;
    }
  }

  async getNote(noteId) {
    try {
      const note = this.notes.find(n => n.id === noteId && !n.isDeleted);
      return note || null;
    } catch (error) {
      console.error('❌ Failed to get note:', error);
      return null;
    }
  }

  async getAllNotes() {
    try {
      return this.notes.filter(note => !note.isDeleted);
    } catch (error) {
      console.error('❌ Failed to get all notes:', error);
      return [];
    }
  }

  // Sync queue operations
  addToSyncQueue(operation) {
    try {
      this.syncQueue.push(operation);
    } catch (error) {
      console.error('❌ Failed to add to sync queue:', error);
    }
  }

  getSyncQueue() {
    try {
      return [...this.syncQueue];
    } catch (error) {
      console.error('❌ Failed to get sync queue:', error);
      return [];
    }
  }

  clearSyncQueue() {
    try {
      this.syncQueue = [];
    } catch (error) {
      console.error('❌ Failed to clear sync queue:', error);
    }
  }

  removeFromSyncQueue(operationId) {
    try {
      this.syncQueue.splice(operationId, 1);
    } catch (error) {
      console.error('❌ Failed to remove from sync queue:', error);
    }
  }

  // Server sync operations
  async syncNoteFromServer(serverNote) {
    try {
      const existingIndex = this.notes.findIndex(n => n.id === serverNote.id);

      const transformedNote = {
        id: serverNote.id,
        title: serverNote.title,
        content: serverNote.content,
        createdAt: serverNote.createdAt,
        updatedAt: serverNote.updatedAt,
        version: serverNote.version || 1,
        isDeleted: false,
        localOnly: false
      };

      if (existingIndex >= 0) {
        this.notes[existingIndex] = transformedNote;
      } else {
        this.notes.push(transformedNote);
      }

      console.log('🔄 Note synced from server to memory:', serverNote.id);
      return transformedNote;
    } catch (error) {
      console.error('❌ Failed to sync note from server:', error);
      throw error;
    }
  }

  async markNoteSynced(noteId) {
    try {
      const noteIndex = this.notes.findIndex(n => n.id === noteId);
      
      if (noteIndex >= 0) {
        this.notes[noteIndex].localOnly = false;
      }
    } catch (error) {
      console.error('❌ Failed to mark note as synced:', error);
    }
  }

  // Metadata operations
  async getLastSyncTime() {
    try {
      return this.lastSync;
    } catch (error) {
      console.error('❌ Failed to get last sync time:', error);
      return 0;
    }
  }

  async setLastSyncTime(timestamp) {
    try {
      this.lastSync = timestamp;
    } catch (error) {
      console.error('❌ Failed to set last sync time:', error);
    }
  }

  // Additional methods needed by SyncService
  async saveNote(note, status) {
    try {
      const existingIndex = this.notes.findIndex(n => n.id === note.id);
      const noteToSave = {
        ...note,
        localOnly: status === 'pending'
      };

      if (existingIndex >= 0) {
        this.notes[existingIndex] = noteToSave;
      } else {
        this.notes.push(noteToSave);
      }

      console.log(`💾 Note saved with status '${status}':`, note.id);
      return noteToSave;
    } catch (error) {
      console.error('❌ Failed to save note:', error);
      throw error;
    }
  }

  async getNoteById(noteId) {
    try {
      const note = this.notes.find(n => n.id === noteId && !n.isDeleted);
      return note || null;
    } catch (error) {
      console.error('❌ Failed to get note by ID:', error);
      return null;
    }
  }

  async markNoteConflicted(noteId) {
    try {
      const noteIndex = this.notes.findIndex(n => n.id === noteId);
      if (noteIndex >= 0) {
        this.notes[noteIndex].hasConflict = true;
        console.log('⚠️ Note marked as conflicted:', noteId);
      }
    } catch (error) {
      console.error('❌ Failed to mark note as conflicted:', error);
    }
  }

  // Cleanup
  async clearAllData() {
    try {
      this.notes = [];
      this.syncQueue = [];
      this.lastSync = 0;
      console.log('🧹 All in-memory data cleared');
    } catch (error) {
      console.error('❌ Failed to clear in-memory data:', error);
    }
  }

  async clearOldData() {
    try {
      // For in-memory storage, we can remove very old deleted notes
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      const initialCount = this.notes.length;
      
      this.notes = this.notes.filter(note => {
        if (note.isDeleted) {
          const noteTime = new Date(note.updatedAt).getTime();
          return noteTime > cutoffTime; // Keep if newer than cutoff
        }
        return true; // Keep all non-deleted notes
      });

      const removedCount = initialCount - this.notes.length;
      console.log(`🧹 Cleared ${removedCount} old deleted notes from memory`);
    } catch (error) {
      console.error('❌ Failed to clear old data:', error);
    }
  }
}

// Export singleton instance
export const inMemoryStorage = new InMemoryStorage();