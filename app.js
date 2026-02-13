const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const academyRoutes = require('./routes/academy');
const activityRoutes = require('./routes/activity');
const bookingRoutes = require('./routes/booking');
const requestRoutes = require('./routes/request');


const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/academy', academyRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/request', requestRoutes);

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/otp-login-system';

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

module.exports = app;
