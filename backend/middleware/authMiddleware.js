// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = 'a-super-secret-key-that-should-be-in-env';
// PASTE THE USER ID YOU COPIED FROM PRISMA STUDIO HERE
const DEV_USER_ID = 'cmfiou47l0000jx4o8kziczot'; 

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ---- START: DEV MODE LOGIC ----
  // If we are in development and the special dev header is present,
  // we will attach a default user and skip token verification.
  if (process.env.NODE_ENV !== 'production' && req.headers['x-dev-mode-user']) {
    console.log('DEV MODE: Attaching default user to request.');
    const user = await prisma.user.findUnique({ where: { id: DEV_USER_ID } });
    if (user) {
      req.user = user;
      return next();
    }
  }
  // ---- END: DEV MODE LOGIC ----

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized: User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};