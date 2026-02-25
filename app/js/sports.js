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
                <div class="sport-tabs" id="sportTabs"></div>
                <div class="sports-content" id="sportsContent"></div>
            </div>
            ${shell.bottomNav}
        </main>`;
    initAppShell('sports');
    renderTabBar();
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
    document.getElementById('sportsContent').innerHTML = '<div class="skel-hero"></div>' + '<div class="skel-card"></div>'.repeat(4);
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

function safeGet(path) { return API.get(path).catch(() => null); }

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

function renderNews(articles) {
  if (!articles || !articles.length) return '';
  return `
    <div class="news-section">
      <div class="news-header">📰 Latest News</div>
      ${articles.slice(0, 6).map((a, i) => `
        <div class="news-card" style="--i:${i}">
          <div class="news-title"><a href="${a.link}" target="_blank" rel="noopener">${a.title}</a></div>
          ${a.description ? `<div class="news-desc">${a.description}</div>` : ''}
          <div class="news-meta">${a.author ? a.author + ' · ' : ''}${timeAgo(a.pubDate)}</div>
        </div>
      `).join('')}
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
    showSkeletons();
    try {
        const [muData, rmData, plStandings, pdStandings, fbNews, fbSummary] = await Promise.all([
            fetchCached('fb-mu', () => safeGet('/sports/football/matches/66')),
            fetchCached('fb-rm', () => safeGet('/sports/football/matches/86')),
            fetchCached('fb-pl', () => safeGet('/sports/football/standings/PL')),
            fetchCached('fb-pd', () => safeGet('/sports/football/standings/PD')),
            fetchCached('football-news', () => safeGet('/sports/news/football')),
            fetchCached('football-summary', () => safeGet('/sports/summary/football')),
        ]);

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
        if (nextMatch && !liveMatch) {
            const el = document.getElementById('fbCountdown');
            if (el) startCountdown(nextMatch.date, el);
        }
    } catch (e) {
        console.error('Football error:', e);
        showError('Failed to load football data.');
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
async function renderCricket() {
    showSkeletons();
    try {
        const [liveResp, upcomingResp, crNews, crSummary] = await Promise.all([
            fetchCached('cr-live', () => safeGet('/sports/cricket/live')),
            fetchCached('cr-upcoming', () => safeGet('/sports/cricket/upcoming')),
            fetchCached('cricket-news', () => safeGet('/sports/news/cricket')),
            fetchCached('cricket-summary', () => safeGet('/sports/summary/cricket')),
        ]);

        const live = liveResp?.data || [];
        const upcoming = upcomingResp?.data || [];
        let html = '';

        // HERO
        const indiaLive = Array.isArray(live) ? live.find(m => m.teams?.some(t => t.toLowerCase().includes('india'))) : null;
        const heroMatch = indiaLive || (Array.isArray(live) && live[0]);

        if (heroMatch) {
            const t1 = stripCode(heroMatch.teams?.[0]);
            const t2 = stripCode(heroMatch.teams?.[1]);
            const s1 = heroMatch.scores?.[0] || '';
            const s2 = heroMatch.scores?.[1] || '';
            const isLive = !heroMatch.status?.toLowerCase().includes('starts at');
            html += `<div class="hero-card hero-cricket">
                <div class="hero-label">${isLive ? '<span class="live-dot"></span> LIVE' : '🏏 UPCOMING'} ${mtBadge(heroMatch.matchType)}</div>
                <div class="hero-matchup">
                    <div class="hero-side">
                        ${heroMatch.t1img ? `<img class="crest crest-48" src="${heroMatch.t1img}" alt="${t1}" width="48" height="48" onerror="this.style.display='none'">` : ''}
                        <div class="hero-tname">${t1}</div>
                        ${s1 ? `<div class="hero-tscore">${s1}</div>` : ''}
                    </div>
                    <div class="hero-center"><div class="hero-vs">VS</div></div>
                    <div class="hero-side">
                        ${heroMatch.t2img ? `<img class="crest crest-48" src="${heroMatch.t2img}" alt="${t2}" width="48" height="48" onerror="this.style.display='none'">` : ''}
                        <div class="hero-tname">${t2}</div>
                        ${s2 ? `<div class="hero-tscore">${s2}</div>` : ''}
                    </div>
                </div>
                <div class="cricket-status">${heroMatch.status || ''}</div>
            </div>`;
        } else {
            // No live — show next India match countdown or generic
            const nextIndia = upcoming.find(m => m.teams?.some(t => t.toLowerCase().includes('india')));
            if (nextIndia) {
                html += `<div class="hero-card hero-cricket">
                    <div class="hero-label">🇮🇳 NEXT INDIA MATCH</div>
                    <div style="text-align:center;position:relative;z-index:1">
                        <div style="font-size:18px;font-weight:800;margin-bottom:4px">${nextIndia.name || nextIndia.teams?.join(' vs ')}</div>
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

        // Additional live matches
        if (Array.isArray(live) && live.length > 1) {
            html += '<div class="sh stagger" style="--i:1"><span class="sh-emoji">🔴</span> OTHER LIVE</div>';
            live.filter(m => m !== heroMatch).forEach((m, i) => {
                html += renderCricketMatchCard(m, i + 2, false, true);
            });
        }

        // Filter bar
        const allTypes = ['all'];
        const typeSet = new Set();
        [...(Array.isArray(live) ? live : []), ...upcoming].forEach(m => {
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
            const indiaMatches = upcoming.filter(m => m.teams?.some(t => t.toLowerCase().includes('india')));
            if (indiaMatches.length) {
                html += '<div class="sh stagger" style="--i:3"><span class="sh-emoji">🇮🇳</span> INDIA MATCHES</div>';
                indiaMatches.slice(0, 5).forEach((m, i) => html += renderUpcomingCricketCard(m, i + 4, true));
            }
        }

        // Upcoming
        if (cricketFilter !== 'india') {
            html += '<div class="sh stagger" style="--i:7"><span class="sh-emoji">📅</span> UPCOMING</div>';
            const filtered = cricketFilter === 'all' || cricketFilter === 'india' ? upcoming :
                upcoming.filter(m => (m.matchType || '').toLowerCase() === cricketFilter);
            if (filtered.length) {
                filtered.slice(0, 12).forEach((m, i) => html += renderUpcomingCricketCard(m, i + 8, false));
            } else {
                html += emptyCard('🏏', 'No Matches', `No ${cricketFilter.toUpperCase()} matches scheduled`);
            }
        }

        html += renderNews(crNews?.data || crNews);

        document.getElementById('sportsContent').innerHTML = html || emptyCard('🏏', 'No Cricket Data', 'Check back later');

        // Countdown for India match
        const nextIndia = upcoming.find(m => m.teams?.some(t => t.toLowerCase().includes('india')));
        if (!heroMatch && nextIndia) {
            const el = document.getElementById('cricketCountdown');
            if (el) startCountdown(nextIndia.date, el);
        }

        if (Array.isArray(live) && live.length) {
            autoRefreshTimer = setInterval(() => { cache['cr-live'] = null; renderCricket(); }, 60000);
        }
    } catch (e) {
        console.error('Cricket error:', e);
        showError('Failed to load cricket data.');
    }
}

function setCricketFilter(type) { cricketFilter = type; renderCricket(); }

function renderCricketMatchCard(m, i, highlight, isLive) {
    const t1 = stripCode(m.teams?.[0]);
    const t2 = stripCode(m.teams?.[1]);
    return `<div class="cricket-card ${highlight ? 'india' : ''} stagger" style="--i:${i}">
        <div class="cc-header">
            ${isLive ? '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' : ''}
            ${mtBadge(m.matchType)}
        </div>
        <div class="cc-teams">
            <div class="cc-team">
                ${m.t1img ? `<img class="crest crest-28" src="${m.t1img}" width="28" height="28" onerror="this.style.display='none'">` : ''}
                <span class="cc-tname">${t1}</span>
                <span class="cc-tscore">${m.scores?.[0] || ''}</span>
            </div>
            <div class="cc-team">
                ${m.t2img ? `<img class="crest crest-28" src="${m.t2img}" width="28" height="28" onerror="this.style.display='none'">` : ''}
                <span class="cc-tname">${t2}</span>
                <span class="cc-tscore">${m.scores?.[1] || ''}</span>
            </div>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">${m.status || ''}</div>
    </div>`;
}

function renderUpcomingCricketCard(m, i, highlight) {
    const t1 = m.teams?.[0] || '?';
    const t2 = m.teams?.[1] || '?';
    const isIndia = m.teams?.some(t => t.toLowerCase().includes('india'));
    return `<div class="cricket-card ${highlight || isIndia ? 'india' : ''} stagger" style="--i:${i}">
        <div class="cc-header">
            ${mtBadge(m.matchType)}
            <span class="cc-date">${fmtShort(m.date)}</span>
        </div>
        <div class="cc-name">${m.name || `${t1} vs ${t2}`}</div>
        <div class="cc-venue">📍 ${m.venue || 'TBA'}</div>
    </div>`;
}

// ─── TENNIS ───
async function renderTennis() {
    showSkeletons();
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
        if (nextSlam) {
            const started = new Date(nextSlam.start) <= now;
            html += `<div class="grand-slam-hero ${nextSlam.cssClass}">
                <div class="hero-label">${started ? '🎾 NOW PLAYING' : '🎾 NEXT GRAND SLAM'}</div>
                <div class="slam-name">${nextSlam.country} ${nextSlam.name}</div>
                <div class="slam-venue">${nextSlam.venue} · ${nextSlam.surface}</div>
                ${!started ? '<div class="countdown" id="tennisCountdown"></div>' : ''}
                <div class="slam-dates">${fmtShort(nextSlam.start)} – ${fmtShort(nextSlam.end)}</div>
                ${lastCompleted ? `<div class="slam-last-winner">Last completed: ${lastCompleted.name}</div>` : ''}
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

        // Grand Slam Calendar
        html += '<div class="sh stagger" style="--i:14"><span class="sh-emoji">🎾</span> 2026 GRAND SLAM CALENDAR</div>';
        html += '<div class="race-table stagger" style="--i:15">';
        GRAND_SLAMS.forEach((gs, i) => {
            const started = new Date(gs.start) <= now;
            const ended = new Date(gs.end) < now;
            const active = started && !ended;
            let dotCls = 'sc-dot sc-big';
            let dotStyle = `background:${gs.color1}`;
            if (ended) { dotCls += ' sc-check'; }
            else if (active) { dotCls += ' sc-pulse'; }
            html += `<div class="slam-cal-item ${active ? 'sc-active' : ''} ${ended ? 'sc-done' : ''}">
                <div class="${dotCls}" style="${dotStyle}"></div>
                <div class="sc-info">
                    <div class="sc-name">${gs.country} ${gs.name}</div>
                    <div class="sc-detail">${gs.venue} · ${gs.surface}</div>
                </div>
                <div class="sc-dates">${fmtShort(gs.start)} – ${fmtShort(gs.end)}</div>
                ${active ? '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' : ''}
            </div>`;
        });
        html += '</div>';

        // NEWS
        html += renderNews(tnNews?.data || tnNews);

        document.getElementById('sportsContent').innerHTML = html;

        if (nextSlam && new Date(nextSlam.start) > now) {
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
    showSkeletons();
    try {
        const [drivers, constructors, calendar, f1News, f1Summary] = await Promise.all([
            fetchCached('f1-drv', () => safeGet('/sports/f1/standings/drivers')),
            fetchCached('f1-con', () => safeGet('/sports/f1/standings/constructors')),
            fetchCached('f1-cal', () => safeGet('/sports/f1/calendar')),
            fetchCached('f1-news', () => safeGet('/sports/news/f1')),
            fetchCached('f1-summary', () => safeGet('/sports/summary/f1')),
        ]);

        const races = calendar?.data || [];
        const driverList = drivers?.data || [];
        const consList = constructors?.data || [];
        const now = new Date();
        const nextRace = races.find(r => new Date(r.date) > now);
        let html = '';

        // HERO: Season countdown
        if (nextRace) {
            const flag = COUNTRY_FLAGS[nextRace.country] || '🏁';
            const raceDateTime = nextRace.date + 'T' + (nextRace.time || '00:00:00Z');
            const isPreseason = !driverList.length;
            html += `<div class="hero-card hero-f1">
                <div class="hero-label">🏎️ ${isPreseason ? 'F1 2026 — NEW ERA' : 'NEXT RACE'}</div>
                ${isPreseason ? '<div class="f1-hero-title">A NEW ERA BEGINS</div>' : ''}
                <div class="f1-hero-flag">${flag}</div>
                <div class="f1-hero-race">${nextRace.name}</div>
                <div class="f1-hero-circuit">${nextRace.circuit || ''}</div>
                <div class="countdown" id="f1Countdown"></div>
                <div class="hero-meta">Lights out: ${fmtDate(raceDateTime)}</div>
            </div>`;
        }

        // AI Summary
        html += renderSummary(f1Summary?.data || f1Summary);

        // 2025 CHAMPIONS RECAP
        if (!driverList.length) {
            html += `<div class="info-card stagger" style="--i:1">
                <div class="info-card-title">🏆 2025 Season Champions</div>
                <div class="champ-item">
                    <span class="champ-pos gold">🥇</span>
                    <div class="champ-color" style="background:#FF8000"></div>
                    <div class="champ-info">
                        <div class="champ-name">Lando Norris</div>
                        <div class="champ-detail">McLaren · First World Championship</div>
                    </div>
                    <span class="champ-pts" style="color:#FF8000">423 pts</span>
                </div>
                <div class="champ-item">
                    <span class="champ-pos silver">🥈</span>
                    <div class="champ-color" style="background:#3671C6"></div>
                    <div class="champ-info">
                        <div class="champ-name">Max Verstappen</div>
                        <div class="champ-detail">Red Bull · Just 2 points behind!</div>
                    </div>
                    <span class="champ-pts" style="color:#3671C6">421 pts</span>
                </div>
                <div class="champ-item">
                    <span class="champ-pos bronze">🥉</span>
                    <div class="champ-color" style="background:#FF8000"></div>
                    <div class="champ-info">
                        <div class="champ-name">Oscar Piastri</div>
                        <div class="champ-detail">McLaren</div>
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

        // RACE CALENDAR
        if (races.length) {
            html += '<div class="sh stagger" style="--i:3"><span class="sh-emoji">📅</span> RACE CALENDAR</div>';
            html += '<div class="f1-cal">';
            let nextFound = false;
            races.forEach((r, i) => {
                const rDate = new Date(r.date);
                const done = rDate < now;
                const isNext = !done && !nextFound;
                if (isNext) nextFound = true;
                const flag = COUNTRY_FLAGS[r.country] || '🏁';
                html += `<div class="f1-race ${done ? 'f1-done' : ''} ${isNext ? 'f1-next' : ''} stagger" style="--i:${Math.min(i + 4, 18)}">
                    <span class="f1-round">R${r.round}</span>
                    <span class="f1-flag">${flag}</span>
                    <div class="f1-rinfo">
                        <span class="f1-rname">${r.name}</span>
                        <span class="f1-rcircuit">${r.circuit || ''}</span>
                    </div>
                    <span class="f1-rdate">${fmtShort(r.date)}</span>
                    ${isNext ? '<span class="next-badge">NEXT</span>' : ''}
                    ${done ? '<span class="done-check">✓</span>' : ''}
                </div>`;
            });
            html += '</div>';
        }

        // STANDINGS (when data exists)
        if (driverList.length) {
            html += '<div class="standings-card stagger" style="--i:20"><div class="standings-title">🏆 Driver Standings</div>';
            driverList.slice(0, 10).forEach((d, i) => {
                const name = d.name || d.driver?.familyName || '?';
                const team = d.team || d.constructors?.[0]?.name || '';
                const color = findTeamColor(team);
                html += `<div class="st-row">
                    <span class="st-pos">${d.position || i + 1}</span>
                    <div class="st-color" style="background:${color}"></div>
                    <div class="st-info"><div class="st-dname">${name}</div><div class="st-team">${team}</div></div>
                    <span class="st-pts">${d.points || 0}</span>
                </div>`;
            });
            html += '</div>';
        }

        if (consList.length) {
            const maxPts = parseFloat(consList[0]?.points) || 1;
            html += '<div class="standings-card stagger" style="--i:21"><div class="standings-title">🏗️ Constructor Standings</div>';
            consList.forEach((c, i) => {
                const name = c.name || c.constructor?.name || '?';
                const pts = c.points || 0;
                const pct = Math.round((pts / maxPts) * 100);
                const color = findTeamColor(name);
                html += `<div class="st-row">
                    <span class="st-pos">${c.position || i + 1}</span>
                    <div class="st-color" style="background:${color}"></div>
                    <div class="st-info" style="flex:1"><div class="st-dname">${name}</div></div>
                    <div style="flex:2"><div class="rr-bar"><div class="rr-bar-fill" style="--bar-w:${pct}%;--i:${i};background:${color}"></div></div></div>
                    <span class="st-pts">${pts}</span>
                </div>`;
            });
            html += '</div>';
        }

        if (!driverList.length && !consList.length && races.length) {
            html += `<div class="info-card stagger" style="--i:22">
                <div class="info-card-title">⏳ Season Starts ${fmtShort(races[0]?.date)}</div>
                <div class="info-card-body">Driver and constructor standings will appear once the 2026 season begins with the ${races[0]?.name || 'first race'}.</div>
            </div>`;
        }

        // NEWS
        html += renderNews(f1News?.data || f1News);

        document.getElementById('sportsContent').innerHTML = html;

        if (nextRace) {
            const el = document.getElementById('f1Countdown');
            if (el) startCountdown(nextRace.date + 'T' + (nextRace.time || '00:00:00Z'), el);
        }
    } catch (e) {
        console.error('F1 error:', e);
        showError('Failed to load F1 data.');
    }
}

function findTeamColor(team) {
    if (!team) return '#666';
    if (F1_TEAM_COLORS[team]) return F1_TEAM_COLORS[team];
    const key = Object.keys(F1_TEAM_COLORS).find(k => team.includes(k));
    return key ? F1_TEAM_COLORS[key] : '#666';
}
