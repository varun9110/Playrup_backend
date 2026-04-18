const mongoose = require('mongoose');

const pricingSchema = new mongoose.Schema({
  courtNumber: Number,
  prices: [{ time: String, price: Number, unavailable: { type: Boolean, default: false } }]
}, { timestamps: true });

const sportSchema = new mongoose.Schema({
  sportName: String,
  numberOfCourts: Number,
  startTime: String,
  endTime: String,
  pricing: [pricingSchema]
}, { timestamps: true });

const amenitySchema = new mongoose.Schema({
  parking: { type: Boolean, default: false },
  drinkingWater: { type: Boolean, default: false },
  changingRooms: { type: Boolean, default: false },
  warmupArea: { type: Boolean, default: false },
  wifi: { type: Boolean, default: false },
  cctvCamera: { type: Boolean, default: false },
  shower: { type: Boolean, default: false },
  cafeteria: { type: Boolean, default: false }
}, { _id: false });

const academySchema = new mongoose.Schema({
  name: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  address: String,
  city: String,
  mapLink: { type: String, default: '' },
  photos: { type: [String], default: [] },
  openTime: { type: String, default: '' },
  closeTime: { type: String, default: '' },
  amenities: { type: amenitySchema, default: () => ({}) },
  shareCode: { type: String, unique: true, sparse: true },
  sports: [sportSchema]
}, { timestamps: true });


academySchema.index({ city: 1, "sports.sportName": 1 });


module.exports = mongoose.model('Academy', academySchema);

