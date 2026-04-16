const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const academyRoutes = require('./routes/academy');
const activityRoutes = require('./routes/activity');
const bookingRoutes = require('./routes/booking');
const requestRoutes = require('./routes/request');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/user');
const notificationRoutes = require('./routes/notification');
const { authenticateToken } = require('./middleware/authMiddleware');
const setupSwagger = require('./swagger');
const { initActivityCompletionSubscriber } = require('./events/activityCompletionSubscriber');
const { initActivityAutoCompletion } = require('./services/activityAutoCompletion');
const { initNotificationReminderService } = require('./services/notificationReminderService');
const { ensureDefaultTemplates } = require('./services/notificationService');


const app = express();

initActivityCompletionSubscriber();
initActivityAutoCompletion();
initNotificationReminderService();
ensureDefaultTemplates().catch((error) => {
  console.error('Failed to initialize notification templates:', error);
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

setupSwagger(app);
app.use(['/api/auth', '/auth'], authRoutes);
app.use(authenticateToken);
app.use('/api/academy', academyRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/request', requestRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/user', userRoutes);
app.use('/api/notification', notificationRoutes);

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/otp-login-system';

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

module.exports = app;
