// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Absolute path for numbers.txt
const filePath = path.join(__dirname, 'numbers.txt');

// ----------------------
// Home route
// ----------------------
app.get('/', (req, res) => {
  res.json({
    message: 'Crypto Proxy API is running!',
    routes: [
      '/api/gold',
      '/api/equity/:symbol',
      '/api/save-number',
      '/api/numbers'
    ]
  });
});

// ----------------------
// Save phone number
// ----------------------
app.post('/api/save-number', async (req, res) => {
  try {
    const phone = req.body?.phone;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'Unknown';

    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    // Read existing numbers
    let existingNumbers = [];
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      existingNumbers = data.split('\n').map(line => line.split(' - ')[0]);
    }

    // Prevent duplicates
    if (existingNumbers.includes(phone)) {
      return res.status(409).json({ error: 'Phone number already saved' });
    }

    const line = `${phone} - ${new Date().toLocaleString()} - ${ip}\n`;

    // Append asynchronously
    fs.appendFile(filePath, line, (err) => {
      if (err) {
        console.error('Error writing file:', err);
        return res.status(500).json({ error: 'Failed to save number' });
      }
      res.json({ success: true, message: 'Number saved!' });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Get saved numbers
// ----------------------
app.get('/api/numbers', (req, res) => {
  try {
    if (!fs.existsSync(filePath)) return res.json({ numbers: [] });

    const data = fs.readFileSync(filePath, 'utf8');
    const numbers = data.split('\n').filter(Boolean); // remove empty lines

    res.json({ numbers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Get Gold price
// ----------------------
app.get('/api/gold', async (req, res) => {
  try {
    const response = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/GC=F');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Get equity by symbol
// ----------------------
app.get('/api/equity/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Start server
// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));