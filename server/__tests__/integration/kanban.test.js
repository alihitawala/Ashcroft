/**
 * Kanban — Integration Tests
 * Full workflow: board → columns → cards → move → assign → complete
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

let boardId, col1Id, col2Id, col3Id, card1Id, card2Id;

afterAll(async () => {
  if (boardId) await pool.query('DELETE FROM kanban_boards WHERE id=$1', [boardId]).catch(() => {});
  await pool.end();
});

describe('Kanban Full Workflow', () => {
  test('1. Create admin board', async () => {
    const res = await request(app)
      .post('/api/kanban/boards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ name: 'Integration Test Board', access: 'admin' });
    expect(res.status).toBe(201);
    boardId = res.body.id;
  });

  test('2. Saba cannot see admin board', async () => {
    const res = await request(app)
      .get('/api/kanban/boards')
      .set('Cookie', `access_token=${sabaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.find(b => b.id === boardId)).toBeFalsy();
  });

  test('3. Add columns', async () => {
    const r1 = await request(app)
      .post('/api/kanban/columns')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ board_id: boardId, name: 'Backlog', position: 0 });
    col1Id = r1.body.id;

    const r2 = await request(app)
      .post('/api/kanban/columns')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ board_id: boardId, name: 'In Progress', position: 1 });
    col2Id = r2.body.id;

    const r3 = await request(app)
      .post('/api/kanban/columns')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ board_id: boardId, name: 'Done', position: 2 });
    col3Id = r3.body.id;

    expect(col1Id).toBeTruthy();
    expect(col2Id).toBeTruthy();
    expect(col3Id).toBeTruthy();
  });

  test('4. Add cards', async () => {
    const r1 = await request(app)
      .post('/api/kanban/cards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: col1Id, title: 'Ali task', position: 0, assigned_to: 1, labels: ['Feature'] });
    card1Id = r1.body.id;
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/kanban/cards')
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: col1Id, title: 'Bittu task', position: 1, assignee_label: 'Bittu', labels: ['Infra'] });
    card2Id = r2.body.id;
    expect(r2.status).toBe(201);
    expect(r2.body.assignee_label).toBe('Bittu');
  });

  test('5. Move card to In Progress', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${card2Id}/move`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: col2Id, position: 0 });
    expect(res.status).toBe(200);
    expect(res.body.column_id).toBe(col2Id);
  });

  test('6. Update card assignment from Bittu to Ali', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${card2Id}`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ assigned_to: 1, assignee_label: null });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(1);
    expect(res.body.assignee_label).toBeNull();
  });

  test('7. Move card to Done', async () => {
    const res = await request(app)
      .put(`/api/kanban/cards/${card2Id}/move`)
      .set('Cookie', `access_token=${aliToken}`)
      .send({ column_id: col3Id, position: 0 });
    expect(res.status).toBe(200);
    expect(res.body.column_id).toBe(col3Id);
  });

  test('8. Verify card positions', async () => {
    const res = await request(app)
      .get(`/api/kanban/cards?board_id=${boardId}`)
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    const doneCard = res.body.find(c => c.id === card2Id);
    expect(doneCard.column_id).toBe(col3Id);
  });

  test('9. Delete column cascades cards', async () => {
    await request(app)
      .delete(`/api/kanban/columns/${col1Id}`)
      .set('Cookie', `access_token=${aliToken}`);

    const res = await request(app)
      .get(`/api/kanban/cards?board_id=${boardId}`)
      .set('Cookie', `access_token=${aliToken}`);
    // card1 was in col1, should be gone
    expect(res.body.find(c => c.id === card1Id)).toBeFalsy();
  });

  test('10. Cleanup — delete board', async () => {
    const res = await request(app)
      .delete(`/api/kanban/boards/${boardId}`)
      .set('Cookie', `access_token=${aliToken}`);
    expect(res.status).toBe(200);
    boardId = null;
  });
});
