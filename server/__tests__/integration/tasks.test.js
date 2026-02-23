/**
 * Tasks — Integration Tests
 * Tests real API endpoints via supertest against the Express app
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { pool } = require('../../db');
const fs = require('fs');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(require('path').join(__dirname, '../../.env')));
const JWT_SECRET = env.JWT_SECRET;

// Generate tokens for both users
const aliToken = jwt.sign({ id: 1, email: 'ali@ashcroft.cloud', role: 'admin', household_id: 1 }, JWT_SECRET, { expiresIn: '10m' });
const sabaToken = jwt.sign({ id: 2, email: 'saba@ashcroft.cloud', role: 'user', household_id: 1 }, JWT_SECRET, { expiresIn: '10m' });

// Track created IDs for cleanup
const createdTaskIds = [];
const createdListIds = [];

afterAll(async () => {
  // Cleanup test data
  for (const id of createdTaskIds) {
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of createdListIds) {
    await pool.query('DELETE FROM task_lists WHERE id = $1', [id]).catch(() => {});
  }
  await pool.end();
});

describe('POST /api/tasks', () => {
  test('creates task with assigned_to as name string "saba" → resolves to ID 2', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: assign saba', assigned_to: 'saba', access: 'household' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test: assign saba');
    expect(res.body.assigned_to).toBe(2);
    expect(res.body.assigned_to_name).toBe('Saba');
    expect(res.body.created_by_name).toBe('Ali');
    createdTaskIds.push(res.body.id);
  });

  test('creates task with assigned_to as name string "ali" → resolves to ID 1', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${sabaToken}`)
      .send({ title: 'Test: assign ali', assigned_to: 'ali', access: 'household' });

    expect(res.status).toBe(201);
    expect(res.body.assigned_to).toBe(1);
    expect(res.body.assigned_to_name).toBe('Ali');
    expect(res.body.created_by_name).toBe('Saba');
    createdTaskIds.push(res.body.id);
  });

  test('creates task with assigned_to as integer ID', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: assign by ID', assigned_to: 2, access: 'private' });

    expect(res.status).toBe(201);
    expect(res.body.assigned_to).toBe(2);
    expect(res.body.assigned_to_name).toBe('Saba');
    createdTaskIds.push(res.body.id);
  });

  test('empty strings for optional fields → null, no crash', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({
        title: 'Test: empty fields',
        description: '',
        due_date: '',
        assigned_to: '',
        list_id: '',
        access: 'private',
      });

    expect(res.status).toBe(201);
    expect(res.body.description).toBeNull();
    expect(res.body.due_date).toBeNull();
    expect(res.body.assigned_to).toBeNull();
    expect(res.body.assigned_to_name).toBeNull();
    expect(res.body.list_id).toBeNull();
    createdTaskIds.push(res.body.id);
  });

  test('unknown assigned_to name → null (no crash)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: unknown user', assigned_to: 'nonexistent', access: 'private' });

    expect(res.status).toBe(201);
    expect(res.body.assigned_to).toBeNull();
    createdTaskIds.push(res.body.id);
  });

  test('missing title → 400 error', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ description: 'no title' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  test('creates task with due_date', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: with date', due_date: '2026-03-01', priority: 'high', access: 'private' });

    expect(res.status).toBe(201);
    expect(res.body.due_date).toContain('2026-03-01');
    expect(res.body.priority).toBe('high');
    createdTaskIds.push(res.body.id);
  });

  test('no auth → 401', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Should fail' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/tasks', () => {
  let householdTaskId, privateTaskId;

  beforeAll(async () => {
    // Ali creates a household task
    const r1 = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: Ali household task', assigned_to: 'saba', access: 'household' });
    householdTaskId = r1.body.id;
    createdTaskIds.push(householdTaskId);

    // Ali creates a private task
    const r2 = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: Ali private task', access: 'private' });
    privateTaskId = r2.body.id;
    createdTaskIds.push(privateTaskId);
  });

  test('returns assigned_to_name and created_by_name fields', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const householdTask = res.body.find(t => t.id === householdTaskId);
    expect(householdTask).toBeTruthy();
    expect(householdTask.assigned_to_name).toBe('Saba');
    expect(householdTask.created_by_name).toBe('Ali');
  });

  test('Saba sees Ali household tasks', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Cookie', `access_token=${sabaToken}`);

    expect(res.status).toBe(200);
    const found = res.body.find(t => t.id === householdTaskId);
    expect(found).toBeTruthy();
    expect(found.title).toBe('Test: Ali household task');
  });

  test('Saba does NOT see Ali private tasks', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Cookie', `access_token=${sabaToken}`);

    expect(res.status).toBe(200);
    const found = res.body.find(t => t.id === privateTaskId);
    expect(found).toBeFalsy();
  });

  test('Ali sees his own private tasks', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`);

    const found = res.body.find(t => t.id === privateTaskId);
    expect(found).toBeTruthy();
  });
});

describe('PUT /api/tasks/:id', () => {
  let taskId;

  beforeAll(async () => {
    const r = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: update me', assigned_to: 'ali', due_date: '2026-03-01', access: 'private' });
    taskId = r.body.id;
    createdTaskIds.push(taskId);
  });

  test('update assigned_to from ali to saba', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ assigned_to: 'saba' });

    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(2);
    expect(res.body.assigned_to_name).toBe('Saba');
  });

  test('clear due_date by sending empty string', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ due_date: '' });

    expect(res.status).toBe(200);
    expect(res.body.due_date).toBeNull();
  });

  test('clear assigned_to by sending empty string', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ assigned_to: '' });

    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBeNull();
    expect(res.body.assigned_to_name).toBeNull();
  });

  test('update title and priority', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Updated title', priority: 'urgent' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated title');
    expect(res.body.priority).toBe('urgent');
  });

  test('mark as done', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ status: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });

  test('update nonexistent task → 404', async () => {
    const res = await request(app)
      .put('/api/tasks/999999')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Nope' });

    expect(res.status).toBe(404);
  });

  test('empty update body → 400', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/tasks/:id', () => {
  test('deletes a task', async () => {
    const r = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: delete me', access: 'private' });
    const id = r.body.id;

    const res = await request(app)
      .delete(`/api/tasks/${id}`)
      .set('Cookie', `access_token=${aliToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deleted');
  });

  test('delete nonexistent → 404', async () => {
    const res = await request(app)
      .delete('/api/tasks/999999')
      .set('Cookie', `access_token=${aliToken}`);

    expect(res.status).toBe(404);
  });
});

describe('Task Lists', () => {
  let listId;

  test('create a household list', async () => {
    const res = await request(app)
      .post('/api/task-lists')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Test: Shared List', access: 'household' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test: Shared List');
    expect(res.body.access).toBe('household');
    listId = res.body.id;
    createdListIds.push(listId);
  });

  test('Saba sees household list created by Ali', async () => {
    const res = await request(app)
      .get('/api/task-lists')
      .set('Cookie', `access_token=${sabaToken}`);

    expect(res.status).toBe(200);
    const found = res.body.find(l => l.id === listId);
    expect(found).toBeTruthy();
    expect(found.name).toBe('Test: Shared List');
  });

  test('create private list — only creator sees it', async () => {
    const r = await request(app)
      .post('/api/task-lists')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Test: Ali Private', access: 'private' });

    createdListIds.push(r.body.id);

    const sabaRes = await request(app)
      .get('/api/task-lists')
      .set('Cookie', `access_token=${sabaToken}`);

    const found = sabaRes.body.find(l => l.id === r.body.id);
    expect(found).toBeFalsy();
  });

  test('create task in a list', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Test: in list', list_id: listId, access: 'household' });

    expect(res.status).toBe(201);
    expect(res.body.list_id).toBe(listId);
    createdTaskIds.push(res.body.id);
  });

  test('empty list name → 400', async () => {
    const res = await request(app)
      .post('/api/task-lists')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
  });
});
