const { Router } = require('express');
const https = require('https');
const http = require('http');
const { pool } = require('../db');

const router = Router();

// ─── Cache ───
const cache = new Map();
function cached(key, ttlMs, fetchFn) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return Promise.resolve(entry.data);
  const promise = fetchFn().then(data => {
    if (data === null || data === undefined) {
      console.warn(`Cache skip null result [${key}]`);
      return entry?.data || data;
    }
    cache.set(key, { data, expires: Date.now() + ttlMs });
    return data;
  }).catch(err => {
    console.error(`Cache fetch error [${key}]:`, err.message);
    return entry?.data || null;
  });
  if (entry?.data) return Promise.resolve(entry.data);
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

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const extract = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      const m = match[1].match(r);
      return m ? m[1].trim() : '';
    };
    // Extract image from media:content, media:thumbnail, or enclosure
    let image = '';
    const mediaUrl = match[1].match(/url\s*=\s*"([^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i);
    if (mediaUrl) image = mediaUrl[1];
    if (!image) {
      const enclosure = match[1].match(/<enclosure[^>]+url="([^"]+)"/i);
      if (enclosure) image = enclosure[1];
    }
    // Try to extract from description img tags
    if (!image) {
      const descImg = match[1].match(/<img[^>]+src="([^"]+)"/i);
      if (descImg) image = descImg[1];
    }

    items.push({
      title: extract('title'),
      description: extract('description'),
      author: extract('dc:creator'),
      link: extract('link'),
      pubDate: extract('pubDate'),
      image,
    });
  }
  return items;
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

// ICC Full Member teams only (men's international cricket)
const ICC_FULL_MEMBERS = [
  'india', 'australia', 'england', 'south africa', 'new zealand',
  'pakistan', 'sri lanka', 'west indies', 'bangladesh', 'zimbabwe',
  'afghanistan', 'ireland'
];
const ICC_CODES = ['IND','AUS','ENG','SA','NZ','PAK','SL','WI','BAN','ZIM','AFG','IRE'];

function isICCMenMatch(teams, name) {
  const nameStr = (name || '').toLowerCase();
  const teamsArr = (teams || []).map(t => t.toLowerCase());
  const teamsStr = teamsArr.join(' ');
  // Exclude women's matches
  if (nameStr.includes('women') || teamsStr.includes('women') || teamsStr.includes('[w]')) return false;
  // Exclude domestic/A-team/emerging/provincial/county/u19 matches
  const domesticKeywords = ['emerging', 'provincial', ' a ', ' a,', 'knights', 'titans', 'warriors',
    'dolphins', 'cobras', 'lions,', 'counties', 'county', 'domestic', 'premier league',
    'u19', 'under-19', 'under 19', 'academy', 'development', 'limpopo', 'boland',
    'north west', 'kwazulu', 'inland', 'division', 'challenge'];
  if (domesticKeywords.some(k => nameStr.includes(k) || teamsStr.includes(k))) return false;
  // Exclude A-team tours (e.g., "Pakistan A", "England Lions")  
  if (teamsArr.some(t => /\b[a-z]+ a\b/.test(t) || t.includes('lions') || t.includes('emerging'))) return false;
  // Must have ICC team code in brackets like [IND], [AUS] — this is the strongest signal for international
  const hasICCCode = ICC_CODES.some(c => teamsStr.includes(`[${c.toLowerCase()}]`));
  if (hasICCCode) return true;
  // Or match name contains international markers
  if (nameStr.includes('t20i') || nameStr.includes('odi') || nameStr.includes('test match') ||
      nameStr.includes('world cup') || nameStr.includes('champions trophy') || nameStr.includes('icc') ||
      nameStr.includes('asia cup') || nameStr.includes('ipl')) return true;
  // Check if BOTH teams are ICC full member names (exact-ish match, not substring)
  const teamMatches = teamsArr.filter(t => 
    ICC_FULL_MEMBERS.some(m => t.startsWith(m) && (t.length === m.length || t[m.length] === ' ' || t[m.length] === '['))
  );
  return teamMatches.length >= 2;
}

/** GET /cricket/rankings - ICC team rankings (static data) */
router.get('/cricket/rankings', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const rankingsPath = path.join(__dirname, '..', 'data', 'icc-rankings.json');
    const data = JSON.parse(fs.readFileSync(rankingsPath, 'utf8'));
    respond(res, data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch rankings' }); }
});

/** Format cricket score properly: T20/ODI → "253/7 (20 ov)", Test → "269 & 198" */
function fmtCricketScore(scoreArr, matchType) {
  if (!scoreArr || !scoreArr.length) return '';
  const isTest = (matchType || '').toLowerCase() === 'test';
  if (isTest) {
    // Test: show both innings separated by " & "
    return scoreArr.map(s => {
      if (s.w >= 10) return `${s.r}`;
      return `${s.r}/${s.w}`;
    }).join(' & ');
  }
  // T20/ODI: show last innings score with overs
  const last = scoreArr[scoreArr.length - 1];
  if (!last) return '';
  return `${last.r}/${last.w} (${last.o} ov)`;
}

/** Extract winning teams from completed semi-final results */
function extractWCFinalists(matches) {
  const finalists = [];
  for (const m of matches) {
    if (!m.matchEnded) continue;
    const nameLC = ((m.name || '') + ' ' + (m.series || '')).toLowerCase();
    if (!nameLC.includes('semi') && !nameLC.includes('sf')) continue;
    if (!nameLC.includes('world cup') && !nameLC.includes('wc') && !nameLC.includes('icc')) continue;
    const status = (m.status || '').toLowerCase();
    // Extract winning team from status like "India won by 7 runs"
    for (const team of m.teams || []) {
      const cleanTeam = team.replace(/\s*\[.*?\]\s*$/, '').trim();
      if (status.includes(cleanTeam.toLowerCase()) && (status.includes('won') || status.includes('win'))) {
        finalists.push(cleanTeam);
        break;
      }
    }
  }
  return finalists;
}

/** Replace TBC teams in upcoming WC matches with actual finalists */
function resolveTBCTeams(upcomingMatches, liveMatches) {
  const finalists = extractWCFinalists(liveMatches);
  if (!finalists.length) return upcomingMatches;
  return upcomingMatches.map(m => {
    const nameLC = ((m.name || '') + ' ' + (m.series || '') + ' ' + (m.status || '')).toLowerCase();
    if (!nameLC.includes('world cup') && !nameLC.includes('wc') && !nameLC.includes('icc')) return m;
    const teams = (m.teams || []).map(t => {
      const clean = t.replace(/\s*\[.*?\]\s*$/, '').trim();
      if (clean.toLowerCase() === 'tbc' || clean.toLowerCase() === 'to be confirmed') {
        // Find a finalist not already in the match
        const otherTeams = (m.teams || []).filter(ot => ot !== t).map(ot => ot.replace(/\s*\[.*?\]\s*$/, '').trim().toLowerCase());
        const replacement = finalists.find(f => !otherTeams.includes(f.toLowerCase()));
        if (replacement) return replacement;
      }
      return t;
    });
    const name = (m.name || '').replace(/Tbc\s*\[TBC\]/gi, teams.find(t => !m.teams.includes(t)) || 'TBC');
    return { ...m, teams, name };
  });
}

/** GET /cricket/live - Live cricket scores (international men's only) */
router.get('/cricket/live', async (req, res) => {
  try {
    const result = await cached('cric-live', TTL.live, async () => {
      // Try currentMatches first for richer data
      const cmJson = await fetchJSON(`https://api.cricapi.com/v1/currentMatches?apikey=${cricKey()}&offset=0`);
      if (cmJson?.data && Array.isArray(cmJson.data)) {
        const matches = cmJson.data
          .filter(m => isICCMenMatch(m.teams || [], m.name))
          .map(m => {
            const scores = (m.score || []).map(s => ({
              r: s.r, w: s.w, o: s.o, inning: s.inning
            }));
            const teamInfo = (m.teamInfo || []).map(t => ({
              name: t.name, shortname: t.shortname, img: t.img
            }));
            const t1 = teamInfo[0] || {};
            const t2 = teamInfo[1] || {};
            // Build formatted score strings per team
            const t1Scores = scores.filter(s => s.inning && (s.inning.includes(t1.shortname) || s.inning.includes(t1.name)));
            const t2Scores = scores.filter(s => s.inning && (s.inning.includes(t2.shortname) || s.inning.includes(t2.name)));
            // Calculate run rate for current innings
            const currentInnings = scores[scores.length - 1];
            const runRate = currentInnings && currentInnings.o > 0 ? (currentInnings.r / currentInnings.o).toFixed(2) : null;

            // Categorize match state
            const isLive = m.matchStarted && !m.matchEnded;
            const isCompleted = !!m.matchEnded;

            return {
              id: m.id, name: m.name, status: m.status, venue: m.venue,
              teams: m.teams || [t1.name || '?', t2.name || '?'],
              scores: [fmtCricketScore(t1Scores, m.matchType), fmtCricketScore(t2Scores, m.matchType)],
              scoreDetail: scores,
              matchType: m.matchType,
              series: m.series || '',
              runRate,
              matchStarted: m.matchStarted, matchEnded: m.matchEnded,
              isLive,
              isCompleted,
              dateTimeGMT: m.dateTimeGMT
            };
          });
        if (matches.length) return matches;
      }
      // Fallback to cricScore
      const json = await fetchJSON(`https://api.cricapi.com/v1/cricScore?apikey=${cricKey()}`);
      if (!json?.data) return [];
      return json.data
        .filter(m => isICCMenMatch([m.t1, m.t2], m.name))
        .map(m => ({
          id: m.id, name: m.name, status: m.status, venue: m.venue,
          teams: [m.t1, m.t2], scores: [m.t1s, m.t2s],
          matchType: m.matchType,
          isLive: !(m.status || '').toLowerCase().includes('won') && !(m.status || '').toLowerCase().includes('draw'),
          isCompleted: (m.status || '').toLowerCase().includes('won') || (m.status || '').toLowerCase().includes('draw'),
        }));
    });
    respond(res, result, cache.has('cric-live'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch live cricket' }); }
});

/** GET /cricket/upcoming - Upcoming cricket matches (international men's only) */
router.get('/cricket/upcoming', async (req, res) => {
  try {
    const result = await cached('cric-upcoming', TTL.standings, async () => {
      // Use /cricScore which has clean international scheduled matches with [CODE] brackets
      const json = await fetchJSON(`https://api.cricapi.com/v1/cricScore?apikey=${cricKey()}`);
      if (!json?.data) return [];
      let upcoming = json.data
        .filter(m => isICCMenMatch([m.t1, m.t2], m.name))
        .filter(m => (m.status || '').toLowerCase().includes('match starts'))
        .map(m => ({
          id: m.id, name: m.name, venue: m.venue, date: null,
          teams: [m.t1, m.t2], matchType: m.matchType, status: m.status,
        }))
        .slice(0, 20);

      // Resolve TBC teams using completed matches from currentMatches
      try {
        const liveEntry = cache.get('cric-live');
        const liveMatches = liveEntry?.data || [];
        if (liveMatches.length) {
          upcoming = resolveTBCTeams(upcoming, liveMatches);
        }
      } catch (e) { /* ignore TBC resolution errors */ }

      return upcoming;
    });
    respond(res, result, cache.has('cric-upcoming'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch upcoming cricket' }); }
});

/** GET /cricket/series - Current series list (international men's only) */
router.get('/cricket/series', async (req, res) => {
  try {
    const result = await cached('cric-series', TTL.calendar, async () => {
      const json = await fetchJSON(`https://api.cricapi.com/v1/series?apikey=${cricKey()}&offset=0`);
      if (!json?.data) return [];
      return json.data
        .filter(s => {
          const name = (s.name || '').toLowerCase();
          if (name.includes('women')) return false;
          // Filter for international series (ICC members, world cup, IPL, etc.)
          return ICC_FULL_MEMBERS.some(t => name.includes(t)) ||
                 name.includes('ipl') || name.includes('world cup') || name.includes('champions trophy') ||
                 name.includes('asia cup') || name.includes('icc') || name.includes('t20i') ||
                 name.includes('odi') || name.includes('test');
        })
        .slice(0, 20)
        .map(s => ({
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

/** GET /f1/recap/2025 - Last season recap */
router.get('/f1/recap/2025', async (req, res) => {
  try {
    const result = await cached('f1-recap-2025', TTL.calendar, async () => {
      const json = await fetchJSON('https://api.jolpi.ca/ergast/f1/2025/results.json?limit=500');
      const apiRaces = json?.MRData?.RaceTable?.Races || [];

      const finalStandings = {
        drivers: [
          { pos: 1, name: 'Lando Norris', team: 'McLaren', pts: 423, wins: 8 },
          { pos: 2, name: 'Max Verstappen', team: 'Red Bull', pts: 421, wins: 9 },
          { pos: 3, name: 'Oscar Piastri', team: 'McLaren', pts: 410, wins: 5 },
          { pos: 4, name: 'George Russell', team: 'Mercedes', pts: 319, wins: 2 },
          { pos: 5, name: 'Charles Leclerc', team: 'Ferrari', pts: 242, wins: 0 },
          { pos: 6, name: 'Lewis Hamilton', team: 'Ferrari', pts: 156, wins: 0 },
        ],
        constructors: [
          { pos: 1, name: 'McLaren', pts: 833, color: '#FF8000' },
          { pos: 2, name: 'Mercedes', pts: 468, color: '#27F4D2' },
          { pos: 3, name: 'Red Bull', pts: 446, color: '#3671C6' },
          { pos: 4, name: 'Ferrari', pts: 398, color: '#E8002D' },
        ],
        headline: "Norris dethroned Verstappen in a nail-biting finale — just 2 points separated champion from challenger after 24 races. McLaren's dominance with Norris and Piastri secured their 2nd consecutive Constructors' title.",
        totalRaces: 24,
      };

      const raceResults = apiRaces.map(r => ({
        round: parseInt(r.round),
        name: r.raceName,
        winner: r.Results?.[0] ? `${r.Results[0].Driver?.givenName?.[0]}. ${r.Results[0].Driver?.familyName}` : '?',
        team: r.Results?.[0]?.Constructor?.name || '?',
        country: r.Circuit?.Location?.country || '',
      }));

      return { finalStandings, raceResults };
    });
    respond(res, result, cache.has('f1-recap-2025'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch F1 recap' }); }
});

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
        country: r.Circuit?.Location?.country, date: r.date, time: r.time,
        qualifying: r.Qualifying ? { date: r.Qualifying.date, time: r.Qualifying.time } : null,
        sprint: r.Sprint ? { date: r.Sprint.date, time: r.Sprint.time } : null,
        sprintQualifying: r.SprintQualifying ? { date: r.SprintQualifying.date, time: r.SprintQualifying.time } : null,
        fp1: r.FirstPractice ? { date: r.FirstPractice.date, time: r.FirstPractice.time } : null,
        fp2: r.SecondPractice ? { date: r.SecondPractice.date, time: r.SecondPractice.time } : null,
        fp3: r.ThirdPractice ? { date: r.ThirdPractice.date, time: r.ThirdPractice.time } : null,
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

/** GET /f1/race/:round/qualifying - Qualifying results */
router.get('/f1/race/:round/qualifying', async (req, res) => {
  try {
    const round = parseInt(req.params.round) || 1;
    const key = `f1-quali-${round}`;
    const result = await cached(key, TTL.results, async () => {
      let json = await fetchJSON(`${JOLPICA}/2026/${round}/qualifying.json`);
      let results = json?.MRData?.RaceTable?.Races?.[0]?.QualifyingResults;
      if (!results || !results.length) {
        json = await fetchJSON(`${JOLPICA}/2025/${round}/qualifying.json`);
        results = json?.MRData?.RaceTable?.Races?.[0]?.QualifyingResults;
      }
      if (!results) return [];
      return results.map(q => ({
        position: parseInt(q.position),
        driver: `${q.Driver.givenName} ${q.Driver.familyName}`,
        code: q.Driver.code,
        constructor: q.Constructor.name,
        q1: q.Q1 || null,
        q2: q.Q2 || null,
        q3: q.Q3 || null
      }));
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch qualifying results' }); }
});

/** GET /f1/race/:round/sprint - Sprint results */
router.get('/f1/race/:round/sprint', async (req, res) => {
  try {
    const round = parseInt(req.params.round) || 1;
    const key = `f1-sprint-${round}`;
    const result = await cached(key, TTL.results, async () => {
      let json = await fetchJSON(`${JOLPICA}/2026/${round}/sprint.json`);
      let results = json?.MRData?.RaceTable?.Races?.[0]?.SprintResults;
      if (!results || !results.length) {
        json = await fetchJSON(`${JOLPICA}/2025/${round}/sprint.json`);
        results = json?.MRData?.RaceTable?.Races?.[0]?.SprintResults;
      }
      if (!results) return [];
      return results.map(r => ({
        position: parseInt(r.position),
        driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
        code: r.Driver.code,
        constructor: r.Constructor.name,
        time: r.Time?.time || r.status,
        points: parseFloat(r.points)
      }));
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch sprint results' }); }
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
    const fbMatches = await cached('fb-nextup-66', TTL.results, async () => {
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
    const f1Next = await cached('f1-raw-next', TTL.standings, async () => {
      const json = await fetchJSON('https://api.openf1.org/v1/sessions?year=2025');
      if (!Array.isArray(json)) return null;
      const upcoming = json.filter(s => s.date_start > now.toISOString());
      return upcoming.length ? upcoming.sort((a, b) => a.date_start.localeCompare(b.date_start))[0] : null;
    });
    if (f1Next) events.push({ sport: 'f1', name: `${f1Next.session_name || f1Next.name} - ${f1Next.circuit_short_name || f1Next.circuit}`, date: f1Next.date_start || f1Next.dateStart });

    // Tennis
    const tennisScores = await cached('tennis-raw-scores', TTL.live, async () => {
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

// ═══════════════════════════════════════
// NEWS (ESPN RSS)
// ═══════════════════════════════════════
const RSS_URLS = {
  football: 'https://www.espn.com/espn/rss/soccer/news',
  cricket: 'https://news.google.com/rss/search?q=cricket+india&hl=en-IN&gl=IN&ceid=IN:en',
  tennis: 'https://www.espn.com/espn/rss/tennis/news',
  f1: 'https://www.espn.com/espn/rss/rpm/news',
};

/** Fetch og:image from article URL */
async function fetchOgImage(url) {
  try {
    const html = await fetchText(url);
    const match = html.match(/og:image["']\s*content=["']([^"']+)/i);
    return match?.[1] || '';
  } catch { return ''; }
}

/** GET /news/:sport - ESPN news feed with article images */
router.get('/news/:sport', async (req, res) => {
  try {
    const sport = req.params.sport;
    const url = RSS_URLS[sport];
    if (!url) return res.status(400).json({ error: 'Unknown sport' });
    const key = `news-${sport}`;
    const result = await cached(key, 1800000, async () => {
      const xml = await fetchText(url);
      const articles = parseRSS(xml).slice(0, 6);
      // Fetch og:image for articles missing images (parallel, with timeout)
      await Promise.all(articles.map(async (a) => {
        if (!a.image && a.link) {
          a.image = await fetchOgImage(a.link);
        }
      }));
      return articles;
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch news' }); }
});

// ═══════════════════════════════════════
// AI SUMMARY (server-generated narratives)
// ═══════════════════════════════════════

async function generateFootballSummary() {
  const [muData, rmData, plStandings, pdStandings] = await Promise.all([
    cached('fb-raw-66', TTL.results, () => fetchJSON(`${FB_BASE}/teams/66/matches?limit=5&status=FINISHED`, fbHeaders()).then(j => j?.matches || [])),
    cached('fb-raw-86', TTL.results, () => fetchJSON(`${FB_BASE}/teams/86/matches?limit=5&status=FINISHED`, fbHeaders()).then(j => j?.matches || [])),
    cached('fb-raw-standings-PL', TTL.standings, () => fetchJSON(`${FB_BASE}/competitions/PL/standings`, fbHeaders()).then(j => j?.standings?.[0]?.table || [])),
    cached('fb-raw-standings-PD', TTL.standings, () => fetchJSON(`${FB_BASE}/competitions/PD/standings`, fbHeaders()).then(j => j?.standings?.[0]?.table || [])),
  ]);
  const parts = [];
  const plTable = Array.isArray(plStandings) ? plStandings : [];
  const pdTable = Array.isArray(pdStandings) ? pdStandings : [];
  const muPos = plTable.find(t => t.name?.includes('Manchester United') || t.team?.name?.includes('Manchester United'));
  if (muPos) {
    const p = muPos.position || muPos.position;
    const pts = muPos.points;
    parts.push(`Man Utd sit ${p}${p===1?'st':p===2?'nd':p===3?'rd':'th'} in the Premier League with ${pts} points (${muPos.won || 0}W ${muPos.draw || 0}D ${muPos.lost || 0}L).`);
  }
  const rmPos = pdTable.find(t => t.name?.includes('Real Madrid') || t.team?.name?.includes('Real Madrid'));
  if (rmPos) {
    const leader = pdTable[0];
    const gap = (leader?.points || 0) - (rmPos.points || 0);
    parts.push(`In La Liga, Real Madrid are ${rmPos.position === 1 ? 'top' : rmPos.position + (rmPos.position===2?'nd':rmPos.position===3?'rd':'th')} with ${rmPos.points} pts${gap > 0 ? `, ${gap} points behind leaders ${leader.name || leader.team?.name}` : ''}.`);
  }
  return parts.join(' ') || 'Football data is currently being updated. Check back soon for the latest summary.';
}

async function generateCricketSummary() {
  const upcoming = await cached('cric-raw-upcoming', TTL.standings, async () => {
    const json = await fetchJSON(`https://api.cricapi.com/v1/matches?apikey=${cricKey()}&offset=0`);
    return json?.data || [];
  });
  const indiaMatches = (Array.isArray(upcoming) ? upcoming : []).filter(m => m.teams?.some(t => t.toLowerCase().includes('india')));
  if (indiaMatches.length) {
    const next = indiaMatches[0];
    return `India's next fixture: ${next.name || next.teams?.join(' vs ')}${next.venue ? ' at ' + next.venue : ''}${next.date ? ' on ' + new Date(next.date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : ''}. ${indiaMatches.length > 1 ? `${indiaMatches.length} upcoming India matches on the schedule.` : ''}`;
  }
  return 'No upcoming India matches currently scheduled. Check back for updates as the cricket calendar unfolds.';
}

async function generateTennisSummary() {
  const rankings = await cached('tennis-raw-rankings', TTL.standings, async () => {
    const json = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/rankings');
    return json?.rankings?.[0]?.ranks?.slice(0, 10).map(r => ({ rank: r.current, name: r.athlete?.displayName, points: r.points })) || [];
  });
  const players = Array.isArray(rankings) ? rankings : [];
  if (players.length >= 3) {
    const top3 = players.slice(0, 3);
    const now = new Date();
    const slams = [
      { name: 'Australian Open', start: '2026-01-19' }, { name: 'Roland Garros', start: '2026-05-25' },
      { name: 'Wimbledon', start: '2026-06-29' }, { name: 'US Open', start: '2026-08-31' },
    ];
    const nextSlam = slams.find(s => new Date(s.start) > now);
    return `${top3[0].name} leads the ATP rankings at #1 with ${(top3[0].points||0).toLocaleString()} points. ${top3[1].name} sits at #2 (${(top3[1].points||0).toLocaleString()} pts), with ${top3[2].name} rounding out the top 3 (${(top3[2].points||0).toLocaleString()} pts).${nextSlam ? ` Next Grand Slam: ${nextSlam.name}.` : ''}`;
  }
  return 'Tennis rankings data is being updated. Check back shortly.';
}

async function generateF1Summary() {
  const calendar = await cached('f1-raw-calendar', TTL.calendar, async () => {
    let json = await fetchJSON(`${JOLPICA}/2026/races.json`);
    let races = json?.MRData?.RaceTable?.Races;
    if (!races || !races.length) { json = await fetchJSON(`${JOLPICA}/2025/races.json`); races = json?.MRData?.RaceTable?.Races || []; }
    return races;
  });
  const races = Array.isArray(calendar) ? calendar : [];
  const now = new Date();
  const nextRace = races.find(r => new Date(r.date) > now);
  if (nextRace) {
    const country = nextRace.Circuit?.Location?.country || nextRace.country || '';
    return `The next F1 race is the ${nextRace.raceName || nextRace.name} in ${country} on ${new Date(nextRace.date).toLocaleDateString('en-GB', { day:'numeric', month:'long' })}. 2026 marks a revolutionary new era with completely redesigned regulations — simplified aero, active aero elements, and a new power unit formula. Reigning champion Lando Norris (McLaren) will look to defend his title after edging Max Verstappen by just 2 points in a dramatic 2025 season.`;
  }
  return 'The F1 season calendar is being updated. Stay tuned for race schedules and previews.';
}

/** GET /summary/:sport - AI-generated narrative summary */
router.get('/summary/:sport', async (req, res) => {
  try {
    const sport = req.params.sport;
    const generators = { football: generateFootballSummary, cricket: generateCricketSummary, tennis: generateTennisSummary, f1: generateF1Summary };
    const gen = generators[sport];
    if (!gen) return res.status(400).json({ error: 'Unknown sport' });
    const key = `summary-${sport}`;
    const result = await cached(key, 900000, async () => {
      const text = await gen();
      return { text, generatedAt: new Date().toISOString() };
    });
    respond(res, result, cache.has(key));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to generate summary' }); }
});

/** GET /next-up - Cross-sport upcoming events for dashboard widget */
router.get('/next-up', async (req, res) => {
  try {
    const result = await cached('next-up', 600000, async () => {
      const events = [];
      // Football
      try {
        const [mu, rm] = await Promise.all([
          fetchJSON(`${FB_BASE}/teams/66/matches?limit=3&status=SCHEDULED`, fbHeaders()).then(j => j?.matches || []),
          fetchJSON(`${FB_BASE}/teams/86/matches?limit=3&status=SCHEDULED`, fbHeaders()).then(j => j?.matches || []),
        ]);
        [...mu, ...rm].forEach(m => {
          events.push({ sport: 'football', title: `${m.homeTeam?.shortName || m.homeTeam?.name} vs ${m.awayTeam?.shortName || m.awayTeam?.name}`, competition: m.competition?.name || '', date: m.utcDate, name: m.homeTeam?.shortName });
        });
      } catch(e) {}
      // Cricket
      try {
        const json = await fetchJSON(`https://api.cricapi.com/v1/matches?apikey=${cricKey()}&offset=0`);
        const matches = (json?.data || []).filter(m => isICCMenMatch(m) && !m.matchStarted);
        matches.slice(0, 3).forEach(m => {
          events.push({ sport: 'cricket', title: m.teams?.join(' vs ') || m.name, competition: m.series || '', date: m.date || m.dateTimeGMT });
        });
      } catch(e) {}
      // F1
      try {
        let json = await fetchJSON(`${JOLPICA}/2026/races.json`);
        let races = json?.MRData?.RaceTable?.Races || [];
        if (!races.length) { json = await fetchJSON(`${JOLPICA}/2025/races.json`); races = json?.MRData?.RaceTable?.Races || []; }
        const now = new Date();
        races.filter(r => new Date(r.date) > now).slice(0, 2).forEach(r => {
          events.push({ sport: 'f1', title: r.raceName || r.name, competition: 'Formula 1', date: r.date });
        });
      } catch(e) {}
      // Tennis — next slam
      try {
        const now = new Date();
        const slams = [
          { name: 'Australian Open', date: '2026-01-19', surface: 'Hard' },
          { name: 'Roland Garros', date: '2026-05-25', surface: 'Clay' },
          { name: 'Wimbledon', date: '2026-06-29', surface: 'Grass' },
          { name: 'US Open', date: '2026-08-31', surface: 'Hard' },
        ];
        const next = slams.find(s => new Date(s.date) > now);
        if (next) events.push({ sport: 'tennis', title: next.name, competition: `Grand Slam · ${next.surface}`, date: next.date });
      } catch(e) {}
      // Sort by date
      events.sort((a, b) => new Date(a.date) - new Date(b.date));
      return events.slice(0, 5);
    });
    respond(res, result, cache.has('next-up'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch next-up' }); }
});

module.exports = router;
