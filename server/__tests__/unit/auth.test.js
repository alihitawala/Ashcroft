const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

jest.mock('../../db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => { req.user = { id: 1, role: 'admin' }; next(); },
  JWT_SECRET: 'test-secret-key-123'
}));

const { pool } = require('../../db');
const authRouter = require('../../routes/auth');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

const mockUser = {
  id: 1, email: 'test@example.com', name: 'Test User',
  role: 'admin', household_id: 5, household_role: 'owner',
  password_hash: bcrypt.hashSync('correct-password', 10)
};

beforeEach(() => jest.clearAllMocks());

describe('POST /auth/login', () => {
  it('returns 400 if email missing', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if password missing', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for unknown email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/auth/login').send({ email: 'bad@x.com', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app).post('/auth/login').send({ email: 'test@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('succeeds with correct credentials and sets cookies', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app).post('/auth/login')
      .send({ email: 'test@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user).not.toHaveProperty('password_hash');
    // Check cookies are set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = cookies.join('; ');
    expect(cookieStr).toContain('access_token');
    expect(cookieStr).toContain('refresh_token');
    expect(cookieStr).toContain('HttpOnly');
  });

  it('includes household info in response', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app).post('/auth/login')
      .send({ email: 'test@example.com', password: 'correct-password' });
    expect(res.body.user.household_id).toBe(5);
    expect(res.body.user.household_role).toBe('owner');
  });
});

describe('POST /auth/logout', () => {
  it('clears cookies', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
  });
});

describe('POST /auth/refresh', () => {
  it('returns 401 without refresh token cookie', async () => {
    const res = await request(app).post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app).post('/auth/refresh')
      .set('Cookie', 'refresh_token=invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('refreshes with valid token', async () => {
    const token = jwt.sign({ id: 1 }, 'test-secret-key-123', { expiresIn: '30d' });
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app).post('/auth/refresh')
      .set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(1);
  });

  it('returns 401 if user no longer exists', async () => {
    const token = jwt.sign({ id: 999 }, 'test-secret-key-123', { expiresIn: '30d' });
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/auth/refresh')
      .set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('returns user data', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'test@example.com', name: 'Test' }] });
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(1);
  });

  it('returns 404 if user gone', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(404);
  });
});

describe('PUT /auth/me (profile update)', () => {
  it('requires currentPassword to change password', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app).put('/auth/me').send({ password: 'newpass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Current password required');
  });

  it('rejects wrong currentPassword', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app).put('/auth/me')
      .send({ password: 'newpass', currentPassword: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('incorrect');
  });
});

describe('DELETE /auth/users/:id', () => {
  it('prevents self-deletion', async () => {
    const res = await request(app).delete('/auth/users/1');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot delete yourself');
  });

  it('deletes other user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2, email: 'other@x.com', name: 'Other' }] });
    const res = await request(app).delete('/auth/users/2');
    expect(res.status).toBe(200);
  });

  it('returns 404 for nonexistent user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/auth/users/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /auth/users (admin only)', () => {
  it('allows admin', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app).get('/auth/users');
    expect(res.status).toBe(200);
  });
});

describe('generateTokens (via login)', () => {
  it('JWT contains correct claims', async () => {
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app).post('/auth/login')
      .send({ email: 'test@example.com', password: 'correct-password' });
    const cookies = res.headers['set-cookie'];
    const accessCookie = cookies.find(c => c.startsWith('access_token='));
    const token = accessCookie.split('=')[1].split(';')[0];
    const decoded = jwt.verify(token, 'test-secret-key-123');
    expect(decoded.id).toBe(1);
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('admin');
    expect(decoded.household_id).toBe(5);
  });
});
