/**
 * Sports Football API Tests
 * Tests cache isolation, data shape, and endpoint reliability
 */
const assert = require('assert');
const http = require('http');

// Load env
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:3456/api';
const token = jwt.sign(
  { id: 1, email: 'ali@ashcroft.cloud', household_id: 1, role: 'admin' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, { headers: { Cookie: `access_token=${token}` }, timeout: 15000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (e) { reject(new Error(`Parse error on ${path}: ${d.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
  }).catch(e => {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  });
}

(async () => {
  console.log('\n🏈 Football API Tests\n');

  // --- Matches endpoints ---
  await test('GET /football/matches/66 returns 200', async () => {
    const r = await apiGet('/sports/football/matches/66');
    assert.strictEqual(r.status, 200);
  });

  await test('matches/66 has recent[] and upcoming[] arrays', async () => {
    const r = await apiGet('/sports/football/matches/66');
    assert.ok(Array.isArray(r.body.data?.recent), `recent is not array: ${typeof r.body.data?.recent}`);
    assert.ok(Array.isArray(r.body.data?.upcoming), `upcoming is not array: ${typeof r.body.data?.upcoming}`);
  });

  await test('matches/66 recent items have correct shape', async () => {
    const r = await apiGet('/sports/football/matches/66');
    const match = r.body.data?.recent?.[0];
    if (!match) return; // no matches is OK
    assert.ok(match.homeTeam?.name, 'missing homeTeam.name');
    assert.ok(match.homeTeam?.crest, 'missing homeTeam.crest');
    assert.ok(match.awayTeam?.name, 'missing awayTeam.name');
    assert.ok(match.awayTeam?.crest, 'missing awayTeam.crest');
    assert.ok(match.score, 'missing score');
    assert.ok(match.date, 'missing date');
  });

  await test('matches/86 returns same shape as matches/66', async () => {
    const r = await apiGet('/sports/football/matches/86');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.data?.recent), 'recent not array');
    assert.ok(Array.isArray(r.body.data?.upcoming), 'upcoming not array');
  });

  // --- Standings ---
  await test('GET /football/standings/PL returns array of teams', async () => {
    const r = await apiGet('/sports/football/standings/PL');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.data), `data is not array: ${typeof r.body.data}`);
    assert.ok(r.body.data.length > 0, 'empty standings');
  });

  await test('standings items have position, name, crest, points', async () => {
    const r = await apiGet('/sports/football/standings/PL');
    const team = r.body.data?.[0];
    assert.ok(team?.position, 'missing position');
    assert.ok(team?.name, 'missing name');
    assert.ok(team?.crest, 'missing crest');
    assert.ok(typeof team?.points === 'number', 'missing points');
  });

  await test('GET /football/standings/PD returns La Liga data', async () => {
    const r = await apiGet('/sports/football/standings/PD');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data?.length > 0, 'empty La Liga standings');
  });

  // --- News ---
  await test('GET /news/football returns articles array', async () => {
    const r = await apiGet('/sports/news/football');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.data), 'data not array');
  });

  await test('news articles have title and link', async () => {
    const r = await apiGet('/sports/news/football');
    const article = r.body.data?.[0];
    if (!article) return;
    assert.ok(article.title, 'missing title');
    assert.ok(article.link, 'missing link');
  });

  // --- Summary ---
  await test('GET /summary/football returns text', async () => {
    const r = await apiGet('/sports/summary/football');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data?.text, 'missing summary text');
  });

  // --- Cache isolation ---
  await test('cache isolation: matches/66 shape survives after summary call', async () => {
    // Call summary first (this was the bug — it poisoned the matches cache)
    await apiGet('/sports/summary/football');
    // Now check matches still has correct shape
    const r = await apiGet('/sports/football/matches/66');
    assert.ok(r.body.data?.recent, `recent missing after summary call — got: ${JSON.stringify(r.body.data).slice(0, 100)}`);
    assert.ok(Array.isArray(r.body.data.recent), `recent not array after summary — type: ${typeof r.body.data.recent}`);
  });

  await test('cache isolation: matches/66 is not raw API format', async () => {
    const r = await apiGet('/sports/football/matches/66');
    const data = r.body.data;
    // Raw API format would be an array of match objects with 'area' field
    if (Array.isArray(data)) {
      assert.ok(!data[0]?.area, 'data appears to be raw API format (has area field) — cache key collision!');
    }
    // Correct format has recent/upcoming
    assert.ok(data?.recent || data?.upcoming, 'data missing recent/upcoming structure');
  });

  // --- Report ---
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
