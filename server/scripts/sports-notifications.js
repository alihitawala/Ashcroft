#!/usr/bin/env node
/**
 * Sports Hub — Live Notification Checker
 * 
 * Standalone script that checks for live sports events and prints
 * notification messages to stdout. Designed to run via cron every 15 min.
 * 
 * Exit codes: 0 = success, 1 = error
 * Output: One notification per line to stdout (empty if nothing notable)
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ─── Load environment ───
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim();
    });
}

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const CRICAPI_KEY = process.env.CRICAPI_KEY || '';

// ─── State file to avoid duplicate notifications ───
const STATE_FILE = path.join(__dirname, '.sports-notify-state.json');
function loadState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
    catch { return { sent: {}, lastRun: 0 }; }
}
function saveState(state) {
    state.lastRun = Date.now();
    // Prune entries older than 6 hours
    const cutoff = Date.now() - 6 * 3600 * 1000;
    for (const k of Object.keys(state.sent)) {
        if (state.sent[k] < cutoff) delete state.sent[k];
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── HTTP helper ───
function fetch(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers, timeout: 10000 }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
                try { resolve(JSON.parse(body)); }
                catch { resolve(body); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

const notifications = [];
const state = loadState();

function notify(key, msg) {
    if (state.sent[key]) return; // Already sent
    state.sent[key] = Date.now();
    notifications.push(msg);
}

// ─── 1. Football: Man Utd (66) & Real Madrid (86) ───
async function checkFootball() {
    if (!FOOTBALL_API_KEY) return;
    try {
        const data = await fetch('https://api.football-data.org/v4/matches?status=LIVE', {
            'X-Auth-Token': FOOTBALL_API_KEY
        });
        if (!data.matches) return;

        const watchTeams = { 66: 'Man Utd', 86: 'Real Madrid' };
        for (const m of data.matches) {
            const homeId = m.homeTeam?.id;
            const awayId = m.awayTeam?.id;
            const watchedId = watchTeams[homeId] ? homeId : watchTeams[awayId] ? awayId : null;
            if (!watchedId) continue;

            const home = m.homeTeam?.shortName || m.homeTeam?.name || '???';
            const away = m.awayTeam?.shortName || m.awayTeam?.name || '???';
            const hg = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? '?';
            const ag = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? '?';
            const min = m.minute || '?';
            const isManUtd = watchTeams[watchedId] === 'Man Utd';
            const emoji = isManUtd ? '🔴' : '⚪';

            // Match started notification
            const startKey = `fb-start-${m.id}`;
            notify(startKey, `⚽${emoji} KICK OFF! ${home} vs ${away} is LIVE! Let's gooo 🏟️`);

            // Goal notifications — key includes score so new goals trigger
            const goalKey = `fb-score-${m.id}-${hg}-${ag}`;
            if (hg + ag > 0) {
                notify(goalKey, `⚽${emoji} GOAAAAL! ${home} ${hg}-${ag} ${away} (${min}') 🚀🔥`);
            }
        }
    } catch (e) {
        // Silently skip — API might be rate-limited
    }
}

// ─── 2. Cricket: India matches ───
async function checkCricket() {
    if (!CRICAPI_KEY) return;
    try {
        const data = await fetch(`https://api.cricapi.com/v1/currentMatches?apikey=${CRICAPI_KEY}&offset=0`);
        if (!data.data) return;

        for (const m of data.data) {
            if (!m.matchStarted || m.matchEnded) continue;
            // Check if India is playing
            const teams = (m.teams || []).join(' ').toLowerCase();
            if (!teams.includes('india')) continue;

            const key = `cricket-${m.id}-${m.score?.[0]?.r || 0}-${m.score?.[0]?.w || 0}`;
            const status = m.status || 'Match in progress';
            const score = (m.score || []).map(s => `${s.inning}: ${s.r}/${s.w} (${s.o} ov)`).join(' | ');

            notify(key, `🏏 India LIVE! ${score || status} 🇮🇳\n${m.name || ''}`);
        }
    } catch (e) { /* skip */ }
}

// ─── 3. F1: Sessions starting in next 30 min ───
async function checkF1() {
    try {
        const now = new Date();
        const data = await fetch('https://api.openf1.org/v1/sessions?year=2026');
        if (!Array.isArray(data)) return;

        for (const s of data) {
            const start = new Date(s.date_start);
            const diffMin = (start - now) / 60000;

            if (diffMin > 0 && diffMin <= 30) {
                const timeStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' });
                const key = `f1-${s.session_key}`;
                const emoji = s.session_name?.toLowerCase().includes('race') ? '🏁' : '🏎️';
                notify(key, `${emoji} Lights out in ${Math.round(diffMin)} minutes! ${s.session_name} — ${s.meeting_name || 'Grand Prix'} starts at ${timeStr} PT 🏎️💨`);
            }
        }
    } catch (e) { /* skip */ }
}

// ─── 4. Tennis: Alcaraz, Sinner, Zverev at big events ───
async function checkTennis() {
    try {
        // ESPN tennis scoreboard
        const data = await fetch('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard');
        if (!data.events) return;

        const watchPlayers = ['alcaraz', 'sinner', 'zverev'];
        const bigEvents = ['grand slam', 'atp 1000', 'masters', 'open', 'wimbledon', 'roland garros', 'us open', 'australian open'];

        for (const event of data.events) {
            const eventName = (event.name || '').toLowerCase();
            const isBig = bigEvents.some(e => eventName.includes(e));
            // Check even non-big events for these top players

            for (const comp of (event.competitions || [])) {
                if (comp.status?.type?.state !== 'in') continue; // Only live

                const players = (comp.competitors || []).map(c => ({
                    name: c.athlete?.displayName || c.team?.displayName || '?',
                    score: c.score || '?',
                    sets: c.linescores?.map(l => l.value).join(' ') || ''
                }));

                const isWatched = players.some(p => 
                    watchPlayers.some(w => p.name.toLowerCase().includes(w))
                );

                if (!isWatched) continue;

                const p1 = players[0], p2 = players[1] || { name: '?', score: '?' };
                const matchDetail = players.map(p => `${p.name} ${p.sets || p.score}`).join(' vs ');
                const key = `tennis-${comp.id}-${p1.score}-${(p2).score}`;
                const tournament = event.shortName || event.name || 'ATP';

                notify(key, `🎾 ${matchDetail} — LIVE at ${tournament} 🔥`);
            }
        }
    } catch (e) { /* skip */ }
}

// ─── Main ───
async function main() {
    await Promise.allSettled([
        checkFootball(),
        checkCricket(),
        checkF1(),
        checkTennis()
    ]);

    saveState(state);

    if (notifications.length > 0) {
        console.log(notifications.join('\n'));
    }
}

main().catch(e => {
    console.error('Sports notification error:', e.message);
    process.exit(1);
});
