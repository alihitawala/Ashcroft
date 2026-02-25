const { Router } = require('express');
const https = require('https');
const http = require('http');
const { pool } = require('../db');

const router = Router();

// ─── Cache ───
const cache = new Map();
function cached(key, ttlMs, fetchFn) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data;
  const promise = fetchFn().then(data => {
    cache.set(key, { data, expires: Date.now() + ttlMs });
    return data;
  }).catch(err => {
    console.error(`Cache fetch error [${key}]:`, err.message);
    return entry?.data || null;
  });
  if (entry?.data) return entry.data;
  return promise;
}

const TTL = { live: 60000, standings: 900000, calendar: 3600000, results: 1800000 };

// ─── HTTP helper ───
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function respond(res, data, isCached = false) {
  res.json({ data, cached: isCached, updatedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════
// FOOTBALL (football-data.org)
// ═══════════════════════════════════════
const FB_BASE = 'https://api.football-data.org/v4';
const fbHeaders = () => ({ 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY || '' });

/** GET /football/standings/:competition - League standings */
router.get('/football/standings/:competition', async (req, res) => {
  try {
    const code = ['PL', 'PD'].includes(req.params.competition) ? req.params.competition : 'PL';
    const key = `fb-standings-${code}`;
    const result = await cached(key, TTL.standings, async () => {
      const json = await fetchJSON(`${FB_BASE}/competitions/${code}/standings`, fbHeaders());
      if (!json?.standings?.[0]?.table) return [];
      return json.standings[0].table.slice(0, 20).map(t => ({
        position: t.position, name: t.team.name, crest: t.team.crest,
        playedGames: t.playedGames, won: t.won, draw: t.draw, lost: t.lost,
        points: t.points, goalDifference: t.goalDifference, form: t.form
      }));
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch standings' }); }
});

/** GET /football/matches/:teamId - Last 5 + next 5 matches */
router.get('/football/matches/:teamId', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId) || 66;
    const key = `fb-matches-${teamId}`;
    const result = await cached(key, TTL.results, async () => {
      const [finished, scheduled] = await Promise.all([
        fetchJSON(`${FB_BASE}/teams/${teamId}/matches?limit=5&status=FINISHED`, fbHeaders()),
        fetchJSON(`${FB_BASE}/teams/${teamId}/matches?limit=5&status=SCHEDULED`, fbHeaders()),
      ]);
      const mapMatch = m => ({
        date: m.utcDate, homeTeam: { name: m.homeTeam.name, crest: m.homeTeam.crest },
        awayTeam: { name: m.awayTeam.name, crest: m.awayTeam.crest },
        score: m.score, status: m.status, competition: m.competition?.name
      });
      return {
        recent: (finished?.matches || []).slice(-5).reverse().map(mapMatch),
        upcoming: (scheduled?.matches || []).slice(0, 5).map(mapMatch)
      };
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch matches' }); }
});

/** GET /football/live - Live matches in PL or PD */
router.get('/football/live', async (req, res) => {
  try {
    const result = await cached('fb-live', TTL.live, async () => {
      const [pl, pd] = await Promise.all([
        fetchJSON(`${FB_BASE}/competitions/PL/matches?status=LIVE,IN_PLAY,PAUSED`, fbHeaders()),
        fetchJSON(`${FB_BASE}/competitions/PD/matches?status=LIVE,IN_PLAY,PAUSED`, fbHeaders()),
      ]);
      const all = [...(pl?.matches || []), ...(pd?.matches || [])];
      return all.map(m => ({
        homeTeam: { name: m.homeTeam.name, crest: m.homeTeam.crest },
        awayTeam: { name: m.awayTeam.name, crest: m.awayTeam.crest },
        score: m.score, status: m.status, minute: m.minute, competition: m.competition?.name
      }));
    });
    respond(res, result, cache.has('fb-live'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch live matches' }); }
});

/** GET /football/title-race/:competition - Top 6 for title race viz */
router.get('/football/title-race/:competition', async (req, res) => {
  try {
    const code = ['PL', 'PD'].includes(req.params.competition) ? req.params.competition : 'PL';
    const key = `fb-title-${code}`;
    const result = await cached(key, TTL.standings, async () => {
      const json = await fetchJSON(`${FB_BASE}/competitions/${code}/standings`, fbHeaders());
      if (!json?.standings?.[0]?.table) return [];
      return json.standings[0].table.slice(0, 6).map(t => ({
        position: t.position, name: t.team.name, crest: t.team.crest,
        points: t.points, playedGames: t.playedGames, goalDifference: t.goalDifference
      }));
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch title race' }); }
});

// ═══════════════════════════════════════
// CRICKET (CricAPI)
// ═══════════════════════════════════════
const cricKey = () => process.env.CRICAPI_KEY || '';

/** GET /cricket/live - Live cricket scores */
router.get('/cricket/live', async (req, res) => {
  try {
    const result = await cached('cric-live', TTL.live, async () => {
      const json = await fetchJSON(`https://api.cricapi.com/v1/cricScore?apikey=${cricKey()}`);
      if (!json?.data) return [];
      return json.data.map(m => ({
        id: m.id, name: m.name, status: m.status, venue: m.venue,
        teams: [m.t1, m.t2], scores: [m.t1s, m.t2s],
        t1img: m.t1img, t2img: m.t2img, matchType: m.matchType
      }));
    });
    respond(res, result, cache.has('cric-live'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch live cricket' }); }
});

/** GET /cricket/upcoming - Upcoming cricket matches */
router.get('/cricket/upcoming', async (req, res) => {
  try {
    const result = await cached('cric-upcoming', TTL.standings, async () => {
      const json = await fetchJSON(`https://api.cricapi.com/v1/matches?apikey=${cricKey()}&offset=0`);
      if (!json?.data) return [];
      return json.data.filter(m => m.matchStarted === false || m.status === 'Match not started').slice(0, 20).map(m => ({
        id: m.id, name: m.name, venue: m.venue, date: m.date || m.dateTimeGMT,
        teams: m.teams, matchType: m.matchType, status: m.status
      }));
    });
    respond(res, result, cache.has('cric-upcoming'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch upcoming cricket' }); }
});

/** GET /cricket/series - Current series list */
router.get('/cricket/series', async (req, res) => {
  try {
    const result = await cached('cric-series', TTL.calendar, async () => {
      const json = await fetchJSON(`https://api.cricapi.com/v1/series?apikey=${cricKey()}&offset=0`);
      if (!json?.data) return [];
      return json.data.slice(0, 20).map(s => ({
        id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, odi: s.odi, t20: s.t20, test: s.test
      }));
    });
    respond(res, result, cache.has('cric-series'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch cricket series' }); }
});

// ═══════════════════════════════════════
// TENNIS (ESPN)
// ═══════════════════════════════════════

/** GET /tennis/rankings - ATP rankings */
router.get('/tennis/rankings', async (req, res) => {
  try {
    const result = await cached('tennis-rankings', TTL.standings, async () => {
      const json = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/rankings');
      if (!json?.rankings?.[0]?.ranks) return [];
      return json.rankings[0].ranks.slice(0, 20).map(r => ({
        rank: r.current, name: r.athlete?.displayName, country: r.athlete?.flag?.alt,
        points: r.points, movement: r.movement || 0
      }));
    });
    respond(res, result, cache.has('tennis-rankings'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch tennis rankings' }); }
});

/** GET /tennis/scores - Current tournament scores */
router.get('/tennis/scores', async (req, res) => {
  try {
    const result = await cached('tennis-scores', TTL.live, async () => {
      const json = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard');
      if (!json?.events) return [];
      return json.events.slice(0, 20).map(e => ({
        id: e.id, name: e.name, date: e.date, status: e.status?.type?.description,
        competitors: e.competitions?.[0]?.competitors?.map(c => ({
          name: c.athlete?.displayName, score: c.score, winner: c.winner
        }))
      }));
    });
    respond(res, result, cache.has('tennis-scores'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch tennis scores' }); }
});

/** GET /tennis/calendar - Tournament calendar */
router.get('/tennis/calendar', async (req, res) => {
  try {
    const result = await cached('tennis-calendar', TTL.calendar, async () => {
      const json = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard');
      return { leagues: json?.leagues || [], season: json?.season || {} };
    });
    respond(res, result, cache.has('tennis-calendar'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch tennis calendar' }); }
});

// ═══════════════════════════════════════
// F1 (Jolpica Ergast + OpenF1)
// ═══════════════════════════════════════
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';

/** GET /f1/standings/drivers - Driver standings */
router.get('/f1/standings/drivers', async (req, res) => {
  try {
    const result = await cached('f1-drivers', TTL.standings, async () => {
      const json = await fetchJSON(`${JOLPICA}/current/driverStandings.json`);
      const list = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;
      if (!list) return [];
      return list.map(d => ({
        position: parseInt(d.position), points: parseFloat(d.points), wins: parseInt(d.wins),
        driver: { name: `${d.Driver.givenName} ${d.Driver.familyName}`, code: d.Driver.code, nationality: d.Driver.nationality },
        constructor: d.Constructors?.[0]?.name
      }));
    });
    respond(res, result, cache.has('f1-drivers'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch driver standings' }); }
});

/** GET /f1/standings/constructors - Constructor standings */
router.get('/f1/standings/constructors', async (req, res) => {
  try {
    const result = await cached('f1-constructors', TTL.standings, async () => {
      const json = await fetchJSON(`${JOLPICA}/current/constructorStandings.json`);
      const list = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings;
      if (!list) return [];
      return list.map(c => ({
        position: parseInt(c.position), points: parseFloat(c.points), wins: parseInt(c.wins),
        constructor: { name: c.Constructor.name, nationality: c.Constructor.nationality }
      }));
    });
    respond(res, result, cache.has('f1-constructors'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch constructor standings' }); }
});

/** GET /f1/calendar - Race calendar */
router.get('/f1/calendar', async (req, res) => {
  try {
    const result = await cached('f1-calendar', TTL.calendar, async () => {
      let json = await fetchJSON(`${JOLPICA}/2026/races.json`);
      let races = json?.MRData?.RaceTable?.Races;
      if (!races || races.length === 0) {
        json = await fetchJSON(`${JOLPICA}/2025/races.json`);
        races = json?.MRData?.RaceTable?.Races || [];
      }
      return races.map(r => ({
        round: parseInt(r.round), name: r.raceName, circuit: r.Circuit?.circuitName,
        country: r.Circuit?.Location?.country, date: r.date, time: r.time
      }));
    });
    respond(res, result, cache.has('f1-calendar'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch F1 calendar' }); }
});

/** GET /f1/next-session - Next upcoming F1 session */
router.get('/f1/next-session', async (req, res) => {
  try {
    const result = await cached('f1-next', TTL.standings, async () => {
      const now = new Date().toISOString();
      let json = await fetchJSON(`https://api.openf1.org/v1/sessions?year=2026`);
      if (!json || !Array.isArray(json) || json.length === 0) {
        json = await fetchJSON(`https://api.openf1.org/v1/sessions?year=2025`);
      }
      if (!Array.isArray(json)) return null;
      const upcoming = json.filter(s => s.date_start > now).sort((a, b) => a.date_start.localeCompare(b.date_start));
      if (!upcoming.length) return null;
      const s = upcoming[0];
      return {
        name: s.session_name, type: s.session_type, circuit: s.circuit_short_name,
        country: s.country_name, dateStart: s.date_start, dateEnd: s.date_end
      };
    });
    respond(res, result, cache.has('f1-next'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch next session' }); }
});

/** GET /f1/race/:round/results - Race results */
router.get('/f1/race/:round/results', async (req, res) => {
  try {
    const round = parseInt(req.params.round) || 1;
    const key = `f1-race-${round}`;
    const result = await cached(key, TTL.results, async () => {
      const json = await fetchJSON(`${JOLPICA}/current/${round}/results.json`);
      const results = json?.MRData?.RaceTable?.Races?.[0]?.Results;
      if (!results) return [];
      return results.map(r => ({
        position: parseInt(r.position), driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
        code: r.Driver.code, constructor: r.Constructor.name,
        time: r.Time?.time || r.status, points: parseFloat(r.points), grid: parseInt(r.grid)
      }));
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch race results' }); }
});

// ═══════════════════════════════════════
// CROSS-SPORT: Next Up
// ═══════════════════════════════════════

/** GET /next-up - Closest upcoming event across all sports */
router.get('/next-up', async (req, res) => {
  try {
    const now = new Date();
    const events = [];

    // Football - next scheduled for Man Utd & Real Madrid
    const fbMatches = await cached('fb-matches-66', TTL.results, async () => {
      const json = await fetchJSON(`${FB_BASE}/teams/66/matches?limit=5&status=SCHEDULED`, fbHeaders());
      return json?.matches || [];
    });
    if (Array.isArray(fbMatches)) {
      for (const m of fbMatches) {
        if (new Date(m.utcDate) > now) {
          events.push({ sport: 'football', name: `${m.homeTeam.name} vs ${m.awayTeam.name}`, date: m.utcDate });
          break;
        }
      }
    }

    // F1 next session
    const f1Next = await cached('f1-next', TTL.standings, async () => {
      const json = await fetchJSON('https://api.openf1.org/v1/sessions?year=2025');
      if (!Array.isArray(json)) return null;
      const upcoming = json.filter(s => s.date_start > now.toISOString());
      return upcoming.length ? upcoming.sort((a, b) => a.date_start.localeCompare(b.date_start))[0] : null;
    });
    if (f1Next) events.push({ sport: 'f1', name: `${f1Next.session_name || f1Next.name} - ${f1Next.circuit_short_name || f1Next.circuit}`, date: f1Next.date_start || f1Next.dateStart });

    // Tennis
    const tennisScores = await cached('tennis-scores', TTL.live, async () => {
      const json = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard');
      return json?.events || [];
    });
    if (Array.isArray(tennisScores)) {
      for (const e of tennisScores) {
        if (new Date(e.date) > now) {
          events.push({ sport: 'tennis', name: e.name, date: e.date });
          break;
        }
      }
    }

    // Sort and return closest
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    respond(res, events[0] || null);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch next event' }); }
});

// ═══════════════════════════════════════
// NOTIFICATIONS (DB)
// ═══════════════════════════════════════

/** GET /notifications - User's notification preferences */
router.get('/notifications', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, sport, event_type, team_or_player, enabled, created_at FROM sports_notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    respond(res, rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch notifications' }); }
});

/** POST /notifications - Add a notification preference */
router.post('/notifications', async (req, res) => {
  try {
    const { sport, event_type, team_or_player } = req.body;
    if (!sport || !event_type) return res.status(400).json({ error: 'sport and event_type are required' });
    const { rows } = await pool.query(
      'INSERT INTO sports_notifications (user_id, sport, event_type, team_or_player) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, sport, event_type, team_or_player || null]
    );
    respond(res, rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create notification' }); }
});

/** DELETE /notifications/:id - Remove a notification preference */
router.delete('/notifications/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM sports_notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete notification' }); }
});

module.exports = router;
