const { Router } = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { upcoming } = req.query;
    let query = `SELECT * FROM events WHERE (
      (access = 'private' AND owner_id = $1) OR 
      (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $2)) OR
      (access = 'admin' AND $3 = 'admin')
    )`;
    const params = [req.user.id, req.user.household_id, req.user.role];
    if (upcoming) {
      params.push(parseInt(upcoming));
      query += ` AND date >= CURRENT_DATE ORDER BY date, time LIMIT $${params.length}`;
    } else {
      query += ` ORDER BY date, time`;
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, description, date, time, end_time, type = 'one-time', recurrence_rule, access = 'household', reminder_before, category, location } = req.body;
    const rbArr = reminder_before ? (Array.isArray(reminder_before) ? reminder_before : [reminder_before]) : null;
    const result = await pool.query(
      `INSERT INTO events (title, description, date, time, end_time, type, recurrence_rule, owner_id, access, reminder_before, category, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [title, description, date, time, end_time, type, recurrence_rule, req.user.id, access, rbArr, category, location]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, description, date, time, end_time, type, recurrence_rule, access, reminder_before, category, location } = req.body;
    const rbArr = reminder_before ? (Array.isArray(reminder_before) ? reminder_before : [reminder_before]) : null;
    const result = await pool.query(
      `UPDATE events SET title=COALESCE($1,title), description=COALESCE($2,description), date=COALESCE($3,date),
       time=COALESCE($4,time), end_time=COALESCE($5,end_time), type=COALESCE($6,type),
       recurrence_rule=COALESCE($7,recurrence_rule), access=COALESCE($8,access),
       reminder_before=COALESCE($9,reminder_before), category=COALESCE($10,category), 
       location=COALESCE($11,location), updated_at=NOW()
       WHERE id=$12 AND ((access = 'private' AND owner_id = $13) OR 
                        (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $14)) OR
                        (access = 'admin' AND $15 = 'admin')) RETURNING *`,
      [title, description, date, time, end_time, type, recurrence_rule, access, rbArr, category, location, req.params.id, req.user.id, req.user.household_id, req.user.role]
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
    const result = await pool.query('DELETE FROM events WHERE id=$1 AND owner_id=$2 RETURNING *', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
