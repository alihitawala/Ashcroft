/**
 * Unit tests for tasks route helpers and logic
 */
const { pool } = require('../../db');

// We need to test the helper functions from tasks.js
// Since they're not exported, we test them indirectly via the route behavior
// But we can extract and test the core logic patterns

describe('Tasks — Helper Logic', () => {

  describe('Name → ID resolution', () => {
    test('ali → 1', async () => {
      const r = await pool.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', ['ali']);
      expect(r.rows[0]?.id).toBe(1);
    });

    test('saba → 2', async () => {
      const r = await pool.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', ['saba']);
      expect(r.rows[0]?.id).toBe(2);
    });

    test('Ali (mixed case) → 1', async () => {
      const r = await pool.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', ['Ali']);
      expect(r.rows[0]?.id).toBe(1);
    });

    test('SABA (uppercase) → 2', async () => {
      const r = await pool.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', ['SABA']);
      expect(r.rows[0]?.id).toBe(2);
    });

    test('unknown name → null/undefined', async () => {
      const r = await pool.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', ['unknown']);
      expect(r.rows[0]?.id).toBeUndefined();
    });

    test('empty string query returns no rows', async () => {
      const r = await pool.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', ['']);
      expect(r.rows.length).toBe(0);
    });

    test('integer ID passes through (not a DB lookup)', () => {
      // The route does: if (!isNaN(val) && val !== '') return Number(val);
      const val = 2;
      expect(!isNaN(val) && val !== '').toBe(true);
      expect(Number(val)).toBe(2);
    });

    test('string number "2" is treated as number', () => {
      const val = '2';
      expect(!isNaN(val) && val !== '').toBe(true);
      expect(Number(val)).toBe(2);
    });
  });

  describe('Empty string → null conversion', () => {
    function emptyToNull(v) {
      if (v === '' || v === undefined) return null;
      return v;
    }

    test('empty string → null', () => expect(emptyToNull('')).toBeNull());
    test('undefined → null', () => expect(emptyToNull(undefined)).toBeNull());
    test('null stays null', () => expect(emptyToNull(null)).toBeNull());
    test('valid string passes through', () => expect(emptyToNull('hello')).toBe('hello'));
    test('0 passes through', () => expect(emptyToNull(0)).toBe(0));
    test('false passes through', () => expect(emptyToNull(false)).toBe(false));
    test('date string passes through', () => expect(emptyToNull('2026-02-23')).toBe('2026-02-23'));
  });

  describe('Access control logic', () => {
    // Simulating the WHERE clause logic from GET /tasks for tasks without a list
    function canSeeTask(task, user) {
      if (task.access === 'private' && task.created_by === user.id) return true;
      if (task.access === 'household' && user.household_id === task.creator_household_id) return true;
      if (task.access === 'admin' && user.role === 'admin') return true;
      return false;
    }

    const ali = { id: 1, role: 'admin', household_id: 1 };
    const saba = { id: 2, role: 'user', household_id: 1 };

    test('private task visible to creator only', () => {
      const task = { access: 'private', created_by: 1, creator_household_id: 1 };
      expect(canSeeTask(task, ali)).toBe(true);
      expect(canSeeTask(task, saba)).toBe(false);
    });

    test('household task visible to all household members', () => {
      const task = { access: 'household', created_by: 1, creator_household_id: 1 };
      expect(canSeeTask(task, ali)).toBe(true);
      expect(canSeeTask(task, saba)).toBe(true);
    });

    test('admin task visible to admin only', () => {
      const task = { access: 'admin', created_by: 1, creator_household_id: 1 };
      expect(canSeeTask(task, ali)).toBe(true);
      expect(canSeeTask(task, saba)).toBe(false);
    });
  });

  describe('Task CRUD (direct DB)', () => {
    let taskId;

    test('create task', async () => {
      const r = await pool.query(
        `INSERT INTO tasks (title, description, priority, status, created_by, assigned_to, access)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        ['Unit test task', 'desc', 'high', 'todo', 1, 2, 'household']
      );
      taskId = r.rows[0].id;
      expect(r.rows[0].title).toBe('Unit test task');
      expect(r.rows[0].assigned_to).toBe(2);
      expect(r.rows[0].priority).toBe('high');
    });

    test('read task with joins', async () => {
      const r = await pool.query(
        `SELECT t.*, u.name as assigned_to_name, c.name as created_by_name
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assigned_to
         LEFT JOIN users c ON c.id = t.created_by
         WHERE t.id = $1`, [taskId]
      );
      expect(r.rows[0].assigned_to_name).toBe('Saba');
      expect(r.rows[0].created_by_name).toBe('Ali');
    });

    test('update task — clear fields', async () => {
      await pool.query(
        `UPDATE tasks SET due_date = NULL, assigned_to = NULL, updated_at = NOW() WHERE id = $1`,
        [taskId]
      );
      const r = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      expect(r.rows[0].due_date).toBeNull();
      expect(r.rows[0].assigned_to).toBeNull();
    });

    test('delete task', async () => {
      const r = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [taskId]);
      expect(r.rows[0].id).toBe(taskId);
      const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      expect(check.rows.length).toBe(0);
    });
  });

  describe('Task Lists CRUD (direct DB)', () => {
    let listId;

    test('create list', async () => {
      const r = await pool.query(
        'INSERT INTO task_lists (name, access, owner_id) VALUES ($1, $2, $3) RETURNING *',
        ['Unit Test List', 'household', 1]
      );
      listId = r.rows[0].id;
      expect(r.rows[0].name).toBe('Unit Test List');
      expect(r.rows[0].access).toBe('household');
    });

    test('household list visible via query', async () => {
      // Saba (household_id=1) should see household lists owned by Ali (household_id=1)
      const r = await pool.query(
        `SELECT * FROM task_lists WHERE id = $1 AND (
          (access = 'private' AND owner_id = $2) OR
          (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $3)) OR
          (access = 'admin' AND $4 = 'admin')
        )`,
        [listId, 2, 1, 'user']
      );
      expect(r.rows.length).toBe(1);
    });

    test('delete list', async () => {
      await pool.query('DELETE FROM task_lists WHERE id = $1', [listId]);
      const check = await pool.query('SELECT * FROM task_lists WHERE id = $1', [listId]);
      expect(check.rows.length).toBe(0);
    });
  });
});

afterAll(async () => {
  await pool.end();
});
