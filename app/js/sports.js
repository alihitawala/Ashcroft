/* ═══════════════════════════════════════════════════════════
   Sports Hub — Main JS
   ═══════════════════════════════════════════════════════════ */

// ─── State ───
let currentSport = localStorage.getItem('sports-tab') || 'football';
const cache = {};
let countdownIntervals = [];
let autoRefreshTimer = null;

const F1_TEAM_COLORS = {
    'Red Bull': '#3671C6', 'Ferrari': '#E8002D', 'McLaren': '#FF8000',
    'Mercedes': '#27F4D2', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
    'Williams': '#64C4FF', 'RB': '#6692FF', 'Sauber': '#52E252', 'Haas': '#B6BABD'
};

const SPORTS = [
    { id: 'football', icon: '⚽', label: 'Football' },
    { id: 'cricket', icon: '🏏', label: 'Cricket' },
    { id: 'tennis', icon: '🎾', label: 'Tennis' },
    { id: 'f1', icon: '🏎️', label: 'F1' },
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
        </main>
    `;
    initAppShell('sports');
    renderTabBar();
    switchTab(currentSport);
});

// ─── Tab Bar ───
function renderTabBar() {
    const tabs = document.getElementById('sportTabs');
    tabs.innerHTML = SPORTS.map(s =>
        `<button class="sport-tab${s.id === currentSport ? ' active' : ''}" data-sport="${s.id}">
            <span class="tab-icon">${s.icon}</span>${s.label}
        </button>`
    ).join('');
    tabs.addEventListener('click', e => {
        const tab = e.target.closest('.sport-tab');
        if (tab && tab.dataset.sport !== currentSport) switchTab(tab.dataset.sport);
    });
}

function switchTab(sport) {
    currentSport = sport;
    localStorage.setItem('sports-tab', sport);
    document.body.setAttribute('data-sport', sport);

    document.querySelectorAll('.sport-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.sport === sport);
    });

    // Clear timers
    countdownIntervals.forEach(id => clearInterval(id));
    countdownIntervals = [];
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }

    const renderers = { football: renderFootball, cricket: renderCricket, tennis: renderTennis, f1: renderF1 };
    renderers[sport]();
}

// ─── Helpers ───
function showSkeletons() {
    document.getElementById('sportsContent').innerHTML =
        '<div class="skeleton skeleton-hero" style="margin-bottom:16px"></div>' +
        '<div class="skeleton skeleton-card" style="margin-bottom:12px"></div>'.repeat(3);
}

function showError(msg, retryFn) {
    document.getElementById('sportsContent').innerHTML = `
        <div class="sport-error">
            <div class="error-emoji">😵</div>
            <p>${msg || 'Something went wrong loading data.'}</p>
            <button class="btn btn-primary" onclick="(${retryFn.name || 'switchTab'})('${currentSport}')">Retry</button>
        </div>`;
}

async function fetchCached(key, fetcher) {
    if (cache[key] && Date.now() - cache[key].ts < 120000) return cache[key].data;
    const data = await fetcher();
    cache[key] = { data, ts: Date.now() };
    return data;
}

function safeGet(path) {
    return API.get(path).catch(() => null);
}

function renderFlipClock(d, h, m, s) {
    const units = [
        { val: d, label: 'days' },
        { val: h, label: 'hrs' },
        { val: m, label: 'min' },
        { val: s, label: 'sec' },
    ];
    return units.map(u =>
        `<div class="flip-unit"><div class="flip-value">${String(u.val).padStart(2, '0')}</div><div class="flip-label">${u.label}</div></div>`
    ).join('');
}

function startCountdown(targetDate, element) {
    function update() {
        const diff = new Date(targetDate) - Date.now();
        if (diff <= 0) { element.innerHTML = '<div class="flip-value" style="font-size:18px">LIVE NOW</div>'; return; }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        element.innerHTML = renderFlipClock(d, h, m, s);
    }
    update();
    const id = setInterval(update, 1000);
    countdownIntervals.push(id);
    return id;
}

function formDot(result) {
    if (!result) return '';
    const r = result.toUpperCase();
    if (r === 'W') return '<div class="form-dot w">W</div>';
    if (r === 'D') return '<div class="form-dot d">D</div>';
    return '<div class="form-dot l">L</div>';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function shortTeam(name) {
    if (!name) return '?';
    // Shorten long names
    return name.replace(/ FC$| CF$/, '').replace(/^FC /, '');
}

// ─── Football ───
async function renderFootball() {
    showSkeletons();
    try {
        const [muMatches, rmMatches, plStandings, pdStandings, live] = await Promise.all([
            fetchCached('fb-mu', () => safeGet('/sports/football/matches/66')),
            fetchCached('fb-rm', () => safeGet('/sports/football/matches/86')),
            fetchCached('fb-pl', () => safeGet('/sports/football/standings/PL')),
            fetchCached('fb-pd', () => safeGet('/sports/football/standings/PD')),
            fetchCached('fb-live', () => safeGet('/sports/football/live')),
        ]);

        const content = document.getElementById('sportsContent');
        let html = '';

        // Hero: next match or live
        const liveMatches = live?.matches || [];
        const allMatches = [...(muMatches?.matches || []), ...(rmMatches?.matches || [])];
        const upcoming = allMatches
            .filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED')
            .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
        const liveMatch = liveMatches[0];
        const nextMatch = upcoming[0];

        if (liveMatch) {
            html += `<div class="hero-card">
                <div class="hero-label"><span class="live-dot"></span> LIVE</div>
                <div class="hero-teams">
                    <span>${shortTeam(liveMatch.homeTeam?.name)}</span>
                    <span class="hero-vs">vs</span>
                    <span>${shortTeam(liveMatch.awayTeam?.name)}</span>
                </div>
                <div class="hero-score">${liveMatch.score?.fullTime?.home ?? '?'} – ${liveMatch.score?.fullTime?.away ?? '?'}</div>
                <div class="hero-meta">${liveMatch.competition?.name || ''}</div>
            </div>`;
        } else if (nextMatch) {
            html += `<div class="hero-card">
                <div class="hero-label">NEXT MATCH</div>
                <div class="hero-teams">
                    <span>${shortTeam(nextMatch.homeTeam?.name)}</span>
                    <span class="hero-vs">vs</span>
                    <span>${shortTeam(nextMatch.awayTeam?.name)}</span>
                </div>
                <div class="countdown" id="footballCountdown"></div>
                <div class="hero-meta">${nextMatch.competition?.name || ''} · ${formatDate(nextMatch.utcDate)}</div>
            </div>`;
        }

        // My Teams
        html += '<div class="section-header"><span class="section-emoji">👕</span> My Teams</div>';
        html += '<div class="teams-grid">';

        const teams = [
            { name: 'Man United', data: muMatches, standings: plStandings, comp: 'PL', id: 66 },
            { name: 'Real Madrid', data: rmMatches, standings: pdStandings, comp: 'PD', id: 86 },
        ];

        teams.forEach((team, i) => {
            const matches = team.data?.matches || [];
            const finished = matches.filter(m => m.status === 'FINISHED').sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));
            const next = matches.filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED').sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0];
            const last = finished[0];

            // Form from last 5
            const form = finished.slice(0, 5).map(m => {
                const home = m.homeTeam?.id === team.id;
                const hg = m.score?.fullTime?.home || 0;
                const ag = m.score?.fullTime?.away || 0;
                if (home) return hg > ag ? 'W' : hg < ag ? 'L' : 'D';
                return ag > hg ? 'W' : ag < hg ? 'L' : 'D';
            });

            // League pos
            const table = team.standings?.standings?.[0]?.table || [];
            const pos = table.find(t => t.team?.id === team.id);

            html += `<div class="team-card" style="--i:${i}">
                <div class="team-name">${team.name}</div>
                ${pos ? `<div class="team-stat"><span>League Position</span><span class="team-stat-value">#${pos.position}</span></div>
                <div class="team-stat"><span>Points</span><span class="team-stat-value">${pos.points}</span></div>` : ''}
                ${last ? `<div class="team-stat"><span>Last Result</span><span class="team-stat-value">${shortTeam(last.homeTeam?.name)} ${last.score?.fullTime?.home}–${last.score?.fullTime?.away} ${shortTeam(last.awayTeam?.name)}</span></div>` : ''}
                ${next ? `<div class="team-stat"><span>Next</span><span class="team-stat-value">${shortTeam(next.homeTeam?.name)} vs ${shortTeam(next.awayTeam?.name)}</span></div>` : ''}
                <div class="form-guide">${form.map(f => formDot(f)).join('')}</div>
            </div>`;
        });
        html += '</div>';

        // Title Race
        const renderTitleRace = (title, standings) => {
            const table = standings?.standings?.[0]?.table || [];
            const top6 = table.slice(0, 6);
            if (!top6.length) return '';
            const maxPts = top6[0]?.points || 1;
            let s = `<div class="sport-section"><div class="sport-section-title">🏆 ${title}</div>`;
            top6.forEach((t, i) => {
                const pct = Math.round((t.points / maxPts) * 100);
                s += `<div class="title-race-item" style="--i:${i}">
                    <span class="title-race-team">${shortTeam(t.team?.name)}</span>
                    <div class="title-race-bar-wrap"><div class="championship-bar"><div class="championship-bar-fill" style="--bar-width:${pct}%;--i:${i};background:var(--sport-primary)"></div></div></div>
                    <span class="title-race-pts">${t.points}</span>
                </div>`;
            });
            s += '</div>';
            return s;
        };

        html += renderTitleRace('Premier League', plStandings);
        html += renderTitleRace('La Liga', pdStandings);

        content.innerHTML = html;

        // Start countdown
        if (!liveMatch && nextMatch) {
            const el = document.getElementById('footballCountdown');
            if (el) startCountdown(nextMatch.utcDate, el);
        }

        // Auto-refresh if live
        if (liveMatches.length) {
            autoRefreshTimer = setInterval(() => { cache['fb-live'] = null; renderFootball(); }, 60000);
        }
    } catch (e) {
        console.error('Football error:', e);
        showError('Failed to load football data.', renderFootball);
    }
}

// ─── Cricket ───
async function renderCricket() {
    showSkeletons();
    try {
        const [live, upcoming] = await Promise.all([
            fetchCached('cr-live', () => safeGet('/sports/cricket/live')),
            fetchCached('cr-upcoming', () => safeGet('/sports/cricket/upcoming')),
        ]);

        const content = document.getElementById('sportsContent');
        let html = '';

        const liveMatches = live?.matches || live || [];
        const upcomingMatches = upcoming?.matches || upcoming || [];

        // Live hero
        if (Array.isArray(liveMatches) && liveMatches.length) {
            const m = liveMatches[0];
            html += `<div class="hero-card">
                <div class="hero-label"><span class="live-dot"></span> LIVE</div>
                <div class="hero-teams">
                    <span>${m.t1 || m.team1 || m.homeTeam || '?'}</span>
                    <span class="hero-vs">vs</span>
                    <span>${m.t2 || m.team2 || m.awayTeam || '?'}</span>
                </div>
                <div class="cricket-score">${m.t1s || m.score1 || ''} vs ${m.t2s || m.score2 || ''}</div>
                <div class="cricket-status">${m.status || m.matchStatus || ''}</div>
            </div>`;

            // Show remaining live matches
            if (liveMatches.length > 1) {
                html += '<div class="section-header"><span class="section-emoji">🔴</span> Other Live Matches</div>';
                liveMatches.slice(1).forEach((m, i) => {
                    html += `<div class="match-card" style="--i:${i}">
                        <div class="match-teams">
                            <span class="match-team">${m.t1 || m.team1 || '?'}</span>
                            <span class="match-score">${m.t1s || ''} - ${m.t2s || ''}</span>
                            <span class="match-team">${m.t2 || m.team2 || '?'}</span>
                        </div>
                        <div class="match-meta">${m.status || ''}</div>
                    </div>`;
                });
            }
        } else {
            html += `<div class="hero-card">
                <div class="hero-label">🏏 CRICKET</div>
                <div style="text-align:center;font-size:15px;margin:12px 0">No live matches right now</div>
            </div>`;
        }

        // Upcoming
        if (Array.isArray(upcomingMatches) && upcomingMatches.length) {
            html += '<div class="section-header"><span class="section-emoji">📅</span> Upcoming</div>';
            upcomingMatches.slice(0, 8).forEach((m, i) => {
                const date = m.date || m.dateTimeGMT || m.utcDate || '';
                html += `<div class="match-card" style="--i:${i}">
                    <div class="match-teams">
                        <span class="match-team">${m.t1 || m.team1 || m.homeTeam || '?'}</span>
                        <span class="match-score">vs</span>
                        <span class="match-team">${m.t2 || m.team2 || m.awayTeam || '?'}</span>
                    </div>
                    <div class="match-meta">${m.series || m.name || ''} · ${formatDate(date)}</div>
                </div>`;
            });
        }

        content.innerHTML = html || '<div class="sport-error"><div class="error-emoji">🏏</div><p>No cricket data available.</p></div>';

        if (Array.isArray(liveMatches) && liveMatches.length) {
            autoRefreshTimer = setInterval(() => { cache['cr-live'] = null; renderCricket(); }, 60000);
        }
    } catch (e) {
        console.error('Cricket error:', e);
        showError('Failed to load cricket data.', renderCricket);
    }
}

// ─── Tennis ───
async function renderTennis() {
    showSkeletons();
    try {
        const [rankings, scores] = await Promise.all([
            fetchCached('tn-rank', () => safeGet('/sports/tennis/rankings')),
            fetchCached('tn-scores', () => safeGet('/sports/tennis/scores')),
        ]);

        const content = document.getElementById('sportsContent');
        let html = '';

        // Hero: current tournament or grand slam countdown
        const events = scores?.events || scores?.tournaments || [];
        if (events.length) {
            const ev = events[0];
            html += `<div class="hero-card">
                <div class="hero-label">🎾 NOW PLAYING</div>
                <div style="text-align:center;font-size:18px;font-weight:700;margin:8px 0">${ev.name || ev.shortName || 'ATP Tour'}</div>
                <div class="hero-meta">${ev.status || ev.location || ''}</div>
            </div>`;
        } else {
            html += `<div class="hero-card">
                <div class="hero-label">🎾 TENNIS</div>
                <div style="text-align:center;font-size:15px;margin:12px 0">No tournaments in progress</div>
            </div>`;
        }

        // Player Spotlight
        const spotlightPlayers = ['Alcaraz', 'Sinner', 'Zverev'];
        const allAthletes = rankings?.rankings || rankings?.athletes || [];
        const flags = { 'Alcaraz': '🇪🇸', 'Sinner': '🇮🇹', 'Zverev': '🇩🇪' };

        if (allAthletes.length) {
            html += '<div class="section-header"><span class="section-emoji">⭐</span> Player Spotlight</div>';
            html += '<div class="player-cards">';
            spotlightPlayers.forEach((name, i) => {
                const p = allAthletes.find(a =>
                    (a.name || a.athlete?.displayName || '').includes(name)
                );
                const rank = p?.rank || p?.athlete?.rank || '?';
                const displayName = p?.name || p?.athlete?.displayName || name;
                html += `<div class="player-card" style="--i:${i}">
                    <div class="player-flag">${flags[name] || '🎾'}</div>
                    <div class="player-rank">#${rank}</div>
                    <div class="player-name">${displayName}</div>
                    ${p?.points ? `<div class="player-stat">${p.points} pts</div>` : ''}
                </div>`;
            });
            html += '</div>';

            // ATP Top 10
            html += '<div class="sport-section" style="--i:1"><div class="sport-section-title">🏆 ATP Top 10</div>';
            html += '<table class="standings-table"><thead><tr><th>#</th><th>Player</th><th>Pts</th></tr></thead><tbody>';
            allAthletes.slice(0, 10).forEach((p, i) => {
                const name = p.name || p.athlete?.displayName || '?';
                const rank = p.rank || i + 1;
                const pts = p.points || p.athlete?.points || '';
                const movement = p.movement || 0;
                let arrow = '<span class="position-change same">→</span>';
                if (movement > 0) arrow = `<span class="position-change up">↑${movement}</span>`;
                else if (movement < 0) arrow = `<span class="position-change down">↓${Math.abs(movement)}</span>`;
                html += `<tr><td class="pos">${rank}</td><td class="team-col">${name} ${arrow}</td><td class="pts">${pts}</td></tr>`;
            });
            html += '</tbody></table></div>';
        }

        // Live/Recent Scores
        if (events.length) {
            html += '<div class="section-header"><span class="section-emoji">📊</span> Recent Scores</div>';
            events.slice(0, 5).forEach((ev, i) => {
                const competitors = ev.competitors || ev.matches || [];
                html += `<div class="match-card" style="--i:${i}">
                    <div class="match-meta" style="margin-bottom:8px;font-weight:600;color:var(--text)">${ev.name || ev.shortName || ''}</div>
                    ${competitors.slice(0, 3).map(c =>
                        `<div class="match-meta">${c.name || c.athlete?.displayName || '?'} ${c.score || ''}</div>`
                    ).join('')}
                </div>`;
            });
        }

        content.innerHTML = html || '<div class="sport-error"><div class="error-emoji">🎾</div><p>No tennis data available.</p></div>';
    } catch (e) {
        console.error('Tennis error:', e);
        showError('Failed to load tennis data.', renderTennis);
    }
}

// ─── F1 ───
async function renderF1() {
    showSkeletons();
    try {
        const [drivers, constructors, calendar, nextSession] = await Promise.all([
            fetchCached('f1-drv', () => safeGet('/sports/f1/standings/drivers')),
            fetchCached('f1-con', () => safeGet('/sports/f1/standings/constructors')),
            fetchCached('f1-cal', () => safeGet('/sports/f1/calendar')),
            fetchCached('f1-next', () => safeGet('/sports/f1/next-session')),
        ]);

        const content = document.getElementById('sportsContent');
        let html = '';

        // Hero: next race/session
        const next = nextSession?.session || nextSession;
        const races = calendar?.races || calendar || [];

        if (next && (next.date || next.dateStart || next.sessionName)) {
            const sessionDate = next.date || next.dateStart || '';
            const sessionName = next.sessionName || next.session_name || next.type || 'Session';
            const raceName = next.raceName || next.meeting_name || next.name || 'Race';
            const country = next.country || next.country_name || '';
            html += `<div class="hero-card">
                <div class="hero-label">🏎️ NEXT UP</div>
                <div style="text-align:center;font-size:18px;font-weight:700;margin:8px 0">${raceName}</div>
                <div class="hero-meta">${sessionName} · ${country}</div>
                ${sessionDate ? '<div class="countdown" id="f1Countdown"></div>' : ''}
                <div class="hero-meta">${formatDate(sessionDate)}</div>
            </div>`;
        } else {
            // Find next race from calendar
            const now = new Date();
            const nextRace = races.find(r => new Date(r.date) > now);
            if (nextRace) {
                html += `<div class="hero-card">
                    <div class="hero-label">🏎️ NEXT RACE</div>
                    <div style="text-align:center;font-size:18px;font-weight:700;margin:8px 0">${nextRace.raceName || nextRace.name || ''}</div>
                    <div class="countdown" id="f1Countdown"></div>
                    <div class="hero-meta">${formatDate(nextRace.date)}</div>
                </div>`;
            } else {
                html += `<div class="hero-card">
                    <div class="hero-label">🏎️ FORMULA 1</div>
                    <div style="text-align:center;font-size:15px;margin:12px 0">Season data loading...</div>
                </div>`;
            }
        }

        // Driver Standings
        const driverList = drivers?.standings || drivers?.drivers || [];
        if (driverList.length) {
            const maxPts = parseFloat(driverList[0]?.points) || 1;
            html += '<div class="sport-section" style="--i:1"><div class="sport-section-title">🏆 Driver Standings</div>';
            driverList.slice(0, 10).forEach((d, i) => {
                const name = d.driver?.familyName ? `${d.driver.givenName?.[0]}. ${d.driver.familyName}` : (d.name || d.driverName || '?');
                const team = d.constructors?.[0]?.name || d.team || d.teamName || '';
                const pts = d.points || 0;
                const color = F1_TEAM_COLORS[team] || F1_TEAM_COLORS[Object.keys(F1_TEAM_COLORS).find(k => team.includes(k))] || '#666';
                html += `<div class="driver-row" style="--i:${i}">
                    <span class="driver-pos">${d.position || i + 1}</span>
                    <div class="driver-color" style="background:${color}"></div>
                    <div style="flex:1;min-width:0">
                        <div class="driver-name">${name}</div>
                        <div class="driver-team">${team}</div>
                    </div>
                    <span class="driver-points">${pts}</span>
                </div>`;
            });
            html += '</div>';
        }

        // Constructor Standings
        const consList = constructors?.standings || constructors?.constructors || [];
        if (consList.length) {
            const maxPts = parseFloat(consList[0]?.points) || 1;
            html += '<div class="sport-section" style="--i:2"><div class="sport-section-title">🏗️ Constructor Standings</div>';
            consList.forEach((c, i) => {
                const name = c.constructor?.name || c.name || c.constructorName || '?';
                const pts = c.points || 0;
                const pct = Math.round((pts / maxPts) * 100);
                const color = F1_TEAM_COLORS[name] || F1_TEAM_COLORS[Object.keys(F1_TEAM_COLORS).find(k => name.includes(k))] || '#666';
                html += `<div class="constructor-row">
                    <span class="driver-pos">${c.position || i + 1}</span>
                    <div class="driver-color" style="background:${color}"></div>
                    <span class="constructor-name">${name}</span>
                    <div class="constructor-bar-wrap"><div class="championship-bar"><div class="championship-bar-fill" style="--bar-width:${pct}%;--i:${i};background:${color}"></div></div></div>
                    <span class="constructor-points">${pts}</span>
                </div>`;
            });
            html += '</div>';
        }

        // Race Calendar
        if (races.length) {
            const now = new Date();
            let nextFound = false;
            html += '<div class="sport-section" style="--i:3"><div class="sport-section-title">📅 Race Calendar</div>';
            html += '<div class="race-calendar">';
            races.forEach((r, i) => {
                const raceDate = new Date(r.date);
                const completed = raceDate < now;
                const isNext = !completed && !nextFound;
                if (isNext) nextFound = true;
                const name = r.raceName || r.name || '?';
                const country = r.Circuit?.Location?.country || r.country || '';
                const round = r.round || i + 1;
                html += `<div class="race-item ${completed ? 'completed' : ''} ${isNext ? 'next' : ''}" style="--i:${Math.min(i, 10)}">
                    <span class="race-round">R${round}</span>
                    <span class="race-status ${completed ? 'done' : isNext ? 'live' : 'upcoming'}"></span>
                    <span class="race-name">${name}</span>
                    <span class="race-date">${raceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>`;
            });
            html += '</div></div>';
        }

        content.innerHTML = html;

        // Start countdown
        const countdownDate = next?.date || next?.dateStart || (() => {
            const nr = races.find(r => new Date(r.date) > new Date());
            return nr?.date;
        })();
        if (countdownDate) {
            const el = document.getElementById('f1Countdown');
            if (el) startCountdown(countdownDate, el);
        }
    } catch (e) {
        console.error('F1 error:', e);
        showError('Failed to load F1 data.', renderF1);
    }
}
