// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// NEW: Import Node's http module and the Server class from socket.io
const http = require('http');
const { Server } = require('socket.io');

// ========== INITIALIZATION ==========
const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = 'a-super-secret-key-that-should-be-in-env';

// NEW: Create an HTTP server from our Express app
const httpServer = http.createServer(app);

// NEW: Create a Socket.IO server and attach it to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Allow our frontend to connect
    methods: ["GET", "POST"]
  }
});

// NEW: Listen for new connections
io.on('connection', (socket) => {
  console.log('A user connected with socket id:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});


// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());
const authMiddleware = require('./middleware/authMiddleware');

// ========== AUTH ROUTES (No changes here) ==========
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
    res.redirect(`http://localhost:5173/auth/callback?token=${sessionToken}`);
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).redirect('http://localhost:5173/login?error=auth_failed');
  }
});

app.post('/api/auth/google/mobile', async (req, res) => {
  const { idToken } = req.body; // The token sent from the mobile app

  try {
    // Verify the token with Google
    const ticket = await oAuth2Client.verifyIdToken({
      idToken,
      // We don't need to specify the audience (client ID) here for mobile
      // as the token is validated by its signature.
    });
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
      data: { title, content, ownerId: req.user.id },
    });

    // NEW: Emit an event to all connected clients that a note was created
    io.emit('note:created', newNote);

    res.status(201).json(newNote);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create note' });
  }
});

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  try {
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || note.ownerId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const updatedNote = await prisma.note.update({
      where: { id },
      data: { title, content },
    });

    // NEW: Emit an event that a note was updated
    io.emit('note:updated', updatedNote);

    res.json(updatedNote);
  } catch (error) {
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
    await prisma.note.delete({ where: { id } });

    // NEW: Emit an event that a note was deleted, sending the ID
    io.emit('note:deleted', { id });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete note' });
  }
});


// ========== SERVER START ==========
const PORT = process.env.PORT || 3001;
// NEW: Start the httpServer instead of the Express app
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});