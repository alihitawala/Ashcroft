const { Router } = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ─── Helpers ───
function emptyToNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

async function resolveAssignedTo(val) {
  if (val === null || val === undefined || val === '') return null;
  if (!isNaN(val) && val !== '') return Number(val);
  const r = await pool.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', [String(val)]);
  return r.rows[0]?.id || null;
}

async function fetchTaskWithNames(id) {
  const r = await pool.query(
    `SELECT t.*, u.name as assigned_to_name, c.name as created_by_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN users c ON c.id = t.created_by
     WHERE t.id = $1`, [id]
  );
  return r.rows[0] || null;
}

// ─── Task Lists ───
router.get('/task-lists', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM task_lists WHERE
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

router.post('/task-lists', async (req, res) => {
  try {
    const { name, access = 'private' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const result = await pool.query(
      'INSERT INTO task_lists (name, access, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), access, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/task-lists/:id', async (req, res) => {
  try {
    const { name, access } = req.body;
    const result = await pool.query(
      `UPDATE task_lists SET name = COALESCE($1, name), access = COALESCE($2, access)
       WHERE id = $3 AND (
         (access = 'private' AND owner_id = $4) OR
         (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $5)) OR
         (access = 'admin' AND $6 = 'admin')
       ) RETURNING *`,
      [name, access, req.params.id, req.user.id, req.user.household_id, req.user.role]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/task-lists/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM task_lists WHERE id = $1 AND (
        owner_id = $2 OR
        (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $3)) OR
        (access = 'admin' AND $4 = 'admin')
      ) RETURNING *`,
      [req.params.id, req.user.id, req.user.household_id, req.user.role]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Tasks ───
router.get('/tasks', async (req, res) => {
  try {
    const { list_id, status, due } = req.query;
    let query = `SELECT t.*, u.name as assigned_to_name, c.name as created_by_name
      FROM tasks t
      LEFT JOIN task_lists tl ON t.list_id = tl.id
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users c ON c.id = t.created_by
      WHERE (
        (tl.id IS NOT NULL AND (
          (tl.access = 'private' AND tl.owner_id = $1) OR
          (tl.access = 'household' AND tl.owner_id IN (SELECT id FROM users WHERE household_id = $2)) OR
          (tl.access = 'admin' AND $3 = 'admin')
        )) OR
        (t.list_id IS NULL AND (
          (t.access = 'private' AND t.created_by = $1) OR
          (t.access = 'household' AND t.created_by IN (SELECT id FROM users WHERE household_id = $2)) OR
          (t.access = 'admin' AND $3 = 'admin')
        ))
      )`;
    const params = [req.user.id, req.user.household_id, req.user.role];

    if (list_id) { params.push(list_id); query += ` AND t.list_id = $${params.length}`; }
    if (status) { params.push(status); query += ` AND t.status = $${params.length}`; }
    if (due === 'today') { query += ` AND t.due_date::date = CURRENT_DATE`; }

    query += ' ORDER BY t.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const { title, description, priority = 'normal', due_date, status = 'todo', list_id, assigned_to, access = 'private' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const assignedToId = await resolveAssignedTo(assigned_to);
    const result = await pool.query(
      `INSERT INTO tasks (title, description, priority, due_date, status, list_id, created_by, assigned_to, access)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [title.trim(), emptyToNull(description), priority, emptyToNull(due_date), status,
       emptyToNull(list_id) ? Number(list_id) : null, req.user.id, assignedToId, access]
    );
    const task = await fetchTaskWithNames(result.rows[0].id);
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const { title, description, priority, due_date, status, assigned_to, list_id, access } = req.body;

    const assignedToId = assigned_to !== undefined ? await resolveAssignedTo(assigned_to) : undefined;

    // Build SET clause — explicit values, no COALESCE (allows clearing fields)
    const sets = [];
    const params = [];
    let idx = 0;
    const addField = (col, val) => {
      if (val !== undefined) { idx++; sets.push(`${col} = $${idx}`); params.push(val); }
    };

    addField('title', title?.trim() || undefined);
    addField('description', description !== undefined ? emptyToNull(description) : undefined);
    addField('priority', priority || undefined);
    addField('due_date', due_date !== undefined ? emptyToNull(due_date) : undefined);
    addField('status', status || undefined);
    addField('assigned_to', assignedToId);
    addField('list_id', list_id !== undefined ? (emptyToNull(list_id) ? Number(list_id) : null) : undefined);
    addField('access', access || undefined);

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    sets.push('updated_at = NOW()');
    idx++; params.push(req.params.id);

    const result = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });

    const task = await fetchTaskWithNames(result.rows[0].id);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
