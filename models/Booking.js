const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userEmail: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy' },
  sport: String,
  courtNumber: Number,
  date: String,
  startTime: String,
  endTime: String,
  price: Number,
  status: {
    type: String,
    enum: ['Confirmed', 'Cancelled'],
    default: 'Confirmed'
  },
  reminder15Sent: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
