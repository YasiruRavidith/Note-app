// mobile/src/services/OfflineStorage.js
import * as SQLite from 'expo-sqlite';

class OfflineStorage {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.db = await SQLite.openDatabaseAsync('notes_offline.db');
      await this.createTables();
      this.isInitialized = true;
      console.log('✅ Offline storage initialized');
    } catch (error) {
      console.error('❌ Failed to initialize offline storage:', error);
      throw error;
    }
  }

  async createTables() {
    const createTablesSQL = `
      -- Notes table
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        version INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        is_encrypted BOOLEAN DEFAULT 0,
        encryption_meta TEXT,
        tags TEXT, -- JSON array as string
        folder_id TEXT,
        is_shared BOOLEAN DEFAULT 0,
        share_code TEXT,
        sync_status TEXT DEFAULT 'synced', -- 'synced', 'pending', 'conflict'
        last_sync_at TEXT
      );

      -- Sync queue table for offline operations
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL, -- 'create', 'update', 'delete'
        note_id TEXT NOT NULL,
        data TEXT, -- JSON data for the operation
        timestamp TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending' -- 'pending', 'processing', 'completed', 'failed'
      );

      -- Device sync metadata
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_notes_sync_status ON notes(sync_status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp);
    `;

    await this.db.execAsync(createTablesSQL);
  }

  // ========== NOTES CRUD OPERATIONS ==========

  async getAllNotes(includeDeleted = false) {
    const whereClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const result = await this.db.getAllAsync(
      `SELECT * FROM notes ${whereClause} ORDER BY updated_at DESC`
    );
    
    return result.map(note => this.transformNoteFromDB(note));
  }

  async getNoteById(id) {
    const result = await this.db.getFirstAsync(
      'SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    
    return result ? this.transformNoteFromDB(result) : null;
  }

  async saveNote(note, syncStatus = 'pending') {
    const noteData = {
      id: note.id,
      title: note.title || '',
      content: note.content || '',
      version: note.version || 1,
      created_at: note.createdAt || new Date().toISOString(),
      updated_at: note.updatedAt || new Date().toISOString(),
      deleted_at: note.deletedAt || null,
      is_encrypted: note.contentEncrypted || false,
      encryption_meta: note.encryptionMeta ? JSON.stringify(note.encryptionMeta) : null,
      tags: note.tags ? JSON.stringify(note.tags) : null,
      folder_id: note.folderId || null,
      is_shared: note.isShared || false,
      share_code: note.shareCode || null,
      sync_status: syncStatus,
      last_sync_at: syncStatus === 'synced' ? new Date().toISOString() : null
    };

    await this.db.runAsync(`
      INSERT OR REPLACE INTO notes (
        id, title, content, version, created_at, updated_at, deleted_at,
        is_encrypted, encryption_meta, tags, folder_id, is_shared, share_code,
        sync_status, last_sync_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      noteData.id, noteData.title, noteData.content, noteData.version,
      noteData.created_at, noteData.updated_at, noteData.deleted_at,
      noteData.is_encrypted, noteData.encryption_meta, noteData.tags,
      noteData.folder_id, noteData.is_shared, noteData.share_code,
      noteData.sync_status, noteData.last_sync_at
    ]);
  }

  async deleteNote(id, soft = true) {
    if (soft) {
      await this.db.runAsync(
        'UPDATE notes SET deleted_at = ?, sync_status = ? WHERE id = ?',
        [new Date().toISOString(), 'pending', id]
      );
    } else {
      await this.db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
    }
  }

  // ========== SYNC QUEUE OPERATIONS ==========

  async addToSyncQueue(operationType, noteId, data) {
    await this.db.runAsync(`
      INSERT INTO sync_queue (operation_type, note_id, data, timestamp)
      VALUES (?, ?, ?, ?)
    `, [operationType, noteId, JSON.stringify(data), new Date().toISOString()]);
  }

  async getSyncQueue() {
    return await this.db.getAllAsync(
      'SELECT * FROM sync_queue WHERE status = ? ORDER BY timestamp ASC',
      ['pending']
    );
  }

  async markSyncItemCompleted(id) {
    await this.db.runAsync(
      'UPDATE sync_queue SET status = ? WHERE id = ?',
      ['completed', id]
    );
  }

  async markSyncItemFailed(id, retryCount) {
    const status = retryCount >= 3 ? 'failed' : 'pending';
    await this.db.runAsync(
      'UPDATE sync_queue SET status = ?, retry_count = ? WHERE id = ?',
      [status, retryCount + 1, id]
    );
  }

  async clearCompletedSyncItems() {
    await this.db.runAsync(
      'DELETE FROM sync_queue WHERE status = ? AND timestamp < ?',
      ['completed', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()]
    );
  }

  // ========== SYNC METADATA OPERATIONS ==========

  async setSyncMetadata(key, value) {
    await this.db.runAsync(`
      INSERT OR REPLACE INTO sync_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
    `, [key, JSON.stringify(value), new Date().toISOString()]);
  }

  async getSyncMetadata(key) {
    const result = await this.db.getFirstAsync(
      'SELECT value FROM sync_metadata WHERE key = ?',
      [key]
    );
    
    return result ? JSON.parse(result.value) : null;
  }

  async getLastSyncTime() {
    return await this.getSyncMetadata('last_sync_time');
  }

  async setLastSyncTime(timestamp) {
    await this.setSyncMetadata('last_sync_time', timestamp);
  }

  // ========== HELPER METHODS ==========

  transformNoteFromDB(dbNote) {
    return {
      id: dbNote.id,
      title: dbNote.title,
      content: dbNote.content,
      version: dbNote.version,
      createdAt: dbNote.created_at,
      updatedAt: dbNote.updated_at,
      deletedAt: dbNote.deleted_at,
      contentEncrypted: Boolean(dbNote.is_encrypted),
      encryptionMeta: dbNote.encryption_meta ? JSON.parse(dbNote.encryption_meta) : null,
      tags: dbNote.tags ? JSON.parse(dbNote.tags) : [],
      folderId: dbNote.folder_id,
      isShared: Boolean(dbNote.is_shared),
      shareCode: dbNote.share_code,
      syncStatus: dbNote.sync_status,
      lastSyncAt: dbNote.last_sync_at
    };
  }

  async getUnsyncedNotes() {
    const result = await this.db.getAllAsync(
      'SELECT * FROM notes WHERE sync_status != ? ORDER BY updated_at ASC',
      ['synced']
    );
    
    return result.map(note => this.transformNoteFromDB(note));
  }

  async markNoteSynced(noteId) {
    await this.db.runAsync(
      'UPDATE notes SET sync_status = ?, last_sync_at = ? WHERE id = ?',
      ['synced', new Date().toISOString(), noteId]
    );
  }

  async markNoteConflicted(noteId) {
    await this.db.runAsync(
      'UPDATE notes SET sync_status = ? WHERE id = ?',
      ['conflict', noteId]
    );
  }

  // ========== DATABASE MAINTENANCE ==========

  async clearOldData() {
    // Clear old deleted notes (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    await this.db.runAsync(
      'DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?',
      [thirtyDaysAgo]
    );
    
    // Clear old completed sync queue items
    await this.clearCompletedSyncItems();
  }

  async getDatabaseStats() {
    const stats = {};
    
    const notesCount = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NULL');
    stats.totalNotes = notesCount.count;
    
    const unsyncedCount = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM notes WHERE sync_status != ?', ['synced']);
    stats.unsyncedNotes = unsyncedCount.count;
    
    const queueCount = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM sync_queue WHERE status = ?', ['pending']);
    stats.pendingSyncItems = queueCount.count;
    
    return stats;
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorage();