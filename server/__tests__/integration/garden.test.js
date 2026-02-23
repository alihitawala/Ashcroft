const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const { pool } = require('../../db');

let cookies;
let testUserId;
let testPlantId;
const TEST_EMAIL = 'garden-test@test.local';
const TEST_PASS = 'GardenTest123!';

beforeAll(async () => {
  const hash = await bcrypt.hash(TEST_PASS, 10);
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, household_id)
     VALUES ($1, $2, 'Garden Tester', 'admin', 1)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin'
     RETURNING id`,
    [TEST_EMAIL, hash]
  );
  testUserId = userRes.rows[0].id;

  // Login to get cookies
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASS });
  cookies = loginRes.headers['set-cookie'];

  // Create a test plant
  const plantRes = await pool.query(
    `INSERT INTO garden_plants (name, species, type, location, health_status, owner_id, access)
     VALUES ('Test Lemon', 'Citrus limon', 'fruit_tree', 'Backyard', 'healthy', $1, 'private')
     RETURNING id`,
    [testUserId]
  );
  testPlantId = plantRes.rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM garden_plants WHERE id = $1', [testPlantId]);
  await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  await pool.end();
});

describe('Garden API', () => {
  test('GET /api/garden/plants — returns array', async () => {
    const res = await request(app)
      .get('/api/garden/plants')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/garden/plants — without auth → 401', async () => {
    const res = await request(app).get('/api/garden/plants');
    expect(res.status).toBe(401);
  });

  test('GET /api/garden/plants — response shape', async () => {
    const res = await request(app)
      .get('/api/garden/plants')
      .set('Cookie', cookies);
    const plant = res.body.find(p => p.id === testPlantId);
    expect(plant).toBeDefined();
    expect(plant).toHaveProperty('name', 'Test Lemon');
    expect(plant).toHaveProperty('species');
    expect(plant).toHaveProperty('type');
    expect(plant).toHaveProperty('location');
    expect(plant).toHaveProperty('health_status');
  });
});
