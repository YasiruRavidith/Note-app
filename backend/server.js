// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Use the cors middleware to allow requests from our frontend
app.use(cors());

// A simple test route to make sure everything is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});