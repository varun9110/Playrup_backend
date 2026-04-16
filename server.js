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
const { authenticateToken } = require('./middleware/authMiddleware');
const setupSwagger = require('./swagger');
const { initActivityCompletionSubscriber } = require('./events/activityCompletionSubscriber');
const { initActivityAutoCompletion } = require('./services/activityAutoCompletion');

initActivityCompletionSubscriber();
initActivityAutoCompletion();

setupSwagger(app);
app.use(['/api/auth', '/auth'], authRoutes);
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

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error(err));