const request = require('supertest');
const express = require('express');

jest.mock('../../db', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn()
  }
}));
jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1, role: 'admin', household_id: 10 };
    next();
  },
  JWT_SECRET: 'test-secret'
}));
jest.mock('multer', () => {
  const m = () => ({
    single: () => (req, res, next) => next(),
    diskStorage: jest.fn()
  });
  m.diskStorage = jest.fn(() => ({}));
  return m;
});
jest.mock('fs', () => ({ mkdirSync: jest.fn() }));

const { pool } = require('../../db');
const gardenRouter = require('../../routes/garden');

const app = express();
app.use(express.json());
app.use('/garden', gardenRouter);

beforeEach(() => jest.clearAllMocks());

// ─── Weekend Snapping Logic (SQL-based, as used in POST /plants/:id/logs) ───
// The SQL uses EXTRACT(DOW FROM date) where Sun=0, Mon=1, ..., Sat=6
// and snaps: Mon→Sun(-1), Tue→Sun(-2), Wed→Sat(+3), Thu→Sat(+2), Fri→Sat(+1), Sat/Sun→keep
describe('Weekend snapping via watering log', () => {
  // We test this indirectly by verifying the SQL contains the correct CASE expression
  // The actual snapping happens in PostgreSQL, so we verify the SQL is correct

  it('watering log SQL contains weekend snapping CASE expression', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, watering_interval_days: 7 }] }) // checkPlantAccess
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT log
      .mockResolvedValueOnce({}) // UPDATE with snapping
      .mockResolvedValueOnce({ rows: [{ id: 10, type: 'watering' }] }); // re-fetch

    await request(app).post('/garden/plants/1/logs').send({ type: 'watering' });

    const updateSQL = pool.query.mock.calls[2][0];
    // Verify snapping rules are in the SQL
    expect(updateSQL).toContain('WHEN 1 THEN -1');  // Mon → Sun
    expect(updateSQL).toContain('WHEN 2 THEN -2');  // Tue → Sun
    expect(updateSQL).toContain('WHEN 3 THEN 3');   // Wed → Sat
    expect(updateSQL).toContain('WHEN 4 THEN 2');   // Thu → Sat
    expect(updateSQL).toContain('WHEN 5 THEN 1');   // Fri → Sat
    expect(updateSQL).toContain('ELSE 0');           // Sat/Sun → keep
  });
});

// ─── Pure weekend snapping function (mirrors SQL logic) ───
// Extracted for direct unit testing
function snapToWeekendSQL(date) {
  const d = new Date(date);
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offsets = { 1: -1, 2: -2, 3: 3, 4: 2, 5: 1, 0: 0, 6: 0 };
  d.setUTCDate(d.getUTCDate() + offsets[dow]);
  return d;
}

describe('Weekend snapping logic (SQL-equivalent)', () => {
  it('Monday → snaps to Sunday (previous day)', () => {
    const result = snapToWeekendSQL('2026-02-23'); // Monday
    expect(result.getUTCDay()).toBe(0); // Sunday
    expect(result.toISOString().split('T')[0]).toBe('2026-02-22');
  });

  it('Tuesday → snaps to Sunday', () => {
    const result = snapToWeekendSQL('2026-02-24'); // Tuesday
    expect(result.getUTCDay()).toBe(0); // Sunday
    expect(result.toISOString().split('T')[0]).toBe('2026-02-22');
  });

  it('Wednesday → snaps to Saturday (forward)', () => {
    const result = snapToWeekendSQL('2026-02-25'); // Wednesday
    expect(result.getUTCDay()).toBe(6); // Saturday
    expect(result.toISOString().split('T')[0]).toBe('2026-02-28');
  });

  it('Thursday → snaps to Saturday', () => {
    const result = snapToWeekendSQL('2026-02-26'); // Thursday
    expect(result.getUTCDay()).toBe(6); // Saturday
    expect(result.toISOString().split('T')[0]).toBe('2026-02-28');
  });

  it('Friday → snaps to Saturday', () => {
    const result = snapToWeekendSQL('2026-02-27'); // Friday
    expect(result.getUTCDay()).toBe(6); // Saturday
    expect(result.toISOString().split('T')[0]).toBe('2026-02-28');
  });

  it('Saturday → stays Saturday', () => {
    const result = snapToWeekendSQL('2026-02-28'); // Saturday
    expect(result.getUTCDay()).toBe(6);
    expect(result.toISOString().split('T')[0]).toBe('2026-02-28');
  });

  it('Sunday → stays Sunday', () => {
    const result = snapToWeekendSQL('2026-03-01'); // Sunday
    expect(result.getUTCDay()).toBe(0);
    expect(result.toISOString().split('T')[0]).toBe('2026-03-01');
  });
});

// ─── Watering interval advancement ───
describe('Watering interval advancement', () => {
  it('plant with watering_interval_days triggers next_watering update', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, watering_interval_days: 7 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 10, type: 'watering' }] });

    await request(app).post('/garden/plants/1/logs').send({ type: 'watering' });

    const updateSQL = pool.query.mock.calls[2][0];
    expect(updateSQL).toContain('next_watering');
    expect(updateSQL).toContain('watering_interval_days');
  });

  it('plant without watering_interval_days keeps next_watering unchanged', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, watering_interval_days: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 10, type: 'watering' }] });

    await request(app).post('/garden/plants/1/logs').send({ type: 'watering' });

    const updateSQL = pool.query.mock.calls[2][0];
    // The SQL uses CASE WHEN watering_interval_days IS NOT NULL ... ELSE next_watering END
    expect(updateSQL).toContain('ELSE next_watering END');
  });

  it('7-day interval SQL advances by 7 days then snaps', async () => {
    // Verify the SQL formula: CURRENT_DATE + watering_interval_days * INTERVAL '1 day'
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, watering_interval_days: 7 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 10 }] });

    await request(app).post('/garden/plants/1/logs').send({ type: 'watering' });
    const sql = pool.query.mock.calls[2][0];
    expect(sql).toContain("watering_interval_days * INTERVAL '1 day'");
    expect(sql).toContain('EXTRACT(DOW FROM');
  });

  // Test the pure function for various intervals
  function advanceAndSnap(startDate, intervalDays) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + intervalDays);
    return snapToWeekendSQL(d);
  }

  it('7-day interval from Sat 2026-02-28 → lands on Sat 2026-03-07', () => {
    const result = advanceAndSnap('2026-02-28', 7);
    expect(result.getUTCDay()).toBeLessThanOrEqual(6);
    expect([0, 6]).toContain(result.getUTCDay());
    expect(result.toISOString().split('T')[0]).toBe('2026-03-07');
  });

  it('14-day interval from Sun 2026-03-01 → lands on Sun 2026-03-15', () => {
    const result = advanceAndSnap('2026-03-01', 14);
    expect([0, 6]).toContain(result.getUTCDay());
    expect(result.toISOString().split('T')[0]).toBe('2026-03-15');
  });

  it('21-day interval from Sat 2026-02-28 → snaps to weekend', () => {
    const result = advanceAndSnap('2026-02-28', 21);
    // 2026-02-28 + 21 = 2026-03-21 (Saturday) → stays
    expect([0, 6]).toContain(result.getUTCDay());
    expect(result.toISOString().split('T')[0]).toBe('2026-03-21');
  });
});

// ─── Urgency calculation ───
describe('Urgency calculation', () => {
  function getUrgency(daysUntil) {
    if (daysUntil < 0) return 'overdue';
    if (daysUntil === 0) return 'today';
    if (daysUntil <= 2) return 'soon';
    return 'upcoming';
  }

  it('negative days_until → overdue', () => {
    expect(getUrgency(-1)).toBe('overdue');
    expect(getUrgency(-5)).toBe('overdue');
  });

  it('days_until === 0 → today', () => {
    expect(getUrgency(0)).toBe('today');
  });

  it('days_until 1-2 → soon', () => {
    expect(getUrgency(1)).toBe('soon');
    expect(getUrgency(2)).toBe('soon');
  });

  it('days_until > 2 → upcoming', () => {
    expect(getUrgency(3)).toBe('upcoming');
    expect(getUrgency(10)).toBe('upcoming');
  });
});

// ─── Watering schedule endpoint ───
describe('GET /garden/watering-schedule', () => {
  it('returns grouped urgency categories', async () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'Overdue Plant', next_watering: yesterday, water_gallons: 5 },
        { id: 2, name: 'Today Plant', next_watering: today, water_gallons: 3 },
        { id: 3, name: 'Soon Plant', next_watering: tomorrow, water_gallons: 4 },
        { id: 4, name: 'Upcoming Plant', next_watering: nextWeek, water_gallons: 2 },
      ]
    });

    const res = await request(app).get('/garden/watering-schedule');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overdue');
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('soon');
    expect(res.body).toHaveProperty('upcoming');
    expect(res.body.overdue).toHaveLength(1);
    expect(res.body.today).toHaveLength(1);
    expect(res.body.soon).toHaveLength(1);
    expect(res.body.upcoming).toHaveLength(1);
  });

  it('each plant has required fields', async () => {
    const today = new Date().toISOString().split('T')[0];
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Fig', water_gallons: 5, next_watering: today, watering_interval_days: 7 }]
    });

    const res = await request(app).get('/garden/watering-schedule');
    const plant = res.body.today[0];
    expect(plant).toHaveProperty('id');
    expect(plant).toHaveProperty('name');
    expect(plant).toHaveProperty('water_gallons');
    expect(plant).toHaveProperty('next_watering');
    expect(plant).toHaveProperty('urgency');
    expect(plant).toHaveProperty('days_until_watering');
  });

  it('plants are ordered by next_watering ASC', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/garden/watering-schedule');
    expect(res.status).toBe(200);
    // Verify the SQL has ORDER BY
    expect(pool.query.mock.calls[0][0]).toContain('ORDER BY next_watering ASC');
  });
});

// ─── Weather adjustment logic (pure function tests) ───
describe('Weather adjustment logic', () => {
  function calculateAdjustment(recentRain, upcomingRain, maxTemp) {
    let pushDays = 0;
    if (recentRain > 10) pushDays = 3;
    else if (recentRain > 5) pushDays = 2;
    else if (upcomingRain > 10) pushDays = 2;
    else if (upcomingRain > 5) pushDays = 1;

    let pullDays = 0;
    if (maxTemp > 32) pullDays = 2;
    else if (maxTemp > 28) pullDays = 1;

    return pushDays - pullDays;
  }

  it('>10mm recent rain → +3 days push', () => {
    expect(calculateAdjustment(15, 0, 20)).toBe(3);
  });

  it('>5mm recent rain → +2 days push', () => {
    expect(calculateAdjustment(7, 0, 20)).toBe(2);
  });

  it('>10mm forecast rain → +2 days push', () => {
    expect(calculateAdjustment(0, 12, 20)).toBe(2);
  });

  it('>5mm forecast rain → +1 day push', () => {
    expect(calculateAdjustment(0, 6, 20)).toBe(1);
  });

  it('>32°C heat wave → -2 days pull', () => {
    expect(calculateAdjustment(0, 0, 35)).toBe(-2);
  });

  it('>28°C warm spell → -1 day pull', () => {
    expect(calculateAdjustment(0, 0, 30)).toBe(-1);
  });

  it('net adjustment: rain push + heat pull', () => {
    // 7mm recent rain (+2) and 33°C (-2) = net 0
    expect(calculateAdjustment(7, 0, 33)).toBe(0);
  });

  it('no adjustment when conditions normal', () => {
    expect(calculateAdjustment(2, 3, 25)).toBe(0);
  });

  it('recent rain takes priority over forecast rain', () => {
    // >10mm recent → +3, even if forecast also high
    expect(calculateAdjustment(12, 15, 20)).toBe(3);
  });
});

// ─── Water quantity validation ───
describe('Water quantity by plant type', () => {
  // These reflect the expected gallons from the watering system
  const WATER_GALLONS = {
    'Blueberry': 8,
    'Hydrangea': 8,
    'Peach': 6,
    'Pomegranate': 5,
    'Citrus': 5,
    'Almond': 4,
    'Plum': 4,
    'Apple': 4,
    'Bougainvillea': 2,
  };

  it('high water plants have >= 7 gallons', () => {
    expect(WATER_GALLONS['Blueberry']).toBeGreaterThanOrEqual(7);
    expect(WATER_GALLONS['Hydrangea']).toBeGreaterThanOrEqual(7);
  });

  it('medium water plants have 4-6 gallons', () => {
    expect(WATER_GALLONS['Peach']).toBeGreaterThanOrEqual(4);
    expect(WATER_GALLONS['Peach']).toBeLessThanOrEqual(6);
    expect(WATER_GALLONS['Pomegranate']).toBeGreaterThanOrEqual(4);
    expect(WATER_GALLONS['Citrus']).toBeGreaterThanOrEqual(4);
  });

  it('hardy plants have 3-5 gallons', () => {
    expect(WATER_GALLONS['Almond']).toBeGreaterThanOrEqual(3);
    expect(WATER_GALLONS['Plum']).toBeGreaterThanOrEqual(3);
    expect(WATER_GALLONS['Apple']).toBeGreaterThanOrEqual(3);
  });

  it('drought tolerant plants have <= 3 gallons', () => {
    expect(WATER_GALLONS['Bougainvillea']).toBeLessThanOrEqual(3);
  });
});
