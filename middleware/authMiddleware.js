const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const TOKEN_EXPIRATION_HOURS = parseInt(process.env.TOKEN_EXPIRATION_HOURS, 10) || 24;
const TOKEN_REFRESH_THRESHOLD_MINUTES = parseInt(process.env.TOKEN_REFRESH_THRESHOLD_MINUTES, 10) || 60;

function issueToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: `${TOKEN_EXPIRATION_HOURS}h` }
  );
}

function getTokenExpiryDate() {
  return new Date(Date.now() + TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000);
}

function attachTokenRefreshResponse(res) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.locals.newToken && body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      body = { ...body, newToken: res.locals.newToken };
    }
    return originalJson(body);
  };
}

async function authenticateToken(req, res, next) {
  attachTokenRefreshResponse(res);

  const rawHeader = req.headers.authorization || req.headers['x-access-token'] || req.headers.token;
  const token = rawHeader && rawHeader.startsWith('Bearer ') ? rawHeader.slice(7) : rawHeader;

  if (!token) {
    return res.status(401).json({ message: 'Authorization token required', error: 'Token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token', error: 'Invalid token' });
  }

  if (!decoded || !decoded.id) {
    return res.status(401).json({ message: 'Invalid token', error: 'Invalid token' });
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.token || user.token !== token) {
    return res.status(401).json({ message: 'Invalid token', error: 'Invalid token' });
  }

  const nowMs = Date.now();
  const expiresAtMs = decoded.exp ? decoded.exp * 1000 : 0;
  if (expiresAtMs && nowMs >= expiresAtMs) {
    return res.status(401).json({ message: 'Token expired', error: 'Token expired' });
  }

  const refreshThresholdMs = TOKEN_REFRESH_THRESHOLD_MINUTES * 60 * 1000;
  if (expiresAtMs && expiresAtMs - nowMs <= refreshThresholdMs) {
    const refreshedToken = issueToken(user);
    user.token = refreshedToken;
    user.tokenExpiry = getTokenExpiryDate();
    await user.save();
    res.locals.newToken = refreshedToken;
  }

  req.user = user;
  next();
}

module.exports = {
  authenticateToken,
  issueToken,
  getTokenExpiryDate,
  TOKEN_EXPIRATION_HOURS
};
