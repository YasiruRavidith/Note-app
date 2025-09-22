// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs');

// NEW: Import Node's http module and the Server class from socket.io
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

// ========== INITIALIZATION ==========
const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = 'a-super-secret-key-that-should-be-in-env';

// File upload configuration
const USE_S3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists for local storage
if (!USE_S3) {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  console.log('📁 Using local file storage at:', UPLOADS_DIR);
}

const s3Client = USE_S3 ? new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.S3_ENDPOINT, // For MinIO or other S3-compatible services
  forcePathStyle: !!process.env.S3_ENDPOINT, // Required for MinIO
}) : null;

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, and text files
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|md/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'));
    }
  }
});

// NEW: Create an HTTP server from our Express app
const httpServer = http.createServer(app);

// NEW: Create Redis clients for Socket.IO adapter (with graceful fallback)
let pubClient, subClient;
try {
  pubClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      connectTimeout: 5000,
    },
    retry_strategy: () => false // Don't retry to avoid hanging
  });
  subClient = pubClient.duplicate();
} catch (error) {
  console.log('⚠️ Redis client creation failed, will use in-memory adapter');
}

// NEW: Create a Socket.IO server and attach it to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://192.168.1.103:5173",
      "http://172.17.192.1:5173"
    ], // Allow our frontend to connect from multiple IPs
    methods: ["GET", "POST"]
  }
});

// Device and session tracking
const userSessions = new Map(); // userId -> Set of socketIds
const deviceSessions = new Map(); // deviceId -> socketId

// Initialize Redis adapter (with fallback for development)
async function initializeRedis() {
  if (!pubClient || !subClient) {
    console.log('⚠️ Redis clients not initialized, using in-memory adapter');
    return;
  }
  
  try {
    // Set connection timeout
    const connectTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
    );
    
    await Promise.race([
      Promise.all([
        pubClient.connect(),
        subClient.connect()
      ]),
      connectTimeout
    ]);
    
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Redis adapter connected for Socket.IO - Multi-server scaling enabled');
  } catch (error) {
    console.log('⚠️ Redis not available, using in-memory adapter for development');
    console.log('   To enable Redis: Install and start Redis server locally');
    // Continue without Redis for development - Socket.IO will use default in-memory adapter
  }
}

// Handle Redis connection errors gracefully
if (pubClient) {
  pubClient.on('error', (err) => {
    console.log('Redis PubClient Error:', err.message);
  });
}

if (subClient) {
  subClient.on('error', (err) => {
    console.log('Redis SubClient Error:', err.message);
  });
}

// Enhanced Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔗 User connected with socket id:', socket.id);

  // Handle device registration
  socket.on('register-device', async (data) => {
    try {
      const { userId, deviceId, deviceName, deviceType } = data;
      
      if (!userId) {
        socket.emit('error', { message: 'User ID required for device registration' });
        return;
      }

      // Store device session
      socket.userId = userId;
      socket.deviceId = deviceId;
      
      // Track user sessions
      if (!userSessions.has(userId)) {
        userSessions.set(userId, new Set());
      }
      userSessions.get(userId).add(socket.id);
      
      // Track device sessions
      if (deviceId) {
        deviceSessions.set(deviceId, socket.id);
      }

      // Join user-specific room for targeted updates
      socket.join(`user-${userId}`);
      
      // Update device last seen in database
      if (deviceId) {
        try {
          await prisma.device.upsert({
            where: { id: deviceId },
            update: { 
              lastSeen: new Date(),
              sessionToken: socket.id,
              isActive: true
            },
            create: {
              id: deviceId,
              userId: userId,
              deviceName: deviceName || 'Unknown Device',
              deviceType: deviceType || 'unknown',
              sessionToken: socket.id,
              lastSeen: new Date(),
              isActive: true
            }
          });
        } catch (dbError) {
          console.error('Failed to update device:', dbError);
        }
      }

      console.log(`📱 Device registered: ${deviceName} (${deviceType}) for user ${userId}`);
      
      // Send current active devices to user
      const activeDevices = await prisma.device.findMany({
        where: { userId, isActive: true },
        select: { id: true, deviceName: true, deviceType: true, lastSeen: true }
      });
      
      socket.emit('devices-updated', { devices: activeDevices });
      
    } catch (error) {
      console.error('Device registration error:', error);
      socket.emit('error', { message: 'Failed to register device' });
    }
  });

  // Handle sync requests
  socket.on('sync-request', async (data) => {
    try {
      const { userId, lastSyncTime } = data;
      
      if (!userId || socket.userId !== userId) {
        socket.emit('error', { message: 'Unauthorized sync request' });
        return;
      }

      // Get notes updated since last sync
      const updatedNotes = await prisma.note.findMany({
        where: {
          ownerId: userId,
          updatedAt: lastSyncTime ? { gt: new Date(lastSyncTime) } : undefined,
          deletedAt: null
        },
        orderBy: { updatedAt: 'desc' }
      });

      socket.emit('sync-response', {
        notes: updatedNotes,
        syncTime: new Date().toISOString()
      });

      console.log(`🔄 Sync completed for user ${userId}: ${updatedNotes.length} notes`);
      
    } catch (error) {
      console.error('Sync request error:', error);
      socket.emit('error', { message: 'Sync failed' });
    }
  });

  // ========== COLLABORATIVE EDITING HANDLERS ==========
  
  // Join a note room for collaborative editing
  socket.on('join-note', (data) => {
    const { noteId } = data;
    if (!noteId || !socket.userId) return;
    
    const roomName = `note-${noteId}`;
    socket.join(roomName);
    
    console.log(`📝 User ${socket.userId} joined note room: ${noteId}`);
    
    // Notify other collaborators
    socket.to(roomName).emit('collaborator-joined', {
      userId: socket.userId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    // Send current collaborators to the joining user
    const room = io.sockets.adapter.rooms.get(roomName);
    const collaborators = [];
    if (room) {
      room.forEach(socketId => {
        const collaboratorSocket = io.sockets.sockets.get(socketId);
        if (collaboratorSocket && collaboratorSocket.userId && collaboratorSocket.id !== socket.id) {
          collaborators.push({
            id: collaboratorSocket.userId,
            name: collaboratorSocket.userName || 'Anonymous',
            socketId: socketId
          });
        }
      });
    }
    
    socket.emit('collaborators-updated', {
      noteId,
      collaborators
    });
  });

  // Leave a note room
  socket.on('leave-note', (data) => {
    const { noteId } = data;
    if (!noteId) return;
    
    const roomName = `note-${noteId}`;
    socket.leave(roomName);
    
    console.log(`📝 User ${socket.userId} left note room: ${noteId}`);
    
    // Notify other collaborators
    socket.to(roomName).emit('collaborator-left', {
      userId: socket.userId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  });

  // Handle real-time text operations for collaborative editing
  socket.on('text-operation', (operation) => {
    const { noteId, type, position, text, newContent, userId } = operation;
    
    if (!noteId || !socket.userId || userId !== socket.userId) return;
    
    const roomName = `note-${noteId}`;
    
    // Broadcast operation to other collaborators in the room
    socket.to(roomName).emit('text-operation', {
      ...operation,
      fromUser: socket.userId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✏️ Text operation in note ${noteId}: ${type} by user ${socket.userId}`);
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log('📴 User disconnected:', socket.id);
      
      // Clean up session tracking
      if (socket.userId) {
        const userSocketSet = userSessions.get(socket.userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            userSessions.delete(socket.userId);
          }
        }
      }
      
      // Clean up device session
      if (socket.deviceId) {
        deviceSessions.delete(socket.deviceId);
        
        // Mark device as inactive in database
        try {
          await prisma.device.updateMany({
            where: { sessionToken: socket.id },
            data: { 
              isActive: false,
              lastSeen: new Date()
            }
          });
        } catch (dbError) {
          console.error('Failed to mark device inactive:', dbError);
        }
      }
      
    } catch (error) {
      console.error('Disconnect cleanup error:', error);
    }
  });
});


// ========== MIDDLEWARE ==========
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://192.168.1.103:5173',
    'http://172.17.192.1:5173'
  ],
  credentials: true
}));
app.use(express.json());
const authMiddleware = require('./middleware/authMiddleware');

// ========== AUTH ROUTES ==========
const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/api/auth/google/callback'
);
// ========== AUTH ROUTES ==========
app.get('/api/auth/google/url', (req, res) => {
  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
  });
  res.json({ url: authorizeUrl });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const ticket = await oAuth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // Check if user exists, if not, create them
    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name,
          avatarUrl: payload.picture,
        },
      });
    }

    const sessionToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    // Use the request host to redirect back to the correct origin
    const frontendOrigin = req.get('origin') || `http://localhost:5173`;
    res.redirect(`${frontendOrigin}/auth/callback?token=${sessionToken}`);
  } catch (error) {
    console.error('Authentication error:', error);
    const frontendOrigin = req.get('origin') || `http://localhost:5173`;
    res.status(500).redirect(`${frontendOrigin}/login?error=auth_failed`);
  }
});

app.post('/api/auth/google/mobile', async (req, res) => {
  const { idToken } = req.body; // The token sent from the mobile app
  
  console.log('📱 Mobile auth request received');
  console.log('🔑 ID Token present:', !!idToken);

  try {
    // Verify the token with Google - specify the web client ID as audience
    const ticket = await oAuth2Client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID, // Web client ID from Firebase
    });
    console.log('✅ Token verification successful');
    const payload = ticket.getPayload();
    const googleId = payload.sub;

    if (!googleId) {
      return res.status(400).json({ message: 'Invalid token' });
    }

    // Find or create the user in the database
    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name,
          avatarUrl: payload.picture,
        },
      });
    }

    // Create OUR OWN session token and send it back to the mobile app
    const sessionToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ token: sessionToken, user });

  } catch (error) {
    console.error('Mobile auth error:', error);
    res.status(500).json({ message: 'Authentication failed' });
  }
});

// ========== PIN AUTHENTICATION ROUTES ==========

// Check if user has PIN configured
app.get('/api/auth/pin/status', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.id },
      select: { pinHash: true, encryptionMode: true }
    });
    
    res.json({
      hasPIN: !!user.pinHash,
      encryptionMode: user.encryptionMode || 'ui_lock'
    });
  } catch (error) {
    console.error('PIN status check error:', error);
    res.status(500).json({ message: 'Failed to check PIN status' });
  }
});

// Setup PIN (first time or reset)
app.post('/api/auth/pin/setup', authMiddleware, async (req, res) => {
  try {
    const { pin, encryptionMode = 'ui_lock', salt } = req.body;

    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ 
        message: 'PIN must be 4-6 digits' 
      });
    }

    if (!['ui_lock', 'zero_knowledge'].includes(encryptionMode)) {
      return res.status(400).json({ 
        message: 'Invalid encryption mode' 
      });
    }

    let updateData = { encryptionMode };

    if (encryptionMode === 'ui_lock') {
      // Server-side PIN hashing for UI lock mode
      const pinHash = await bcrypt.hash(pin, 12);
      updateData.pinHash = pinHash;
      updateData.pinSalt = null; // Clear any existing salt
    } else {
      // Zero-knowledge mode: store client-provided salt, no server PIN hash
      if (!salt) {
        return res.status(400).json({ 
          message: 'Salt required for zero-knowledge mode' 
        });
      }
      updateData.pinSalt = salt;
      updateData.pinHash = null; // Clear any existing server hash
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: updateData
    });

    console.log(`✅ PIN setup completed for user ${req.user.id} in ${encryptionMode} mode`);
    res.json({ 
      success: true, 
      encryptionMode,
      message: encryptionMode === 'zero_knowledge' 
        ? 'PIN configured for zero-knowledge encryption. Remember: losing your PIN means losing access to your encrypted notes!'
        : 'PIN configured for app unlock.'
    });

  } catch (error) {
    console.error('PIN setup error:', error);
    res.status(500).json({ message: 'Failed to setup PIN' });
  }
});

// Verify PIN
app.post('/api/auth/pin/verify', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({ message: 'PIN is required' });
    }

    const user = await prisma.user.findUnique({ 
      where: { id: req.user.id },
      select: { pinHash: true, pinSalt: true, encryptionMode: true }
    });

    if (!user.pinHash && !user.pinSalt) {
      return res.status(400).json({ message: 'No PIN configured' });
    }

    if (user.encryptionMode === 'ui_lock') {
      // Server-side PIN verification
      const isValid = await bcrypt.compare(pin, user.pinHash);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid PIN' });
      }
      
      res.json({ 
        success: true, 
        encryptionMode: 'ui_lock',
        message: 'PIN verified successfully' 
      });
    } else {
      // Zero-knowledge mode: return salt for client-side key derivation
      res.json({ 
        success: true, 
        encryptionMode: 'zero_knowledge',
        salt: user.pinSalt,
        message: 'Use salt for client-side key derivation' 
      });
    }

  } catch (error) {
    console.error('PIN verification error:', error);
    res.status(500).json({ message: 'Failed to verify PIN' });
  }
});

// Reset/Remove PIN
app.delete('/api/auth/pin/reset', authMiddleware, async (req, res) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      return res.status(400).json({ 
        message: 'PIN reset must be confirmed' 
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { encryptionMode: true }
    });

    if (user.encryptionMode === 'zero_knowledge') {
      return res.status(400).json({
        message: 'Cannot reset PIN in zero-knowledge mode. This would make your encrypted notes permanently inaccessible.'
      });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        pinHash: null,
        pinSalt: null,
        encryptionMode: 'ui_lock'
      }
    });

    console.log(`✅ PIN reset completed for user ${req.user.id}`);
    res.json({ 
      success: true, 
      message: 'PIN reset successfully' 
    });

  } catch (error) {
    console.error('PIN reset error:', error);
    res.status(500).json({ message: 'Failed to reset PIN' });
  }
});


// ========== NOTES CRUD ROUTES (PROTECTED) ==========

app.get('/api/notes', authMiddleware, async (req, res) => {
    // ... (no changes in this GET route)
    const notes = await prisma.note.findMany({ where: { ownerId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json(notes);
});

app.post('/api/notes', authMiddleware, async (req, res) => {
  const { title, content } = req.body;
  try {
    const newNote = await prisma.note.create({
      data: { 
        title, 
        content, 
        ownerId: req.user.id,
        version: 1
      },
    });

    // Enhanced: Emit to user-specific room instead of all clients
    io.to(`user-${req.user.id}`).emit('note:created', {
      note: newNote,
      timestamp: new Date().toISOString(),
      action: 'create'
    });

    console.log(`📝 Note created by user ${req.user.id}: "${newNote.title}"`);
    res.status(201).json(newNote);
  } catch (error) {
    console.error('Note creation error:', error);
    res.status(500).json({ message: 'Failed to create note' });
  }
});

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, content, clientVersion } = req.body;
  try {
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || note.ownerId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    // Version conflict detection
    if (clientVersion && clientVersion < note.version) {
      return res.status(409).json({ 
        message: 'Version conflict detected',
        serverNote: note,
        conflict: true
      });
    }

    // Create version snapshot before updating
    await prisma.noteVersion.create({
      data: {
        noteId: id,
        contentSnapshot: note.content || '',
        title: note.title,
        authorDeviceId: req.headers['x-device-id'] || 'unknown',
        changesSummary: 'Manual edit'
      }
    });

    const updatedNote = await prisma.note.update({
      where: { id },
      data: { 
        title, 
        content,
        version: { increment: 1 }
      },
    });

    // Enhanced: Emit to user-specific room with version info
    io.to(`user-${req.user.id}`).emit('note:updated', {
      note: updatedNote,
      timestamp: new Date().toISOString(),
      action: 'update',
      previousVersion: note.version
    });

    console.log(`✏️ Note updated by user ${req.user.id}: "${updatedNote.title}" (v${updatedNote.version})`);
    res.json(updatedNote);
  } catch (error) {
    console.error('Note update error:', error);
    res.status(500).json({ message: 'Failed to update note' });
  }
});

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || note.ownerId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    // Soft delete instead of hard delete
    const deletedNote = await prisma.note.update({
      where: { id },
      data: { 
        deletedAt: new Date(),
        version: { increment: 1 }
      }
    });

    // Enhanced: Emit to user-specific room
    io.to(`user-${req.user.id}`).emit('note:deleted', {
      noteId: id,
      timestamp: new Date().toISOString(),
      action: 'delete',
      version: deletedNote.version
    });

    console.log(`🗑️ Note deleted by user ${req.user.id}: "${note.title}"`);
    res.status(204).send();
  } catch (error) {
    console.error('Note deletion error:', error);
    res.status(500).json({ message: 'Failed to delete note' });
  }
});

// ========== ATTACHMENT ENDPOINTS ==========

// Upload file attachment
app.post('/api/attachments/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const { noteId } = req.body;
    if (!noteId) {
      return res.status(400).json({ message: 'Note ID is required' });
    }

    // Verify note ownership
    const note = await prisma.note.findFirst({
      where: { id: noteId, ownerId: req.user.id }
    });

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
    const s3Key = `attachments/${req.user.id}/${noteId}/${fileName}`;

    let processedBuffer = req.file.buffer;

    // Process images - resize if too large
    if (req.file.mimetype.startsWith('image/')) {
      try {
        const metadata = await sharp(req.file.buffer).metadata();
        
        // Resize if width > 1920px or file size > 5MB
        if (metadata.width > 1920 || req.file.size > 5 * 1024 * 1024) {
          processedBuffer = await sharp(req.file.buffer)
            .resize(1920, null, { withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        }
      } catch (error) {
        console.warn('Image processing failed, using original:', error);
      }
    }

    let fileUrl;
    
    if (USE_S3) {
      // Upload to S3 (or S3-compatible storage)
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET || 'notes-attachments',
        Key: s3Key,
        Body: processedBuffer,
        ContentType: req.file.mimetype,
        Metadata: {
          originalName: req.file.originalname,
          noteId: noteId,
          userId: req.user.id
        }
      });

      await s3Client.send(uploadCommand);
      
      // Generate presigned URL for S3
      const getCommand = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET || 'notes-attachments',
        Key: s3Key
      });
      fileUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
    } else {
      // Save to local storage
      const localPath = path.join(UPLOADS_DIR, s3Key);
      const localDir = path.dirname(localPath);
      
      // Ensure directory exists
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      
      // Write file
      fs.writeFileSync(localPath, processedBuffer);
      
      // Generate local URL
      fileUrl = `/api/attachments/file/${encodeURIComponent(s3Key)}`;
    }

    // Save attachment record to database
    const attachment = await prisma.attachment.create({
      data: {
        noteId: noteId,
        fileName: fileName,
        originalName: req.file.originalname,
        s3Key: s3Key,
        mimeType: req.file.mimetype,
        size: processedBuffer.length
      }
    });

    res.json({
      id: attachment.id,
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: fileUrl,
      createdAt: attachment.createdAt
    });

    console.log(`📎 File uploaded: ${attachment.originalName} for note ${noteId}`);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

// Get attachments for a note
app.get('/api/notes/:noteId/attachments', authMiddleware, async (req, res) => {
  try {
    const { noteId } = req.params;

    // Verify note ownership
    const note = await prisma.note.findFirst({
      where: { id: noteId, ownerId: req.user.id }
    });

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const attachments = await prisma.attachment.findMany({
      where: { noteId: noteId },
      orderBy: { createdAt: 'desc' }
    });

    // Generate URLs for all attachments
    const attachmentsWithUrls = await Promise.all(
      attachments.map(async (attachment) => {
        let fileUrl;
        
        if (USE_S3) {
          const getCommand = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET || 'notes-attachments',
            Key: attachment.s3Key
          });
          fileUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        } else {
          fileUrl = `/api/attachments/file/${encodeURIComponent(attachment.s3Key)}`;
        }

        return {
          id: attachment.id,
          fileName: attachment.fileName,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          url: fileUrl,
          createdAt: attachment.createdAt
        };
      })
    );

    res.json(attachmentsWithUrls);
  } catch (error) {
    console.error('Get attachments error:', error);
    res.status(500).json({ message: 'Failed to get attachments' });
  }
});

// Delete attachment
app.delete('/api/attachments/:attachmentId', authMiddleware, async (req, res) => {
  try {
    const { attachmentId } = req.params;

    // Get attachment and verify ownership through note
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId },
      include: { note: true }
    });

    if (!attachment || attachment.note.ownerId !== req.user.id) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    // Delete file from storage
    if (USE_S3) {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET || 'notes-attachments',
        Key: attachment.s3Key
      });
      await s3Client.send(deleteCommand);
    } else {
      const localPath = path.join(UPLOADS_DIR, attachment.s3Key);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }

    // Delete from database
    await prisma.attachment.delete({
      where: { id: attachmentId }
    });

    res.status(204).send();
    console.log(`🗑️ Attachment deleted: ${attachment.originalName}`);
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ message: 'Failed to delete attachment' });
  }
});

// Get presigned upload URL (alternative method for direct uploads)
app.post('/api/attachments/presigned-url', authMiddleware, async (req, res) => {
  try {
    const { noteId, fileName, mimeType } = req.body;

    if (!noteId || !fileName || !mimeType) {
      return res.status(400).json({ message: 'Note ID, file name, and MIME type are required' });
    }

    // Verify note ownership
    const note = await prisma.note.findFirst({
      where: { id: noteId, ownerId: req.user.id }
    });

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Generate unique S3 key
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
    const s3Key = `attachments/${req.user.id}/${noteId}/${uniqueFileName}`;

    // Generate presigned URL for upload
    const putCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET || 'notes-attachments',
      Key: s3Key,
      ContentType: mimeType,
      Metadata: {
        originalName: fileName,
        noteId: noteId,
        userId: req.user.id
      }
    });

    const presignedUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 300 }); // 5 minutes

    res.json({
      presignedUrl,
      s3Key,
      fileName: uniqueFileName
    });
  } catch (error) {
    console.error('Presigned URL error:', error);
    res.status(500).json({ message: 'Failed to generate presigned URL' });
  }
});

// Serve local attachment files (when not using S3)
app.get('/api/attachments/file/:filename', authMiddleware, async (req, res) => {
  try {
    const filePath = decodeURIComponent(req.params.filename);
    const localPath = path.join(UPLOADS_DIR, filePath);
    
    // Security check: ensure the path is within uploads directory
    const resolvedPath = path.resolve(localPath);
    const uploadsPath = path.resolve(UPLOADS_DIR);
    
    if (!resolvedPath.startsWith(uploadsPath)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check if file exists
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Get attachment record to verify ownership
    const attachment = await prisma.attachment.findFirst({
      where: { s3Key: filePath },
      include: { note: true }
    });
    
    if (!attachment || attachment.note.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Set appropriate headers
    const mimeType = attachment.mimeType || mime.lookup(localPath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(localPath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ message: 'Failed to serve file' });
  }
});


// ========== SERVER START ==========
const PORT = process.env.PORT || 3001;

// Initialize Redis and start server
async function startServer() {
  try {
    await initializeRedis();
    
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📡 Socket.IO ready with enhanced real-time sync`);
      console.log(`🔐 PIN authentication system active`);
      console.log(`📊 Database schema: comprehensive features enabled`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();