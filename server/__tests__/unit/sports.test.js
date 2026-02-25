const mockResponses = {};
function setMockResponse(urlPattern, data) {
  mockResponses[urlPattern] = data;
}

function mockGetFactory(actualModule) {
  const original = actualModule.get;
  actualModule.get = jest.fn((url, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    if (typeof url === 'string') {
      const EventEmitter = require('events');
      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      const mockReq = new EventEmitter();
      mockReq.setTimeout = jest.fn();
      mockReq.destroy = jest.fn();

      const matched = Object.keys(mockResponses).find(k => url.includes(k));
      const data = matched ? JSON.stringify(mockResponses[matched]) : '{}';

      process.nextTick(() => {
        if (cb) cb(mockRes);
        mockRes.emit('data', data);
        mockRes.emit('end');
      });

      return mockReq;
    }
    return original.call(actualModule, url, opts, cb);
  });
}

// Patch https and http get BEFORE requiring routes
const https = require('https');
const http = require('http');
mockGetFactory(https);
mockGetFactory(http);

// Mock db
const mockPool = { query: jest.fn() };
jest.mock('../../db', () => ({ pool: mockPool }));

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => { req.user = { id: 1 }; next(); }
}));

const express = require('express');
const request = require('supertest');

let app;

beforeAll(() => {
  process.env.FOOTBALL_DATA_API_KEY = 'test-key';
  process.env.CRICAPI_KEY = 'test-key';

  app = express();
  app.use(express.json());
  const { authenticate } = require('../../middleware/auth');
  app.use('/api/sports', authenticate, require('../../routes/sports'));
});

beforeEach(() => {
  Object.keys(mockResponses).forEach(k => delete mockResponses[k]);
});

describe('Football endpoints', () => {
  test('GET /football/standings/PL returns standings', async () => {
    setMockResponse('competitions/PL/standings', {
      standings: [{ table: [
        { position: 1, team: { name: 'Liverpool', crest: 'url' }, playedGames: 25, won: 20, draw: 3, lost: 2, points: 63, goalDifference: 40, form: 'WWWWW' },
        { position: 2, team: { name: 'Arsenal', crest: 'url2' }, playedGames: 25, won: 18, draw: 4, lost: 3, points: 58, goalDifference: 35, form: 'WWDWW' }
      ]}]
    });

    const res = await request(app).get('/api/sports/football/standings/PL');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toHaveProperty('name', 'Liverpool');
    expect(res.body.data[0]).toHaveProperty('points');
    expect(res.body).toHaveProperty('updatedAt');
  });

  test('GET /football/matches/:teamId returns matches', async () => {
    setMockResponse('teams/66/matches', {
      matches: [{ utcDate: '2025-02-20T20:00:00Z', homeTeam: { name: 'Man Utd', crest: 'u' }, awayTeam: { name: 'Arsenal', crest: 'a' }, score: { fullTime: { home: 2, away: 1 } }, status: 'FINISHED', competition: { name: 'PL' } }]
    });

    const res = await request(app).get('/api/sports/football/matches/66');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('recent');
    expect(res.body.data).toHaveProperty('upcoming');
  });

  test('GET /football/live returns live matches', async () => {
    setMockResponse('competitions/PL/matches', { matches: [] });
    setMockResponse('competitions/PD/matches', { matches: [] });

    const res = await request(app).get('/api/sports/football/live');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /football/title-race/PL returns top 6', async () => {
    const table = Array.from({ length: 10 }, (_, i) => ({
      position: i + 1, team: { name: `Team ${i}`, crest: 'c' }, points: 60 - i * 3, playedGames: 25, goalDifference: 30 - i * 2
    }));
    setMockResponse('competitions/PL/standings', { standings: [{ table }] });

    const res = await request(app).get('/api/sports/football/title-race/PL');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(6);
  });
});

describe('Cricket endpoints', () => {
  test('GET /cricket/live returns live scores', async () => {
    setMockResponse('cricScore', { data: [
      { id: '1', name: 'IND vs AUS', status: 'Live', venue: 'MCG', t1: 'India', t2: 'Australia', t1s: '250/3', t2s: '', t1img: '', t2img: '', matchType: 'test' }
    ]});

    const res = await request(app).get('/api/sports/cricket/live');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('name');
  });

  test('GET /cricket/upcoming returns upcoming', async () => {
    setMockResponse('matches', { data: [
      { id: '2', name: 'ENG vs SA', venue: 'Lords', date: '2025-03-01', teams: ['ENG', 'SA'], matchType: 'odi', matchStarted: false, status: 'Match not started' }
    ]});

    const res = await request(app).get('/api/sports/cricket/upcoming');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('GET /cricket/series returns series', async () => {
    setMockResponse('series', { data: [
      { id: '3', name: 'Ashes 2025', startDate: '2025-06-01', endDate: '2025-08-01', odi: 0, t20: 0, test: 5 }
    ]});

    const res = await request(app).get('/api/sports/cricket/series');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('name');
  });
});

describe('Tennis endpoints', () => {
  test('GET /tennis/rankings returns rankings', async () => {
    setMockResponse('rankings', { rankings: [{ ranks: [
      { current: 1, athlete: { displayName: 'Sinner', flag: { alt: 'ITA' } }, points: 11000, movement: 0 }
    ]}]});

    const res = await request(app).get('/api/sports/tennis/rankings');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('rank');
  });

  test('GET /tennis/scores returns scores', async () => {
    setMockResponse('scoreboard', { events: [
      { id: '1', name: 'Match 1', date: '2025-02-25', status: { type: { description: 'In Progress' } }, competitions: [{ competitors: [{ athlete: { displayName: 'Player A' }, score: '6', winner: false }] }] }
    ]});

    const res = await request(app).get('/api/sports/tennis/scores');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('name');
  });
});

describe('F1 endpoints', () => {
  test('GET /f1/standings/drivers returns driver standings', async () => {
    setMockResponse('driverStandings', { MRData: { StandingsTable: { StandingsLists: [{ DriverStandings: [
      { position: '1', points: '250', wins: '8', Driver: { givenName: 'Max', familyName: 'Verstappen', code: 'VER', nationality: 'Dutch' }, Constructors: [{ name: 'Red Bull' }] }
    ]}]}}});

    const res = await request(app).get('/api/sports/f1/standings/drivers');
    expect(res.status).toBe(200);
    expect(res.body.data[0].driver.name).toBe('Max Verstappen');
  });

  test('GET /f1/standings/constructors', async () => {
    setMockResponse('constructorStandings', { MRData: { StandingsTable: { StandingsLists: [{ ConstructorStandings: [
      { position: '1', points: '500', wins: '15', Constructor: { name: 'Red Bull', nationality: 'Austrian' } }
    ]}]}}});

    const res = await request(app).get('/api/sports/f1/standings/constructors');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('constructor');
  });

  test('GET /f1/calendar returns races', async () => {
    setMockResponse('races', { MRData: { RaceTable: { Races: [
      { round: '1', raceName: 'Bahrain GP', Circuit: { circuitName: 'Bahrain', Location: { country: 'Bahrain' } }, date: '2025-03-02', time: '15:00:00Z' }
    ]}}});

    const res = await request(app).get('/api/sports/f1/calendar');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('name', 'Bahrain GP');
  });

  test('GET /f1/race/:round/results', async () => {
    setMockResponse('results', { MRData: { RaceTable: { Races: [{ Results: [
      { position: '1', Driver: { givenName: 'Max', familyName: 'Verstappen', code: 'VER' }, Constructor: { name: 'Red Bull' }, Time: { time: '1:30:00' }, points: '25', grid: '1', status: 'Finished' }
    ]}]}}});

    const res = await request(app).get('/api/sports/f1/race/1/results');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('driver');
  });
});

describe('Notifications CRUD', () => {
  test('GET /notifications returns user prefs', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ id: 1, sport: 'football', event_type: 'goal', team_or_player: 'Man Utd', enabled: true }] });
    const res = await request(app).get('/api/sports/notifications');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('sport', 'football');
  });

  test('POST /notifications creates a pref', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ id: 2, sport: 'f1', event_type: 'race_start' }] });
    const res = await request(app).post('/api/sports/notifications').send({ sport: 'f1', event_type: 'race_start' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('sport', 'f1');
  });

  test('POST /notifications requires fields', async () => {
    const res = await request(app).post('/api/sports/notifications').send({});
    expect(res.status).toBe(400);
  });

  test('DELETE /notifications/:id removes', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).delete('/api/sports/notifications/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  test('DELETE /notifications/:id 404 if missing', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).delete('/api/sports/notifications/999');
    expect(res.status).toBe(404);
  });
});

describe('Error handling', () => {
  test('API failure returns empty data gracefully', async () => {
    const res = await request(app).get('/api/sports/cricket/series');
    expect(res.status).toBe(200);
  });
});

describe('Cross-sport', () => {
  test('GET /next-up returns data', async () => {
    setMockResponse('teams/66/matches', { matches: [{ utcDate: '2099-12-31T20:00:00Z', homeTeam: { name: 'Man Utd' }, awayTeam: { name: 'Liverpool' } }] });
    const res = await request(app).get('/api/sports/next-up');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});
