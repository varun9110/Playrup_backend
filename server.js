require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

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

const setupSwagger = require('./swagger');
setupSwagger(app);

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error(err));