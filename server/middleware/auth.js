const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

async function authenticate(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    
    // If household info is missing from token, fetch from database
    if (!payload.household_id) {
      const result = await pool.query(
        'SELECT id, email, name, role, household_id, household_role FROM users WHERE id = $1',
        [payload.id]
      );
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: 'User not found' });
      req.user = user;
    } else {
      req.user = payload;
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, JWT_SECRET };
