const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../db');

let testToken;
let testEventId;

beforeAll(async () => {
  // Create a test event and invite
  const event = await pool.query(
    `INSERT INTO iftar_events (title, event_date, address_line1, city, state, zip, host_name, owner_id, active)
     VALUES ('Test Iftar', '2026-03-15', '123 Test St', 'Testville', 'TX', '75001', 'Test Host', 1, true)
     RETURNING id`
  );
  testEventId = event.rows[0].id;

  const invite = await pool.query(
    `INSERT INTO iftar_invites (event_id, token, guest_name)
     VALUES ($1, 'test-tok-123', 'Test Guest')
     RETURNING token`,
    [testEventId]
  );
  testToken = invite.rows[0].token;
});

afterAll(async () => {
  await pool.query('DELETE FROM iftar_invites WHERE event_id = $1', [testEventId]);
  await pool.query('DELETE FROM iftar_events WHERE id = $1', [testEventId]);
  await pool.end();
});

describe('Iftar Invite API', () => {
  test('GET /api/iftar/invite/:token — valid token returns invite with event', async () => {
    const res = await request(app).get(`/api/iftar/invite/${testToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token', testToken);
    expect(res.body).toHaveProperty('guest_name', 'Test Guest');
    expect(res.body).toHaveProperty('rsvp_status');
    expect(res.body).toHaveProperty('event');
    expect(res.body.event).toHaveProperty('title');
    expect(res.body.event).toHaveProperty('event_date');
    expect(res.body.event).toHaveProperty('address_line1');
    expect(res.body.event).toHaveProperty('host_name');
  });

  test('GET /api/iftar/invite/nonexistent → 404', async () => {
    const res = await request(app).get('/api/iftar/invite/nonexistent-token-xyz');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT /api/iftar/invite/:token/rsvp — valid RSVP', async () => {
    const res = await request(app)
      .put(`/api/iftar/invite/${testToken}/rsvp`)
      .send({ rsvp_status: 'attending', guest_count: 2, dietary_notes: 'Vegetarian' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rsvp_status', 'attending');
    expect(res.body).toHaveProperty('guest_count', 2);
  });

  test('PUT /api/iftar/invite/:token/rsvp — invalid status → 400', async () => {
    const res = await request(app)
      .put(`/api/iftar/invite/${testToken}/rsvp`)
      .send({ rsvp_status: 'invalid_status' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT /api/iftar/invite/nonexistent/rsvp → 404', async () => {
    const res = await request(app)
      .put('/api/iftar/invite/nonexistent-xyz/rsvp')
      .send({ rsvp_status: 'attending' });
    expect(res.status).toBe(404);
  });
});

describe('Iftar Email API', () => {
  test('PUT /api/iftar/invite/:token/email — valid email saves', async () => {
    const res = await request(app)
      .put(`/api/iftar/invite/${testToken}/email`)
      .send({ email: 'guest@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, email: 'guest@example.com' });
  });

  test('PUT /api/iftar/invite/:token/email — invalid email returns 400', async () => {
    const res = await request(app)
      .put(`/api/iftar/invite/${testToken}/email`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT /api/iftar/invite/:token/email — nonexistent token returns 404', async () => {
    const res = await request(app)
      .put('/api/iftar/invite/nonexistent-token-xyz/email')
      .send({ email: 'valid@email.com' });
    expect(res.status).toBe(404);
  });
});

describe('Iftar Authenticated Routes', () => {
  const jwt = require('jsonwebtoken');
  const authCookie = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);

  test('GET /api/iftar/events — requires auth (401 without cookie)', async () => {
    const res = await request(app).get('/api/iftar/events');
    expect(res.status).toBe(401);
  });

  test('GET /api/iftar/events — returns events with invite stats', async () => {
    const res = await request(app)
      .get('/api/iftar/events')
      .set('Cookie', `access_token=${authCookie}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const evt = res.body.find(e => e.id === testEventId);
    expect(evt).toBeDefined();
    expect(evt).toHaveProperty('stats');
    expect(evt.stats).toHaveProperty('total_invited');
    expect(evt.stats).toHaveProperty('attending');
    expect(evt.stats).toHaveProperty('total_expected');
  });

  test('POST /api/iftar/events — creates new event', async () => {
    const res = await request(app)
      .post('/api/iftar/events')
      .set('Cookie', `access_token=${authCookie}`)
      .send({
        title: 'Integration Test Event',
        event_date: '2026-04-01',
        event_time: '18:00',
        address_line1: '456 Test Ave',
        city: 'Testburg',
        state: 'CA',
        zip: '90210',
        host_name: 'Tester'
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Integration Test Event');
    // cleanup
    await pool.query('DELETE FROM iftar_events WHERE id = $1', [res.body.id]);
  });

  test('PUT /api/iftar/events/:id — updates event fields', async () => {
    const res = await request(app)
      .put(`/api/iftar/events/${testEventId}`)
      .set('Cookie', `access_token=${authCookie}`)
      .send({ title: 'Updated Iftar Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Iftar Title');
    // restore
    await request(app)
      .put(`/api/iftar/events/${testEventId}`)
      .set('Cookie', `access_token=${authCookie}`)
      .send({ title: 'Test Iftar' });
  });

  test('POST /api/iftar/events/:id/invites — creates multiple guests with tokens', async () => {
    const res = await request(app)
      .post(`/api/iftar/events/${testEventId}/invites`)
      .set('Cookie', `access_token=${authCookie}`)
      .send({ guests: [{ name: 'Guest A' }, { name: 'Guest B' }] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('token');
    expect(res.body[1]).toHaveProperty('token');
    expect(res.body[0].token).not.toBe(res.body[1].token);
    // cleanup
    for (const inv of res.body) {
      await pool.query('DELETE FROM iftar_invites WHERE id = $1', [inv.id]);
    }
  });

  test('PUT /api/iftar/invites/:id/sent — marks as sent', async () => {
    const inv = await pool.query('SELECT id FROM iftar_invites WHERE token = $1', [testToken]);
    const res = await request(app)
      .put(`/api/iftar/invites/${inv.rows[0].id}/sent`)
      .set('Cookie', `access_token=${authCookie}`);
    expect(res.status).toBe(200);
    expect(res.body.link_sent).toBe(true);
  });

  test('DELETE /api/iftar/invites/:id — removes invite', async () => {
    // create one to delete
    const inv = await pool.query(
      `INSERT INTO iftar_invites (event_id, token, guest_name) VALUES ($1, 'del-tok', 'Delete Me') RETURNING id`,
      [testEventId]
    );
    const res = await request(app)
      .delete(`/api/iftar/invites/${inv.rows[0].id}`)
      .set('Cookie', `access_token=${authCookie}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    // verify gone
    const check = await pool.query('SELECT id FROM iftar_invites WHERE id = $1', [inv.rows[0].id]);
    expect(check.rows).toHaveLength(0);
  });
});
