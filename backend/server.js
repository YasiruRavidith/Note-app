// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// NEW: Import Node's http module and the Server class from socket.io
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

// ========== INITIALIZATION ==========
const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = 'a-super-secret-key-that-should-be-in-env';

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