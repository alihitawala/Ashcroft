# Sports Hub — Design Document

## Overview
The most fun, animated, and engaging section of ashcroft.cloud. Four sport tabs with live data, animations, countdowns, and personality.

## Tab Structure
**⚽ Football | 🏏 Cricket | 🎾 Tennis | 🏎️ F1**

Each tab has its own color theme that washes over the page on switch.

## Color Themes per Tab
- ⚽ Football: Pitch green `#2D8544` with red accents
- 🏏 Cricket: Deep blue `#1A237E` with gold `#FFD700` accents  
- 🎾 Tennis: Grass green `#4CAF50` (shifts by surface — clay orange, hard blue)
- 🏎️ F1: Carbon dark `#1E1E1E` with racing red `#FF1801`

## Animations & Energy
- Page entry: cards fly in with staggered spring animations (CSS keyframes)
- Tab switch: smooth crossfade with sport-themed color wash
- Score updates: numbers flip like old-school scoreboard (CSS 3D transforms)
- Countdown timers: smooth ticking, pulse animation when < 1 hour
- Win celebrations: confetti burst via canvas when your team wins
- Pull-to-refresh: sport-themed loading spinner
- Cards: subtle hover lift + glow on interactive elements
- Live indicator: pulsing red dot CSS animation

## Data Sources & APIs

### Football (soccer)
- **football-data.org** (API key: in .env) — standings, match schedules, results, team details
  - EPL: competition code `PL` (id 2021)
  - La Liga: competition code `PD` (id 2014)
  - Man Utd: team id 66
  - Real Madrid: team id 86
  - Free tier: 10 requests/minute
- **ESPN API** (no key) — live scores, match events
  - `site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard`
  - `site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard`

### Cricket
- **CricAPI** (key in .env) — live scores, upcoming matches, series
  - `/v1/cricScore` for live scores
  - `/v1/series` for upcoming series
  - IPL coverage included

### Tennis
- **ESPN ATP API** (no key) — scores, rankings, tournament schedules
  - `site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard`
  - `site.api.espn.com/apis/site/v2/sports/tennis/atp/rankings`
- Focus players: Alcaraz, Sinner, Zverev + top 10 ATP

### F1
- **OpenF1** (no key) — live session data, timing, telemetry
  - `api.openf1.org/v1/sessions` — session schedule
  - `api.openf1.org/v1/drivers` — driver info
  - `api.openf1.org/v1/position` — race positions
- **Jolpica Ergast** (no key) — calendar, results, standings
  - `api.jolpi.ca/ergast/f1/2026/` — season data
  - `api.jolpi.ca/ergast/f1/current/driverStandings`
  - `api.jolpi.ca/ergast/f1/current/constructorStandings`
- Focus: Verstappen, Red Bull, Ferrari, McLaren, Mercedes

## Backend Architecture

### Route: `/api/sports/:sport`
Single route file: `server/routes/sports.js`

### Endpoints:
```
GET /api/sports/football/standings/:competition  (PL or PD)
GET /api/sports/football/matches/:team           (66 or 86)
GET /api/sports/football/live
GET /api/sports/football/title-race/:competition

GET /api/sports/cricket/live
GET /api/sports/cricket/upcoming
GET /api/sports/cricket/ipl                      (when in season)

GET /api/sports/tennis/rankings
GET /api/sports/tennis/scores
GET /api/sports/tennis/calendar
GET /api/sports/tennis/player/:name

GET /api/sports/f1/standings/drivers
GET /api/sports/f1/standings/constructors
GET /api/sports/f1/calendar
GET /api/sports/f1/race/:round/results
GET /api/sports/f1/next-session

GET /api/sports/next-up                          (cross-sport: closest upcoming event)
```

### Caching Strategy
All external API responses cached in-memory (node-cache or Map) with TTL:
- Live scores: 60 seconds
- Standings: 15 minutes
- Calendar/schedule: 1 hour
- Results: 30 minutes

### Database (optional, for notifications)
```sql
CREATE TABLE sports_notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  sport VARCHAR(20) NOT NULL,        -- football, cricket, tennis, f1
  event_type VARCHAR(30) NOT NULL,   -- goal, wicket, race_start, match_start
  team_or_player VARCHAR(100),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Frontend Architecture

### Files:
- `/home/ashcroft/www/app/sports.html` — page shell
- `/home/ashcroft/www/app/css/sports.css` — all styles including animations
- `/home/ashcroft/www/app/js/sports.js` — all tab logic, data fetching, rendering

### Tab Implementation:
- Tab bar at top with sport icons + names
- Active tab has colored underline + icon color matching sport theme
- CSS custom properties change on tab switch (smooth transition)
- Content area crossfades between tabs
- Last active tab stored in localStorage

### ⚽ Football Tab Content:
1. **Hero Card** — Next/Live match for Man Utd or Real Madrid (whichever is sooner)
   - Team crests, kickoff countdown (or LIVE pulsing dot + score)
   - Animated flip clock countdown
2. **My Teams** — Two cards side by side
   - Last result (W/D/L color flash), next fixture, form guide (last 5), league position + arrow
3. **Title Race** — EPL + La Liga
   - Top 6 mini table with points, animated bar visualization
   - Games in hand indicator
4. **Recent Results** — Last 3 matches for each team

### 🏏 Cricket Tab Content:
1. **Live Match Card** (if any) — Scorecard with batting/bowling team, RR, overs
   - Animated ball icons for last few deliveries
2. **Upcoming Matches** — India + IPL focused
   - Countdown cards with flags/team logos
3. **Series Tracker** — Current series scoreline with flags
4. **IPL Section** (April-May) — Points table, fixtures, Orange/Purple cap

### 🎾 Tennis Tab Content:
1. **Tournament Hero** — Current/next major tournament
   - Grand Slam countdown with venue background gradient
   - If during slam: bracket/draw preview
2. **Player Spotlight** — Alcaraz, Sinner, Zverev cards
   - Ranking, season W/L, titles, trend sparkline
3. **ATP Top 10** — Rankings with movement arrows, animated row shifts
4. **Calendar** — ATP 1000 + Grand Slams timeline
   - Completed ✅ / Current 🔴 / Upcoming ⚪

### 🏎️ F1 Tab Content:
1. **Race Weekend Hero** (on race weekends) — Session countdown
   - FP1→FP2→FP3→Quali→Race timeline with active indicator
   - Circuit name + country flag
2. **Championship Standings** — Drivers top 10 + Constructors
   - Team color accents on each row
   - Points gap visualization bar
3. **Race Calendar** — All races, circuit icons
   - Completed/Next/Upcoming indicators
   - Click for results
4. **Last Race Results** — Podium card with position changes

### Sound FX (toggle in settings):
- Football: crowd roar on goal
- Cricket: stumps hit sound on wicket  
- Tennis: ball hit sound
- F1: engine rev on tab entry
- Stored in `/home/ashcroft/www/public/sounds/` as small MP3s (< 50KB each)

## Telegram Notifications (via cron)
- Goal alerts for Man Utd + Real Madrid
- Match start reminders (30 min before)
- Race start reminders for F1
- Grand Slam match alerts for followed players
- India cricket match start alerts

## Navigation Integration
- Add "Sports" to sidebar nav (trophy icon)
- Add to bottom nav (replacing one of the current items, or adding to "More" menu)
- Dashboard widget: "Next Up" showing closest upcoming event across all sports

## File Structure
```
/home/ashcroft/www/
├── app/
│   ├── sports.html
│   ├── css/sports.css
│   └── js/sports.js
├── server/
│   ├── routes/sports.js
│   └── __tests__/unit/sports.test.js
└── public/
    └── sounds/
        ├── goal.mp3
        ├── wicket.mp3
        ├── tennis-hit.mp3
        └── f1-rev.mp3
```
