const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const filePath = path.join(__dirname, 'numbers.txt');

// ----------------------
// Connect MongoDB
// ----------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// ----------------------
// MongoDB Schema
// ----------------------
const LeadSchema = new mongoose.Schema({
  phone: String,
  telegram: { type: String, default: 'N/A' },
  name: { type: String, default: 'N/A' },
  telegramId: { type: String, default: 'N/A' },
  ip: { type: String, default: 'Unknown' },
  createdAt: { type: Date, default: Date.now }
});

const Lead = mongoose.model('Lead', LeadSchema);

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
      '/api/numbers',
      '/api/download-numbers',
      '/api/leads'
    ]
  });
});

// ----------------------
// Save phone number to FILE + MongoDB
// ----------------------
app.post('/api/save-number', async (req, res) => {
  try {
    const phone = req.body?.phone;
    const telegram = req.body?.telegram ?? 'N/A';
    const name = req.body?.name ?? 'N/A';
    const telegramId = req.body?.telegramId ?? 'N/A';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'Unknown';

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Save to text file
    const line = `Phone: ${phone} | Name: ${name} | Telegram: ${telegram} | IP: ${ip} | ${new Date().toLocaleString()}\n`;
    fs.appendFile(filePath, line, (err) => {
      if (err) console.error('File save error:', err);
    });

    // Save to MongoDB
    const lead = new Lead({
      phone,
      telegram,
      name,
      telegramId,
      ip
    });
    await lead.save();

    res.json({ success: true, message: 'Lead saved!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Get all leads from MongoDB
// ----------------------
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Get saved numbers from file
// ----------------------
app.get('/api/numbers', (req, res) => {
  try {
    if (!fs.existsSync(filePath)) return res.json({ numbers: [] });
    const data = fs.readFileSync(filePath, 'utf8');
    const numbers = data.split('\n').filter(Boolean);
    res.json({ numbers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Download numbers.txt
// ----------------------
app.get('/api/download-numbers', (req, res) => {
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
  res.download(filePath, 'numbers.txt', (err) => {
    if (err) console.error('Error downloading file:', err);
  });
});

// ----------------------
// Get Gold price
// ----------------------
app.get('/api/gold', async (req, res) => {
  try {
    const response = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/GC=F'
    );
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
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
    );
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