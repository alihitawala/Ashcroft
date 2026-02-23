const { Router } = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { folder, tag } = req.query;
    let query = `SELECT * FROM notes WHERE 
      (access = 'private' AND owner_id = $1) OR 
      (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $2)) OR
      (access = 'admin' AND $3 = 'admin')`;
    const params = [req.user.id, req.user.household_id, req.user.role];
    if (folder) { params.push(folder); query += ` AND folder = $${params.length}`; }
    if (tag) { params.push(tag); query += ` AND $${params.length} = ANY(tags)`; }
    query += ' ORDER BY pinned DESC, updated_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, content, access = 'private', tags = [], folder, pinned = false } = req.body;
    const result = await pool.query(
      `INSERT INTO notes (title, content, owner_id, access, tags, folder, pinned) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, content, req.user.id, access, tags, folder, pinned]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, content, access, tags, folder, pinned } = req.body;
    const result = await pool.query(
      `UPDATE notes SET title=COALESCE($1,title), content=COALESCE($2,content), access=COALESCE($3,access),
       tags=COALESCE($4,tags), folder=COALESCE($5,folder), pinned=COALESCE($6,pinned), updated_at=NOW()
       WHERE id=$7 AND ((access = 'private' AND owner_id = $8) OR 
                       (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $9)) OR
                       (access = 'admin' AND $10 = 'admin')) RETURNING *`,
      [title, content, access, tags, folder, pinned, req.params.id, req.user.id, req.user.household_id, req.user.role]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM notes WHERE id=$1 AND owner_id=$2 RETURNING *', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
