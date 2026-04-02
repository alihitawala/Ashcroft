const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
});

function generateTokens(user) {
  const access_token = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      role: user.role,
      household_id: user.household_id,
      household_role: user.household_role
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  const refresh_token = jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  return { access_token, refresh_token };
}

function setTokenCookies(res, tokens) {
  const opts = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' };
  res.cookie('access_token', tokens.access_token, { ...opts, maxAge: 86400000 });
  res.cookie('refresh_token', tokens.refresh_token, { ...opts, maxAge: 2592000000 });
}

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const tokens = generateTokens(user);
    setTokenCookies(res, tokens);

    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role,
        household_id: user.household_id,
        household_role: user.household_role
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
  res.json({ message: 'Logged out' });
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, theme, settings, household_id, household_role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    // Determine visible pages based on household
    const isAshcroft = user.household_id === 1;
    const visible_pages = isAshcroft 
      ? ['dashboard', 'grocery', 'gallery', 'garden', 'captures', 'travel', 'flights', 'events', 'notes', 'kanban', 'tasks', 'settings']
      : ['dashboard', 'garden', 'grocery', 'tasks', 'settings'];
    res.json({ user: { ...user, visible_pages } });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    const payload = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [payload.id]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    const tokens = generateTokens(user);
    setTokenCookies(res, tokens);
    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role,
        household_id: user.household_id,
        household_role: user.household_role
      } 
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Update profile
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, theme, password, currentPassword } = req.body;
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If changing password, verify current password
    if (password) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      const hash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    }

    // Update name/theme
    if (name !== undefined || theme !== undefined) {
      await pool.query(
        'UPDATE users SET name = COALESCE($1, name), theme = COALESCE($2, theme) WHERE id = $3',
        [name || null, theme || null, req.user.id]
      );
    }

    const updated = await pool.query(
      'SELECT id, email, name, role, theme, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ user: updated.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: list all users
router.get('/users', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await pool.query('SELECT id, email, name, role, household_id, household_role, created_at FROM users ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: delete user
router.delete('/users/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, email, name', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
