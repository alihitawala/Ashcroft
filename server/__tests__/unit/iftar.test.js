const request = require('supertest');
const express = require('express');

// Mock db before requiring router
jest.mock('../../db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => { req.user = { id: 1, role: 'admin' }; next(); },
  JWT_SECRET: 'test-secret'
}));

const { pool } = require('../../db');
const iftarRouter = require('../../routes/iftar');

const app = express();
app.use(express.json());
app.use('/iftar', iftarRouter);

beforeEach(() => jest.clearAllMocks());

describe('GET /iftar/invite/:token', () => {
  it('returns shaped invite data', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{
      token: 'abc123', guest_name: 'Ali', rsvp_status: 'pending',
      guest_count: 2, dietary_notes: null, message_to_host: null,
      title: 'Iftar 2025', event_date: '2025-03-15', event_time: '18:30',
      sunset_time: '18:15', address_line1: '123 Main', address_line2: null,
      city: 'Dallas', state: 'TX', zip: '75001', message: 'Welcome!',
      host_name: 'Omar', host_phone: '555-1234', active: true
    }]});
    const res = await request(app).get('/iftar/invite/abc123');
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('abc123');
    expect(res.body.event.title).toBe('Iftar 2025');
    expect(res.body.event.host_phone).toBeUndefined(); // host_phone not exposed
    expect(res.body).not.toHaveProperty('active'); // internal field not exposed
  });

  it('returns 404 for unknown token', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/iftar/invite/bad');
    expect(res.status).toBe(404);
  });

  it('returns 410 for inactive event', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ active: false }] });
    const res = await request(app).get('/iftar/invite/old');
    expect(res.status).toBe(410);
  });

  it('handles db error', async () => {
    pool.query.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/iftar/invite/x');
    expect(res.status).toBe(500);
  });
});

describe('PUT /iftar/invite/:token/rsvp', () => {
  it('accepts valid rsvp_status values', async () => {
    for (const status of ['attending', 'declined', 'maybe']) {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1, rsvp_status: status }] });
      const res = await request(app).put('/iftar/invite/tok/rsvp').send({ rsvp_status: status });
      expect(res.status).toBe(200);
    }
  });

  it('rejects invalid rsvp_status', async () => {
    const res = await request(app).put('/iftar/invite/tok/rsvp').send({ rsvp_status: 'invalid' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('defaults guest_count to 1 when not provided', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await request(app).put('/iftar/invite/tok/rsvp').send({ rsvp_status: 'attending' });
    expect(pool.query.mock.calls[0][1][1]).toBe(1); // guest_count param
  });

  it('passes provided guest_count', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await request(app).put('/iftar/invite/tok/rsvp').send({ rsvp_status: 'attending', guest_count: 5 });
    expect(pool.query.mock.calls[0][1][1]).toBe(5);
  });

  it('returns 404 when token not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/iftar/invite/bad/rsvp').send({ rsvp_status: 'attending' });
    expect(res.status).toBe(404);
  });
});

describe('GET /iftar/events (authenticated)', () => {
  it('computes stats correctly', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // events query
      .mockResolvedValueOnce({ rows: [ // invites
        { rsvp_status: 'attending', guest_count: 3 },
        { rsvp_status: 'attending', guest_count: 2 },
        { rsvp_status: 'declined', guest_count: 1 },
        { rsvp_status: 'maybe', guest_count: 4 },
        { rsvp_status: 'pending', guest_count: 1 },
      ]});
    const res = await request(app).get('/iftar/events');
    expect(res.status).toBe(200);
    const stats = res.body[0].stats;
    expect(stats.total_invited).toBe(5);
    expect(stats.attending).toBe(5); // 3+2
    expect(stats.declined).toBe(1);
    expect(stats.maybe).toBe(4);
    expect(stats.pending).toBe(1);
    expect(stats.total_expected).toBe(9); // 3+2+4
  });

  it('handles null guest_count as 1', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [
        { rsvp_status: 'attending', guest_count: null },
      ]});
    const res = await request(app).get('/iftar/events');
    expect(res.body[0].stats.attending).toBe(1);
  });
});

describe('POST /iftar/events/:id/invites', () => {
  it('rejects empty guests array', async () => {
    const res = await request(app).post('/iftar/events/1/invites').send({ guests: [] });
    expect(res.status).toBe(400);
  });

  it('rejects missing guests', async () => {
    const res = await request(app).post('/iftar/events/1/invites').send({});
    expect(res.status).toBe(400);
  });

  it('creates invites with generated tokens', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, token: 'gen' }] });
    const res = await request(app).post('/iftar/events/1/invites')
      .send({ guests: [{ name: 'A' }, { name: 'B' }] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});

describe('PUT /iftar/invite/:token/email', () => {
  it('saves valid email and returns success shape', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, guest_email: 'test@example.com' }] });
    const res = await request(app).put('/iftar/invite/tok/email').send({ email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, email: 'test@example.com' });
  });

  it('accepts valid email formats', async () => {
    const validEmails = ['user@domain.com', 'a.b@c.co', 'test+tag@gmail.com', 'x@y.museum'];
    for (const email of validEmails) {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1, guest_email: email }] });
      const res = await request(app).put('/iftar/invite/tok/email').send({ email });
      expect(res.status).toBe(200);
    }
  });

  it('rejects invalid emails', async () => {
    const invalidEmails = ['notanemail', '@no.com', 'no@', 'no spaces@x.com', 'a@b'];
    for (const email of invalidEmails) {
      const res = await request(app).put('/iftar/invite/tok/email').send({ email });
      expect(res.status).toBe(400);
    }
  });

  it('rejects empty email', async () => {
    const res = await request(app).put('/iftar/invite/tok/email').send({ email: '' });
    expect(res.status).toBe(400);
  });

  it('rejects missing email', async () => {
    const res = await request(app).put('/iftar/invite/tok/email').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent token', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/iftar/invite/bad/email').send({ email: 'a@b.com' });
    expect(res.status).toBe(404);
  });

  it('lowercases email before saving', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, guest_email: 'test@example.com' }] });
    await request(app).put('/iftar/invite/tok/email').send({ email: 'Test@Example.COM' });
    const savedEmail = pool.query.mock.calls[0][1][0];
    expect(savedEmail).toBe('test@example.com');
  });
});

describe('Event dashboard stats - total_expected calculation', () => {
  it('total_expected sums guest_count for attending and maybe only', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [
        { rsvp_status: 'attending', guest_count: 3 },
        { rsvp_status: 'maybe', guest_count: 2 },
        { rsvp_status: 'declined', guest_count: 5 },
        { rsvp_status: 'pending', guest_count: 4 },
      ]});
    const res = await request(app).get('/iftar/events');
    expect(res.body[0].stats.total_expected).toBe(5); // 3+2, not 14
  });

  it('total_expected treats null guest_count as 1', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [
        { rsvp_status: 'attending', guest_count: null },
        { rsvp_status: 'maybe', guest_count: null },
      ]});
    const res = await request(app).get('/iftar/events');
    expect(res.body[0].stats.total_expected).toBe(2);
  });
});

describe('Invite creation edge cases', () => {
  it('creates invites with duplicate names', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, token: 'tok1', guest_name: 'Ali' }] });
    const res = await request(app).post('/iftar/events/1/invites')
      .send({ guests: [{ name: 'Ali' }, { name: 'Ali' }] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
  });

  it('generates unique tokens for each invite', async () => {
    // The real generateToken uses crypto.randomBytes so tokens will differ
    const tokens = new Set();
    pool.query.mockImplementation(() => {
      const tok = require('crypto').randomBytes(6).toString('base64url');
      tokens.add(tok);
      return Promise.resolve({ rows: [{ id: 1, token: tok }] });
    });
    await request(app).post('/iftar/events/1/invites')
      .send({ guests: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    // Each query call gets a different token in params
    const calledTokens = pool.query.mock.calls.map(c => c[1][1]);
    const uniqueTokens = new Set(calledTokens);
    expect(uniqueTokens.size).toBe(3);
  });
});

describe('DELETE /iftar/invites/:id', () => {
  it('returns deleted true on success', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const res = await request(app).delete('/iftar/invites/5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it('returns 404 when invite not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/iftar/invites/999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /iftar/invites/:id/sent', () => {
  it('marks invite as sent', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, link_sent: true }] });
    const res = await request(app).put('/iftar/invites/1/sent');
    expect(res.status).toBe(200);
    expect(res.body.link_sent).toBe(true);
  });

  it('returns 404 when not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/iftar/invites/999/sent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /iftar/events/:id', () => {
  it('rejects empty update', async () => {
    const res = await request(app).put('/iftar/events/1').send({});
    expect(res.status).toBe(400);
  });

  it('updates provided fields only', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app).put('/iftar/events/1').send({ title: 'New Title' });
    expect(res.status).toBe(200);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('title=$1');
  });
});
