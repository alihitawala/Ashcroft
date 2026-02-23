const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const { pool } = require('../../db');

let testUserId;
const TEST_EMAIL = 'integration-test@test.local';
const TEST_PASS = 'TestPass123!';

beforeAll(async () => {
  const hash = await bcrypt.hash(TEST_PASS, 10);
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, 'Test User', 'user')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2
     RETURNING id`,
    [TEST_EMAIL, hash]
  );
  testUserId = res.rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  await pool.end();
});

describe('Auth API', () => {
  test('POST /api/auth/login — wrong credentials → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
  });

  test('POST /api/auth/login — missing fields → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/auth/login — valid credentials → 200 + cookies', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASS });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('email', TEST_EMAIL);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('name');
    expect(res.body.user).toHaveProperty('role');

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = cookies.join('; ');
    expect(cookieStr).toMatch(/access_token/);
    expect(cookieStr).toMatch(/refresh_token/);
  });

  test('POST /api/auth/login — nonexistent user → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@nowhere.xyz', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});
