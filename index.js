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
// Telegram Bot Config
// ----------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Send message to one user
const sendTelegramMessage = async (telegramId, message) => {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: telegramId,
      text: message,
      parse_mode: 'Markdown'
    });
    console.log(`✅ Sent to ${telegramId}`);
  } catch (err) {
    console.error(`❌ Failed to send to ${telegramId}:`, err.message);
  }
};

// Send signal to ALL users in MongoDB
const sendSignalToAll = async (message) => {
  try {
    const leads = await Lead.find({ telegramId: { $ne: 'N/A' } });
    console.log(`📢 Sending to ${leads.length} users...`);
    for (const lead of leads) {
      await sendTelegramMessage(lead.telegramId, message);
    }
    console.log('✅ All signals sent!');
  } catch (err) {
    console.error('❌ Broadcast error:', err.message);
  }
};

// ----------------------
// Fetch Market Data + Build Signal
// ----------------------
const fetchAndSendSignal = async () => {
  try {
    // Fetch BTC price
    const cryptoRes = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd'
    );
    const crypto = cryptoRes.data;

    // Fetch Gold
    const goldRes = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/GC=F'
    );
    const goldUSD = goldRes.data.chart.result[0].meta.regularMarketPrice;
    const goldAED = (goldUSD * 3.67).toFixed(2);

    // Fetch Forex
    const forexRes = await axios.get('https://open.er-api.com/v6/latest/USD');
    const rates = forexRes.data.rates;
    const aedToInr = (rates.INR / rates.AED).toFixed(4);

    // Build signal message
    const message = `
📊 *Hourly Market Signal*
🕐 ${new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })}

🪙 *Crypto Prices (USD)*
- Bitcoin:  $${crypto.bitcoin.usd.toLocaleString()}
- Ethereum: $${crypto.ethereum.usd.toLocaleString()}
- Solana:   $${crypto.solana.usd.toLocaleString()}
- XRP:      $${crypto.ripple.usd.toLocaleString()}

🥇 *Gold*
- Per oz:   $${goldUSD.toLocaleString()} | AED ${goldAED}
- Per gram: $${(goldUSD / 31.1).toFixed(2)} | AED ${(goldAED / 31.1).toFixed(2)}

💱 *Forex (1 USD)*
- AED: ${rates.AED.toFixed(4)}
- EUR: ${rates.EUR.toFixed(4)}
- GBP: ${rates.GBP.toFixed(4)}
- INR: ${rates.INR.toFixed(4)}
- AED/INR: ${aedToInr}

_Powered by CryptoProxy_ 🚀
    `.trim();

    await sendSignalToAll(message);
  } catch (err) {
    console.error('❌ Signal fetch error:', err.message);
  }
};

// ----------------------
// Auto trigger every 1 hour
// ----------------------
setInterval(() => {
  console.log('⏰ Sending hourly signal...');
  fetchAndSendSignal();
}, 60 * 60 * 1000); // every 1 hour

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
      '/api/leads',
      '/api/send-signal (POST)',
      '/api/test-signal (GET)'
    ]
  });
});

// ----------------------
// Manually trigger signal (POST)
// ----------------------
app.post('/api/send-signal', async (req, res) => {
  try {
    await fetchAndSendSignal();
    res.json({ success: true, message: 'Signal sent to all users!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Test signal to one user (GET)
// ----------------------
app.get('/api/test-signal/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    await sendTelegramMessage(telegramId, '✅ Test signal working!');
    res.json({ success: true, message: `Test sent to ${telegramId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

    const line = `Phone: ${phone} | Name: ${name} | Telegram: ${telegram} | IP: ${ip} | ${new Date().toLocaleString()}\n`;
    fs.appendFile(filePath, line, (err) => {
      if (err) console.error('File save error:', err);
    });

    const lead = new Lead({ phone, telegram, name, telegramId, ip });
    await lead.save();

    // Send welcome message if telegramId exists
    if (telegramId !== 'N/A') {
      await sendTelegramMessage(telegramId,
        `👟 *Welcome ${name}!*\n\nYou are now subscribed to hourly market signals!\n\n📊 You will receive updates every hour for:\n• Crypto prices\n• Gold prices\n• Forex rates\n\n_Stay tuned!_ 🚀`
      );
    }

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