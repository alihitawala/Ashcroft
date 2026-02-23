const request = require('supertest');
const express = require('express');

jest.mock('../../db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1, role: 'admin', household_id: 10 };
    next();
  },
  JWT_SECRET: 'test-secret'
}));

const { pool } = require('../../db');
const groceryRouter = require('../../routes/grocery');

const app = express();
app.use(express.json());
app.use('/grocery', groceryRouter);

beforeEach(() => jest.clearAllMocks());

describe('GET /grocery/stores', () => {
  it('returns stores list', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Costco', icon: '🏪' }] });
    const res = await request(app).get('/grocery/stores');
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Costco');
  });

  it('handles db error', async () => {
    pool.query.mockRejectedValueOnce(new Error('fail'));
    const res = await request(app).get('/grocery/stores');
    expect(res.status).toBe(500);
  });
});

describe('POST /grocery/stores', () => {
  it('requires name', async () => {
    const res = await request(app).post('/grocery/stores').send({});
    expect(res.status).toBe(400);
  });

  it('creates store with default icon', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Trader Joes', icon: '🏪' }] });
    const res = await request(app).post('/grocery/stores').send({ name: 'Trader Joes' });
    expect(res.status).toBe(201);
    // Check that name is trimmed
    expect(pool.query.mock.calls[0][1][0]).toBe('Trader Joes');
  });

  it('trims whitespace from name', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'HEB' }] });
    await request(app).post('/grocery/stores').send({ name: '  HEB  ' });
    expect(pool.query.mock.calls[0][1][0]).toBe('HEB');
  });

  it('accepts custom icon', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await request(app).post('/grocery/stores').send({ name: 'Target', icon: '🎯' });
    expect(pool.query.mock.calls[0][1][1]).toBe('🎯');
  });
});

describe('POST /grocery/grocery-items', () => {
  it('creates item and re-fetches with store join', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // insert
      .mockResolvedValueOnce({ rows: [{ id: 5, name: 'Milk', store_name: 'HEB' }] }); // re-fetch
    const res = await request(app).post('/grocery/grocery-items')
      .send({ list_id: 1, name: 'Milk', category: 'dairy', quantity: '1 gal' });
    expect(res.status).toBe(201);
    expect(res.body.store_name).toBe('HEB');
  });

  it('defaults store_id to null', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await request(app).post('/grocery/grocery-items')
      .send({ list_id: 1, name: 'Eggs', category: 'dairy', quantity: '1 dz' });
    const params = pool.query.mock.calls[0][1];
    expect(params[params.length - 1]).toBeNull(); // store_id
  });
});

describe('PUT /grocery/grocery-items/:id', () => {
  it('rejects empty update', async () => {
    const res = await request(app).put('/grocery/grocery-items/1').send({});
    expect(res.status).toBe(400);
  });

  it('updates only provided fields', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // update
      .mockResolvedValueOnce({ rows: [{ id: 1, checked: true }] }); // re-fetch
    const res = await request(app).put('/grocery/grocery-items/1').send({ checked: true });
    expect(res.status).toBe(200);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('checked=$1');
    expect(sql).not.toContain('name=');
  });

  it('returns 404 for missing item', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/grocery/grocery-items/999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /grocery/grocery-items/:id', () => {
  it('deletes item', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app).delete('/grocery/grocery-items/1');
    expect(res.status).toBe(200);
  });

  it('returns 404 if not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/grocery/grocery-items/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /grocery/grocery-lists', () => {
  it('creates list with default access', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Weekly', access: 'household' }] });
    const res = await request(app).post('/grocery/grocery-lists').send({ name: 'Weekly' });
    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[0][1][1]).toBe('household'); // default access
  });
});

describe('DELETE /grocery/grocery-lists/:id', () => {
  it('only owner can delete', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // owner check fails
    const res = await request(app).delete('/grocery/grocery-lists/1');
    expect(res.status).toBe(404);
  });
});
