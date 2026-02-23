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
// Mock multer to skip file handling
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

describe('POST /garden/plants', () => {
  it('requires name', async () => {
    const res = await request(app).post('/garden/plants').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Name');
  });

  it('creates plant with defaults', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Tomato', type: 'fruit_tree' }] });
    const res = await request(app).post('/garden/plants').send({ name: 'Tomato' });
    expect(res.status).toBe(201);
    const params = pool.query.mock.calls[0][1];
    expect(params[2]).toBe('fruit_tree'); // default type
    expect(params[14]).toBe('9b'); // default usda_zone
    expect(params[15]).toBe('in_ground'); // default planting_method
  });
});

describe('PUT /garden/plants/:id', () => {
  it('rejects empty update', async () => {
    const res = await request(app).put('/garden/plants/1').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for inaccessible plant', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/garden/plants/999').send({ name: 'New' });
    expect(res.status).toBe(404);
  });
});

describe('Health score → health_status mapping (via POST /garden/plants/:id/assess)', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };

  beforeEach(() => {
    pool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  const assess = (score) => {
    // checkPlantAccess
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // INSERT assessment
      .mockResolvedValueOnce({}) // UPDATE plant
      .mockResolvedValueOnce({}); // COMMIT
    return request(app).post('/garden/plants/1/assess')
      .send({ overall_score: score, leaf_health: 8, hydration_level: 7, pest_damage: 1, disease_signs: 0, growth_vigor: 8 });
  };

  it('score > 80 → healthy', async () => {
    const res = await assess(85);
    expect(res.status).toBe(201);
    // Check UPDATE plant call has 'healthy'
    const updateCall = mockClient.query.mock.calls[2];
    expect(updateCall[1][3]).toBe('healthy');
  });

  it('score 50-80 → needs_attention', async () => {
    await assess(65);
    const updateCall = mockClient.query.mock.calls[2];
    expect(updateCall[1][3]).toBe('needs_attention');
  });

  it('score < 50 → sick', async () => {
    await assess(30);
    const updateCall = mockClient.query.mock.calls[2];
    expect(updateCall[1][3]).toBe('sick');
  });

  it('score exactly 80 → needs_attention (not >80)', async () => {
    await assess(80);
    const updateCall = mockClient.query.mock.calls[2];
    expect(updateCall[1][3]).toBe('needs_attention');
  });

  it('score exactly 50 → needs_attention', async () => {
    await assess(50);
    const updateCall = mockClient.query.mock.calls[2];
    expect(updateCall[1][3]).toBe('needs_attention');
  });

  it('score exactly 49 → sick', async () => {
    await assess(49);
    const updateCall = mockClient.query.mock.calls[2];
    expect(updateCall[1][3]).toBe('sick');
  });

  it('requires overall_score', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // checkPlantAccess
    const res = await request(app).post('/garden/plants/1/assess').send({ leaf_health: 5 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for inaccessible plant', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/garden/plants/999/assess').send({ overall_score: 75 });
    expect(res.status).toBe(404);
  });
});

describe('POST /garden/plants/:id/logs', () => {
  it('requires type', async () => {
    const res = await request(app).post('/garden/plants/1/logs').send({});
    expect(res.status).toBe(400);
  });

  it('updates last_watered on watering log', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // checkPlantAccess
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT log
      .mockResolvedValueOnce({}) // UPDATE last_watered
      .mockResolvedValueOnce({ rows: [{ id: 10, type: 'watering' }] }); // re-fetch
    const res = await request(app).post('/garden/plants/1/logs').send({ type: 'watering' });
    expect(res.status).toBe(201);
    expect(pool.query.mock.calls[2][0]).toContain('last_watered');
  });

  it('updates last_fertilized on fertilizing log', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 10 }] });
    await request(app).post('/garden/plants/1/logs').send({ type: 'fertilizing' });
    expect(pool.query.mock.calls[2][0]).toContain('last_fertilized');
  });
});

describe('GET /garden/plants/dashboard', () => {
  it('counts needs_attention plants', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [
        { id: 1, health_status: 'healthy' },
        { id: 2, health_status: 'needs_attention' },
        { id: 3, health_status: 'sick' },
      ]})
      .mockResolvedValueOnce({ rows: [] }); // recommendations
    const res = await request(app).get('/garden/plants/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.needs_attention_count).toBe(2);
  });

  it('sorts recommendations by urgency', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        plant_id: 1, plant_name: 'Fig',
        ai_recommendations: [
          { urgency: 'routine', action: 'water' },
          { urgency: 'urgent', action: 'treat pest' },
          { urgency: 'soon', action: 'fertilize' },
        ]
      }]});
    const res = await request(app).get('/garden/plants/dashboard');
    expect(res.body.recommendations[0].urgency).toBe('urgent');
    expect(res.body.recommendations[1].urgency).toBe('soon');
    expect(res.body.recommendations[2].urgency).toBe('routine');
  });
});

describe('POST /garden/supplies', () => {
  it('requires name and category', async () => {
    const res = await request(app).post('/garden/supplies').send({ name: 'Neem Oil' });
    expect(res.status).toBe(400);
  });

  it('creates supply', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app).post('/garden/supplies')
      .send({ name: 'Neem Oil', category: 'pesticide' });
    expect(res.status).toBe(201);
  });
});

describe('DELETE /garden/plants/:id', () => {
  it('returns 404 for inaccessible plant', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/garden/plants/999');
    expect(res.status).toBe(404);
  });

  it('deletes accessible plant', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app).delete('/garden/plants/1');
    expect(res.status).toBe(200);
  });
});
