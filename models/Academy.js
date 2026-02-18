const mongoose = require('mongoose');

const pricingSchema = new mongoose.Schema({
  courtNumber: Number,
  prices: [{ time: String, price: Number }]
}, { timestamps: true });

const sportSchema = new mongoose.Schema({
  sportName: String,
  numberOfCourts: Number,
  startTime: String,
  endTime: String,
  pricing: [pricingSchema]
}, { timestamps: true });

const academySchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  phone: String,
  address: String,
  city: String,
  sports: [sportSchema]
}, { timestamps: true });


academySchema.index({ city: 1, "sports.sportName": 1 });


module.exports = mongoose.model('Academy', academySchema);

