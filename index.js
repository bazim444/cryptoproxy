const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home route
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

// Save phone number to text file
app.post('/api/save-number', (req, res) => {
  try {
    const phone = req.body?.phone;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const line = `${phone} - ${new Date().toLocaleString()}\n`;

    fs.appendFileSync('numbers.txt', line);

    res.json({ success: true, message: 'Number saved!' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));