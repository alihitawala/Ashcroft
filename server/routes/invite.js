const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = Router();

function generateTokens(user) {
  const access_token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role,
      household_id: user.household_id, household_role: user.household_role },
    JWT_SECRET, { expiresIn: '24h' }
  );
  const refresh_token = jwt.sign(
    { id: user.id }, JWT_SECRET, { expiresIn: '30d' }
  );
  return { access_token, refresh_token };
}

function setTokenCookies(res, tokens) {
  const opts = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' };
  res.cookie('access_token', tokens.access_token, { ...opts, maxAge: 86400000 });
  res.cookie('refresh_token', tokens.refresh_token, { ...opts, maxAge: 2592000000 });
}

function generateCode() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
}

// Generate invite code (admin only)
router.post('/generate', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { household_name, expires_days } = req.body;
    if (!household_name) return res.status(400).json({ error: 'household_name required' });

    const code = generateCode();
    const expires_at = expires_days
      ? new Date(Date.now() + expires_days * 86400000)
      : new Date(Date.now() + 7 * 86400000); // default 7 days

    const result = await pool.query(
      `INSERT INTO invite_codes (code, created_by, household_name, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING code, expires_at`,
      [code, req.user.id, household_name, expires_at]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Invite generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate invite code (public)
router.get('/validate/:code', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT code, household_name, expires_at, used_by FROM invite_codes WHERE code = $1`,
      [req.params.code.toUpperCase()]
    );
    const invite = result.rows[0];
    if (!invite || invite.used_by || (invite.expires_at && new Date(invite.expires_at) < new Date())) {
      return res.json({ valid: false });
    }
    res.json({ valid: true, household_name: invite.household_name });
  } catch (err) {
    console.error('Invite validate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign up with invite code (public)
router.post('/signup', async (req, res) => {
  try {
    const { code, name, email, password, household_name } = req.body;
    if (!code || !name || !email || !password) {
      return res.status(400).json({ error: 'code, name, email, and password required' });
    }

    const invite = await pool.query(
      `SELECT * FROM invite_codes WHERE code = $1`, [code.toUpperCase()]
    );
    const inv = invite.rows[0];
    if (!inv) return res.status(400).json({ error: 'Invalid invite code' });
    if (inv.used_by) return res.status(400).json({ error: 'Invite code already used' });
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite code expired' });
    }

    // Check email not taken
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) return res.status(400).json({ error: 'Email already registered' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create household (use user-provided name if given, fallback to invite's)
      const finalHouseholdName = (household_name && household_name.trim()) || inv.household_name;
      const household = await client.query(
        `INSERT INTO households (name) VALUES ($1) RETURNING id`,
        [finalHouseholdName]
      );
      const household_id = household.rows[0].id;

      // Create user
      const password_hash = await bcrypt.hash(password, 12);
      const user = await client.query(
        `INSERT INTO users (name, email, password_hash, role, household_id, household_role)
         VALUES ($1, $2, $3, 'user', $4, 'head') RETURNING *`,
        [name, email, password_hash, household_id]
      );

      // Mark invite as used
      await client.query(
        `UPDATE invite_codes SET used_by = $1, used_at = NOW() WHERE id = $2`,
        [user.rows[0].id, inv.id]
      );

      await client.query('COMMIT');

      const u = user.rows[0];
      const tokens = generateTokens(u);
      setTokenCookies(res, tokens);

      res.json({
        user: { id: u.id, email: u.email, name: u.name, role: u.role,
                household_id: u.household_id, household_role: u.household_role }
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Invite signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
