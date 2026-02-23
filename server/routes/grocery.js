const { Router } = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ─── Stores ───
router.get('/stores', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stores ORDER BY sort_order, name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/stores', async (req, res) => {
  try {
    const { name, icon = '🏪' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await pool.query(
      'INSERT INTO stores (name, icon) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name=stores.name RETURNING *',
      [name.trim(), icon]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Grocery Lists ───
router.get('/grocery-lists', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM grocery_lists WHERE 
        (access = 'private' AND owner_id = $1) OR 
        (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $2)) OR
        (access = 'admin' AND $3 = 'admin')
        ORDER BY created_at`,
      [req.user.id, req.user.household_id, req.user.role]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/grocery-lists', async (req, res) => {
  try {
    const { name, access = 'household' } = req.body;
    const result = await pool.query(
      'INSERT INTO grocery_lists (name, access, owner_id) VALUES ($1,$2,$3) RETURNING *',
      [name, access, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/grocery-lists/:id', async (req, res) => {
  try {
    const { name, access } = req.body;
    const result = await pool.query(
      `UPDATE grocery_lists SET name=COALESCE($1,name), access=COALESCE($2,access) WHERE id=$3 AND 
        ((access = 'private' AND owner_id = $4) OR 
         (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $5)) OR
         (access = 'admin' AND $6 = 'admin')) RETURNING *`,
      [name, access, req.params.id, req.user.id, req.user.household_id, req.user.role]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/grocery-lists/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM grocery_lists WHERE id=$1 AND owner_id=$2 RETURNING *`, 
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Grocery Items ───
router.get('/grocery-items', async (req, res) => {
  try {
    const { list_id } = req.query;
    let query = `SELECT gi.*, s.name as store_name, s.icon as store_icon
      FROM grocery_items gi
      JOIN grocery_lists gl ON gi.list_id = gl.id
      LEFT JOIN stores s ON gi.store_id = s.id
      WHERE ((gl.access = 'private' AND gl.owner_id = $1) OR 
             (gl.access = 'household' AND gl.owner_id IN (SELECT id FROM users WHERE household_id = $2)) OR
             (gl.access = 'admin' AND $3 = 'admin'))`;
    const params = [req.user.id, req.user.household_id, req.user.role];
    if (list_id) { params.push(list_id); query += ` AND gi.list_id = $${params.length}`; }
    query += ' ORDER BY gi.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/grocery-items', async (req, res) => {
  try {
    const { list_id, name, category, quantity, recurring = false, store_id } = req.body;
    const result = await pool.query(
      'INSERT INTO grocery_items (list_id, name, category, quantity, checked, recurring, added_by, store_id) VALUES ($1,$2,$3,$4,false,$5,$6,$7) RETURNING *',
      [list_id, name, category, quantity, recurring, req.user.id, store_id || null]
    );
    // Re-fetch with store join
    const full = await pool.query(
      'SELECT gi.*, s.name as store_name, s.icon as store_icon FROM grocery_items gi LEFT JOIN stores s ON gi.store_id = s.id WHERE gi.id = $1',
      [result.rows[0].id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/grocery-items/:id', async (req, res) => {
  try {
    const { name, category, quantity, checked, recurring, store_id } = req.body;
    // Build dynamic update
    const sets = [];
    const params = [];
    if (name !== undefined) { params.push(name); sets.push(`name=$${params.length}`); }
    if (category !== undefined) { params.push(category); sets.push(`category=$${params.length}`); }
    if (quantity !== undefined) { params.push(quantity); sets.push(`quantity=$${params.length}`); }
    if (checked !== undefined) { params.push(checked); sets.push(`checked=$${params.length}`); }
    if (recurring !== undefined) { params.push(recurring); sets.push(`recurring=$${params.length}`); }
    if (store_id !== undefined) { params.push(store_id); sets.push(`store_id=$${params.length}`); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE grocery_items SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    // Re-fetch with store join
    const full = await pool.query(
      'SELECT gi.*, s.name as store_name, s.icon as store_icon FROM grocery_items gi LEFT JOIN stores s ON gi.store_id = s.id WHERE gi.id = $1',
      [result.rows[0].id]
    );
    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/grocery-items/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM grocery_items WHERE id=$1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
