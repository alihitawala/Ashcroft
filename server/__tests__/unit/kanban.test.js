/**
 * Kanban — Unit Tests
 * Tests kanban routes via supertest
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { pool } = require('../../db');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../../.env')));
const JWT_SECRET = env.JWT_SECRET;

const aliToken = jwt.sign({ id: 1, email: 'ali@ashcroft.cloud', role: 'admin', household_id: 1 }, JWT_SECRET, { expiresIn: '10m' });
const sabaToken = jwt.sign({ id: 2, email: 'saba@ashcroft.cloud', role: 'user', household_id: 1 }, JWT_SECRET, { expiresIn: '10m' });

// Track IDs for cleanup
const createdBoardIds = [];
const createdColumnIds = [];
const createdCardIds = [];

afterAll(async () => {
  for (const id of createdCardIds) await pool.query('DELETE FROM kanban_cards WHERE id=$1', [id]).catch(() => {});
  for (const id of createdColumnIds) await pool.query('DELETE FROM kanban_columns WHERE id=$1', [id]).catch(() => {});
  for (const id of createdBoardIds) await pool.query('DELETE FROM kanban_boards WHERE id=$1', [id]).catch(() => {});
  await pool.end();
});

// ─── Board CRUD ───
describe('Kanban Boards', () => {
  let boardId;

  test('POST /kanban/boards — create board', async () => {
    const res = await request(app)
      .post('/api/kanban/boards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Test Board', access: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Board');
    boardId = res.body.id;
    createdBoardIds.push(boardId);
  });

  test('GET /kanban/boards — Ali (admin) sees admin boards', async () => {
    const res = await request(app)
      .get('/api/kanban/boards')
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(b => b.id === boardId);
    expect(found).toBeTruthy();
  });

  test('GET /kanban/boards — Saba (user) cannot see admin boards', async () => {
    const res = await request(app)
      .get('/api/kanban/boards')
      .set('Cookie', `access_token=${sabaToken}`);
    expect(res.status).toBe(200);
    const found = res.body.find(b => b.id === boardId);
    expect(found).toBeFalsy();
  });

  test('PUT /kanban/boards/:id — rename board', async () => {
    const res = await request(app)
      .put(`/api/kanban/boards/${boardId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Renamed Board' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Board');
  });

  test('DELETE /kanban/boards/:id — delete board', async () => {
    const res = await request(app)
      .delete(`/api/kanban/boards/${boardId}`)
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    createdBoardIds.pop();
  });
});

// ─── Column CRUD ───
describe('Kanban Columns', () => {
  let boardId, colId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/kanban/boards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Col Test Board', access: 'private' });
    boardId = res.body.id;
    createdBoardIds.push(boardId);
  });

  test('POST /kanban/columns — create column', async () => {
    const res = await request(app)
      .post('/api/kanban/columns')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ board_id: boardId, name: 'To Do', position: 0 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('To Do');
    colId = res.body.id;
    createdColumnIds.push(colId);
  });

  test('GET /kanban/columns — list columns', async () => {
    const res = await request(app)
      .get(`/api/kanban/columns?board_id=${boardId}`)
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('PUT /kanban/columns/:id — rename column', async () => {
    const res = await request(app)
      .put(`/api/kanban/columns/${colId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Done' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Done');
  });

  test('DELETE /kanban/columns/:id — deletes column and cascades cards', async () => {
    // Add a card first
    const cardRes = await request(app)
      .post('/api/kanban/cards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: colId, title: 'Cascade test', position: 0 });

    const res = await request(app)
      .delete(`/api/kanban/columns/${colId}`)
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    createdColumnIds.pop();

    // Card should be gone too (cascade)
    const check = await pool.query('SELECT * FROM kanban_cards WHERE id=$1', [cardRes.body.id]);
    expect(check.rows.length).toBe(0);
  });
});

// ─── Card CRUD ───
describe('Kanban Cards', () => {
  let boardId, colId1, colId2, cardId;

  beforeAll(async () => {
    const bRes = await request(app)
      .post('/api/kanban/boards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Card Test Board', access: 'private' });
    boardId = bRes.body.id;
    createdBoardIds.push(boardId);

    const c1 = await request(app)
      .post('/api/kanban/columns')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ board_id: boardId, name: 'Backlog', position: 0 });
    colId1 = c1.body.id;
    createdColumnIds.push(colId1);

    const c2 = await request(app)
      .post('/api/kanban/columns')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ board_id: boardId, name: 'Done', position: 1 });
    colId2 = c2.body.id;
    createdColumnIds.push(colId2);
  });

  test('POST /kanban/cards — create card', async () => {
    const res = await request(app)
      .post('/api/kanban/cards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: colId1, title: 'Test Card', position: 0, labels: ['Bug', 'Feature'] });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test Card');
    expect(res.body.labels).toEqual(['Bug', 'Feature']);
    cardId = res.body.id;
    createdCardIds.push(cardId);
  });

  test('GET /kanban/cards?board_id — list cards', async () => {
    const res = await request(app)
      .get(`/api/kanban/cards?board_id=${boardId}`)
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    const found = res.body.find(c => c.id === cardId);
    expect(found).toBeTruthy();
  });

  test('PUT /kanban/cards/:id — update card', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${cardId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ title: 'Updated Card', description: 'Some desc', labels: ['Garden'] });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Card');
    expect(res.body.description).toBe('Some desc');
  });

  test('PUT /kanban/cards/:id — assign to Ali', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${cardId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ assigned_to: 1, assignee_label: null });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(1);
    expect(res.body.assignee_label).toBeNull();
  });

  test('PUT /kanban/cards/:id — assign to Bittu via assignee_label', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${cardId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ assigned_to: null, assignee_label: 'Bittu' });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBeNull();
    expect(res.body.assignee_label).toBe('Bittu');
  });

  test('PUT /kanban/cards/:id — unassign (both null)', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${cardId}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ assigned_to: null, assignee_label: null });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBeNull();
    expect(res.body.assignee_label).toBeNull();
  });

  test('POST /kanban/cards — create card with assignee_label', async () => {
    const res = await request(app)
      .post('/api/kanban/cards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: colId1, title: 'Bittu Task', position: 1, assignee_label: 'Bittu' });
    expect(res.status).toBe(201);
    expect(res.body.assignee_label).toBe('Bittu');
    createdCardIds.push(res.body.id);
  });

  test('PUT /kanban/cards/:id/move — move card between columns', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${cardId}/move`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: colId2, position: 0 });
    expect(res.status).toBe(200);
    expect(res.body.column_id).toBe(colId2);
  });

  test('DELETE /kanban/cards/:id — delete card', async () => {
    const res = await request(app)
      .delete(`/api/kanban/cards/${cardId}`)
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    createdCardIds.shift();
  });

  test('GET /kanban/cards without params → 400', async () => {
    const res = await request(app)
      .get('/api/kanban/cards')
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(400);
  });
});
