const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  name: String,
  phone: String,
  telegram: String,
  telegramId: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lead', LeadSchema);