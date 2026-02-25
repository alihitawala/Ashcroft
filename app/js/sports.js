/* ═══════════════════════════════════════════════════════════
   Sports Hub V2 — Main JS
   ═══════════════════════════════════════════════════════════ */

// ─── State ───
let currentSport = localStorage.getItem('sports-tab') || 'football';
const cache = {};
let countdownIntervals = [];
let autoRefreshTimer = null;
let cricketFilter = 'all'; // all, t20, odi, test

const F1_TEAM_COLORS = {
    'Red Bull': '#3671C6', 'Ferrari': '#E8002D', 'McLaren': '#FF8000',
    'Mercedes': '#27F4D2', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
    'Williams': '#64C4FF', 'RB': '#6692FF', 'Sauber': '#52E252', 'Haas': '#B6BABD'
};

const COUNTRY_FLAGS = {
    'Australia': '🇦🇺', 'China': '🇨🇳', 'Japan': '🇯🇵', 'Bahrain': '🇧🇭',
    'Saudi Arabia': '🇸🇦', 'USA': '🇺🇸', 'United States': '🇺🇸',
    'Spain': '🇪🇸', 'Monaco': '🇲🇨', 'Canada': '🇨🇦', 'UK': '🇬🇧',
    'United Kingdom': '🇬🇧', 'Hungary': '🇭🇺', 'Belgium': '🇧🇪',
    'Netherlands': '🇳🇱', 'Italy': '🇮🇹', 'Azerbaijan': '🇦🇿',
    'Singapore': '🇸🇬', 'Mexico': '🇲🇽', 'Brazil': '🇧🇷',
    'Qatar': '🇶🇦', 'Abu Dhabi': '🇦🇪', 'UAE': '🇦🇪', 'Austria': '🇦🇹',
    'France': '🇫🇷', 'Portugal': '🇵🇹', 'Russia': '🇷🇺', 'Turkey': '🇹🇷',
    'Vietnam': '🇻🇳', 'Las Vegas': '🇺🇸', 'Miami': '🇺🇸',
};

const TENNIS_PLAYER_FLAGS = {
    'Carlos Alcaraz': '🇪🇸', 'Jannik Sinner': '🇮🇹', 'Alexander Zverev': '🇩🇪',
    'Novak Djokovic': '🇷🇸', 'Daniil Medvedev': '🇷🇺', 'Andrey Rublev': '🇷🇺',
    'Casper Ruud': '🇳🇴', 'Holger Rune': '🇩🇰', 'Hubert Hurkacz': '🇵🇱',
    'Alex de Minaur': '🇦🇺', 'Taylor Fritz': '🇺🇸', 'Stefanos Tsitsipas': '🇬🇷',
    'Tommy Paul': '🇺🇸', 'Ben Shelton': '🇺🇸', 'Frances Tiafoe': '🇺🇸',
};

const GRAND_SLAMS_2026 = [
    { name: 'Australian Open', start: '2026-01-19', end: '2026-02-01', color: '#0091D2', venue: 'Melbourne Park', country: '🇦🇺', surface: 'Hard' },
    { name: 'Roland Garros', start: '2026-05-25', end: '2026-06-08', color: '#C84B31', venue: 'Stade Roland Garros', country: '🇫🇷', surface: 'Clay' },
    { name: 'Wimbledon', start: '2026-06-29', end: '2026-07-12', color: '#006633', venue: 'All England Club', country: '🇬🇧', surface: 'Grass' },
    { name: 'US Open', start: '2026-08-31', end: '2026-09-13', color: '#1E3A5F', venue: 'Flushing Meadows', country: '🇺🇸', surface: 'Hard' },
];

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
        '<div class="skeleton skeleton-card" style="margin-bottom:12px"></div>'.repeat(4);
}

function showError(msg, retryFn) {
    document.getElementById('sportsContent').innerHTML = `
        <div class="sport-error">
            <div class="error-emoji">😵</div>
            <p>${msg || 'Something went wrong loading data.'}</p>
            <button class="btn btn-primary" onclick="switchTab('${currentSport}')">Retry</button>
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
    return [
        { val: d, label: 'days' }, { val: h, label: 'hrs' },
        { val: m, label: 'min' }, { val: s, label: 'sec' },
    ].map(u =>
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

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function shortTeam(name) {
    if (!name) return '?';
    return name.replace(/ FC$| CF$/, '').replace(/^FC /, '');
}

function crestImg(url, size = 32) {
    if (!url) return '';
    return `<img class="team-crest" src="${url}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.style.display='none'">`;
}

function stripTeamCode(name) {
    if (!name) return '?';
    return name.replace(/\s*\[.*?\]\s*$/, '').trim();
}

function matchTypeBadge(type) {
    if (!type) return '';
    const t = type.toLowerCase();
    const colors = { t20: '#E91E63', odi: '#2196F3', test: '#4CAF50', t10: '#FF5722' };
    const color = colors[t] || '#9E9E9E';
    return `<span class="match-type-badge" style="--badge-color:${color}">${type.toUpperCase()}</span>`;
}

function emptyState(emoji, title, subtitle) {
    return `<div class="empty-state-card">
        <div class="empty-emoji">${emoji}</div>
        <div class="empty-title">${title}</div>
        <div class="empty-subtitle">${subtitle}</div>
    </div>`;
}

// ─── Football ───
async function renderFootball() {
    showSkeletons();
    try {
        const [muData, rmData, plStandings, pdStandings] = await Promise.all([
            fetchCached('fb-mu', () => safeGet('/sports/football/matches/66')),
            fetchCached('fb-rm', () => safeGet('/sports/football/matches/86')),
            fetchCached('fb-pl', () => safeGet('/sports/football/standings/PL')),
            fetchCached('fb-pd', () => safeGet('/sports/football/standings/PD')),
        ]);

        const content = document.getElementById('sportsContent');
        let html = '';

        // Extract recent and upcoming from correct paths
        const muRecent = muData?.data?.recent || [];
        const muUpcoming = muData?.data?.upcoming || [];
        const rmRecent = rmData?.data?.recent || [];
        const rmUpcoming = rmData?.data?.upcoming || [];

        const allUpcoming = [...muUpcoming, ...rmUpcoming]
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const allRecent = [...muRecent, ...rmRecent]
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        const nextMatch = allUpcoming[0];

        // Hero: next match with crests
        if (nextMatch) {
            html += `<div class="hero-card hero-football">
                <div class="hero-pattern"></div>
                <div class="hero-label">⚽ NEXT MATCH</div>
                <div class="hero-teams-v2">
                    <div class="hero-team-block">
                        ${crestImg(nextMatch.homeTeam?.crest, 56)}
                        <span class="hero-team-name">${shortTeam(nextMatch.homeTeam?.name)}</span>
                    </div>
                    <div class="hero-vs-block">
                        <span class="hero-vs">VS</span>
                        <div class="hero-comp">${nextMatch.competition || ''}</div>
                    </div>
                    <div class="hero-team-block">
                        ${crestImg(nextMatch.awayTeam?.crest, 56)}
                        <span class="hero-team-name">${shortTeam(nextMatch.awayTeam?.name)}</span>
                    </div>
                </div>
                <div class="countdown" id="footballCountdown"></div>
                <div class="hero-meta">${formatDate(nextMatch.date)}</div>
            </div>`;
        } else if (allRecent.length) {
            const last = allRecent[0];
            html += `<div class="hero-card hero-football">
                <div class="hero-pattern"></div>
                <div class="hero-label">⚽ LATEST RESULT</div>
                <div class="hero-teams-v2">
                    <div class="hero-team-block">
                        ${crestImg(last.homeTeam?.crest, 56)}
                        <span class="hero-team-name">${shortTeam(last.homeTeam?.name)}</span>
                    </div>
                    <div class="hero-score-big">${last.score?.fullTime?.home ?? '?'} – ${last.score?.fullTime?.away ?? '?'}</div>
                    <div class="hero-team-block">
                        ${crestImg(last.awayTeam?.crest, 56)}
                        <span class="hero-team-name">${shortTeam(last.awayTeam?.name)}</span>
                    </div>
                </div>
                <div class="hero-meta">${last.competition || ''} · ${formatDate(last.date)}</div>
            </div>`;
        }

        // My Teams Section
        html += '<div class="section-header"><span class="section-emoji">👕</span> My Teams</div>';
        html += '<div class="teams-grid">';

        const plTable = plStandings?.data || [];
        const pdTable = pdStandings?.data || [];

        const teams = [
            { name: 'Man United', short: 'MUFC', recent: muRecent, upcoming: muUpcoming, table: plTable, crest: 'https://crests.football-data.org/66.png', id: 66, teamKey: 'Manchester United' },
            { name: 'Real Madrid', short: 'RMA', recent: rmRecent, upcoming: rmUpcoming, table: pdTable, crest: 'https://crests.football-data.org/86.png', id: 86, teamKey: 'Real Madrid' },
        ];

        teams.forEach((team, i) => {
            const pos = team.table.find(t => t.name && t.name.includes(team.teamKey));
            const last3 = team.recent.slice(0, 3);
            const next = team.upcoming[0];

            // Derive form from recent results
            const form = last3.map(m => {
                const isHome = m.homeTeam?.name?.includes(team.teamKey);
                const hg = m.score?.fullTime?.home ?? 0;
                const ag = m.score?.fullTime?.away ?? 0;
                if (isHome) return hg > ag ? 'W' : hg < ag ? 'L' : 'D';
                return ag > hg ? 'W' : ag < hg ? 'L' : 'D';
            });

            html += `<div class="team-card" style="--i:${i}">
                <div class="team-header">
                    ${crestImg(team.crest, 40)}
                    <div>
                        <div class="team-name">${team.name}</div>
                        ${pos ? `<div class="team-position-badge">#${pos.position} · ${pos.points} pts</div>` : ''}
                    </div>
                </div>
                <div class="form-guide">${form.map(f => formDot(f)).join('') || '<span class="no-data-small">No recent form</span>'}</div>`;

            // Mini recent results
            if (last3.length) {
                html += '<div class="mini-results">';
                last3.forEach(m => {
                    const winner = m.score?.winner;
                    const isHome = m.homeTeam?.name?.includes(team.teamKey);
                    let resultClass = 'draw';
                    if (winner === 'HOME_TEAM') resultClass = isHome ? 'win' : 'loss';
                    else if (winner === 'AWAY_TEAM') resultClass = isHome ? 'loss' : 'win';

                    html += `<div class="mini-result ${resultClass}">
                        ${crestImg(m.homeTeam?.crest, 18)}
                        <span class="mini-score">${m.score?.fullTime?.home ?? '?'}–${m.score?.fullTime?.away ?? '?'}</span>
                        ${crestImg(m.awayTeam?.crest, 18)}
                    </div>`;
                });
                html += '</div>';
            }

            // Next fixture
            if (next) {
                html += `<div class="next-fixture">
                    <span class="next-label">NEXT</span>
                    ${crestImg(next.homeTeam?.crest, 20)}
                    <span class="next-teams">${shortTeam(next.homeTeam?.name)} vs ${shortTeam(next.awayTeam?.name)}</span>
                    ${crestImg(next.awayTeam?.crest, 20)}
                    <span class="next-date">${formatDateShort(next.date)}</span>
                </div>`;
            }

            html += '</div>';
        });
        html += '</div>';

        // Upcoming Fixtures — horizontal scroll
        if (allUpcoming.length) {
            html += '<div class="section-header"><span class="section-emoji">📅</span> Upcoming Fixtures</div>';
            html += '<div class="fixtures-scroll">';
            allUpcoming.forEach((m, i) => {
                html += `<div class="fixture-card" style="--i:${i}">
                    <div class="fixture-comp">${m.competition || ''}</div>
                    <div class="fixture-teams">
                        <div class="fixture-team">
                            ${crestImg(m.homeTeam?.crest, 28)}
                            <span>${shortTeam(m.homeTeam?.name)}</span>
                        </div>
                        <span class="fixture-vs">vs</span>
                        <div class="fixture-team">
                            ${crestImg(m.awayTeam?.crest, 28)}
                            <span>${shortTeam(m.awayTeam?.name)}</span>
                        </div>
                    </div>
                    <div class="fixture-date">${formatDate(m.date)}</div>
                </div>`;
            });
            html += '</div>';
        }

        // Recent Results
        if (allRecent.length) {
            html += '<div class="section-header"><span class="section-emoji">📊</span> Recent Results</div>';
            allRecent.slice(0, 6).forEach((m, i) => {
                const scoreHome = m.score?.fullTime?.home;
                const scoreAway = m.score?.fullTime?.away;
                html += `<div class="result-card" style="--i:${i}">
                    <div class="result-teams">
                        <div class="result-team home">
                            ${crestImg(m.homeTeam?.crest, 24)}
                            <span>${shortTeam(m.homeTeam?.name)}</span>
                        </div>
                        <div class="result-score ${m.score?.winner === 'HOME_TEAM' ? 'home-win' : m.score?.winner === 'AWAY_TEAM' ? 'away-win' : 'drawn'}">
                            ${scoreHome ?? '?'} – ${scoreAway ?? '?'}
                        </div>
                        <div class="result-team away">
                            <span>${shortTeam(m.awayTeam?.name)}</span>
                            ${crestImg(m.awayTeam?.crest, 24)}
                        </div>
                    </div>
                    <div class="result-meta">${m.competition || ''} · ${formatDateShort(m.date)}</div>
                </div>`;
            });
        }

        // Title Race
        const renderTitleRace = (title, table, emoji) => {
            if (!table || !table.length) return '';
            const top6 = table.slice(0, 6);
            const maxPts = top6[0]?.points || 1;
            let s = `<div class="sport-section"><div class="sport-section-title">${emoji} ${title}</div>`;
            top6.forEach((t, i) => {
                const pct = Math.round((t.points / maxPts) * 100);
                s += `<div class="title-race-item" style="--i:${i}">
                    ${crestImg(t.crest, 22)}
                    <span class="title-race-team">${shortTeam(t.name)}</span>
                    <div class="title-race-bar-wrap"><div class="championship-bar"><div class="championship-bar-fill" style="--bar-width:${pct}%;--i:${i};background:var(--sport-primary)"></div></div></div>
                    <span class="title-race-pts">${t.points}</span>
                </div>`;
            });
            s += '</div>';
            return s;
        };

        html += renderTitleRace('Premier League', plTable, '🏴󠁧󠁢󠁥󠁮󠁧󠁿');
        html += renderTitleRace('La Liga', pdTable, '🇪🇸');

        content.innerHTML = html;

        if (nextMatch) {
            const el = document.getElementById('footballCountdown');
            if (el) startCountdown(nextMatch.date, el);
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
        const [liveResp, upcomingResp] = await Promise.all([
            fetchCached('cr-live', () => safeGet('/sports/cricket/live')),
            fetchCached('cr-upcoming', () => safeGet('/sports/cricket/upcoming')),
        ]);

        const content = document.getElementById('sportsContent');
        let html = '';

        const liveMatches = liveResp?.data || [];
        const upcomingMatches = upcomingResp?.data || [];

        // Live hero
        if (Array.isArray(liveMatches) && liveMatches.length) {
            const m = liveMatches[0];
            const t1 = stripTeamCode(m.teams?.[0]);
            const t2 = stripTeamCode(m.teams?.[1]);
            const s1 = m.scores?.[0] || '';
            const s2 = m.scores?.[1] || '';

            html += `<div class="hero-card hero-cricket">
                <div class="hero-pattern"></div>
                <div class="hero-label"><span class="live-dot"></span> LIVE ${matchTypeBadge(m.matchType)}</div>
                <div class="hero-teams-v2">
                    <div class="hero-team-block">
                        ${m.t1img ? `<img class="team-crest" src="${m.t1img}" alt="${t1}" width="48" height="48" onerror="this.style.display='none'">` : ''}
                        <span class="hero-team-name">${t1}</span>
                        <span class="hero-team-score">${s1}</span>
                    </div>
                    <div class="hero-vs-block">
                        <span class="hero-vs">VS</span>
                    </div>
                    <div class="hero-team-block">
                        ${m.t2img ? `<img class="team-crest" src="${m.t2img}" alt="${t2}" width="48" height="48" onerror="this.style.display='none'">` : ''}
                        <span class="hero-team-name">${t2}</span>
                        <span class="hero-team-score">${s2}</span>
                    </div>
                </div>
                <div class="cricket-status-hero">${m.status || ''}</div>
            </div>`;

            // Additional live matches
            if (liveMatches.length > 1) {
                html += '<div class="section-header"><span class="section-emoji">🔴</span> Other Live Matches</div>';
                liveMatches.slice(1).forEach((m, i) => {
                    const t1 = stripTeamCode(m.teams?.[0]);
                    const t2 = stripTeamCode(m.teams?.[1]);
                    html += `<div class="cricket-match-card" style="--i:${i}">
                        <div class="cricket-match-header">
                            <span class="live-badge"><span class="live-dot"></span> LIVE</span>
                            ${matchTypeBadge(m.matchType)}
                        </div>
                        <div class="cricket-match-teams">
                            <div class="cricket-team">
                                ${m.t1img ? `<img class="team-crest" src="${m.t1img}" width="28" height="28" onerror="this.style.display='none'">` : ''}
                                <span class="cricket-team-name">${t1}</span>
                                <span class="cricket-team-score">${m.scores?.[0] || ''}</span>
                            </div>
                            <div class="cricket-team">
                                ${m.t2img ? `<img class="team-crest" src="${m.t2img}" width="28" height="28" onerror="this.style.display='none'">` : ''}
                                <span class="cricket-team-name">${t2}</span>
                                <span class="cricket-team-score">${m.scores?.[1] || ''}</span>
                            </div>
                        </div>
                        <div class="cricket-match-status">${m.status || ''}</div>
                    </div>`;
                });
            }
        } else {
            html += `<div class="hero-card hero-cricket">
                <div class="hero-pattern"></div>
                <div class="hero-label">🏏 CRICKET</div>
                <div class="hero-empty">
                    <div style="font-size:48px;margin-bottom:12px">🏏</div>
                    <div style="font-size:16px;font-weight:600">No Live Matches</div>
                    <div style="font-size:13px;opacity:0.8;margin-top:4px">Check back during match time</div>
                </div>
            </div>`;
        }

        // Match type filter buttons
        if (upcomingMatches.length) {
            const types = ['all', ...new Set(upcomingMatches.map(m => m.matchType?.toLowerCase()).filter(Boolean))];
            html += '<div class="filter-bar">';
            types.forEach(t => {
                const label = t === 'all' ? 'All' : t.toUpperCase();
                html += `<button class="filter-btn ${cricketFilter === t ? 'active' : ''}" onclick="setCricketFilter('${t}')">${label}</button>`;
            });
            html += '</div>';

            // India matches highlighted
            const indiaMatches = upcomingMatches.filter(m =>
                m.teams?.some(t => t.toLowerCase().includes('india'))
            );

            if (indiaMatches.length) {
                html += '<div class="section-header"><span class="section-emoji">🇮🇳</span> India Matches</div>';
                indiaMatches.slice(0, 5).forEach((m, i) => {
                    html += renderUpcomingCricketCard(m, i, true);
                });
            }

            // All upcoming
            html += '<div class="section-header"><span class="section-emoji">📅</span> Upcoming Matches</div>';
            const filtered = cricketFilter === 'all' ? upcomingMatches :
                upcomingMatches.filter(m => m.matchType?.toLowerCase() === cricketFilter);

            if (filtered.length) {
                filtered.slice(0, 10).forEach((m, i) => {
                    html += renderUpcomingCricketCard(m, i, false);
                });
            } else {
                html += emptyState('🏏', 'No Matches', `No ${cricketFilter.toUpperCase()} matches scheduled`);
            }
        }

        content.innerHTML = html || emptyState('🏏', 'No Cricket Data', 'Check back later for updates');

        if (liveMatches.length) {
            autoRefreshTimer = setInterval(() => { cache['cr-live'] = null; renderCricket(); }, 60000);
        }
    } catch (e) {
        console.error('Cricket error:', e);
        showError('Failed to load cricket data.', renderCricket);
    }
}

function setCricketFilter(type) {
    cricketFilter = type;
    renderCricket();
}

function renderUpcomingCricketCard(m, i, highlight) {
    const t1 = m.teams?.[0] || '?';
    const t2 = m.teams?.[1] || '?';
    return `<div class="cricket-match-card ${highlight ? 'india-highlight' : ''}" style="--i:${i}">
        <div class="cricket-match-header">
            ${matchTypeBadge(m.matchType)}
            <span class="cricket-match-date">${formatDateShort(m.date)}</span>
        </div>
        <div class="cricket-match-name">${m.name || `${t1} vs ${t2}`}</div>
        <div class="cricket-match-venue">📍 ${m.venue || 'TBA'}</div>
    </div>`;
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

        const players = rankings?.data || [];
        const tournaments = scores?.data || [];

        // Grand Slam Countdown
        const now = new Date();
        const nextSlam = GRAND_SLAMS_2026.find(gs => new Date(gs.end) > now);
        if (nextSlam) {
            const slamStarted = new Date(nextSlam.start) <= now;
            html += `<div class="grand-slam-hero" style="--slam-color:${nextSlam.color}">
                <div class="hero-pattern"></div>
                <div class="hero-label">${slamStarted ? '🎾 NOW PLAYING' : '🎾 NEXT GRAND SLAM'}</div>
                <div class="slam-name">${nextSlam.country} ${nextSlam.name}</div>
                <div class="slam-venue">${nextSlam.venue} · ${nextSlam.surface}</div>
                ${!slamStarted ? `<div class="countdown" id="tennisCountdown"></div>` : ''}
                <div class="slam-dates">${formatDateShort(nextSlam.start)} – ${formatDateShort(nextSlam.end)}</div>
            </div>`;
        }

        // Player Spotlight — top 3
        const spotlightNames = ['Alcaraz', 'Sinner', 'Zverev'];
        if (players.length) {
            html += '<div class="section-header"><span class="section-emoji">⭐</span> Player Spotlight</div>';
            html += '<div class="player-cards">';
            spotlightNames.forEach((name, i) => {
                const p = players.find(a => (a.name || '').includes(name));
                if (!p) return;
                const flag = TENNIS_PLAYER_FLAGS[p.name] || Object.entries(TENNIS_PLAYER_FLAGS).find(([k]) => k.includes(name))?.[1] || '🎾';
                const movement = p.movement || 0;
                let arrow = '';
                if (movement > 0) arrow = `<span class="position-change up">▲${movement}</span>`;
                else if (movement < 0) arrow = `<span class="position-change down">▼${Math.abs(movement)}</span>`;

                html += `<div class="player-card spotlight" style="--i:${i}">
                    <div class="player-flag">${flag}</div>
                    <div class="player-rank">#${p.rank}</div>
                    <div class="player-name">${p.name}</div>
                    <div class="player-stat">${p.points?.toLocaleString()} pts ${arrow}</div>
                </div>`;
            });
            html += '</div>';

            // ATP Top 10 Leaderboard
            html += '<div class="sport-section" style="--i:1"><div class="sport-section-title">🏆 ATP Top 10</div>';
            html += '<div class="tennis-leaderboard">';
            players.slice(0, 10).forEach((p, i) => {
                const flag = TENNIS_PLAYER_FLAGS[p.name] || '🎾';
                const maxPts = players[0]?.points || 1;
                const pct = Math.round((p.points / maxPts) * 100);
                const movement = p.movement || 0;
                let arrow = '<span class="position-change same">–</span>';
                if (movement > 0) arrow = `<span class="position-change up">▲${movement}</span>`;
                else if (movement < 0) arrow = `<span class="position-change down">▼${Math.abs(movement)}</span>`;

                html += `<div class="leaderboard-row" style="--i:${i}">
                    <span class="lb-rank ${i < 3 ? 'top3' : ''}">${p.rank}</span>
                    <span class="lb-flag">${flag}</span>
                    <div class="lb-info">
                        <span class="lb-name">${p.name}</span>
                        <div class="lb-bar"><div class="lb-bar-fill" style="--bar-width:${pct}%"></div></div>
                    </div>
                    <span class="lb-pts">${p.points?.toLocaleString()}</span>
                    ${arrow}
                </div>`;
            });
            html += '</div></div>';
        }

        // Recent Tournaments
        if (tournaments.length) {
            html += '<div class="section-header"><span class="section-emoji">🏆</span> Recent Tournaments</div>';
            tournaments.slice(0, 6).forEach((t, i) => {
                html += `<div class="tournament-card" style="--i:${i}">
                    <div class="tournament-name">${t.name}</div>
                    <div class="tournament-meta">
                        <span class="tournament-status">${t.status || ''}</span>
                        <span class="tournament-date">${formatDateShort(t.date)}</span>
                    </div>
                </div>`;
            });
        }

        // Grand Slam Calendar
        html += '<div class="sport-section" style="--i:3"><div class="sport-section-title">🎾 2026 Grand Slam Calendar</div>';
        GRAND_SLAMS_2026.forEach((gs, i) => {
            const started = new Date(gs.start) <= now;
            const ended = new Date(gs.end) < now;
            const isActive = started && !ended;
            html += `<div class="slam-calendar-item ${isActive ? 'active' : ''} ${ended ? 'completed' : ''}" style="--slam-color:${gs.color};--i:${i}">
                <div class="slam-color-bar" style="background:${gs.color}"></div>
                <div class="slam-cal-info">
                    <div class="slam-cal-name">${gs.country} ${gs.name}</div>
                    <div class="slam-cal-details">${gs.venue} · ${gs.surface}</div>
                </div>
                <div class="slam-cal-dates">${formatDateShort(gs.start)} – ${formatDateShort(gs.end)}</div>
                ${isActive ? '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' : ''}
            </div>`;
        });
        html += '</div>';

        content.innerHTML = html;

        // Start countdown for next slam
        if (nextSlam && new Date(nextSlam.start) > now) {
            const el = document.getElementById('tennisCountdown');
            if (el) startCountdown(nextSlam.start, el);
        }
    } catch (e) {
        console.error('Tennis error:', e);
        showError('Failed to load tennis data.', renderTennis);
    }
}

// ─── F1 ───
async function renderF1() {
    showSkeletons();
    try {
        const [drivers, constructors, calendar] = await Promise.all([
            fetchCached('f1-drv', () => safeGet('/sports/f1/standings/drivers')),
            fetchCached('f1-con', () => safeGet('/sports/f1/standings/constructors')),
            fetchCached('f1-cal', () => safeGet('/sports/f1/calendar')),
        ]);

        const content = document.getElementById('sportsContent');
        let html = '';

        const races = calendar?.data || [];
        const driverList = drivers?.data || [];
        const consList = constructors?.data || [];
        const now = new Date();
        const nextRace = races.find(r => new Date(r.date) > now);

        // Hero: Season countdown
        if (nextRace) {
            const flag = COUNTRY_FLAGS[nextRace.country] || '🏁';
            html += `<div class="hero-card hero-f1">
                <div class="hero-pattern"></div>
                <div class="hero-label">🏎️ ${driverList.length ? 'NEXT RACE' : 'SEASON 2026'}</div>
                <div class="f1-hero-flag">${flag}</div>
                <div class="f1-hero-race">${nextRace.name}</div>
                <div class="f1-hero-circuit">${nextRace.circuit || ''}</div>
                <div class="countdown" id="f1Countdown"></div>
                <div class="hero-meta">${formatDate(nextRace.date + 'T' + (nextRace.time || '00:00:00Z'))}</div>
            </div>`;
        }

        // Pre-season info (if no standings)
        if (!driverList.length) {
            html += `<div class="season-info">
                <div class="season-info-icon">🏁</div>
                <div class="season-info-content">
                    <div class="season-info-title">2026 Season Preview</div>
                    <div class="season-info-text">
                        Major regulation changes for 2026 bring new era of F1 with simplified aerodynamics, 
                        active aero, and increased electrical power. New engine suppliers including Audi join the grid.
                        Reigning champion Max Verstappen looks to defend his title.
                    </div>
                    <div class="season-info-champion">
                        <span class="champion-badge">🏆 2025 Champion</span>
                        <span class="champion-name">Max Verstappen</span>
                        <span class="champion-team" style="color:#3671C6">Red Bull Racing</span>
                    </div>
                </div>
            </div>`;
        }

        // Race Calendar — the centerpiece
        if (races.length) {
            html += '<div class="section-header"><span class="section-emoji">📅</span> Race Calendar</div>';
            html += '<div class="f1-calendar">';
            let nextFound = false;
            races.forEach((r, i) => {
                const raceDate = new Date(r.date);
                const completed = raceDate < now;
                const isNext = !completed && !nextFound;
                if (isNext) nextFound = true;
                const flag = COUNTRY_FLAGS[r.country] || '🏁';

                html += `<div class="f1-race-item ${completed ? 'completed' : ''} ${isNext ? 'next-race' : ''}" style="--i:${Math.min(i, 15)}">
                    <span class="race-round-badge">R${r.round}</span>
                    <span class="race-flag">${flag}</span>
                    <div class="race-info">
                        <span class="race-name">${r.name}</span>
                        <span class="race-circuit">${r.circuit || ''}</span>
                    </div>
                    <div class="race-date-block">
                        <span class="race-date">${formatDateShort(r.date)}</span>
                        ${isNext ? '<span class="next-badge">NEXT</span>' : ''}
                        ${completed ? '<span class="done-check">✓</span>' : ''}
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        // Driver Standings (if available)
        if (driverList.length) {
            html += '<div class="sport-section" style="--i:1"><div class="sport-section-title">🏆 Driver Standings</div>';
            driverList.slice(0, 10).forEach((d, i) => {
                const name = d.name || d.driver?.familyName || '?';
                const team = d.team || d.constructors?.[0]?.name || '';
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

        // Constructor Standings (if available)
        if (consList.length) {
            const maxPts = parseFloat(consList[0]?.points) || 1;
            html += '<div class="sport-section" style="--i:2"><div class="sport-section-title">🏗️ Constructor Standings</div>';
            consList.forEach((c, i) => {
                const name = c.name || c.constructor?.name || '?';
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

        content.innerHTML = html;

        // Countdown
        if (nextRace) {
            const el = document.getElementById('f1Countdown');
            if (el) startCountdown(nextRace.date + 'T' + (nextRace.time || '00:00:00Z'), el);
        }
    } catch (e) {
        console.error('F1 error:', e);
        showError('Failed to load F1 data.', renderF1);
    }
}
