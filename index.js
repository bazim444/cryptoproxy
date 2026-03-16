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
  .then(() => {
    console.log('✅ MongoDB Connected');
    // Start bot only after MongoDB is ready
    startBot();
  })
  .catch(err => console.log('❌ MongoDB Error:', err));

// ----------------------
// MongoDB Schema
// ----------------------
const LeadSchema = new mongoose.Schema({
  phone: { type: String, default: 'N/A' },
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
// Telegram Bot Polling (/start handler)
// ----------------------
let lastUpdateId = 0;

const startBot = () => {
  console.log('🤖 Bot polling started...');
  setInterval(async () => {
    try {
      const res = await axios.get(`${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`);
      const updates = res.data.result;

      for (const update of updates) {
        lastUpdateId = update.update_id;
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        const text = msg.text;
        const username = msg.from?.username ?? 'N/A';
        const name = `${msg.from?.first_name ?? ''} ${msg.from?.last_name ?? ''}`.trim();

        // Handle /start
        if (text === '/start') {
          try {
            // Check if already subscribed
            const existing = await Lead.findOne({ telegramId: chatId });

            if (existing) {
              await sendTelegramMessage(chatId,
                `👋 Welcome back *${name}*!\n\nYou are already subscribed! 📊\n\nYou will receive hourly market signals automatically.`
              );
              continue;
            }

            // Save new subscriber
            await Lead.create({
              phone: 'N/A',
              name,
              telegram: `@${username}`,
              telegramId: chatId,
              ip: 'N/A'
            });

            console.log(`✅ New subscriber: ${name} (@${username}) ID: ${chatId}`);

            // Send welcome message
            await sendTelegramMessage(chatId,
              `🎉 *Welcome ${name}!*\n\n` +
              `You are now subscribed to *hourly market signals!*\n\n` +
              `📊 Every hour you will receive:\n` +
              `• 🪙 Crypto prices (BTC, ETH, SOL, XRP)\n` +
              `• 🥇 Gold prices (USD & AED)\n` +
              `• 💱 Forex rates (AED/INR)\n\n` +
              `_First signal coming soon!_ 🚀`
            );

          } catch (err) {
            console.error('❌ Start handler error:', err.message);
          }
        }

        // Handle /stop
        if (text === '/stop') {
          try {
            await Lead.deleteOne({ telegramId: chatId });
            await sendTelegramMessage(chatId,
              `😢 You have been *unsubscribed* from market signals.\n\nSend /start anytime to resubscribe!`
            );
            console.log(`❌ Unsubscribed: ${name} (@${username})`);
          } catch (err) {
            console.error('❌ Stop handler error:', err.message);
          }
        }

        // Handle /count (admin)
        if (text === '/count') {
          try {
            const count = await Lead.countDocuments({ telegramId: { $ne: 'N/A' } });
            await sendTelegramMessage(chatId,
              `📊 *Total Subscribers:* ${count}`
            );
          } catch (err) {
            console.error('❌ Count handler error:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('❌ Polling error:', err.message);
    }
  }, 3000); // poll every 3 seconds
};

// ----------------------
// Fetch Market Data + Build Signal
// ----------------------
const fetchAndSendSignal = async () => {
  try {
    const cryptoRes = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd'
    );
    const crypto = cryptoRes.data;

    const goldRes = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/GC=F'
    );
    const goldUSD = goldRes.data.chart.result[0].meta.regularMarketPrice;
    const goldAED = (goldUSD * 3.67).toFixed(2);

    const forexRes = await axios.get('https://open.er-api.com/v6/latest/USD');
    const rates = forexRes.data.rates;
    const aedToInr = (rates.INR / rates.AED).toFixed(4);

    const message =
`📊 *Hourly Market Signal*
🕐 ${new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })}

🪙 *Crypto (USD)*
- BTC:  $${crypto.bitcoin.usd.toLocaleString()}
- ETH:  $${crypto.ethereum.usd.toLocaleString()}
- SOL:  $${crypto.solana.usd.toLocaleString()}
- XRP:  $${crypto.ripple.usd.toLocaleString()}

🥇 *Gold*
- Per oz:   $${goldUSD.toLocaleString()} | AED ${goldAED}
- Per gram: $${(goldUSD / 31.1).toFixed(2)} | AED ${(parseFloat(goldAED) / 31.1).toFixed(2)}

💱 *Forex (1 USD)*
- AED: ${rates.AED.toFixed(4)}
- EUR: ${rates.EUR.toFixed(4)}
- GBP: ${rates.GBP.toFixed(4)}
- INR: ${rates.INR.toFixed(4)}
- AED/INR: ${aedToInr}

_Powered by CryptoDash_ 🚀`;

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
}, 60 * 60 * 1000);

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
      '/api/test-signal/:telegramId (GET)'
    ]
  });
});

// ----------------------
// Manually trigger signal
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
// Test signal to one user
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
// Save number (from gift claim / manual)
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

    if (telegramId !== 'N/A') {
      await sendTelegramMessage(telegramId,
        `👟 *Welcome ${name}!*\n\nYou are now subscribed to hourly market signals! 🚀`
      );
    }

    res.json({ success: true, message: 'Lead saved!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Get all leads
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
// Get numbers from file
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
// Gold price
app.get('/api/gold', async (req, res) => {
  try {
    const response = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/GC=F',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Same fix for equity
app.get('/api/equity/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        }
      }
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