const { Router } = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// Boards
router.get('/boards', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM kanban_boards WHERE 
        (access = 'private' AND owner_id = $1) OR 
        (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $2)) OR
        (access = 'admin' AND $3 = 'admin') OR
        $1 = ANY(shared_with)
        ORDER BY created_at`,
      [req.user.id, req.user.household_id, req.user.role]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/boards', async (req, res) => {
  try {
    const { name, shared_with = [], access = 'private' } = req.body;
    const result = await pool.query(
      'INSERT INTO kanban_boards (name, owner_id, shared_with, access) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, req.user.id, shared_with, access]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/boards/:id', async (req, res) => {
  try {
    const { name, shared_with, access } = req.body;
    const result = await pool.query(
      `UPDATE kanban_boards SET name=COALESCE($1,name), shared_with=COALESCE($2,shared_with), access=COALESCE($3,access)
       WHERE id=$4 AND owner_id=$5 RETURNING *`,
      [name, shared_with, access, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/boards/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM kanban_boards WHERE id=$1 AND owner_id=$2 RETURNING *', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Columns
router.get('/columns', async (req, res) => {
  try {
    const { board_id } = req.query;
    if (!board_id) return res.status(400).json({ error: 'board_id required' });
    const result = await pool.query(
      'SELECT * FROM kanban_columns WHERE board_id = $1 ORDER BY position',
      [board_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/columns', async (req, res) => {
  try {
    const { board_id, name, position } = req.body;
    const result = await pool.query(
      'INSERT INTO kanban_columns (board_id, name, position) VALUES ($1,$2,$3) RETURNING *',
      [board_id, name, position]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/columns/:id', async (req, res) => {
  try {
    const { name, position } = req.body;
    const result = await pool.query(
      'UPDATE kanban_columns SET name=COALESCE($1,name), position=COALESCE($2,position) WHERE id=$3 RETURNING *',
      [name, position, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/columns/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM kanban_columns WHERE id=$1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cards
router.get('/cards', async (req, res) => {
  try {
    const { column_id, board_id } = req.query;
    let query, params;
    if (column_id) {
      query = 'SELECT kc.*, u.name AS assigned_name FROM kanban_cards kc LEFT JOIN users u ON kc.assigned_to = u.id WHERE kc.column_id = $1 ORDER BY kc.position';
      params = [column_id];
    } else if (board_id) {
      query = 'SELECT kc.*, u.name AS assigned_name FROM kanban_cards kc JOIN kanban_columns kcol ON kc.column_id = kcol.id LEFT JOIN users u ON kc.assigned_to = u.id WHERE kcol.board_id = $1 ORDER BY kcol.position, kc.position';
      params = [board_id];
    } else {
      return res.status(400).json({ error: 'column_id or board_id required' });
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/cards', async (req, res) => {
  try {
    const { column_id, title, description, position, due_date, labels = [], assigned_to, assignee_label } = req.body;
    const result = await pool.query(
      `INSERT INTO kanban_cards (column_id, title, description, position, due_date, labels, assigned_to, assignee_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [column_id, title, description, position, due_date, labels, assigned_to, assignee_label || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/cards/:id', async (req, res) => {
  try {
    const { title, description, position, due_date, labels, assigned_to, assignee_label } = req.body;
    const hasAssignedTo = 'assigned_to' in req.body;
    const hasAssigneeLabel = 'assignee_label' in req.body;

    // Build dynamic SET clauses
    const sets = ['title=COALESCE($1,title)', 'description=COALESCE($2,description)',
      'position=COALESCE($3,position)', 'due_date=COALESCE($4,due_date)', 'labels=COALESCE($5,labels)'];
    const params = [title, description, position, due_date, labels];
    let idx = 6;

    if (hasAssignedTo) {
      sets.push(`assigned_to=$${idx}`);
      params.push(assigned_to);
      idx++;
    }
    if (hasAssigneeLabel) {
      sets.push(`assignee_label=$${idx}`);
      params.push(assignee_label);
      idx++;
    }
    sets.push('updated_at=NOW()');
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE kanban_cards SET ${sets.join(', ')} WHERE id=$${idx} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/cards/:id/move', async (req, res) => {
  try {
    const { column_id, position } = req.body;
    const result = await pool.query(
      'UPDATE kanban_cards SET column_id=$1, position=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [column_id, position, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/cards/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM kanban_cards WHERE id=$1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
