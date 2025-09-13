// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// ========== INITIALIZATION ==========
const app = express();
const prisma = new PrismaClient();
const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/api/auth/google/callback'
);
const JWT_SECRET = 'a-super-secret-key-that-should-be-in-env';

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json()); // <-- IMPORTANT: Add this to parse JSON request bodies
const authMiddleware = require('./middleware/authMiddleware'); // Import our new middleware

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

// ========== NOTES CRUD ROUTES (PROTECTED) ==========

// GET all notes for the logged-in user
app.get('/api/notes', authMiddleware, async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { ownerId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notes', error });
  }
});

// POST a new note for the logged-in user
app.post('/api/notes', authMiddleware, async (req, res) => {
  const { title, content } = req.body;
  if (!title) {
    return res.status(400).json({ message: 'Title is required' });
  }
  try {
    const newNote = await prisma.note.create({
      data: {
        title,
        content,
        ownerId: req.user.id,
      },
    });
    res.status(201).json(newNote);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create note', error });
  }
});


// ========== SERVER START ==========
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});