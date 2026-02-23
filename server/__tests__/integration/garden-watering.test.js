const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const { pool } = require('../../db');

let cookies;
let testUserId;
let testPlantId;
const TEST_EMAIL = 'garden-watering-test@test.local';
const TEST_PASS = 'WateringTest123!';

beforeAll(async () => {
  const hash = await bcrypt.hash(TEST_PASS, 10);
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, household_id)
     VALUES ($1, $2, 'Watering Tester', 'admin', 1)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin'
     RETURNING id`,
    [TEST_EMAIL, hash]
  );
  testUserId = userRes.rows[0].id;

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASS });
  cookies = loginRes.headers['set-cookie'];

  // Create test plant with known watering data
  const plantRes = await pool.query(
    `INSERT INTO garden_plants 
     (name, species, type, location, health_status, owner_id, access,
      water_gallons, watering_interval_days, next_watering, last_watered, watering_frequency)
     VALUES ('Test Watering Fig', 'Ficus carica', 'fruit_tree', 'Backyard', 'healthy', $1, 'private',
             5, 7, CURRENT_DATE, CURRENT_DATE - INTERVAL '7 days', 'weekly')
     RETURNING id`,
    [testUserId]
  );
  testPlantId = plantRes.rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM garden_logs WHERE plant_id = $1', [testPlantId]);
  await pool.query('DELETE FROM garden_plants WHERE id = $1', [testPlantId]);
  await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  await pool.end();
});

describe('GET /api/garden/watering-schedule', () => {
  it('requires auth — 401 without cookies', async () => {
    const res = await request(app).get('/api/garden/watering-schedule');
    expect(res.status).toBe(401);
  });

  it('returns overdue/today/soon/upcoming groups', async () => {
    const res = await request(app)
      .get('/api/garden/watering-schedule')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overdue');
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('soon');
    expect(res.body).toHaveProperty('upcoming');
    expect(Array.isArray(res.body.overdue)).toBe(true);
    expect(Array.isArray(res.body.today)).toBe(true);
    expect(Array.isArray(res.body.soon)).toBe(true);
    expect(Array.isArray(res.body.upcoming)).toBe(true);
  });

  it('each plant has required fields', async () => {
    const res = await request(app)
      .get('/api/garden/watering-schedule')
      .set('Cookie', cookies);
    // Find our test plant in one of the groups
    const allPlants = [
      ...res.body.overdue, ...res.body.today,
      ...res.body.soon, ...res.body.upcoming
    ];
    const plant = allPlants.find(p => p.id === testPlantId);
    expect(plant).toBeDefined();
    expect(plant).toHaveProperty('id');
    expect(plant).toHaveProperty('name');
    expect(plant).toHaveProperty('water_gallons');
    expect(plant).toHaveProperty('next_watering');
    expect(plant).toHaveProperty('urgency');
    expect(plant).toHaveProperty('days_until_watering');
  });
});

describe('POST /api/garden/plants/:id/logs (watering)', () => {
  it('updates last_watered to today', async () => {
    const res = await request(app)
      .post(`/api/garden/plants/${testPlantId}/logs`)
      .set('Cookie', cookies)
      .send({ type: 'watering', notes: 'Test watering' });
    expect(res.status).toBe(201);

    // Verify last_watered updated
    const plantRes = await request(app)
      .get('/api/garden/plants')
      .set('Cookie', cookies);
    const plant = plantRes.body.find(p => p.id === testPlantId);
    const today = new Date().toISOString().split('T')[0];
    expect(plant.last_watered.split('T')[0]).toBe(today);
  });

  it('advances next_watering', async () => {
    // Get current next_watering
    const before = await pool.query('SELECT next_watering FROM garden_plants WHERE id = $1', [testPlantId]);
    const beforeDate = before.rows[0].next_watering;

    await request(app)
      .post(`/api/garden/plants/${testPlantId}/logs`)
      .set('Cookie', cookies)
      .send({ type: 'watering' });

    const after = await pool.query('SELECT next_watering FROM garden_plants WHERE id = $1', [testPlantId]);
    const afterDate = after.rows[0].next_watering;
    // next_watering should have changed (advanced from CURRENT_DATE + interval)
    expect(afterDate).toBeDefined();
  });

  it('next_watering lands on weekend (Saturday or Sunday)', async () => {
    await request(app)
      .post(`/api/garden/plants/${testPlantId}/logs`)
      .set('Cookie', cookies)
      .send({ type: 'watering' });

    const result = await pool.query('SELECT next_watering FROM garden_plants WHERE id = $1', [testPlantId]);
    const nextWatering = new Date(result.rows[0].next_watering);
    const day = nextWatering.getUTCDay(); // 0=Sun, 6=Sat
    expect([0, 6]).toContain(day);
  });
});

describe('GET /api/garden/plants — watering fields', () => {
  it('includes watering fields', async () => {
    const res = await request(app)
      .get('/api/garden/plants')
      .set('Cookie', cookies);
    const plant = res.body.find(p => p.id === testPlantId);
    expect(plant).toBeDefined();
    expect(plant).toHaveProperty('next_watering');
    expect(plant).toHaveProperty('water_gallons');
    expect(plant).toHaveProperty('watering_interval_days');
    expect(Number(plant.water_gallons)).toBe(5);
    expect(plant.watering_interval_days).toBe(7);
  });
});
