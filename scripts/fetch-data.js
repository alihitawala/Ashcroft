#!/usr/bin/env node
/**
 * fetch-data.js — Fetches live data for ashcroft.cloud public homepage
 * Run via cron every 15 minutes. Writes JSON to /home/ashcroft/www/public/data/
 * All sources are free, no API keys required.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// ═══════════════ HELPERS ═══════════════

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'ashcroft-cloud/1.0', ...opts.headers },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function writeData(name, obj) {
  const file = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...obj, _updated: new Date().toISOString() }, null, 2));
  console.log(`✓ ${name}.json written`);
}

function parseXml(xml, tag) {
  // Minimal RSS item parser — no dependencies
  const items = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) items.push(m[1]);
  return items;
}

function xmlVal(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

function xmlAttr(xml, tag, attr) {
  // Extract attribute from a self-closing or open tag: <tag attr="value" ...> or <tag attr="value"/>
  const re = new RegExp(`<${tag}[^>]*?${attr}\\s*=\\s*"([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function extractImage(itemXml) {
  // Try multiple RSS image patterns in priority order
  // 1. media:thumbnail (BBC)
  let img = xmlAttr(itemXml, 'media:thumbnail', 'url');
  if (img) return img;
  // 2. media:content with image type or url ending in image ext
  img = xmlAttr(itemXml, 'media:content', 'url');
  if (img && /\.(jpg|jpeg|png|gif|webp)/i.test(img)) return img;
  if (img && /image/i.test(xmlAttr(itemXml, 'media:content', 'type') || xmlAttr(itemXml, 'media:content', 'medium'))) return img;
  if (img) return img; // media:content usually is an image anyway
  // 3. enclosure (TOI, general RSS)
  img = xmlAttr(itemXml, 'enclosure', 'url');
  if (img) return img;
  // 4. <image><url> inside item (rare)
  img = xmlVal(itemXml, 'url');
  if (img && /^https?:/.test(img) && /\.(jpg|jpeg|png|gif|webp)/i.test(img)) return img;
  return '';
}

// ═══════════════ WEATHER (Open-Meteo) ═══════════════

async function fetchWeather() {
  try {
    const locations = [
      { name: 'Sunnyvale, CA', lat: 37.3688, lon: -122.0363, tz: 'America/Los_Angeles', unit: 'fahrenheit', windUnit: 'mph' },
      { name: 'Udaipur, India', lat: 24.5854, lon: 73.7125, tz: 'Asia/Kolkata', unit: 'fahrenheit', windUnit: 'mph' },
    ];
    const results = [];
    for (const loc of locations) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=${loc.unit}&wind_speed_unit=${loc.windUnit}&timezone=${loc.tz}&forecast_days=6`;
    const res = await fetch(url);
    const d = JSON.parse(res.data);

    const wmoEmoji = (code) => {
      if (code <= 1) return '☀️';
      if (code <= 3) return '⛅';
      if (code <= 48) return '☁️';
      if (code <= 55) return '🌧️';
      if (code <= 57) return '🌧️';
      if (code <= 65) return '🌧️';
      if (code <= 67) return '🧊';
      if (code <= 75) return '❄️';
      if (code <= 77) return '❄️';
      if (code <= 82) return '🌧️';
      if (code <= 86) return '❄️';
      if (code <= 99) return '⛈️';
      return '🌡️';
    };

    const wmoDesc = (code) => {
      if (code === 0) return 'Clear Sky';
      if (code === 1) return 'Mainly Clear';
      if (code === 2) return 'Partly Cloudy';
      if (code === 3) return 'Overcast';
      if (code <= 48) return 'Foggy';
      if (code <= 57) return 'Drizzle';
      if (code <= 65) return 'Rain';
      if (code <= 67) return 'Freezing Rain';
      if (code <= 75) return 'Snow';
      if (code <= 82) return 'Rain Showers';
      if (code <= 86) return 'Snow Showers';
      if (code <= 99) return 'Thunderstorm';
      return 'Unknown';
    };

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const forecast = d.daily.time.slice(1, 6).map((date, i) => ({
      label: dayNames[new Date(date + 'T12:00:00').getDay()],
      emoji: wmoEmoji(d.daily.weather_code[i + 1]),
      high: Math.round(d.daily.temperature_2m_max[i + 1]),
    }));

    results.push({
      location: loc.name,
      temp: Math.round(d.current.temperature_2m),
      emoji: wmoEmoji(d.current.weather_code),
      description: wmoDesc(d.current.weather_code),
      high: Math.round(d.daily.temperature_2m_max[0]),
      low: Math.round(d.daily.temperature_2m_min[0]),
      wind: Math.round(d.current.wind_speed_10m),
      humidity: d.current.relative_humidity_2m,
      forecast,
    });
    }
    writeData('weather', { locations: results });
  } catch (e) {
    console.error('✗ weather:', e.message);
  }
}

// ═══════════════ STOCKS (Yahoo Finance) ═══════════════

function isMarketOpen() {
  // US market hours: Mon-Fri, ~4am-8pm ET (extended hours included)
  // Skip entirely on weekends; on weekdays skip overnight (8:30pm - 3:50am ET)
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  // Skip between 8:30 PM and 3:50 AM ET (no meaningful price changes)
  if (mins >= 20 * 60 + 30 || mins < 3 * 60 + 50) return false;
  return true;
}

async function fetchStocks() {
  if (!isMarketOpen()) {
    console.log('  ⏭ stocks: market closed');
    return;
  }
  try {
    const tickers = ['META', 'GOOGL', 'TSLA', 'AAPL', 'AVGO', 'VOO', 'ACHR', 'CRSP', 'MRVL', 'RBLX', 'ROKU', 'SHOP', 'XLE'];
    const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
    const quotes = [];

    // Use v8 chart endpoint (works without auth)
    await Promise.allSettled(tickers.map(async (sym) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`;
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        const d = JSON.parse(res.data);
        const meta = d.chart?.result?.[0]?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose;
        const changePct = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
        quotes.push({
          ticker: sym,
          name: meta.shortName || meta.longName || sym,
          price: price.toFixed(2),
          change: changePct.toFixed(2),
        });
      } catch (e) {
        console.error(`  ✗ stock ${sym}: ${e.message}`);
      }
    }));

    // Preserve original order
    const ordered = tickers.map(t => quotes.find(q => q.ticker === t)).filter(Boolean);
    writeData('stocks', { stocks: ordered });
  } catch (e) {
    console.error('✗ stocks:', e.message);
  }
}

// ═══════════════ NEWS (RSS Feeds) ═══════════════

async function fetchNews() {
  const feeds = {
    us: [
      { source: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
      { source: 'NYT', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
      { source: 'AP', url: 'https://rsshub.app/apnews/topics/apf-topnews' },
      { source: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
      { source: 'PBS', url: 'https://www.pbs.org/newshour/feeds/rss/headlines' },
    ],
    india: [
      { source: 'NDTV', url: 'https://feeds.feedburner.com/ndtvnews-top-stories' },
      { source: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms' },
      { source: 'The Hindu', url: 'https://www.thehindu.com/news/national/feeder/default.rss' },
      { source: 'Indian Express', url: 'https://indianexpress.com/section/india/feed/' },
      { source: 'Hindustan Times', url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml' },
    ],
  };

  const results = { us: [], india: [] };

  for (const [region, sources] of Object.entries(feeds)) {
    for (const feed of sources) {
      try {
        const res = await fetch(feed.url);
        const items = parseXml(res.data, 'item').slice(0, 2);
        for (const item of items) {
          const title = xmlVal(item, 'title');
          const link = xmlVal(item, 'link');
          const pubDate = xmlVal(item, 'pubDate');
          if (title) {
            const img = extractImage(item);
            results[region].push({
              source: feed.source,
              headline: title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
              link: link.replace(/<[^>]+>/g, '').trim(),
              time: pubDate,
              ...(img && { img }),
            });
          }
        }
      } catch (e) {
        console.error(`  ✗ ${feed.source}: ${e.message}`);
      }
    }
    // Keep top 5 per region
    results[region] = results[region].slice(0, 5);
  }

  writeData('news', results);
}

// ═══════════════ CRICKET (CricAPI) ═══════════════

async function fetchCricketMatches() {
  const CRICAPI_KEY = process.env.CRICAPI_KEY || '';
  if (!CRICAPI_KEY) {
    console.log('  ⏭ cricket: no API key (set CRICAPI_KEY)');
    return [];
  }

  // Featured nations — partial match so "India A", "Pakistan A", "India U19" etc. count
  const FEATURED = ['India', 'Australia', 'South Africa', 'England', 'New Zealand', 'Pakistan',
    'Sri Lanka', 'West Indies', 'Bangladesh', 'Afghanistan', 'Ireland'];
  const isFeatured = (name) => FEATURED.some(f => name.startsWith(f));
  // Ali's teams get highlight
  const HIGHLIGHT = ['India'];
  const isHighlight = (name) => HIGHLIGHT.some(f => name.startsWith(f));

  try {
    // cricScore endpoint has current + upcoming fixtures (matches endpoint only has old data)
    const url = `https://api.cricapi.com/v1/cricScore?apikey=${CRICAPI_KEY}`;
    const res = await fetch(url);
    const data = JSON.parse(res.data);

    if (data.status !== 'success' || !data.data) {
      console.error('  ✗ cricket:', data.reason || 'unknown error');
      return [];
    }

    const matches = [];
    const seen = new Set();

    for (const m of data.data) {
      // Extract team names — cricScore uses t1/t2 with "[CODE]" suffix
      const t1Raw = m.t1 || '';
      const t2Raw = m.t2 || '';
      const t1 = t1Raw.replace(/\s*\[.*?\]\s*$/, '').trim();
      const t2 = t2Raw.replace(/\s*\[.*?\]\s*$/, '').trim();

      // Skip women's matches
      if (/women/i.test(t1) || /women/i.test(t2)) continue;

      // At least one featured nation
      if (!isFeatured(t1) && !isFeatured(t2)) continue;

      // Skip domestic (Sheffield Shield, Ranji, Plunket, etc.) — keep A-team & U19
      if (!isFeatured(t1) && !isFeatured(t2)) continue;

      // Dedupe
      const key = [t1, t2].sort().join('|') + '|' + (m.dateTimeGMT || '').slice(0, 10);
      if (seen.has(key)) continue;
      seen.add(key);

      // Map status from 'ms' field
      let state = 'pre';
      if (m.ms === 'live' || (m.matchStarted && !m.matchEnded)) state = 'in';
      else if (m.ms === 'result' || m.matchEnded) state = 'post';
      // ms=fixture means upcoming

      // Build league name from series field (most accurate) then fallback to matchType
      let league = '🏏 Cricket';
      const series = (m.series || m.name || m.status || '').toLowerCase();
      if (/t20.world.cup/i.test(series)) league = '🏏 T20 World Cup';
      else if (/odi.world.cup/i.test(series)) league = '🏏 ODI World Cup';
      else if (/champions.trophy/i.test(series)) league = '🏏 Champions Trophy';
      else if (/ipl/i.test(series)) league = '🏏 IPL';
      else if (/asia.cup/i.test(series)) league = '🏏 Asia Cup';
      else if (/the.ashes/i.test(series)) league = '🏏 The Ashes';
      else if (/world.test.championship/i.test(series)) league = '🏏 WTC';
      else if (m.matchType === 't20') league = '🏏 T20I';
      else if (m.matchType === 'odi') league = '🏏 ODI';
      else if (m.matchType === 'test') league = '🏏 Test';

      const t1Img = m.t1img || '';
      const t2Img = m.t2img || '';

      // Parse scores — cricScore uses t1s/t2s fields
      const t1Score = m.t1s || '';
      const t2Score = m.t2s || '';

      matches.push({
        league,
        teams: [
          { name: t1, logo: t1Img, score: t1Score },
          { name: t2, logo: t2Img, score: t2Score },
        ],
        status: m.status || (state === 'in' ? 'In Progress' : state === 'post' ? 'Result' : 'Scheduled'),
        statusDetail: m.status || 'Upcoming',
        date: m.dateTimeGMT ? new Date(m.dateTimeGMT).toISOString() : new Date().toISOString(),
        state,
        highlight: isHighlight(t1) || isHighlight(t2),
      });
    }

    // Drop completed older than 48h
    const cutoff = Date.now() - 48 * 3600 * 1000;
    return matches.filter(m => m.state !== 'post' || new Date(m.date).getTime() > cutoff);
  } catch (e) {
    console.error('  ✗ cricket:', e.message);
    return [];
  }
}

// ═══════════════ SPORTS ═══════════════

async function fetchSports() {
  const matches = [];
  const seen = new Set();

  // Top teams to show (EPL top 5 + Man Utd, La Liga top 5 + Real Madrid)
  const FEATURED_TEAMS = {
    // EPL — IDs: Liverpool=364, Arsenal=359, Nottm Forest=393, Chelsea=363, Man City=382, Man Utd=360, Newcastle=361, Brighton=331
    'Premier League': new Set(['Liverpool', 'Arsenal', 'Nott\'m Forest', 'Chelsea', 'Man City', 'Man United']),
    // La Liga — Barcelona=83, Atletico=1068, Real Madrid=86, Athletic=93, Villarreal=102
    'La Liga': new Set(['Barcelona', 'Atlético', 'Real Madrid', 'Athletic', 'Villarreal']),
  };

  // Ali's teams get ⭐
  const MY_TEAMS = ['Man United', 'Real Madrid'];

  // Cricket: only these nations (men's)
  const CRICKET_NATIONS = new Set(['IND', 'AUS', 'SA', 'RSA', 'ENG', 'NZ', 'PAK', 'SL', 'WI', 'BAN', 'AFG', 'IRE',
    'India', 'Australia', 'South Africa', 'England', 'New Zealand', 'Pakistan', 'Sri Lanka', 'West Indies', 'Bangladesh', 'Afghanistan', 'Ireland']);

  // Tennis: only Grand Slams + ATP 1000 + top 10 players
  const TENNIS_MAJORS = ['Australian Open', 'Roland Garros', 'French Open', 'Wimbledon', 'US Open',
    'Indian Wells', 'BNP Paribas', 'Miami Open', 'Monte-Carlo', 'Monte Carlo', 'Madrid Open', 'Mutua Madrid',
    'Italian Open', 'Rome', 'Canadian Open', 'Rogers Cup', 'National Bank Open',
    'Cincinnati', 'Western & Southern', 'Shanghai', 'Rolex Shanghai', 'Paris Masters', 'Rolex Paris'];
  const TENNIS_TOP10 = new Set(['Sinner', 'Zverev', 'Alcaraz', 'Djokovic', 'Medvedev',
    'Fritz', 'Rune', 'De Minaur', 'Ruud', 'Draper',
    'J. Sinner', 'A. Zverev', 'C. Alcaraz', 'N. Djokovic', 'D. Medvedev',
    'T. Fritz', 'H. Rune', 'A. De Minaur', 'C. Ruud', 'J. Draper']);

  function addMatch(event, league, forceInclude = false, parentEvent = null) {
    const c = event.competitions?.[0];
    if (!c) return;
    const teams = c.competitors?.map(t => ({
      name: t.team?.shortDisplayName || t.team?.displayName,
      logo: t.team?.logo || '',
      score: t.score,
    })) || [];

    const key = teams.map(t => t.name).sort().join('|') + '|' + event.date?.slice(0, 10);
    if (seen.has(key)) {
      // If it's a MY_TEAMS match, mark existing as highlight
      if (teams.some(t => MY_TEAMS.includes(t.name))) {
        const existing = matches.find(m => {
          const ek = m.teams.map(t => t.name).sort().join('|') + '|' + m.date?.slice(0, 10);
          return ek === key;
        });
        if (existing) existing.highlight = true;
      }
      return;
    }

    // Filter soccer: only featured teams (unless forceInclude)
    const allowedTeams = FEATURED_TEAMS[league];
    if (allowedTeams && !forceInclude) {
      const hasTopTeam = teams.some(t => allowedTeams.has(t.name));
      if (!hasTopTeam) return;
    }

    // Filter cricket: only selected nations
    if (league === 'Cricket') {
      const hasFeaturedNation = teams.some(t => CRICKET_NATIONS.has(t.name));
      if (!hasFeaturedNation) return;
    }

    // Filter tennis: only majors/ATP 1000 or top 10 players
    if (league === 'Tennis · ATP') {
      const eventName = parentEvent?.name || parentEvent?.shortName || event?.name || event?.shortName || '';
      const isMajorEvent = TENNIS_MAJORS.some(m => eventName.toLowerCase().includes(m.toLowerCase()));
      const hasTopPlayer = teams.some(t => TENNIS_TOP10.has(t.name));
      if (!isMajorEvent && !hasTopPlayer) return;
    }

    seen.add(key);
    const isMyTeam = teams.some(t => MY_TEAMS.includes(t.name));
    matches.push({
      league,
      teams,
      status: event.status?.type?.description || '',
      statusDetail: event.status?.type?.detail || '',
      date: event.date,
      state: event.status?.type?.state || '',
      highlight: isMyTeam,
    });
  }

  async function fetchScoreboard(sport, league, label, dateRange, maxItems = 10) {
    try {
      let url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
      if (dateRange) url += `?dates=${dateRange}`;
      const res = await fetch(url);
      const data = JSON.parse(res.data);
      const forceInclude = !['Premier League', 'La Liga'].includes(label);
      for (const event of (data.events || []).slice(0, maxItems)) {
        addMatch(event, label, forceInclude, event);
      }
    } catch (e) {
      console.error(`  ✗ ${label}:`, e.message);
    }
  }

  async function fetchTeamNext(sport, league, teamId, label) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}`;
      const res = await fetch(url);
      const data = JSON.parse(res.data);
      for (const event of (data.team?.nextEvent || [])) {
        addMatch(event, label, true);
      }
    } catch (e) {
      console.error(`  ✗ team ${teamId}:`, e.message);
    }
  }

  const now = new Date();
  const future = new Date(now.getTime() + 14 * 86400000);
  const dateRange = now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + future.toISOString().slice(0, 10).replace(/-/g, '');

  await Promise.allSettled([
    // Soccer: EPL & La Liga (today + upcoming 2 weeks, filtered to top teams)
    fetchScoreboard('soccer', 'eng.1', 'Premier League', null),
    fetchScoreboard('soccer', 'eng.1', 'Premier League', dateRange),
    fetchScoreboard('soccer', 'esp.1', 'La Liga', null),
    fetchScoreboard('soccer', 'esp.1', 'La Liga', dateRange),

    // My teams next fixtures (always included + highlighted)
    fetchTeamNext('soccer', 'eng.1', '360', 'Premier League'),    // Man Utd
    fetchTeamNext('soccer', 'esp.1', '86', 'La Liga'),            // Real Madrid
    fetchTeamNext('soccer', 'uefa.champions', '360', 'Champions League'),
    fetchTeamNext('soccer', 'uefa.champions', '86', 'Champions League'),

    // Cricket — CricAPI.com (1 call per run, ~96/day under free 100 limit)
    fetchCricketMatches().then(cricketMatches => {
      for (const cm of cricketMatches) {
        const key = cm.teams.map(t => t.name).sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(cm);
        }
      }
    }),

    // Tennis (current + upcoming)
    fetchScoreboard('tennis', 'atp', 'Tennis · ATP', null, 5),
    fetchScoreboard('tennis', 'atp', 'Tennis · ATP', dateRange, 5),
  ]);

  // Sort: live first, then everything by date/time
  matches.sort((a, b) => {
    if (a.state === 'in' && b.state !== 'in') return -1;
    if (b.state === 'in' && a.state !== 'in') return 1;
    return new Date(a.date) - new Date(b.date);
  });

  // Drop completed matches >48h old (unless highlighted)
  const cutoff = now.getTime() - 48 * 3600 * 1000;
  const filtered = matches.filter(m => {
    if (m.state !== 'post') return true;
    if (m.highlight) return true;
    return new Date(m.date).getTime() > cutoff;
  });

  // Split into soccer vs cricket/tennis
  const soccer = filtered.filter(m => ['Premier League', 'La Liga', 'Champions League'].includes(m.league));
  const other = filtered.filter(m => !['Premier League', 'La Liga', 'Champions League'].includes(m.league));

  writeData('sports', { matches: soccer.slice(0, 12) });
  writeData('sports-other', { matches: other.slice(0, 10) });
}

// ═══════════════ YOUTUBE ═══════════════

const YT_CHANNELS_FILE = path.join(__dirname, 'youtube-channels.json');

// Parse video details into clean objects
function parseYTVideos(items) {
  return (items || []).map(v => {
    const s = v.snippet || {};
    const stats = v.statistics || {};
    const thumbs = s.thumbnails || {};
    const thumb = (thumbs.medium || thumbs.default || {}).url || '';
    const dur = v.contentDetails?.duration || '';
    const durMatch = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    let duration = '';
    if (durMatch) {
      const h = durMatch[1] ? durMatch[1] + ':' : '';
      const m = (durMatch[2] || '0').padStart(h ? 2 : 1, '0');
      const sec = (durMatch[3] || '0').padStart(2, '0');
      duration = h + m + ':' + sec;
    }
    return {
      id: typeof v.id === 'string' ? v.id : v.id?.videoId || '',
      title: s.title,
      channel: s.channelTitle,
      thumbnail: thumb,
      views: parseInt(stats.viewCount || 0),
      duration,
      publishedAt: s.publishedAt,
    };
  });
}

// Fetch video details (stats + duration) for a list of IDs
async function getVideoDetails(ids, apiKey) {
  if (!ids.length) return [];
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${apiKey}`;
  const res = await fetch(url);
  const d = JSON.parse(res.data);
  return d.error ? [] : parseYTVideos(d.items || []);
}

// Search YouTube by query
async function searchYT(query, apiKey, maxResults = 5) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&publishedAfter=${since}&maxResults=${maxResults}&relevanceLanguage=en&key=${apiKey}`;
  const res = await fetch(url);
  const d = JSON.parse(res.data);
  if (d.error || !d.items) return [];
  const ids = d.items.map(v => v.id.videoId).filter(Boolean);
  return getVideoDetails(ids, apiKey);
}

async function fetchYouTube() {
  const API_KEY = process.env.YOUTUBE_API_KEY || '';
  if (!API_KEY) {
    console.log('  ⏭ youtube: no API key (set YOUTUBE_API_KEY)');
    return;
  }

  const results = [];

  // ── 1. From Your Subscriptions ──
  try {
    let channels = [];
    try {
      channels = JSON.parse(fs.readFileSync(YT_CHANNELS_FILE, 'utf8'));
    } catch {}

    if (channels.length) {
      // Pick ~20 random channels each run to stay within API quota
      // (each search call = 100 units, 20 calls = 2000 units, well within 10k/day at 2 runs/day)
      const shuffled = channels.sort(() => Math.random() - 0.5).slice(0, 20);
      const since = new Date(Date.now() - 3 * 86400000).toISOString(); // last 3 days
      const allVideos = [];

      // Fetch in parallel batches of 5
      for (let i = 0; i < shuffled.length; i += 5) {
        const batch = shuffled.slice(i, i + 5);
        await Promise.allSettled(batch.map(async (ch) => {
          try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ch.id}&type=video&order=date&maxResults=1&publishedAfter=${since}&key=${API_KEY}`;
            const res = await fetch(url);
            const d = JSON.parse(res.data);
            if (d.items?.length) {
              allVideos.push(...d.items.map(v => ({
                videoId: v.id.videoId,
                title: v.snippet.title,
                channel: v.snippet.channelTitle,
                publishedAt: v.snippet.publishedAt,
                thumbnail: (v.snippet.thumbnails?.medium || v.snippet.thumbnails?.default || {}).url || '',
              })));
            }
          } catch {}
        }));
      }

      if (allVideos.length) {
        // Sort by recency, get full details for top 8
        allVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        const topIds = allVideos.slice(0, 8).map(v => v.videoId);
        const detailed = await getVideoDetails(topIds, API_KEY);
        if (detailed.length) {
          results.push({ label: 'From Your Subscriptions', region: 'subs', videos: detailed });
        }
      }
      console.log(`  📺 Checked ${shuffled.length} channels, found ${allVideos.length} recent videos`);
    } else {
      console.log('  ⏭ youtube subs: no channels file');
    }
  } catch (e) {
    console.error('  ✗ youtube subs:', e.message);
  }

  // ── 2. Sports trending ──
  try {
    const sportsVideos = await searchYT('soccer football highlights 2026', API_KEY, 3);
    const tennisVideos = await searchYT('tennis highlights ATP 2026', API_KEY, 2);
    const cricketVideos = await searchYT('cricket highlights 2026', API_KEY, 2);
    const seenIds = new Set();
    const sports = [...sportsVideos, ...tennisVideos, ...cricketVideos]
      .filter(v => { if (seenIds.has(v.id)) return false; seenIds.add(v.id); return true; })
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
    if (sports.length) results.push({ label: 'Sports', region: 'sports', videos: sports });
  } catch (e) {
    console.error('  ✗ youtube sports:', e.message);
  }

  // ── 3. AI & H1B ──
  try {
    const aiVideos = await searchYT('artificial intelligence AI news', API_KEY, 4);
    const h1bVideos = await searchYT('H1B visa immigration news 2026', API_KEY, 3);
    const seenAI = new Set();
    const aiH1b = [...aiVideos, ...h1bVideos]
      .filter(v => { if (seenAI.has(v.id)) return false; seenAI.add(v.id); return true; })
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
    if (aiH1b.length) results.push({ label: 'AI & Immigration', region: 'ai-h1b', videos: aiH1b });
  } catch (e) {
    console.error('  ✗ youtube ai/h1b:', e.message);
  }

  if (results.length) writeData('youtube', { categories: results });
}

// ═══════════════ MAIN ═══════════════

async function main() {
  console.log(`[${new Date().toISOString()}] Fetching data...`);
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const tasks = [fetchWeather(), fetchStocks(), fetchNews(), fetchSports()];

  // YouTube: only fetch if --youtube flag or cached data is >12h old
  const ytFile = path.join(DATA_DIR, 'youtube.json');
  const ytForce = process.argv.includes('--youtube');
  let ytStale = true;
  try {
    const stat = fs.statSync(ytFile);
    ytStale = (Date.now() - stat.mtimeMs) > 12 * 3600 * 1000;
  } catch {}
  if (ytForce || ytStale) {
    tasks.push(fetchYouTube());
  } else {
    console.log('  ⏭ youtube: cached (<12h old)');
  }

  await Promise.allSettled(tasks);

  console.log('Done.\n');
}

main();
