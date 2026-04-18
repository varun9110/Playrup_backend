require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const { authenticateToken } = require('./middleware/authMiddleware');
const setupSwagger = require('./swagger');
const { initActivityCompletionSubscriber } = require('./events/activityCompletionSubscriber');
const { initActivityAutoCompletion } = require('./services/activityAutoCompletion');
const { initNotificationReminderService } = require('./services/notificationReminderService');
const { ensureDefaultTemplates } = require('./services/notificationService');

initActivityCompletionSubscriber();
initActivityAutoCompletion();
initNotificationReminderService();
ensureDefaultTemplates().catch((error) => {
  console.error('Failed to initialize notification templates:', error);
});

setupSwagger(app);
app.use(['/api/auth', '/auth'], authRoutes);
app.use('/api/public', publicRoutes);
app.use(authenticateToken);

const academyRoutes = require('./routes/academy');
app.use('/api/academy', academyRoutes);

const bookingRoutes = require('./routes/booking');
app.use('/api/booking', bookingRoutes);

const activityRoutes = require('./routes/activity');
app.use('/api/activity', activityRoutes);

const requestRoutes = require('./routes/request');
app.use('/api/request', requestRoutes);

const dashboardRoutes = require('./routes/dashboard');
app.use('/api/dashboard', dashboardRoutes);

const userRoutes = require('./routes/user');
app.use('/api/user', userRoutes);

const notificationRoutes = require('./routes/notification');
app.use('/api/notification', notificationRoutes);

const dropInRoutes = require('./routes/dropIn');
app.use('/api/dropin', dropInRoutes);

const coachingRoutes = require('./routes/coaching');
app.use('/api/coaching', coachingRoutes);

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error(err));