/* ═══════════════════════════════════════════════════════════
   Sports Hub V3 — Premium Sports Dashboard
   FotMob × SofaScore × ESPN × F1.com quality
   ═══════════════════════════════════════════════════════════ */

// ─── State ───
let currentSport = localStorage.getItem('sports-tab') || 'football';
const cache = {};
let countdownIntervals = [];
let autoRefreshTimer = null;
let cricketFilter = 'all';

// ─── Constants ───
const F1_TEAM_COLORS = {
    'Red Bull':'#3671C6','Ferrari':'#E8002D','McLaren':'#FF8000',
    'Mercedes':'#27F4D2','Aston Martin':'#229971','Alpine':'#FF87BC',
    'Williams':'#64C4FF','RB':'#6692FF','Kick Sauber':'#52E252',
    'Sauber':'#52E252','Haas':'#B6BABD'
};

const F1_TEAM_LOGOS = {
    'Red Bull':'https://media.formula1.com/content/dam/fom-website/teams/2025/red-bull-racing-logo.png',
    'Ferrari':'https://media.formula1.com/content/dam/fom-website/teams/2025/ferrari-logo.png',
    'McLaren':'https://media.formula1.com/content/dam/fom-website/teams/2025/mclaren-logo.png',
    'Mercedes':'https://media.formula1.com/content/dam/fom-website/teams/2025/mercedes-logo.png',
    'Aston Martin':'https://media.formula1.com/content/dam/fom-website/teams/2025/aston-martin-logo.png',
    'Alpine':'https://media.formula1.com/content/dam/fom-website/teams/2025/alpine-logo.png',
    'Williams':'https://media.formula1.com/content/dam/fom-website/teams/2025/williams-logo.png',
    'RB':'https://media.formula1.com/content/dam/fom-website/teams/2025/rb-logo.png',
    'Kick Sauber':'https://media.formula1.com/content/dam/fom-website/teams/2025/kick-sauber-logo.png',
    'Sauber':'https://media.formula1.com/content/dam/fom-website/teams/2025/kick-sauber-logo.png',
    'Haas':'https://media.formula1.com/content/dam/fom-website/teams/2025/haas-logo.png',
};

function f1Logo(team, size = 20) {
    const url = F1_TEAM_LOGOS[team] || Object.entries(F1_TEAM_LOGOS).find(([k]) => team?.includes(k))?.[1];
    if (!url) return '';
    return `<img class="f1-team-logo" src="${url}" alt="${team}" width="${size}" height="${size}" loading="lazy" onerror="this.style.display='none'" style="object-fit:contain;vertical-align:middle;margin-right:4px;">`;
}

const COUNTRY_FLAGS = {
    'Australia':'🇦🇺','China':'🇨🇳','Japan':'🇯🇵','Bahrain':'🇧🇭',
    'Saudi Arabia':'🇸🇦','USA':'🇺🇸','United States':'🇺🇸',
    'Spain':'🇪🇸','Monaco':'🇲🇨','Canada':'🇨🇦','UK':'🇬🇧',
    'United Kingdom':'🇬🇧','Great Britain':'🇬🇧','Hungary':'🇭🇺',
    'Belgium':'🇧🇪','Netherlands':'🇳🇱','Italy':'🇮🇹','Azerbaijan':'🇦🇿',
    'Singapore':'🇸🇬','Mexico':'🇲🇽','Brazil':'🇧🇷','Qatar':'🇶🇦',
    'Abu Dhabi':'🇦🇪','UAE':'🇦🇪','Austria':'🇦🇹',
    'France':'🇫🇷','Portugal':'🇵🇹','Las Vegas':'🇺🇸','Miami':'🇺🇸',
};

const PLAYER_FLAGS = {
    'Carlos Alcaraz':'🇪🇸','Jannik Sinner':'🇮🇹','Alexander Zverev':'🇩🇪',
    'Novak Djokovic':'🇷🇸','Daniil Medvedev':'🇷🇺','Andrey Rublev':'🇷🇺',
    'Casper Ruud':'🇳🇴','Holger Rune':'🇩🇰','Hubert Hurkacz':'🇵🇱',
    'Alex de Minaur':'🇦🇺','Taylor Fritz':'🇺🇸','Stefanos Tsitsipas':'🇬🇷',
    'Tommy Paul':'🇺🇸','Ben Shelton':'🇺🇸','Frances Tiafoe':'🇺🇸',
};

const SPOTLIGHT_PLAYERS = ['Alcaraz', 'Sinner', 'Zverev'];

const GRAND_SLAMS = [
    { name:'Australian Open', start:'2026-01-19', end:'2026-02-01', color1:'#0091D2', color2:'#005A8C', venue:'Melbourne Park', country:'🇦🇺', surface:'Hard', cssClass:'hero-tennis-ao' },
    { name:'Roland Garros', start:'2026-05-25', end:'2026-06-08', color1:'#C84B31', color2:'#8B3121', venue:'Stade Roland Garros', country:'🇫🇷', surface:'Clay', cssClass:'hero-tennis-rg' },
    { name:'Wimbledon', start:'2026-06-29', end:'2026-07-12', color1:'#006633', color2:'#004422', venue:'All England Club', country:'🇬🇧', surface:'Grass', cssClass:'hero-tennis-wim' },
    { name:'US Open', start:'2026-08-31', end:'2026-09-13', color1:'#1E3A5F', color2:'#0D1F2F', venue:'Flushing Meadows', country:'🇺🇸', surface:'Hard', cssClass:'hero-tennis-uso' },
];

const SLAM_WINNERS = {
    'Australian Open': { '2026': 'Carlos Alcaraz', '2025': 'Jannik Sinner' },
    'Roland Garros': { '2025': 'Carlos Alcaraz' },
    'Wimbledon': { '2025': 'Carlos Alcaraz' },
    'US Open': { '2025': 'Jannik Sinner' },
};

const SURFACE_COLORS = { 'Clay': '#C84B31', 'Hard': '#0091D2', 'Grass': '#006633' };

const CRICKET_FLAGS = {
    'India': '🇮🇳', 'Australia': '🇦🇺', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'New Zealand': '🇳🇿',
    'South Africa': '🇿🇦', 'Pakistan': '🇵🇰', 'Sri Lanka': '🇱🇰', 'West Indies': '🌴',
    'Bangladesh': '🇧🇩', 'Afghanistan': '🇦🇫', 'Ireland': '🇮🇪', 'Zimbabwe': '🇿🇼',
    'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Netherlands': '🇳🇱', 'Nepal': '🇳🇵', 'Oman': '🇴🇲',
    'Namibia': '🇳🇦', 'USA': '🇺🇸', 'UAE': '🇦🇪', 'Canada': '🇨🇦',
};

function cricketFlag(teamName) {
    const clean = stripCode(teamName);
    return CRICKET_FLAGS[clean] || '🏏';
}

const SPORTS = [
    { id:'football', icon:'⚽', label:'Football' },
    { id:'f1', icon:'🏎️', label:'F1' },
    { id:'cricket', icon:'🏏', label:'Cricket' },
    { id:'tennis', icon:'🎾', label:'Tennis' },
];

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    const shell = renderAppShell('Sports', 'sports');
    document.getElementById('appShell').innerHTML = shell.sidebar + `
        <main class="main-content">
            ${shell.topbar}
            <div class="page-content">
                <div class="sport-tabs-row">
                    <div class="sport-tabs" id="sportTabs"></div>
                    <button class="sound-toggle" id="soundToggle" onclick="this.textContent = sportsSounds.toggle() ? '🔊' : '🔇'" title="Toggle sound effects">🔊</button>
                </div>
                <div class="sports-bg-pattern"></div>
                <div class="sports-content" id="sportsContent"></div>
            </div>
            ${shell.bottomNav}
        </main>`;
    initAppShell('sports');
    renderTabBar();
    // Init sound toggle state
    const stBtn = document.getElementById('soundToggle');
    if (stBtn && typeof sportsSounds !== 'undefined') stBtn.textContent = sportsSounds.enabled ? '🔊' : '🔇';
    switchTab(currentSport);
});

// ─── Tab Bar ───
function renderTabBar() {
    const el = document.getElementById('sportTabs');
    el.innerHTML = SPORTS.map(s =>
        `<button class="sport-tab${s.id === currentSport ? ' active' : ''}" data-sport="${s.id}">
            <span class="tab-icon">${s.icon}</span>${s.label}
        </button>`
    ).join('');
    el.addEventListener('click', e => {
        const t = e.target.closest('.sport-tab');
        if (t && t.dataset.sport !== currentSport) switchTab(t.dataset.sport);
    });
}

function switchTab(sport) {
    currentSport = sport;
    localStorage.setItem('sports-tab', sport);
    document.body.setAttribute('data-sport', sport);
    document.querySelectorAll('.sport-tab').forEach(t => t.classList.toggle('active', t.dataset.sport === sport));
    countdownIntervals.forEach(id => clearInterval(id));
    countdownIntervals = [];
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    ({ football: renderFootball, cricket: renderCricket, tennis: renderTennis, f1: renderF1 })[sport]();
}

// ─── Helpers ───
function showSkeletons() {
    const skels = {
        football: `<div class="skel-hero"></div>
            <div class="skel-section-title"></div>
            <div class="skel-match"></div><div class="skel-match"></div><div class="skel-match"></div>
            <div class="skel-section-title"></div>
            <div class="skel-table"></div>
            <div class="skel-section-title"></div>
            <div class="skel-news-row"><div class="skel-news-img"></div><div class="skel-news-lines"></div></div>
            <div class="skel-news-row"><div class="skel-news-img"></div><div class="skel-news-lines"></div></div>`,
        cricket: `<div class="skel-hero"></div>
            <div class="skel-filter-bar"></div>
            <div class="skel-section-title"></div>
            <div class="skel-match"></div><div class="skel-match"></div><div class="skel-match"></div>
            <div class="skel-news-row"><div class="skel-news-img"></div><div class="skel-news-lines"></div></div>`,
        tennis: `<div class="skel-hero" style="height:220px"></div>
            <div class="skel-section-title"></div>
            <div class="skel-ranking"></div><div class="skel-ranking"></div><div class="skel-ranking"></div><div class="skel-ranking"></div>
            <div class="skel-section-title"></div>
            <div class="skel-h2h-row"></div><div class="skel-h2h-row"></div>`,
        f1: `<div class="skel-hero"></div>
            <div class="skel-section-title"></div>
            <div class="skel-card" style="height:100px"></div><div class="skel-card" style="height:100px"></div>
            <div class="skel-section-title"></div>
            <div class="skel-standing"></div><div class="skel-standing"></div><div class="skel-standing"></div>`,
    };
    document.getElementById('sportsContent').innerHTML = skels[currentSport] || skels.football;
}

function showError(msg) {
    document.getElementById('sportsContent').innerHTML = `
        <div class="sport-error">
            <div class="err-icon">😵</div>
            <p>${msg || 'Something went wrong.'}</p>
            <button class="btn btn-primary" onclick="switchTab('${currentSport}')">Retry</button>
        </div>`;
}

async function fetchCached(key, fetcher) {
    if (cache[key] && Date.now() - cache[key].ts < 120000) return cache[key].data;
    const data = await fetcher();
    cache[key] = { data, ts: Date.now() };
    return data;
}

function allCached(...keys) {
    return keys.every(k => cache[k] && Date.now() - cache[k].ts < 120000);
}

function bustCache(...keys) {
    keys.forEach(k => delete cache[k]);
}

function forceRefresh() {
    Object.keys(cache).forEach(k => delete cache[k]);
    switchTab(currentSport);
}

function safeGet(path) { return API.get(path).catch(() => null); }

let lastUpdatedTs = 0;
function updateFooter() {
    lastUpdatedTs = Date.now();
    const el = document.getElementById('sportsContent');
    if (!el) return;
    el.insertAdjacentHTML('beforeend', `
        <div class="sports-footer" id="sportsFooter">
            <span class="footer-time" id="footerTime">Updated just now</span>
            <button class="footer-refresh" onclick="forceRefresh()">↻ Refresh</button>
        </div>`);
    // Update relative time every 30s
    if (window._footerInterval) clearInterval(window._footerInterval);
    window._footerInterval = setInterval(() => {
        const el = document.getElementById('footerTime');
        if (!el) return;
        const sec = Math.floor((Date.now() - lastUpdatedTs) / 1000);
        if (sec < 60) el.textContent = 'Updated just now';
        else if (sec < 3600) el.textContent = `Updated ${Math.floor(sec/60)} min ago`;
        else el.textContent = `Updated ${Math.floor(sec/3600)}h ago`;
    }, 30000);
}

function crest(url, size = 32) {
    if (!url) return '';
    const cls = `crest crest-${size}`;
    return `<img class="${cls}" src="${url}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.style.display='none'">`;
}

function short(name) {
    if (!name) return '?';
    return name.replace(/ FC$| CF$/, '').replace(/^FC /, '');
}

function stripCode(name) {
    if (!name) return '?';
    return name.replace(/\s*\[.*?\]\s*$/, '').trim();
}

function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function fmtShort(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function flipClock(d, h, m, s) {
    return [{ v:d, l:'days' },{ v:h, l:'hrs' },{ v:m, l:'min' },{ v:s, l:'sec' }]
        .map(u => `<div class="flip-unit"><div class="flip-val">${String(u.v).padStart(2,'0')}</div><div class="flip-lbl">${u.l}</div></div>`)
        .join('');
}

function startCountdown(target, el) {
    function tick() {
        const diff = new Date(target) - Date.now();
        if (diff <= 0) { el.innerHTML = '<div class="live-now-text">LIVE NOW</div>'; return; }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        el.innerHTML = flipClock(d, h, m, s);
    }
    tick();
    const id = setInterval(tick, 1000);
    countdownIntervals.push(id);
}

function mtBadge(type) {
    if (!type) return '';
    const t = type.toLowerCase();
    const cls = { t20:'mt-t20', odi:'mt-odi', test:'mt-test', t10:'mt-t10' }[t] || 'mt-default';
    return `<span class="mt-badge ${cls}">${type.toUpperCase()}</span>`;
}

function emptyCard(icon, title, sub) {
    return `<div class="empty-card"><div class="ec-icon">${icon}</div><div class="ec-title">${title}</div><div class="ec-sub">${sub}</div></div>`;
}

// ─── News + Summary Helpers ───
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const SPORT_PLACEHOLDERS = {
  football: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="12" fill="#1a472a"/><circle cx="40" cy="40" r="22" fill="none" stroke="#fff" stroke-width="2" opacity="0.3"/><polygon points="40,22 47,32 44,42 36,42 33,32" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.4"/><text x="40" y="46" text-anchor="middle" font-size="28">⚽</text></svg>`,
  cricket: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="12" fill="#2d1810"/><text x="40" y="48" text-anchor="middle" font-size="32">🏏</text></svg>`,
  tennis: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="12" fill="#1a3a1a"/><text x="40" y="48" text-anchor="middle" font-size="32">🎾</text></svg>`,
  f1: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="12" fill="#1a1a2e"/><text x="40" y="48" text-anchor="middle" font-size="32">🏎️</text></svg>`,
};

function newsPlaceholder(sport) {
  const svg = SPORT_PLACEHOLDERS[sport || currentSport] || SPORT_PLACEHOLDERS.football;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function renderNews(articles) {
  if (!articles || !articles.length) return '';
  return `
    <div class="news-section">
      <div class="news-header">📰 Latest News</div>
      ${articles.slice(0, 6).map((a, i) => {
        const img = a.image || newsPlaceholder();
        return `
        <div class="news-card has-img" style="--i:${i}">
          <div class="news-img"><img src="${img}" alt="" loading="lazy" onerror="this.src='${newsPlaceholder()}'"></div>
          <div class="news-body">
            <div class="news-title"><a href="${a.link}" target="_blank" rel="noopener">${a.title}</a></div>
            ${a.description ? `<div class="news-desc">${a.description}</div>` : ''}
            <div class="news-meta">${a.author ? a.author + ' · ' : ''}${timeAgo(a.pubDate)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderSummary(summary) {
  if (!summary || !summary.text) return '';
  return `
    <div class="ai-summary">
      <div class="ai-summary-label">✨ Summary</div>
      <div class="ai-summary-text">${summary.text}</div>
    </div>`;
}

// ─── FOOTBALL ───
async function renderFootball() {
    if (!allCached('fb-mu','fb-rm','fb-pl','fb-pd','football-news','football-summary')) showSkeletons();
    try {
        const [muData, rmData, plStandings, pdStandings, fbNews, fbSummary] = await Promise.all([
            fetchCached('fb-mu', () => safeGet('/sports/football/matches/66')),
            fetchCached('fb-rm', () => safeGet('/sports/football/matches/86')),
            fetchCached('fb-pl', () => safeGet('/sports/football/standings/PL')),
            fetchCached('fb-pd', () => safeGet('/sports/football/standings/PD')),
            fetchCached('football-news', () => safeGet('/sports/news/football')),
            fetchCached('football-summary', () => safeGet('/sports/summary/football')),
        ]);
        console.log('[FB Debug]', {muData:!!muData, rmData:!!rmData, plStandings:!!plStandings, muRecent:muData?.data?.recent?.length, rmRecent:rmData?.data?.recent?.length});

        const muRecent = muData?.data?.recent || [];
        const muUpcoming = muData?.data?.upcoming || [];
        const rmRecent = rmData?.data?.recent || [];
        const rmUpcoming = rmData?.data?.upcoming || [];
        const allUpcoming = [...muUpcoming, ...rmUpcoming].sort((a, b) => new Date(a.date) - new Date(b.date));
        const allRecent = [...muRecent, ...rmRecent].sort((a, b) => new Date(b.date) - new Date(a.date));
        const plTable = plStandings?.data || [];
        const pdTable = pdStandings?.data || [];

        let html = '';

        // HERO: Next match or latest result
        const nextMatch = allUpcoming[0];
        const liveMatch = [...muRecent, ...rmRecent, ...muUpcoming, ...rmUpcoming].find(m => m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'LIVE');

        if (liveMatch) {
            html += heroMatchCard(liveMatch, true, [...plTable, ...pdTable]);
        } else if (nextMatch) {
            const heroClass = getHeroClass(nextMatch);
            const teamKey = (nextMatch.homeTeam?.name || '').includes('Manchester United') || (nextMatch.awayTeam?.name || '').includes('Manchester United')
                ? 'Manchester United' : 'Real Madrid';
            const allStandings = [...plTable, ...pdTable];
            const context = getMatchContext(nextMatch, allStandings, teamKey);
            const isHome = nextMatch.homeTeam?.name?.includes(teamKey);
            const venue = isHome ? (teamKey.includes('Manchester') ? 'Old Trafford' : 'Santiago Bernabéu') : null;

            html += `<div class="hero-card hero-football ${heroClass}">
                <div class="hero-comp-badge">${nextMatch.competition || ''}</div>
                <div class="hero-label">⚽ NEXT MATCH</div>
                <div class="hero-crests">
                    ${crest(nextMatch.homeTeam?.crest, 56)}
                    <span class="hero-vs">VS</span>
                    ${crest(nextMatch.awayTeam?.crest, 56)}
                </div>
                <div class="hero-matchup" style="margin-top:-4px">
                    <div class="hero-side"><div class="hero-tname">${short(nextMatch.homeTeam?.name)}</div></div>
                    <div class="hero-center"></div>
                    <div class="hero-side"><div class="hero-tname">${short(nextMatch.awayTeam?.name)}</div></div>
                </div>
                <div class="countdown" id="fbCountdown"></div>
                ${context ? `<div class="hero-context">${context}</div>` : ''}
                ${venue ? `<div class="hero-venue">📍 ${venue}</div>` : ''}
                <div class="hero-meta">${fmtDate(nextMatch.date)}</div>
            </div>`;
        } else if (allRecent[0]) {
            html += heroMatchCard(allRecent[0], false, [...plTable, ...pdTable]);
        }

        // AI Summary
        html += renderSummary(fbSummary?.data || fbSummary);

        // MY TEAMS
        html += '<div class="sh stagger" style="--i:1"><span class="sh-emoji">👕</span> MY TEAMS</div>';
        html += '<div class="teams-row">';

        const teams = [
            { name:'Man United', key:'Manchester United', recent:muRecent, upcoming:muUpcoming, table:plTable, crestUrl:'https://crests.football-data.org/66.png' },
            { name:'Real Madrid', key:'Real Madrid', recent:rmRecent, upcoming:rmUpcoming, table:pdTable, crestUrl:'https://crests.football-data.org/86.png' },
        ];

        teams.forEach((team, ti) => {
            const pos = team.table.find(t => t.name && t.name.includes(team.key));
            const last5 = team.recent.slice(0, 5);
            const form = last5.map(m => {
                const isHome = m.homeTeam?.name?.includes(team.key);
                const h = m.score?.fullTime?.home ?? 0, a = m.score?.fullTime?.away ?? 0;
                return isHome ? (h > a ? 'W' : h < a ? 'L' : 'D') : (a > h ? 'W' : a < h ? 'L' : 'D');
            });
            const next = team.upcoming[0];

            html += `<div class="team-card stagger" style="--i:${ti + 2}">
                <div class="tc-header">
                    ${crest(team.crestUrl, 40)}
                    <div class="tc-info">
                        <div class="tc-name">${team.name}</div>
                        ${pos ? `<div class="tc-pos"><span class="tc-pos-circle">${pos.position}</span> ${pos.points} pts · ${pos.won}W ${pos.draw}D ${pos.lost}L</div>` : ''}
                    </div>
                </div>
                <div class="form-row">${form.map(f => `<div class="form-pill fp-${f.toLowerCase()}">${f}</div>`).join('') || '<span style="font-size:11px;color:var(--text-tertiary)">No form data</span>'}</div>
                <div class="mini-results">`;

            last5.slice(0, 3).forEach(m => {
                const winner = m.score?.winner;
                const isHome = m.homeTeam?.name?.includes(team.key);
                let rc = 'mr-d';
                let resultLabel = 'D';
                if (winner === 'HOME_TEAM') { rc = isHome ? 'mr-w' : 'mr-l'; resultLabel = isHome ? 'W' : 'L'; }
                else if (winner === 'AWAY_TEAM') { rc = isHome ? 'mr-l' : 'mr-w'; resultLabel = isHome ? 'L' : 'W'; }
                const h = m.score?.fullTime?.home ?? '?';
                const a = m.score?.fullTime?.away ?? '?';
                const opponent = isHome ? m.awayTeam : m.homeTeam;
                const venue = isHome ? 'H' : 'A';
                html += `<div class="mini-row ${rc}">
                    <span class="mr-result">${resultLabel}</span>
                    ${crest(opponent?.crest, 20)}
                    <span class="mr-opponent">${short(opponent?.name)}</span>
                    <span class="mini-score">${h}–${a}</span>
                    <span class="mr-venue">${venue}</span>
                    <span class="mr-date">${fmtShort(m.date)}</span>
                </div>`;
            });

            html += '</div>';
            if (next) {
                html += `<div class="next-fix">
                    <span class="nf-label">NEXT</span>
                    ${crest(next.homeTeam?.crest, 18)} ${crest(next.awayTeam?.crest, 18)}
                    <span class="nf-text">${short(next.homeTeam?.name)} vs ${short(next.awayTeam?.name)}</span>
                    <span class="nf-date">${fmtShort(next.date)}</span>
                </div>`;
            }
            html += '</div>';
        });
        html += '</div>';

        // RECENT RESULTS
        if (allRecent.length) {
            html += '<div class="sh stagger" style="--i:4"><span class="sh-emoji">📊</span> RECENT RESULTS</div>';
            allRecent.slice(0, 6).forEach((m, i) => {
                const w = m.score?.winner;
                let cls = 'mr-draw';
                if (w === 'HOME_TEAM') cls = 'mr-win';
                else if (w === 'AWAY_TEAM') cls = 'mr-win';
                html += `<div class="match-row ${cls} stagger" style="--i:${i + 5}">
                    <span class="mr-comp">${(m.competition || '').substring(0, 3).toUpperCase()}</span>
                    <div class="mr-teams">
                        ${crest(m.homeTeam?.crest, 24)}
                        <span class="mr-tname">${short(m.homeTeam?.name)}</span>
                        <span class="mr-score">${m.score?.fullTime?.home ?? '?'} – ${m.score?.fullTime?.away ?? '?'}</span>
                        <span class="mr-tname right">${short(m.awayTeam?.name)}</span>
                        ${crest(m.awayTeam?.crest, 24)}
                    </div>
                    <span class="mr-time">${fmtShort(m.date)}</span>
                </div>`;
            });
        }

        // UPCOMING FIXTURES
        if (allUpcoming.length) {
            html += '<div class="sh stagger" style="--i:8"><span class="sh-emoji">📅</span> UPCOMING FIXTURES</div>';
            html += '<div class="fix-scroll">';
            allUpcoming.forEach((m, i) => {
                html += `<div class="fix-card stagger" style="--i:${i + 9}">
                    <div class="fix-comp">${m.competition || ''}</div>
                    <div class="fix-teams">
                        <div class="fix-team">${crest(m.homeTeam?.crest, 28)}<span>${short(m.homeTeam?.name)}</span></div>
                        <span class="fix-vs">vs</span>
                        <div class="fix-team">${crest(m.awayTeam?.crest, 28)}<span>${short(m.awayTeam?.name)}</span></div>
                    </div>
                    <div class="fix-date">${fmtDate(m.date)}</div>
                </div>`;
            });
            html += '</div>';
        }

        // LEAGUE TABLES
        html += renderLeagueTable('Premier League', plTable, 'Manchester United');
        html += renderLeagueTable('La Liga', pdTable, 'Real Madrid');

        // TITLE RACE
        html += renderTitleRace('🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', plTable);
        html += renderTitleRace('🇪🇸 La Liga', pdTable);

        // NEWS
        html += renderNews(fbNews?.data || fbNews);

        document.getElementById('sportsContent').innerHTML = html;
        updateFooter();
        if (nextMatch && !liveMatch) {
            const el = document.getElementById('fbCountdown');
            if (el) startCountdown(nextMatch.date, el);
        }
    } catch (e) {
        console.error('Football error:', e);
        showError(`Failed to load football data: ${e.message}`);
    }
}

function renderLeagueTable(title, data, highlightTeam) {
    const top6 = (data || []).slice(0, 6);
    if (!top6.length) return '';
    let html = `<div class="sport-section"><div class="sport-section-title">📊 ${title}</div>`;
    html += '<table class="league-table"><thead><tr><th class="lt-pos">#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th class="lt-pts">Pts</th></tr></thead><tbody>';
    top6.forEach(t => {
        const isHL = highlightTeam && t.name.includes(highlightTeam);
        const posClass = t.position <= 4 ? 'lt-pos-cl' : t.position <= 6 ? 'lt-pos-el' : '';
        const gdSign = t.goalDifference > 0 ? '+' : '';
        const gdClass = t.goalDifference > 0 ? 'lt-gd-pos' : t.goalDifference < 0 ? 'lt-gd-neg' : '';
        html += `<tr class="${isHL ? 'lt-highlight' : ''}">
            <td class="lt-pos ${posClass}">${t.position}</td>
            <td><div class="lt-team">${crest(t.crest, 20)} ${short(t.name)}</div></td>
            <td>${t.playedGames}</td><td>${t.won}</td><td>${t.draw}</td><td>${t.lost}</td>
            <td class="${gdClass}">${gdSign}${t.goalDifference}</td>
            <td class="lt-pts">${t.points}</td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    return html;
}

function getHeroClass(m) {
    const home = m.homeTeam?.name || '';
    const away = m.awayTeam?.name || '';
    if (home.includes('Manchester United') || away.includes('Manchester United')) return 'hero-mu';
    if (home.includes('Real Madrid') || away.includes('Real Madrid')) return 'hero-rm';
    return '';
}

function getMatchContext(match, standings, teamKey) {
    if (!match || !standings || !teamKey) return '';
    const teamPos = standings.find(t => t.name && t.name.includes(teamKey));
    const isHome = match.homeTeam?.name?.includes(teamKey);
    const opponent = isHome ? match.awayTeam?.name : match.homeTeam?.name;
    const opponentPos = standings.find(t => t.name && opponent && t.name.includes(short(opponent)));
    const venue = isHome ? (teamKey.includes('Manchester') ? 'Old Trafford' : 'Santiago Bernabéu') : null;
    const pos = teamPos?.position;

    if (opponentPos && opponentPos.position <= 3) return `Big test against title challengers ${short(opponent)}`;
    if (pos && pos <= 4) return 'Defending their Champions League spot';
    if (pos && pos >= 5 && pos <= 7) return `A win could push ${teamKey.includes('Manchester') ? 'United' : 'Madrid'} into the top 4`;
    if (isHome && venue) {
        const hour = new Date(match.date).getHours();
        return hour >= 17 ? `Under the lights at ${venue}` : `Home advantage at ${venue}`;
    }
    const matchday = match.matchday || '';
    const comp = match.competition || 'the league';
    return matchday ? `Matchday ${matchday} of ${comp}` : '';
}

function getResultContext(m, teamKey) {
    const isHome = m.homeTeam?.name?.includes(teamKey);
    const h = m.score?.fullTime?.home ?? 0, a = m.score?.fullTime?.away ?? 0;
    const won = isHome ? h > a : a > h;
    const lost = isHome ? h < a : a < h;
    const teamShort = teamKey.includes('Manchester') ? 'Man Utd' : 'Real Madrid';
    const opponent = short(isHome ? m.awayTeam?.name : m.homeTeam?.name);
    const venue = isHome ? 'home' : 'away';

    if (won) return `${teamShort} ${venue === 'away' ? 'claim a gritty away win' : 'secure the three points'} against ${opponent}`;
    if (lost) return `${teamShort} fall to ${opponent} ${venue === 'away' ? 'on the road' : 'at home'}`;
    return `${teamShort} held to a draw by ${opponent}`;
}

function getResultBorderClass(m, teamKey) {
    const isHome = m.homeTeam?.name?.includes(teamKey);
    const h = m.score?.fullTime?.home ?? 0, a = m.score?.fullTime?.away ?? 0;
    const won = isHome ? h > a : a > h;
    const lost = isHome ? h < a : a < h;
    if (won) return 'hero-result-win';
    if (lost) return 'hero-result-loss';
    return 'hero-result-draw';
}

function heroMatchCard(m, isLive, standings) {
    const h = m.score?.fullTime?.home, a = m.score?.fullTime?.away;
    const heroClass = getHeroClass(m);
    const teamKey = (m.homeTeam?.name || '').includes('Manchester United') || (m.awayTeam?.name || '').includes('Manchester United')
        ? 'Manchester United' : 'Real Madrid';
    const resultBorder = !isLive ? getResultBorderClass(m, teamKey) : '';
    const context = !isLive ? getResultContext(m, teamKey) : '';

    return `<div class="hero-card hero-football ${heroClass} ${resultBorder}">
        <div class="hero-comp-badge">${m.competition || ''}</div>
        <div class="hero-label">${isLive ? '<span class="live-dot"></span> LIVE' : '⚽ LATEST RESULT'}</div>
        <div class="hero-crests">
            ${crest(m.homeTeam?.crest, 56)}
            <div class="hero-result-score">${h ?? '?'} – ${a ?? '?'}</div>
            ${crest(m.awayTeam?.crest, 56)}
        </div>
        <div class="hero-matchup" style="margin-top:-4px">
            <div class="hero-side"><div class="hero-tname">${short(m.homeTeam?.name)}</div></div>
            <div class="hero-center"></div>
            <div class="hero-side"><div class="hero-tname">${short(m.awayTeam?.name)}</div></div>
        </div>
        ${context ? `<div class="hero-context">${context}</div>` : ''}
        <div class="hero-meta">${fmtDate(m.date)}</div>
    </div>`;
}

function renderTitleRace(title, table) {
    if (!table || !table.length) return '';
    const top6 = table.slice(0, 6);
    const maxPts = top6[0]?.points || 1;
    let html = `<div class="race-table stagger" style="--i:12">
        <div class="race-table-title">${title}</div>`;
    top6.forEach((t, i) => {
        const pct = Math.round((t.points / maxPts) * 100);
        const isTop4 = i < 4;
        html += `<div class="race-row">
            <span class="rr-pos ${isTop4 ? 'top4' : ''}">${t.position || i + 1}</span>
            ${crest(t.crest, 20)}
            <span class="rr-name">${short(t.name)}</span>
            <div class="rr-bar-wrap"><div class="rr-bar"><div class="rr-bar-fill" style="--bar-w:${pct}%;--i:${i};background:var(--sport-primary)"></div></div></div>
            <span class="rr-stats">${t.won}W ${t.draw}D ${t.lost}L · ${t.goalDifference > 0 ? '+' : ''}${t.goalDifference}</span>
            <span class="rr-pts">${t.points}</span>
        </div>`;
    });
    return html + '</div>';
}

// ─── CRICKET ───
const CRICKET_FOCUS_TEAMS = ['IND', 'AUS', 'NZ', 'SA', 'ENG'];

let cricketRankingsFormat = 'test';

function getMatchTypeGradient(matchType) {
    const t = (matchType || '').toLowerCase();
    if (t.includes('t20')) return 'hero-cricket-t20';
    if (t.includes('test')) return 'hero-cricket-test';
    if (t.includes('odi')) return 'hero-cricket-odi';
    return 'hero-cricket';
}

async function renderCricket() {
    if (!allCached('cr-live','cr-upcoming','cricket-news','cricket-summary','cr-rankings','cr-series')) showSkeletons();
    try {
        const [liveResp, upcomingResp, crNews, crSummary, crRankings, crSeries] = await Promise.all([
            fetchCached('cr-live', () => safeGet('/sports/cricket/live')),
            fetchCached('cr-upcoming', () => safeGet('/sports/cricket/upcoming')),
            fetchCached('cricket-news', () => safeGet('/sports/news/cricket')),
            fetchCached('cricket-summary', () => safeGet('/sports/summary/cricket')),
            fetchCached('cr-rankings', () => safeGet('/sports/cricket/rankings')),
            fetchCached('cr-series', () => safeGet('/sports/cricket/series')),
        ]);

        const allMatches = liveResp?.data || [];
        const upcoming = upcomingResp?.data || [];
        const rankings = crRankings?.data || null;
        const series = crSeries?.data || [];

        // Separate live vs completed
        const liveMatches = Array.isArray(allMatches) ? allMatches.filter(m => m.isLive) : [];
        const completedMatches = Array.isArray(allMatches) ? allMatches.filter(m => m.isCompleted) : [];

        let html = '';

        const isIndiaMatch = (m) => m.teams?.some(t => t.toLowerCase().includes('india'));
        const isWCMatch = (m) => {
            const n = ((m.name || '') + ' ' + (m.series || '')).toLowerCase();
            return n.includes('world cup') || n.includes('wc') || n.includes('icc');
        };

        // ── T20 WORLD CUP BRACKET ──
        const wcCompleted = completedMatches.filter(isWCMatch);
        const wcUpcoming = upcoming.filter(m => {
            const n = ((m.name || '') + ' ' + (m.series || '') + ' ' + (m.status || '')).toLowerCase();
            return n.includes('world cup') || n.includes('wc');
        });
        const hasWC = wcCompleted.length > 0 || wcUpcoming.length > 0;

        if (hasWC) {
            html += `<div class="wc-bracket-card stagger" style="--i:0">
                <div class="wc-bracket-title">🏆 T20 WORLD CUP 2026</div>
                <div class="wc-bracket-matches">`;

            // Show semi-final results
            const semis = wcCompleted.filter(m => {
                const n = (m.name || '').toLowerCase();
                return n.includes('semi') || n.includes('sf');
            });
            semis.forEach(m => {
                const t1 = stripCode(m.teams?.[0]);
                const t2 = stripCode(m.teams?.[1]);
                const status = m.status || '';
                const winnerTeam = [t1, t2].find(t => status.toLowerCase().includes(t.toLowerCase()));
                html += `<div class="wc-bracket-match wc-bracket-done">
                    <span class="wc-bracket-label">SEMI-FINAL</span>
                    <div class="wc-bracket-teams">
                        <span class="wc-bracket-team ${winnerTeam === t1 ? 'wc-winner' : ''}">${cricketFlag(t1)} ${t1}</span>
                        <span class="wc-bracket-score">${m.scores?.[0] || ''}</span>
                    </div>
                    <div class="wc-bracket-teams">
                        <span class="wc-bracket-team ${winnerTeam === t2 ? 'wc-winner' : ''}">${cricketFlag(t2)} ${t2}</span>
                        <span class="wc-bracket-score">${m.scores?.[1] || ''}</span>
                    </div>
                    <div class="wc-bracket-status">${status} ✓</div>
                </div>`;
            });

            // Show final
            const wcFinal = wcUpcoming.find(m => (m.name || '').toLowerCase().includes('final'));
            const wcOtherCompleted = wcCompleted.filter(m => !semis.includes(m));
            wcOtherCompleted.forEach(m => {
                const t1 = stripCode(m.teams?.[0]);
                const t2 = stripCode(m.teams?.[1]);
                html += `<div class="wc-bracket-match wc-bracket-done">
                    <span class="wc-bracket-label">RESULT</span>
                    <div class="wc-bracket-teams">
                        <span class="wc-bracket-team">${cricketFlag(t1)} ${t1}</span>
                        <span class="wc-bracket-score">${m.scores?.[0] || ''}</span>
                    </div>
                    <div class="wc-bracket-teams">
                        <span class="wc-bracket-team">${cricketFlag(t2)} ${t2}</span>
                        <span class="wc-bracket-score">${m.scores?.[1] || ''}</span>
                    </div>
                    <div class="wc-bracket-status">${m.status || ''} ✓</div>
                </div>`;
            });

            if (wcFinal) {
                const ft1 = stripCode(wcFinal.teams?.[0]);
                const ft2 = stripCode(wcFinal.teams?.[1]);
                html += `<div class="wc-bracket-match wc-bracket-final">
                    <span class="wc-bracket-label wc-final-label">🏆 FINAL</span>
                    <div class="wc-bracket-teams">
                        <span class="wc-bracket-team">${cricketFlag(ft1)} ${ft1}</span>
                    </div>
                    <div class="wc-bracket-vs">VS</div>
                    <div class="wc-bracket-teams">
                        <span class="wc-bracket-team">${cricketFlag(ft2)} ${ft2}</span>
                    </div>
                    <div class="wc-bracket-status">${wcFinal.status || ''}</div>
                </div>`;
            }

            html += '</div></div>';
        }

        // ── HERO — India-centric ──
        const indiaLive = liveMatches.find(isIndiaMatch);
        const indiaResult = completedMatches.find(m => isIndiaMatch(m) && m.dateTimeGMT && (Date.now() - new Date(m.dateTimeGMT).getTime()) < 86400000);
        const heroMatch = indiaLive || indiaResult || liveMatches[0] || completedMatches[0] || null;
        const isIndiaHero = heroMatch && isIndiaMatch(heroMatch);

        if (heroMatch) {
            const t1 = stripCode(heroMatch.teams?.[0]);
            const t2 = stripCode(heroMatch.teams?.[1]);
            const s1 = heroMatch.scores?.[0] || '';
            const s2 = heroMatch.scores?.[1] || '';
            const isLive = heroMatch.isLive;
            const isResult = heroMatch.isCompleted;
            const heroGradient = isIndiaHero ? 'hero-cricket-india' : getMatchTypeGradient(heroMatch.matchType);
            const statusText = heroMatch.status || '';
            const isWin = isResult && (statusText.toLowerCase().includes('won') || statusText.toLowerCase().includes('win'));
            const isIndiaWin = isWin && statusText.toLowerCase().includes('india');

            html += `<div class="hero-card ${heroGradient} ${isWin ? 'hero-cricket-win' : ''}">
                <div class="hero-label">
                    ${isLive ? '<span class="live-dot"></span> LIVE' : isResult ? '🏏 RESULT' : '🏏 UPCOMING'}
                    ${mtBadge(heroMatch.matchType)}
                </div>
                <div class="hero-matchup cricket-hero-matchup">
                    <div class="hero-side">
                        <span class="cricket-hero-flag">${cricketFlag(t1)}</span>
                        <div class="hero-tname">${t1}</div>
                        ${s1 ? `<div class="hero-cricket-score">${s1}</div>` : ''}
                    </div>
                    <div class="hero-center"><div class="hero-vs">VS</div></div>
                    <div class="hero-side">
                        <span class="cricket-hero-flag">${cricketFlag(t2)}</span>
                        <div class="hero-tname">${t2}</div>
                        ${s2 ? `<div class="hero-cricket-score">${s2}</div>` : ''}
                    </div>
                </div>
                ${heroMatch.runRate && isLive ? `<div class="cricket-rr">RR: ${heroMatch.runRate}</div>` : ''}
                <div class="cricket-status ${isIndiaWin ? 'cricket-status-win' : ''} ${isWin ? 'cricket-status-celebration' : ''}">${isWin ? statusText + ' 🎉' : statusText}</div>
                ${heroMatch.venue ? `<div class="hero-venue">📍 ${heroMatch.venue}</div>` : ''}
                ${heroMatch.series ? `<div style="font-size:10px;opacity:0.5;text-align:center;position:relative;z-index:1;margin-top:2px">${heroMatch.series}</div>` : ''}
            </div>`;
        } else {
            const nextIndia = upcoming.find(isIndiaMatch);
            if (nextIndia) {
                const nt1 = stripCode(nextIndia.teams?.[0]);
                const nt2 = stripCode(nextIndia.teams?.[1]);
                html += `<div class="hero-card hero-cricket-india">
                    <div class="hero-label">🇮🇳 NEXT INDIA MATCH</div>
                    <div style="text-align:center;position:relative;z-index:1">
                        <div class="cricket-hero-matchup-simple">
                            <span class="cricket-hero-flag">${cricketFlag(nt1)}</span>
                            <span style="font-size:18px;font-weight:800">${nt1} vs ${nt2}</span>
                            <span class="cricket-hero-flag">${cricketFlag(nt2)}</span>
                        </div>
                        <div style="font-size:12px;opacity:0.7">${nextIndia.venue || 'TBA'}</div>
                        <div class="countdown" id="cricketCountdown"></div>
                        <div style="font-size:11px;opacity:0.6;margin-top:4px">${fmtDate(nextIndia.date)}</div>
                    </div>
                </div>`;
            } else {
                html += `<div class="hero-card hero-cricket">
                    <div class="hero-label">🏏 CRICKET</div>
                    <div style="text-align:center;position:relative;z-index:1;padding:16px 0">
                        <div style="font-size:40px;margin-bottom:8px">🏏</div>
                        <div style="font-size:15px;font-weight:700">No Live Matches</div>
                        <div style="font-size:12px;opacity:0.7;margin-top:4px">Check back during match time</div>
                    </div>
                </div>`;
            }
        }

        // AI Summary
        html += renderSummary(crSummary?.data || crSummary);

        // ── LIVE MATCHES ──
        const otherLive = liveMatches.filter(m => m !== heroMatch);
        if (otherLive.length) {
            html += '<div class="sh stagger" style="--i:1"><span class="sh-emoji">🔴</span> LIVE</div>';
            html += '<div class="cricket-match-grid">';
            otherLive.forEach((m, i) => {
                html += renderCricketMatchCard(m, i + 2, false, true);
            });
            html += '</div>';
        }

        // ── RECENT RESULTS ──
        const recentResults = completedMatches.filter(m => m !== heroMatch);
        if (recentResults.length) {
            html += '<div class="sh stagger" style="--i:3"><span class="sh-emoji">📊</span> RECENT RESULTS</div>';
            html += '<div class="cricket-match-grid">';
            recentResults.forEach((m, i) => {
                html += renderCricketResultCard(m, i + 4);
            });
            html += '</div>';
        }

        // ICC RANKINGS
        if (rankings?.teams) {
            html += '<div class="sh stagger" style="--i:6"><span class="sh-emoji">🏆</span> ICC RANKINGS</div>';
            html += renderCricketRankings(rankings);
        }

        // Filter bar
        const allTypes = ['all'];
        const typeSet = new Set();
        [...(Array.isArray(allMatches) ? allMatches : []), ...upcoming].forEach(m => {
            const t = (m.matchType || '').toLowerCase();
            if (t && !typeSet.has(t)) { typeSet.add(t); allTypes.push(t); }
        });
        allTypes.push('india');
        html += '<div class="filter-bar">';
        allTypes.forEach(t => {
            const label = t === 'all' ? 'All' : t === 'india' ? '🇮🇳 India' : t.toUpperCase();
            html += `<button class="fbtn ${cricketFilter === t ? 'active' : ''}" onclick="setCricketFilter('${t}')">${label}</button>`;
        });
        html += '</div>';

        // India matches highlighted
        if (cricketFilter === 'all' || cricketFilter === 'india') {
            const indiaMatches = upcoming.filter(isIndiaMatch);
            if (indiaMatches.length) {
                html += '<div class="sh stagger" style="--i:8"><span class="sh-emoji">🇮🇳</span> INDIA MATCHES</div>';
                html += '<div class="cricket-match-grid">';
                indiaMatches.slice(0, 5).forEach((m, i) => html += renderUpcomingCricketCard(m, i + 9, true));
                html += '</div>';
            }
        }

        // SERIES — grouped
        if (series.length && (cricketFilter === 'all')) {
            const indiaSeries = series.filter(s => (s.name || '').toLowerCase().includes('india'));
            const iccSeries = series.filter(s => {
                const n = (s.name || '').toLowerCase();
                return !n.includes('india') && (n.includes('icc') || n.includes('world cup') || n.includes('champions') || n.includes('asia cup'));
            });
            const otherSeries = series.filter(s => !indiaSeries.includes(s) && !iccSeries.includes(s));

            const renderSeriesGroup = (title, items, idx) => {
                if (!items.length) return '';
                let h = `<div class="sh stagger" style="--i:${idx}"><span class="sh-emoji">${title.includes('India') ? '🇮🇳' : title.includes('ICC') ? '🏆' : '🌏'}</span> ${title}</div>`;
                items.slice(0, 5).forEach((s, i) => {
                    const matchCount = (s.odi || 0) + (s.t20 || 0) + (s.test || 0);
                    h += `<div class="cricket-card ${(s.name||'').toLowerCase().includes('india') ? 'india' : ''} stagger" style="--i:${idx + i + 1}">
                        <div class="cc-header">
                            ${s.test ? mtBadge('test') : ''} ${s.odi ? mtBadge('odi') : ''} ${s.t20 ? mtBadge('t20') : ''}
                        </div>
                        <div class="cc-name">${s.name}</div>
                        <div class="cc-venue">${fmtShort(s.startDate)} – ${fmtShort(s.endDate)}${matchCount ? ` · ${matchCount} matches` : ''}</div>
                    </div>`;
                });
                return h;
            };

            html += renderSeriesGroup('INDIA TOURS', indiaSeries, 12);
            html += renderSeriesGroup('ICC EVENTS', iccSeries, 18);
            html += renderSeriesGroup('OTHER INTERNATIONAL', otherSeries, 24);
        }

        // Upcoming
        if (cricketFilter !== 'india') {
            html += '<div class="sh stagger" style="--i:30"><span class="sh-emoji">📅</span> UPCOMING</div>';
            const filtered = cricketFilter === 'all' || cricketFilter === 'india' ? upcoming :
                upcoming.filter(m => (m.matchType || '').toLowerCase() === cricketFilter);
            if (filtered.length) {
                html += '<div class="cricket-match-grid">';
                filtered.slice(0, 12).forEach((m, i) => html += renderUpcomingCricketCard(m, i + 31, false));
                html += '</div>';
            } else {
                html += emptyCard('🏏', 'No Matches', `No ${cricketFilter.toUpperCase()} matches scheduled`);
            }
        }

        html += renderNews(crNews?.data || crNews);

        document.getElementById('sportsContent').innerHTML = html || emptyCard('🏏', 'No Cricket Data', 'Check back later');

        updateFooter();
        const nextIndia = upcoming.find(isIndiaMatch);
        if (!heroMatch && nextIndia) {
            const el = document.getElementById('cricketCountdown');
            if (el) startCountdown(nextIndia.date, el);
        }

        if (liveMatches.length) {
            autoRefreshTimer = setInterval(() => { cache['cr-live'] = null; renderCricket(); }, 60000);
        }
    } catch (e) {
        console.error('Cricket error:', e);
        showError('Failed to load cricket data.');
    }
}

function setCricketFilter(type) { cricketFilter = type; renderCricket(); }
function setCricketRankingsFormat(fmt) { cricketRankingsFormat = fmt; renderCricket(); }

function renderCricketRankings(rankings) {
    const formats = ['test', 'odi', 't20i'];
    const teams = rankings.teams[cricketRankingsFormat] || [];
    let html = `<div class="rankings-card rankings-compact stagger" style="--i:7">
        <div class="rankings-tabs">
            ${formats.map(f => `<button class="rankings-tab ${cricketRankingsFormat === f ? 'active' : ''}" onclick="setCricketRankingsFormat('${f}')">${f.toUpperCase()}</button>`).join('')}
        </div>
        <div class="rankings-table">`;
    teams.forEach((t, i) => {
        const isFocus = CRICKET_FOCUS_TEAMS.includes(t.code);
        const medalClass = i === 0 ? 'rankings-gold' : i === 1 ? 'rankings-silver' : i === 2 ? 'rankings-bronze' : '';
        const flagEmoji = CRICKET_FLAGS[t.team] || t.flag || '🏏';
        html += `<div class="rankings-row ${isFocus ? 'rankings-focus' : ''} ${medalClass}">
            <span class="rankings-pos ${i < 3 ? 'rankings-top3' : ''}">${t.rank}</span>
            <span class="rankings-flag">${flagEmoji}</span>
            <span class="rankings-team">${t.team}</span>
            <div class="rankings-bar-wrap"><div class="rankings-bar" style="--bar-w:${Math.round((t.rating / (teams[0]?.rating || 1)) * 100)}%;--i:${i}"></div></div>
            <span class="rankings-rating">${t.rating}</span>
        </div>`;
    });
    html += `</div>
        <div class="rankings-updated">Updated: ${rankings.updatedAt || '—'}</div>
    </div>`;
    return html;
}

function renderCricketMatchCard(m, i, highlight, isLive) {
    const t1 = stripCode(m.teams?.[0]);
    const t2 = stripCode(m.teams?.[1]);
    return `<div class="cricket-card ${highlight ? 'india' : ''} stagger" style="--i:${i}">
        <div class="cc-header">
            ${isLive ? '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' : ''}
            ${mtBadge(m.matchType)}
            ${m.series ? `<span class="cc-series">${m.series}</span>` : ''}
        </div>
        <div class="cc-teams">
            <div class="cc-team">
                <span class="cc-flag">${cricketFlag(t1)}</span>
                <span class="cc-tname">${t1}</span>
                <span class="cc-tscore">${m.scores?.[0] || ''}</span>
            </div>
            <div class="cc-team">
                <span class="cc-flag">${cricketFlag(t2)}</span>
                <span class="cc-tname">${t2}</span>
                <span class="cc-tscore">${m.scores?.[1] || ''}</span>
            </div>
        </div>
        ${m.runRate && isLive ? `<div class="cc-rr">RR: ${m.runRate}</div>` : ''}
        ${m.venue ? `<div class="cc-venue-line">📍 ${m.venue}</div>` : ''}
        <div class="cc-status-line">${m.status || ''}</div>
    </div>`;
}

function renderCricketResultCard(m, i) {
    const t1 = stripCode(m.teams?.[0]);
    const t2 = stripCode(m.teams?.[1]);
    const status = m.status || '';
    const winnerTeam = [t1, t2].find(t => status.toLowerCase().includes(t.toLowerCase()));
    const isIndiaWin = winnerTeam && winnerTeam.toLowerCase() === 'india';
    return `<div class="cricket-card cricket-result-card ${isIndiaWin ? 'india-win' : ''} stagger" style="--i:${i}">
        <div class="cc-header">
            <span class="result-badge">RESULT</span>
            ${mtBadge(m.matchType)}
            ${m.series ? `<span class="cc-series">${m.series}</span>` : ''}
        </div>
        <div class="cc-teams">
            <div class="cc-team ${winnerTeam === t1 ? 'cc-team-winner' : ''}">
                <span class="cc-flag">${cricketFlag(t1)}</span>
                <span class="cc-tname">${t1}</span>
                <span class="cc-tscore">${m.scores?.[0] || ''}</span>
            </div>
            <div class="cc-team ${winnerTeam === t2 ? 'cc-team-winner' : ''}">
                <span class="cc-flag">${cricketFlag(t2)}</span>
                <span class="cc-tname">${t2}</span>
                <span class="cc-tscore">${m.scores?.[1] || ''}</span>
            </div>
        </div>
        <div class="cc-result-status">${status}</div>
    </div>`;
}

function renderUpcomingCricketCard(m, i, highlight) {
    const t1 = stripCode(m.teams?.[0] || '?');
    const t2 = stripCode(m.teams?.[1] || '?');
    const isIndia = m.teams?.some(t => t.toLowerCase().includes('india'));
    return `<div class="cricket-card ${highlight || isIndia ? 'india' : ''} stagger" style="--i:${i}">
        <div class="cc-header">
            ${mtBadge(m.matchType)}
            <span class="cc-date">${fmtShort(m.date)}</span>
        </div>
        <div class="cc-upcoming-matchup">
            <span class="cc-flag">${cricketFlag(t1)}</span>
            <span class="cc-upcoming-tname">${t1}</span>
            <span class="cc-upcoming-vs">vs</span>
            <span class="cc-upcoming-tname">${t2}</span>
            <span class="cc-flag">${cricketFlag(t2)}</span>
        </div>
        <div class="cc-venue">📍 ${m.venue || 'TBA'}</div>
    </div>`;
}

// ─── TENNIS ───
// ─── Tennis H2H Data & Renderer ───
const TENNIS_H2H = [
    { p1: 'Carlos Alcaraz', p2: 'Jannik Sinner', w1: 6, w2: 6, last: 'Sinner d. Alcaraz 6-3 6-4 (AO SF 2026)', surface: 'Hard' },
    { p1: 'Carlos Alcaraz', p2: 'Alexander Zverev', w1: 5, w2: 5, last: 'Zverev d. Alcaraz 7-5 6-3 (ATP Finals 2025)', surface: 'Hard' },
    { p1: 'Jannik Sinner', p2: 'Alexander Zverev', w1: 4, w2: 4, last: 'Sinner d. Zverev 6-4 3-6 6-3 (AO QF 2026)', surface: 'Hard' },
    { p1: 'Carlos Alcaraz', p2: 'Novak Djokovic', w1: 5, w2: 4, last: 'Alcaraz d. Djokovic 6-4 6-4 (Wimbledon F 2025)', surface: 'Grass' },
    { p1: 'Jannik Sinner', p2: 'Novak Djokovic', w1: 4, w2: 8, last: 'Djokovic d. Sinner 7-6 6-2 (ATP Finals 2025)', surface: 'Hard' },
];

function renderTennisH2H() {
    let html = '<div class="sh stagger" style="--i:3"><span class="sh-emoji">⚔️</span> HEAD-TO-HEAD</div>';
    html += '<div class="h2h-grid stagger" style="--i:4">';
    TENNIS_H2H.forEach(m => {
        const total = m.w1 + m.w2;
        const pct1 = Math.round((m.w1 / total) * 100);
        const pct2 = 100 - pct1;
        const f1 = PLAYER_FLAGS[m.p1] || '🎾';
        const f2 = PLAYER_FLAGS[m.p2] || '🎾';
        const lastName = n => n.split(' ').pop();
        const surfColor = SURFACE_COLORS[m.surface] || '#888';
        html += `<div class="h2h-card">
            <div class="h2h-players">
                <div class="h2h-p h2h-left">
                    <span class="h2h-flag">${f1}</span>
                    <span class="h2h-name">${lastName(m.p1)}</span>
                    <span class="h2h-wins">${m.w1}</span>
                </div>
                <div class="h2h-vs">VS</div>
                <div class="h2h-p h2h-right">
                    <span class="h2h-wins">${m.w2}</span>
                    <span class="h2h-name">${lastName(m.p2)}</span>
                    <span class="h2h-flag">${f2}</span>
                </div>
            </div>
            <div class="h2h-bar-track">
                <div class="h2h-bar-left" style="--bar-w:${pct1}%">${pct1}%</div>
                <div class="h2h-bar-right" style="--bar-w:${pct2}%">${pct2}%</div>
            </div>
            <div class="h2h-last"><span class="h2h-surface" style="background:${surfColor}">${m.surface}</span>${m.last}</div>
        </div>`;
    });
    html += '</div>';
    return html;
}

async function renderTennis() {
    if (!allCached('tn-rank','tn-scores','tennis-news','tennis-summary')) showSkeletons();
    try {
        const [rankings, scores, tnNews, tnSummary] = await Promise.all([
            fetchCached('tn-rank', () => safeGet('/sports/tennis/rankings')),
            fetchCached('tn-scores', () => safeGet('/sports/tennis/scores')),
            fetchCached('tennis-news', () => safeGet('/sports/news/tennis')),
            fetchCached('tennis-summary', () => safeGet('/sports/summary/tennis')),
        ]);

        const players = rankings?.data || [];
        const tournaments = scores?.data || [];
        const now = new Date();
        let html = '';

        // Grand Slam Hero
        const nextSlam = GRAND_SLAMS.find(gs => new Date(gs.end) > now);
        const lastCompleted = [...GRAND_SLAMS].reverse().find(gs => new Date(gs.end) < now);
        const completedCount = GRAND_SLAMS.filter(gs => new Date(gs.end) < now).length;

        // Check if a slam just ended (within 7 days)
        const justEnded = lastCompleted && (now - new Date(lastCompleted.end)) < 7 * 24 * 60 * 60 * 1000;

        // Helper to get defender/winner
        const getWinner = (gs) => {
            const w = SLAM_WINNERS[gs.name];
            if (!w) return null;
            const yr = new Date(gs.start).getFullYear();
            return w[String(yr)] || w[String(yr - 1)] || Object.values(w)[0];
        };

        if (justEnded && !nextSlam) {
            // Celebration hero for just-ended slam
            const winner = getWinner(lastCompleted);
            html += `<div class="slam-hero ${lastCompleted.cssClass}">
                <div class="slam-name">🏆 ${lastCompleted.name} 🏆</div>
                <div class="slam-venue">${lastCompleted.venue}, ${lastCompleted.country}</div>
                <div class="slam-surface-badge" style="background:${SURFACE_COLORS[lastCompleted.surface] || 'rgba(255,255,255,0.2)'}">${lastCompleted.surface}</div>
                ${winner ? `<div class="slam-champion-line">CHAMPION: ${winner}</div>` : ''}
                <div class="slam-progress">Slam ${completedCount} of 4</div>
            </div>`;
        } else if (nextSlam) {
            const started = new Date(nextSlam.start) <= now;
            const slamIdx = GRAND_SLAMS.indexOf(nextSlam) + 1;
            const defender = getWinner(nextSlam);
            const surfColor = SURFACE_COLORS[nextSlam.surface] || 'rgba(255,255,255,0.2)';
            const daysUntil = Math.ceil((new Date(nextSlam.start) - now) / (1000*60*60*24));
            const pulseClass = !started && daysUntil <= 30 ? ' slam-countdown-pulse' : '';

            html += `<div class="slam-hero ${nextSlam.cssClass}${pulseClass}">
                ${started ? '<div class="slam-live-badge"><span class="slam-live-dot"></span> LIVE NOW</div>' : '<div class="slam-hero-label">🎾 NEXT GRAND SLAM</div>'}
                <div class="slam-name">${nextSlam.name}</div>
                <div class="slam-venue">${nextSlam.venue}, ${nextSlam.country}</div>
                <div class="slam-surface-badge" style="background:${surfColor}">${nextSlam.surface}</div>
                ${!started ? `<div class="slam-flip-countdown" id="tennisFlipCountdown"></div>
                <div class="slam-dates">${fmtShort(nextSlam.start)} – ${fmtShort(nextSlam.end)}</div>` : ''}
                ${defender ? `<div class="slam-defender">🏆 Defending: ${defender}</div>` : ''}
                <div class="slam-progress">Slam ${slamIdx} of 4</div>
            </div>`;
        }

        // AI Summary
        html += renderSummary(tnSummary?.data || tnSummary);

        // Player Spotlight
        if (players.length) {
            html += '<div class="sh stagger" style="--i:1"><span class="sh-emoji">⭐</span> PLAYER SPOTLIGHT</div>';
            html += '<div class="player-grid">';
            SPOTLIGHT_PLAYERS.forEach((name, i) => {
                const p = players.find(a => (a.name || '').includes(name));
                if (!p) return;
                const flag = PLAYER_FLAGS[p.name] || Object.entries(PLAYER_FLAGS).find(([k]) => k.includes(name))?.[1] || '🎾';
                html += `<div class="p-card highlight stagger" style="--i:${i + 2}">
                    <div class="p-flag">${flag}</div>
                    <div class="p-rank">#${p.rank}</div>
                    <div class="p-name">${p.name}</div>
                    <div class="p-pts">${(p.points || 0).toLocaleString()} pts</div>
                </div>`;
            });
            html += '</div>';

            // Head-to-Head Records
            html += renderTennisH2H();

            // ATP Top 10
            html += '<div class="sh stagger" style="--i:5"><span class="sh-emoji">🏆</span> ATP TOP 10</div>';
            html += '<div class="race-table stagger" style="--i:6"><div class="lb-table">';
            const maxPts = players[0]?.points || 1;
            players.slice(0, 10).forEach((p, i) => {
                const flag = PLAYER_FLAGS[p.name] || '🎾';
                const pct = Math.round((p.points / maxPts) * 100);
                const mv = p.movement || 0;
                const isHL = SPOTLIGHT_PLAYERS.some(s => (p.name || '').includes(s));
                let arrow = '<span class="lb-move lb-same">–</span>';
                if (mv > 0) arrow = `<span class="lb-move lb-up">▲${mv}</span>`;
                else if (mv < 0) arrow = `<span class="lb-move lb-down">▼${Math.abs(mv)}</span>`;

                html += `<div class="lb-row ${isHL ? 'lb-hl' : ''}">
                    <span class="lb-rank ${i < 3 ? 'lb-top3' : ''}">${p.rank}</span>
                    <span class="lb-flag">${flag}</span>
                    <div class="lb-info">
                        <span class="lb-name">${p.name}</span>
                        <div class="lb-bar"><div class="lb-bar-fill" style="--bar-w:${pct}%"></div></div>
                    </div>
                    <span class="lb-pts">${(p.points || 0).toLocaleString()}</span>
                    ${arrow}
                </div>`;
            });
            html += '</div></div>';
        }

        // Recent Tournaments
        if (tournaments.length) {
            html += '<div class="sh stagger" style="--i:8"><span class="sh-emoji">🏆</span> RECENT TOURNAMENTS</div>';
            tournaments.slice(0, 6).forEach((t, i) => {
                html += `<div class="tourney-card stagger" style="--i:${i + 9}">
                    <span class="tc-tname">${t.name}</span>
                    <div class="tc-meta">
                        <span class="tc-status">${t.status || ''}</span>
                        <span class="tc-date">${fmtShort(t.date)}</span>
                    </div>
                </div>`;
            });
        }

        // Grand Slam Calendar Grid
        html += '<div class="sh stagger" style="--i:14"><span class="sh-emoji">🎾</span> 2026 GRAND SLAM CALENDAR</div>';
        html += '<div class="slam-calendar stagger" style="--i:15">';
        GRAND_SLAMS.forEach((gs, i) => {
            const started = new Date(gs.start) <= now;
            const ended = new Date(gs.end) < now;
            const active = started && !ended;
            const isNext = !started && !ended && gs === nextSlam;
            const winner = getWinner(gs);
            const cardClass = (active || isNext) ? ' current' : '';
            html += `<div class="slam-mini-card${cardClass}" style="background:linear-gradient(135deg, ${gs.color2}, ${gs.color1})${ended ? ';opacity:0.7' : ''}">
                <div class="slam-mini-name">${gs.country} ${gs.name}</div>
                <div class="slam-mini-dates">${fmtShort(gs.start)} – ${fmtShort(gs.end)}</div>
                <div class="slam-mini-surface">${gs.surface}</div>
                ${ended && winner ? `<div class="slam-mini-winner">✓ ${winner}</div>` : ''}
                ${active ? '<div class="slam-mini-winner">🔴 LIVE</div>' : ''}
            </div>`;
        });
        html += '</div>';

        // NEWS
        html += renderNews(tnNews?.data || tnNews);

        document.getElementById('sportsContent').innerHTML = html;

        updateFooter();
        if (nextSlam && new Date(nextSlam.start) > now) {
            const flipEl = document.getElementById('tennisFlipCountdown');
            if (flipEl) {
                const updateFlip = () => {
                    const diff = new Date(nextSlam.start) - new Date();
                    if (diff <= 0) { flipEl.innerHTML = '<span class="slam-flip-label">STARTING NOW</span>'; return; }
                    const d = Math.floor(diff / 86400000);
                    const h = Math.floor((diff % 86400000) / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    flipEl.innerHTML = `<div class="slam-flip-unit"><span class="slam-flip-num">${d}</span><span class="slam-flip-label">DAYS</span></div>
                        <div class="slam-flip-sep">:</div>
                        <div class="slam-flip-unit"><span class="slam-flip-num">${String(h).padStart(2,'0')}</span><span class="slam-flip-label">HRS</span></div>
                        <div class="slam-flip-sep">:</div>
                        <div class="slam-flip-unit"><span class="slam-flip-num">${String(m).padStart(2,'0')}</span><span class="slam-flip-label">MIN</span></div>`;
                };
                updateFlip();
                setInterval(updateFlip, 60000);
            }
            const el = document.getElementById('tennisCountdown');
            if (el) startCountdown(nextSlam.start, el);
        }
    } catch (e) {
        console.error('Tennis error:', e);
        showError('Failed to load tennis data.');
    }
}

// ─── F1 ───
async function renderF1() {
    if (!allCached('f1-drv','f1-con','f1-cal','f1-news','f1-summary','f1-recap')) showSkeletons();
    try {
        const [drivers, constructors, calendar, f1News, f1Summary, f1Recap] = await Promise.all([
            fetchCached('f1-drv', () => safeGet('/sports/f1/standings/drivers')),
            fetchCached('f1-con', () => safeGet('/sports/f1/standings/constructors')),
            fetchCached('f1-cal', () => safeGet('/sports/f1/calendar')),
            fetchCached('f1-news', () => safeGet('/sports/news/f1')),
            fetchCached('f1-summary', () => safeGet('/sports/summary/f1')),
            fetchCached('f1-recap', () => safeGet('/sports/f1/recap/2025')),
        ]);

        const races = (calendar?.data || []).sort((a, b) => new Date(a.date) - new Date(b.date));
        const driverList = drivers?.data || [];
        const consList = constructors?.data || [];
        const now = new Date();
        const nextRace = races.find(r => new Date(r.date) > now);
        let html = '';

        // HERO: Next session countdown
        const nextSess = f1NextSession(races, now);
        if (nextRace && nextSess) {
            const flag = COUNTRY_FLAGS[nextSess.race.country] || '🏁';
            const sessDateTime = nextSess.session.date + 'T' + nextSess.session.time;
            const isPreseason = !driverList.length;
            const sessLabel = nextSess.session.label === 'Race' ? 'Lights out' : nextSess.session.label;
            html += `<div class="hero-card hero-f1">
                <div class="hero-label">🏎️ ${isPreseason ? 'F1 2026 — NEW ERA' : 'NEXT UP'}</div>
                ${isPreseason ? '<div class="f1-hero-title">A NEW ERA BEGINS</div>' : ''}
                <div class="f1-hero-flag">${flag}</div>
                <div class="f1-hero-race">${nextSess.race.name}</div>
                <div class="f1-hero-circuit">${nextSess.race.circuit || ''}</div>
                <div class="countdown" id="f1Countdown"></div>
                <div class="hero-meta">${sessLabel}: ${fmtDate(sessDateTime)}</div>
            </div>`;
        }

        // AI Summary
        html += renderSummary(f1Summary?.data || f1Summary);

        // 2026 STANDINGS (current season)
        if (driverList.length) {
            html += '<div class="standings-card stagger" style="--i:2"><div class="standings-title">🏆 Driver Standings</div>';
            driverList.slice(0, 10).forEach((d, i) => {
                const name = d.driver?.name || d.name || '?';
                const team = d.constructor || d.team || '';
                const color = findTeamColor(team);
                html += `<div class="st-row">
                    <span class="st-pos">${d.position || i + 1}</span>
                    <div class="st-color" style="background:${color}"></div>
                    <div class="st-info"><div class="st-dname">${name}</div><div class="st-team">${f1Logo(team, 14)}${team}</div></div>
                    <span class="st-pts">${d.points || 0}</span>
                </div>`;
            });
            html += '</div>';
        }

        if (consList.length) {
            const maxPtsTop = parseFloat(consList[0]?.points) || 1;
            html += '<div class="standings-card stagger" style="--i:3"><div class="standings-title">🏗️ Constructor Standings</div>';
            consList.forEach((c, i) => {
                const name = c.constructor?.name || c.name || '?';
                const pts = c.points || 0;
                const pct = Math.round((pts / maxPtsTop) * 100);
                const color = findTeamColor(name);
                html += `<div class="st-row">
                    <span class="st-pos">${c.position || i + 1}</span>
                    <div class="st-color" style="background:${color}"></div>
                    <div class="st-info" style="flex:1"><div class="st-dname">${f1Logo(name, 18)}${name}</div></div>
                    <div style="flex:2"><div class="rr-bar"><div class="rr-bar-fill" style="--bar-w:${pct}%;--i:${i};background:${color}"></div></div></div>
                    <span class="st-pts">${pts}</span>
                </div>`;
            });
            html += '</div>';
        }

        if (!driverList.length && !consList.length && races.length) {
            html += `<div class="info-card stagger" style="--i:4">
                <div class="info-card-title">⏳ Season Starts ${fmtShort(races[0]?.date)}</div>
                <div class="info-card-body">Driver and constructor standings will appear once the 2026 season begins with the ${races[0]?.name || 'first race'}.</div>
            </div>`;
        }

        // RACE CALENDAR
        if (races.length) {
            html += '<div class="sh stagger" style="--i:5"><span class="sh-emoji">📅</span> RACE CALENDAR</div>';
            html += renderF1Calendar(races, now);
        }

        // 2025 SEASON RECAP
        const recapData = f1Recap?.data || f1Recap;
        if (recapData?.finalStandings) {
            const fs = recapData.finalStandings;
            const maxConsPts = fs.constructors[0]?.pts || 1;
            html += `<div class="recap-section stagger" style="--i:1">
                <div class="sh"><span class="sh-emoji">🏆</span> 2025 SEASON RECAP</div>
                <div class="recap-headline">${fs.headline}</div>
                <div class="sh" style="margin-top:16px"><span class="sh-emoji">🏁</span> DRIVERS CHAMPIONSHIP</div>
                ${fs.drivers.map(d => {
                    const color = findTeamColor(d.team);
                    return `<div class="recap-driver-row">
                        <span class="recap-pos${d.pos === 1 ? ' champion' : ''}">${d.pos}</span>
                        <div class="recap-team-dot" style="background:${color}"></div>
                        <div class="recap-driver-name">${d.name.split(' ').map((n,i) => i===0 ? n[0]+'.' : n).join(' ')}${d.pos === 1 ? ' 🏆' : ''}</div>
                        <div class="recap-driver-team">${f1Logo(d.team, 16)}${d.team}</div>
                        <span class="recap-driver-pts">${d.pts}</span>
                        ${d.wins ? `<span class="recap-driver-wins">${d.wins}W</span>` : ''}
                    </div>`;
                }).join('')}
                <div class="sh" style="margin-top:16px"><span class="sh-emoji">🏗️</span> CONSTRUCTORS CHAMPIONSHIP</div>
                ${fs.constructors.map(c => {
                    const pct = Math.round((c.pts / maxConsPts) * 100);
                    return `<div class="recap-constructor-row">
                        <span class="recap-constructor-name">${f1Logo(c.name, 18)}${c.name}</span>
                        <div style="flex:1"><div class="recap-constructor-bar" style="width:${pct}%;background:${c.color};--bar-w:${pct}%"></div></div>
                        <span class="recap-constructor-pts">${c.pts}</span>
                    </div>`;
                }).join('')}
            </div>`;
        } else if (!driverList.length) {
            html += `<div class="info-card stagger" style="--i:1">
                <div class="info-card-title">🏆 2025 Season Champions</div>
                <div class="champ-item">
                    <span class="champ-pos gold">🥇</span>
                    <div class="champ-color" style="background:#FF8000"></div>
                    <div class="champ-info">
                        <div class="champ-name">Lando Norris</div>
                        <div class="champ-detail">${f1Logo('McLaren', 14)}McLaren · First World Championship</div>
                    </div>
                    <span class="champ-pts" style="color:#FF8000">423 pts</span>
                </div>
                <div class="champ-item">
                    <span class="champ-pos silver">🥈</span>
                    <div class="champ-color" style="background:#3671C6"></div>
                    <div class="champ-info">
                        <div class="champ-name">Max Verstappen</div>
                        <div class="champ-detail">${f1Logo('Red Bull', 14)}Red Bull · Just 2 points behind!</div>
                    </div>
                    <span class="champ-pts" style="color:#3671C6">421 pts</span>
                </div>
                <div class="champ-item">
                    <span class="champ-pos bronze">🥉</span>
                    <div class="champ-color" style="background:#FF8000"></div>
                    <div class="champ-info">
                        <div class="champ-name">Oscar Piastri</div>
                        <div class="champ-detail">${f1Logo('McLaren', 14)}McLaren</div>
                    </div>
                    <span class="champ-pts" style="color:#FF8000">410 pts</span>
                </div>
                <div style="margin-top:8px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:12px;color:var(--text-secondary)">
                    <strong style="color:#FF8000">🏗️ Constructors: McLaren</strong> — 2nd consecutive title, 10th overall. Norris ended Verstappen's 4-year reign.
                </div>
            </div>`;

            // SEASON PREVIEW
            html += `<div class="info-card stagger" style="--i:2">
                <div class="info-card-title">🔮 2026 Season Preview</div>
                <div class="info-card-body">
                    <strong>New regulations era:</strong> Completely redesigned cars with simplified aerodynamics, active aero elements, and increased electrical power from the power unit.<br><br>
                    <strong>Key storylines:</strong> Lewis Hamilton at Ferrari for his second year, Kimi Antonelli in his sophomore season at Mercedes, Carlos Sainz at Williams, and the question — can Norris defend his title against a hungry Verstappen?<br><br>
                    <strong>New engine suppliers:</strong> Audi enters as a works team, marking the most significant regulation change since 2014.
                </div>
            </div>`;
        }

        // NEWS
        html += renderNews(f1News?.data || f1News);

        document.getElementById('sportsContent').innerHTML = html;
        updateFooter();

        if (nextSess) {
            const el = document.getElementById('f1Countdown');
            if (el) startCountdown(nextSess.session.date + 'T' + nextSess.session.time, el);
        }
    } catch (e) {
        console.error('F1 error:', e);
        showError('Failed to load F1 data.');
    }
}

function f1GetSessions(race) {
    const sessions = [];
    if (race.fp1) sessions.push({ key: 'fp1', label: 'Free Practice 1', ...race.fp1, color: '#666' });
    if (race.fp2) sessions.push({ key: 'fp2', label: 'Free Practice 2', ...race.fp2, color: '#666' });
    if (race.fp3) sessions.push({ key: 'fp3', label: 'Free Practice 3', ...race.fp3, color: '#666' });
    if (race.sprintQualifying) sessions.push({ key: 'sq', label: 'Sprint Qualifying', ...race.sprintQualifying, color: '#e67e22' });
    if (race.sprint) sessions.push({ key: 'sprint', label: 'Sprint', ...race.sprint, color: '#e67e22' });
    if (race.qualifying) sessions.push({ key: 'quali', label: 'Qualifying', ...race.qualifying, color: '#3498db' });
    sessions.push({ key: 'race', label: 'Race', date: race.date, time: race.time || '00:00:00Z', color: '#2ecc71' });
    sessions.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
    return sessions;
}

function f1NextSession(races, now) {
    for (const r of races) {
        const sessions = f1GetSessions(r);
        for (const s of sessions) {
            const dt = new Date(s.date + 'T' + s.time);
            if (dt > now) return { race: r, session: s, dateTime: dt };
        }
    }
    return null;
}

function f1SessionStatusLine(race, now) {
    const sessions = f1GetSessions(race);
    for (const s of sessions) {
        const dt = new Date(s.date + 'T' + s.time);
        const diff = dt - now;
        if (diff > 0) {
            if (diff < 3600000) return `${s.label} in ${Math.ceil(diff/60000)}m`;
            if (diff < 86400000) return `${s.label} in ${Math.floor(diff/3600000)}h`;
            const days = Math.floor(diff/86400000);
            return `${s.label} in ${days}d`;
        }
    }
    return 'Completed';
}

function f1SessionTimePT(date, time) {
    const dt = new Date(date + 'T' + time);
    return dt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
}

function f1MiniCountdown(dt) {
    const diff = dt - Date.now();
    if (diff <= 0) return '<span class="f1-session-live">LIVE</span>';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

const f1CardTimers = [];

function renderF1Calendar(races, now) {
    f1CardTimers.forEach(id => clearInterval(id));
    f1CardTimers.length = 0;

    let nextIdx = races.findIndex(r => new Date(r.date + 'T' + (r.time || '23:59:59Z')) > now);
    if (nextIdx === -1) nextIdx = races.length;

    // Season progress dots
    let html = '<div class="f1-season-progress">';
    races.forEach((r, i) => {
        const cls = i < nextIdx ? 'done' : i === nextIdx ? 'next' : 'future';
        html += `<div class="f1-dot ${cls}" title="R${r.round} ${r.name}"></div>`;
    });
    html += '</div>';

    html += '<div class="f1-cal">';

    races.forEach((r, i) => {
        const flag = COUNTRY_FLAGS[r.country] || '🏁';
        const isSprint = !!r.sprint;
        const isCompleted = i < nextIdx;
        const isNext = i === nextIdx;
        const sessions = f1GetSessions(r);
        const statusLine = isCompleted ? 'Completed' : f1SessionStatusLine(r, now);

        // Date range
        const dates = sessions.map(s => new Date(s.date + 'T' + s.time));
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        const dateRange = firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
            (firstDate.getDate() !== lastDate.getDate() ? '–' + lastDate.getDate() : '');

        html += `<div class="f1-gp-card${isNext ? ' f1-gp-next' : ''}${isCompleted ? ' f1-gp-done' : ''} stagger" style="--i:${Math.min(i + 4, 18)}" data-round="${r.round}">`;
        html += `<div class="f1-gp-header" onclick="this.parentElement.classList.toggle('f1-gp-open')">
            <span class="race-flag-large">${flag}</span>
            <div class="f1-gp-info">
                <div class="f1-gp-name">${r.name}${isSprint ? ' <span class="sprint-badge">SPRINT</span>' : ''}</div>
                <div class="f1-gp-circuit">${r.circuit || ''} · ${dateRange}</div>
            </div>
            <div class="f1-gp-status-col">
                <div class="f1-gp-status">${isCompleted ? '✓' : statusLine}</div>
                <div class="f1-gp-round">R${r.round}</div>
            </div>
            <span class="f1-gp-chevron">›</span>
        </div>`;

        // Expandable content
        html += '<div class="f1-gp-body">';
        sessions.forEach(s => {
            const dt = new Date(s.date + 'T' + s.time);
            const isPast = dt < now;
            const timePT = f1SessionTimePT(s.date, s.time);
            const countdownId = `f1-cd-${r.round}-${s.key}`;
            html += `<div class="f1-session-row" style="border-left-color:${s.color}">
                <div class="f1-session-name">${s.label}</div>
                <div class="f1-session-time">${timePT}</div>
                <div class="f1-session-countdown" id="${countdownId}">${isPast ? '<span class="f1-session-done">✓</span>' : f1MiniCountdown(dt)}</div>
            </div>`;
        });

        // Show results buttons based on what's completed
        const qualiDone = r.qualifying && new Date(r.qualifying.date + 'T' + r.qualifying.time) < now;
        const sprintDone = r.sprint && new Date(r.sprint.date + 'T' + r.sprint.time) < now;
        const raceDone = new Date(r.date + 'T' + (r.time || '00:00:00Z')) < now;

        if (qualiDone || sprintDone || raceDone) {
            html += `<div class="f1-results-area" id="f1-results-${r.round}">`;
            html += `<div class="f1-results-buttons">`;
            if (qualiDone) html += `<button class="f1-results-btn" onclick="f1LoadQualiResults(${r.round}, event)">Qualifying Grid</button>`;
            if (sprintDone) html += `<button class="f1-results-btn" onclick="f1LoadSprintResults(${r.round}, event)">Sprint Results</button>`;
            if (raceDone) html += `<button class="f1-results-btn f1-results-btn-primary" onclick="f1LoadResults(${r.round}, event)">Race Results</button>`;
            html += `</div></div>`;
        }

        html += '</div></div>';
    });

    html += '</div>';

    // Auto-expand next race after render
    requestAnimationFrame(() => {
        const nextCard = document.querySelector('.f1-gp-next');
        if (nextCard) nextCard.classList.add('f1-gp-open');

        // Start mini countdown timers for upcoming sessions
        races.forEach(r => {
            const sessions = f1GetSessions(r);
            sessions.forEach(s => {
                const dt = new Date(s.date + 'T' + s.time);
                if (dt > now) {
                    const el = document.getElementById(`f1-cd-${r.round}-${s.key}`);
                    if (el) {
                        const tid = setInterval(() => { el.textContent = f1MiniCountdown(dt); }, 60000);
                        f1CardTimers.push(tid);
                    }
                }
            });
        });
    });

    return html;
}

async function f1LoadQualiResults(round, event) {
    event.stopPropagation();
    const area = document.getElementById(`f1-results-${round}`);
    if (!area) return;
    const existing = area.querySelector('.f1-quali-results');
    if (existing) { existing.remove(); return; }
    const loader = document.createElement('div');
    loader.className = 'f1-quali-results';
    loader.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">Loading...</div>';
    area.appendChild(loader);
    try {
        const data = await safeGet(`/sports/f1/race/${round}/qualifying`);
        const results = data?.data || [];
        if (!results.length) { loader.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">No qualifying data yet</div>'; return; }
        let h = '<div class="f1-results-list"><div class="f1-results-header" style="font-weight:700;font-size:11px;color:var(--text-tertiary);padding:4px 8px;display:flex;gap:8px"><span style="width:24px">P</span><span style="flex:1">Driver</span><span style="width:70px">Q1</span><span style="width:70px">Q2</span><span style="width:70px">Q3</span></div>';
        results.slice(0, 20).forEach(r => {
            const color = findTeamColor(r.constructor);
            h += `<div class="f1-result-row" style="display:flex;align-items:center;gap:8px;padding:4px 8px">
                <span class="f1-result-pos">${r.position}</span>
                <div class="f1-result-color" style="background:${color}"></div>
                <span class="f1-result-name" style="flex:1">${r.code || r.driver}</span>
                <span style="width:70px;font-size:11px;color:var(--text-secondary);font-family:monospace">${r.q1 || '-'}</span>
                <span style="width:70px;font-size:11px;color:var(--text-secondary);font-family:monospace">${r.q2 || '-'}</span>
                <span style="width:70px;font-size:11px;color:${r.q3 ? 'var(--text)' : 'var(--text-secondary)'};font-weight:${r.q3 ? '600' : '400'};font-family:monospace">${r.q3 || '-'}</span>
            </div>`;
        });
        h += '</div>';
        loader.innerHTML = h;
    } catch { loader.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">Failed to load qualifying</div>'; }
}

async function f1LoadSprintResults(round, event) {
    event.stopPropagation();
    const area = document.getElementById(`f1-results-${round}`);
    if (!area) return;
    const existing = area.querySelector('.f1-sprint-results');
    if (existing) { existing.remove(); return; }
    const loader = document.createElement('div');
    loader.className = 'f1-sprint-results';
    loader.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">Loading...</div>';
    area.appendChild(loader);
    try {
        const data = await safeGet(`/sports/f1/race/${round}/sprint`);
        const results = data?.data || [];
        if (!results.length) { loader.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">No sprint data yet</div>'; return; }
        let h = '<div class="f1-results-list">';
        results.slice(0, 10).forEach(r => {
            const color = findTeamColor(r.constructor);
            h += `<div class="f1-result-row">
                <span class="f1-result-pos">${r.position}</span>
                <div class="f1-result-color" style="background:${color}"></div>
                <span class="f1-result-name">${r.driver}</span>
                <span class="f1-result-team">${r.constructor}</span>
                <span class="f1-result-pts">${r.points || 0}pt</span>
            </div>`;
        });
        h += '</div>';
        loader.innerHTML = h;
    } catch { loader.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">Failed to load sprint results</div>'; }
}

async function f1LoadResults(round, event) {
    event.stopPropagation();
    const area = document.getElementById(`f1-results-${round}`);
    if (!area) return;
    area.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">Loading...</div>';
    try {
        const data = await safeGet(`/sports/f1/race/${round}/results`);
        const results = data?.data || [];
        if (!results.length) { area.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">No results available</div>'; return; }
        let h = '<div class="f1-results-list">';
        results.slice(0, 10).forEach(r => {
            const name = r.driver || r.Driver?.familyName || '?';
            const team = r.team || r.Constructor?.name || '';
            const color = findTeamColor(team);
            h += `<div class="f1-result-row">
                <span class="f1-result-pos">${r.position || r.pos}</span>
                <div class="f1-result-color" style="background:${color}"></div>
                <span class="f1-result-name">${name}</span>
                <span class="f1-result-team">${team}</span>
                <span class="f1-result-pts">${r.points || 0}pt</span>
            </div>`;
        });
        h += '</div>';
        area.innerHTML = h;
    } catch { area.innerHTML = '<div style="padding:8px;color:var(--text-secondary)">Failed to load results</div>'; }
}

function findTeamColor(team) {
    if (!team) return '#666';
    if (F1_TEAM_COLORS[team]) return F1_TEAM_COLORS[team];
    const key = Object.keys(F1_TEAM_COLORS).find(k => team.includes(k));
    return key ? F1_TEAM_COLORS[key] : '#666';
}
