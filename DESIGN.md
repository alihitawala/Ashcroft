# ashcroft.cloud — Design Document

---

## Decisions Made ✅

1. **Stack:** Next.js + PostgreSQL + NextAuth + Tailwind
2. **Auth:** Email/password (two users only — Ali & Saba)
3. **User model:** Role-based views
   - **Ali** (admin) — sees everything
   - **Saba** (family) — shared sections + her personal sections
   - Same URLs, content adapts per user
   - Ali controls section visibility per role
4. **Shared sections:** Grocery, garden, etc. — same data for both
5. **Personal sections:** Each user can have sections only they see
6. **Design doc stays local** — never served publicly
7. **Mobile-first** — responsive design + native app wrapper

---

## Architecture

```
                    ┌─────────────┐
                    │   Nginx     │ SSL + reverse proxy
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Next.js    │ Port 3000
                    │  (App)      │ SSR + API routes
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │ Local DB
                    └─────────────┘

Mobile:
┌──────────────────────┐
│ Capacitor (native)   │ iOS + Android shell
│  └─ WebView          │ Loads ashcroft.cloud
│     └─ Next.js PWA   │ Same codebase, native feel
└──────────────────────┘
```

---

## Mobile Strategy

| Option | Pros | Cons |
|--------|------|------|
| **PWA (Progressive Web App)** | Zero app store, installable from browser, works offline, push notifications (Android), no separate code | iOS push notifications limited, no app store presence |
| **Capacitor (recommended)** | Wraps our web app in native shell, full native API access (camera, notifications, biometrics), one codebase, publishable to App Store & Play Store | Thin native layer to maintain, need dev accounts ($25 Google, $99/yr Apple) |
| **React Native** | True native UI, best performance | Completely separate codebase, double the work |

**Recommendation: PWA first, Capacitor when ready for app stores.**
- Phase 1: Build mobile-responsive web app + PWA manifest (installable immediately)
- Phase 2: Wrap in Capacitor for native app stores when we need native APIs

Both use the exact same web codebase — zero duplication.

---

## Features & Sections

### 🌐 Public Home (`/`)
**Audience:** Everyone (no login required)
- Clean landing page — what ashcroft.cloud is about
- Widget-based layout, configurable by Ali (admin)

**Public Widgets:**
- ⚽ Sports updates — scores, upcoming matches (Man Utd, Real Madrid, Cricket, Tennis)
- 📈 Stock tickers — companies Ali invests in (delayed data, not real-time to minimize API calls)
- 🌤️ Weather — Sunnyvale current + forecast
- 🇺🇸 US News — top 5 headlines from major sources
- 🇮🇳 India News — top 5 headlines from major sources
- 📅 Upcoming public events
- Widget topics are configurable by admin (e.g., swap "India News" for "H1B News")

**Rules:**
- ⛔ NEVER shows user-specific data, personal info, or anything behind auth
- All data sourced from publicly available APIs/feeds
- Widgets are configurable: admin can add/remove/rename widget topics via settings
- Designed to be useful even for a random visitor

### 🏠 Dashboard (`/dashboard`)
**Audience:** Both (personalized per user, requires login)
- Quick overview: today's tasks, upcoming events, weather
- Recent activity
- Quick-add buttons (task, grocery item, note)
- Widgets configurable per user
- Summary view — at-a-glance status of all sections

### ✅ Tasks (`/tasks`)
**Audience:** Both (separate task lists + shared lists)
- Create, edit, delete, complete tasks
- Priority levels (urgent, high, normal, low)
- Due dates + reminders
- Tags/categories
- Shared lists (e.g., "House" tasks both can see)
- Personal lists (only visible to owner)
- Recurring tasks

### 📋 Kanban Board (`/kanban`)
**Audience:** Both (shared boards + personal boards)
- Drag-and-drop columns
- **Default board: "Ali & Bittu"** — our shared project tracker
  - Columns: Backlog → To Do → In Progress → Review → Done
  - Cards created from conversations that need follow-up
  - Bittu (me) can pick up Backlog/To Do items independently
  - Ali moves cards, adds context, reprioritizes
- Multiple boards (e.g., "Home Projects", "Coding", "Garden", "Ali & Bittu")
- Card details: description, checklist, due date, labels, comments
- Labels for categorization (website, home automation, infra, etc.)
- Optionally share specific boards with Saba
- API access so Bittu can read/update cards programmatically

### 🌳 Garden Tracker (`/garden`)
**Audience:** Both
**Core flow:** Ali sends photo via Telegram/WhatsApp → Bittu identifies plant → updates DB → provides recommendations

- **AI-powered plant identification** from photos (Bittu's vision)
- Inventory of all fruit trees (species, variety, location, age)
- Planting date + growth tracking
- **Photo timeline per plant** — visual health history
- **Health trend analysis** — positive/negative/stable based on photo comparisons over time
- **Smart watering recommendations** — based on species + season + local rainfall (Open-Meteo API)
- **Fertilizer recommendations** — what to buy, when to apply, links to Home Depot
- Harvest tracking (when, how much)
- Seasonal care reminders (auto-generated based on species + zone)
- Backyard map/layout view (future)
- Dashboard widget shows plants needing attention

**How it works:**
1. Ali sends a plant photo via Telegram/WhatsApp
2. Bittu analyzes the image (plant ID, health assessment)
3. If new plant → creates entry, asks for location/name
4. If existing → matches to DB, updates health record
5. Compares with previous photos → trend direction
6. Checks weather data → watering/care recommendation
7. All data visible on /garden with photo timeline + vitals

### 🛒 Grocery & Shopping (`/grocery`)
**Audience:** Both
- Shared grocery list (real-time sync)
- Categories (produce, dairy, pantry, etc.)
- Quick add (voice? text input)
- Check off items while shopping
- Recurring items ("we always buy milk")
- Multiple lists (Costco vs Safeway vs Indian store)
- History — what did we buy last time?

### 📝 Notes (`/notes`)
**Audience:** Both (personal + shared)
- Quick capture — text notes
- Shared notes (e.g., recipes, house info)
- Personal notes (private to each user)
- Search across all notes
- Tags/folders

### ⚽ Sports Tracker (`/sports`)
**Audience:** Ali (admin only)
- Upcoming matches: Manchester United, Real Madrid, Cricket, Tennis
- Live scores / results
- Match reminders (push notification → Telegram)
- Season standings
- Data source: API integration (football-data.org, cricinfo, etc.)

### 📸 Photo Pipeline (`/photos`) — Future
**Audience:** Ali (admin only)
- Connect Adobe Lightroom/Camera
- Auto-import from camera SD card
- Batch post-processing presets
- Gallery view of processed photos
- Share select photos with Saba

### ⚡ Automation & Alerts
**Audience:** Ali (admin, configurable)
- Morning briefing (Telegram + WhatsApp): weather, tasks, calendar, sports
- Daily routine notifications
- Custom alerts & reminders
- Bittu (me!) sends these via Telegram + WhatsApp
- Both notification channels run in parallel

### 📅 Events & Reminders (`/events`)
**Audience:** Both (shared + personal)
- Add events with dates: "Akash's birthday party Feb 25th"
- Recurring reminders: weekly, monthly, yearly
  - "Put garbage out" — synced with Sunnyvale city schedule
  - "Anniversary", "Birthdays", etc.
- Shared events (both Ali & Saba see + get reminded)
- Personal events (only the creator sees)
- Smart reminders: configurable lead time (1 day before, 2 hours before, etc.)
- Notifications via Telegram + WhatsApp
- Calendar view (month/week)
- Upcoming events widget on Dashboard
- Integration: auto-fetch city schedules (garbage, recycling, street sweeping)

### ⚙️ Settings (`/settings`)
**Audience:** Both (own settings)
- Theme picker (dark, light, custom themes)
- Notification preferences
- Profile management
- Admin panel (Ali only): manage users, sections, visibility

---

## User Roles & Section Visibility

| Section | Public 🌐 | Ali (admin) | Saba (family) | Notes |
|---------|:---------:|:-----------:|:-------------:|-------|
| Public Home | ✅ | ✅ | ✅ | News, stocks, sports, weather widgets |
| Dashboard | ❌ | ✅ | ✅ | Personalized widgets + summary |
| Tasks | ❌ | ✅ | ✅ | Shared + personal lists |
| Events & Reminders | ❌ | ✅ | ✅ | Shared + personal, recurring |
| Smart Home | ❌ | ✅ | 🔘 select | Ali full control, Saba gets select devices |
| Kanban | ❌ | ✅ | 🔘 optional | Ali can share specific boards |
| Garden | ❌ | ✅ | ✅ | Shared data |
| Grocery | ❌ | ✅ | ✅ | Shared lists, real-time, offline |
| Notes | ❌ | ✅ | ✅ | Shared + personal |
| Sports | ❌ | ✅ | ❌ | Ali only (public gets generic widget) |
| Photos | ❌ | ✅ | ❌ | Ali only (for now) |
| Automation | ❌ | ✅ | ❌ | Ali only |
| Settings | ❌ | ✅ | ✅ | Own settings each |

**Hard rule:** Public view NEVER exposes user-indexed data. Period.

---

## Theming System

- CSS variables define all colors, spacing, typography
- Theme stored per user in DB
- Switch via Settings UI or API call
- Predefined themes:
  - 🌑 **Dark** (default)
  - ☀️ **Light**
  - 🌊 **Ocean**
  - 🌲 **Forest**
- Custom theme support later (pick your own colors)

---

## Data Model (High Level)

```
Users
├── id, email, password_hash, name, role, theme, settings

Tasks
├── id, title, description, priority, due_date, status
├── list_id → TaskList, created_by → User, assigned_to → User

TaskLists
├── id, name, type (personal|shared), owner → User

KanbanBoards
├── id, name, owner → User, shared_with[]

KanbanColumns
├── id, board_id, name, position

KanbanCards
├── id, column_id, title, description, position, due_date

GardenTrees
├── id, species, variety, location, planted_date, notes, photos[]

GardenLogs
├── id, tree_id, type (water|fertilize|harvest|note), date, details

GroceryLists
├── id, name, type (personal|shared)

GroceryItems
├── id, list_id, name, category, quantity, checked, recurring

Notes
├── id, title, content, owner → User, shared, tags[]

Events
├── id, title, date, time, type (one-time|recurring), recurrence_rule
├── owner → User, shared (bool), reminder_before[] (e.g., [1440, 120] = 1 day + 2 hrs)
├── category (birthday|holiday|city-schedule|custom)

SportsSubscriptions
├── id, user_id, team/league, notify_method
```

---

## Build Order

| Phase | What | Details |
|-------|------|---------|
| **Phase 0** | Design mocks | Wireframes/mockups for all views before coding |
| **Phase 1** | Public landing page + widgets | News, stocks, sports, weather — the public face |
| **Phase 2** | Auth system | Email/password login, role-based access |
| **Phase 3** | User dashboard + summary view | Personalized home, at-a-glance status |
| **Phase 4** | Tasks | Shared + personal task lists |
| **Phase 5** | Grocery | Shared lists, offline support, categories |
| **Phase 6** | Garden Tracker | Tree inventory, care logs, harvest tracking |
| **Phase 7** | Kanban Board | Drag-and-drop project boards |
| **Phase 8** | Sports Tracker | API integrations, match alerts |
| **Phase 9** | Photo Pipeline | Adobe integration |
| **Phase 10** | Native apps (Capacitor) | iOS + Android app store deployment |

---

## Public Widget System

Widgets are the building blocks of the public page. Admin (Ali) can:
- Add/remove widgets
- Change widget topics (e.g., "India News" → "H1B News")
- Reorder widgets
- Configure refresh intervals per widget (to control API call frequency)

| Widget | Data Source | Refresh |
|--------|-----------|---------|
| Sports scores | football-data.org, cricinfo API | Every 30 min |
| Stock tickers | Yahoo Finance / Alpha Vantage (delayed) — GOOGL, AAPL, ACHR, AVGO, CRSP, MRVL, META, RBLX, ROKU, SHOP, TSLA, VOO + trending | Every 15 min |
| Weather | Open-Meteo (free, no key) | Every 1 hr |
| US News | RSS feeds (AP, Reuters, NPR, CNN, NYT) | Every 1 hr |
| India News | RSS feeds (NDTV, TOI, Hindu, IE, HT) | Every 1 hr |
| Custom topic | News API / RSS with keyword filter | Configurable |

Data is cached server-side to minimize external API calls.

---

## Notifications

| Channel | Status | Use for |
|---------|--------|---------|
| Telegram | ✅ Connected | Morning briefing, alerts, reminders |
| WhatsApp | ⏳ To set up | Same as Telegram, parallel delivery |
| Push (PWA) | Phase 2+ | In-app notifications |
| Email | Future | Weekly digests, non-urgent |

---

## 🏠 Smart Home (`/home`)
**Audience:** Ali (admin) — select controls shareable with Saba later
**Middleware:** Home Assistant (local) — single API for all devices

**Dashboard widgets (top 4-5 on main dashboard):**
- 🔒 Front door lock status (Nest)
- 🚗 Garage door status (myQ)
- 💡 Lights quick toggle — Family room, Kitchen (Hue)
- 📹 Camera snapshot — front door (eufy)

**Dedicated /home section — all devices:**
| Device | Brand | Controls |
|--------|-------|----------|
| Lights — Family, Kitchen, Garage | Philips Hue | On/off, brightness, color, scenes |
| Front door lock | Google Nest | Lock/unlock, status, history |
| Cameras | eufy | Live view (RTSP), snapshots, motion alerts |
| Vacuum | Roborock | Start/stop/dock, view map, schedule |
| Garage door | myQ | Open/close, status |
| Floor heating — bathroom | Schluter | On/off, temperature |
| Irrigation — front yard | Rachio | Run zones, schedules, weather data |
| Garden lights — backyard | Dewenwils | On/off, schedule |
| Refrigerator | HomeConnect | Status, temp, notifications |
| Dishwasher | HomeConnect | Status, cycle notifications |
| Everything | Google Home | Routines, grouped control |

---

## Architecture Principles

1. **No one-way doors** — every design decision should be reversible
2. **Component-based UI** — reusable components make redesigns easy (swap styles, keep logic)
3. **Separation of concerns** — data layer (API/DB) is independent of presentation
4. **Theming via CSS variables** — full visual redesign = just changing variable values
5. **Mobile-first responsive** — design for phone, enhance for desktop
6. **PWA first, Capacitor later** — same codebase for web + native

**Redesign should be easy because:**
- Tailwind + CSS variables = change look without touching logic
- Component library = swap out UI pieces independently
- API layer is stable — frontend is the only thing that changes
- Design tokens (colors, spacing, typography) defined in one place

---

## Flight Tracker ✈️ (Backlog)

### Overview
Track flights for specific routes/dates, monitor price trends over time, and alert when prices hit a buy range. Eventually support quick booking via deep links.

### API Options Evaluated

| Provider | Free Tier | Paid | Pros | Cons |
|----------|-----------|------|------|------|
| **Amadeus Self-Service** | 2,000 calls/month (test env) | Production: pay-per-use (~€0.01-0.04/call) | Official GDS data, real-time prices, booking capability, well-documented REST API | Test env = fake data; production requires business verification |
| **SerpApi (Google Flights)** | 100 searches/month | $50/mo = 5,000 searches | Scrapes actual Google Flights results, best price accuracy, includes price insights | Scraper (fragile long-term), no direct booking, expensive at scale |
| **Tequila by Kiwi.com** | Free (affiliate model) | Commission on bookings | Free unlimited searches, real booking, multi-city/combo trips | Must be affiliate partner, data skewed toward Kiwi inventory |
| **Sky-Scrapper / Skyscanner (RapidAPI)** | 50 req/day (free) | $10/mo = 1,000/day | Good coverage, price comparison | Via RapidAPI middleman, rate limits tight on free tier |
| **Google Flights (ITA Matrix)** | N/A | N/A | Best data | No public API — SerpApi is the workaround |
| **Aviationstack** | 100 req/month | $50/mo | Flight status/tracking | NOT for price search — only schedules & status |

### Recommended Strategy: **Amadeus (primary) + SerpApi (validation)**

**Phase 1 — MVP (Amadeus test environment):**
- Use Amadeus Self-Service API (Flight Offers Search v2)
- Free 2,000 calls/month in test mode — enough for prototyping
- Build the DB schema, tracking logic, and alert system
- Test data won't have real prices, but validates the integration

**Phase 2 — Production:**
- Apply for Amadeus production key (requires business info)
- OR switch to SerpApi Google Flights (100 free/month, ~3 checks/day)
- For personal use: 2-3 route checks/day = ~90/month fits SerpApi free tier
- SerpApi gives actual Google Flights prices — most accurate for consumers

**Phase 3 — Smart alerts:**
- Store price history in PostgreSQL, detect trends
- Alert via Telegram when price drops below threshold or hits historical low
- Include "Book now" deep link to Google Flights or airline site

### Budget Estimate (Personal Use)
- **Tracking 2-3 routes, checking 2x/day** = ~150-180 API calls/month
- **SerpApi free tier** (100/mo) works for 1-2 routes at 2x/day
- **Amadeus production** would cost ~€1.80-7.20/month for same volume
- **Tequila/Kiwi** is free unlimited but affiliate-only

### Data Model (Draft)

```sql
-- Routes to watch
CREATE TABLE flight_watches (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  origin VARCHAR(3) NOT NULL,         -- IATA code (SFO, SJC)
  destination VARCHAR(3) NOT NULL,    -- IATA code (DEL, UDR)
  depart_date DATE,                   -- NULL = flexible
  return_date DATE,                   -- NULL = one-way
  passengers INT DEFAULT 1,
  cabin_class VARCHAR(20) DEFAULT 'economy',
  max_price NUMERIC(10,2),            -- alert threshold
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Price snapshots
CREATE TABLE flight_prices (
  id SERIAL PRIMARY KEY,
  watch_id INT REFERENCES flight_watches(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  airline VARCHAR(100),
  stops INT,
  duration_min INT,
  departure_time TIMESTAMP,
  source VARCHAR(20),                 -- 'amadeus', 'serpapi', 'kiwi'
  raw_data JSONB,                     -- full API response
  fetched_at TIMESTAMP DEFAULT NOW()
);
```

### UX
- **App page:** `/app/flights.html` — list active watches, price chart per route, add new watch
- **Telegram alerts:** "✈️ SFO→DEL dropped to $680 (was $750 last week). [Book on Google Flights](link)"
- **Morning briefing:** Include active flight watches with current best price + trend arrow
- **Dashboard widget:** Cheapest current price per watched route

### Fetch Strategy
- Cron job (similar to weather/stocks): check prices 2x/day (morning + evening)
- Skip routes with `depart_date` in the past → auto-deactivate
- Store every price point for trend analysis
- Gate API calls: don't check if last check was <6 hours ago

---

## Phase: Photo Gallery & AI Search

### Overview
Self-hosted Google Photos alternative on ashcroft.cloud. Lightroom-edited photos uploaded to the server, auto-processed with AI tagging and smart search.

### Pipeline
```
Lightroom (local) → Export JPEG/WebP → Upload API → Server pipeline:
                                                      ├── Extract EXIF metadata
                                                      ├── Generate thumbnails (sharp/libvips)
                                                      ├── AI vision analysis → tags + description
                                                      ├── Store metadata in PostgreSQL
                                                      └── Serve via gallery UI with search
```

### Database Schema
```sql
CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  original_path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500),
  medium_path VARCHAR(500),
  width INT,
  height INT,
  file_size INT,
  mime_type VARCHAR(50),
  -- EXIF
  taken_at TIMESTAMP,
  camera_model VARCHAR(100),
  lens VARCHAR(100),
  focal_length VARCHAR(20),
  aperture VARCHAR(10),
  shutter_speed VARCHAR(20),
  iso INT,
  gps_lat DECIMAL(10,7),
  gps_lon DECIMAL(10,7),
  -- AI
  ai_description TEXT,
  ai_tags TEXT[],              -- ['sunset', 'garden', 'people']
  ai_analyzed_at TIMESTAMP,
  -- Organization
  album_id INT REFERENCES photo_albums(id),
  is_favorite BOOLEAN DEFAULT false,
  perceptual_hash VARCHAR(64),  -- for duplicate detection
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE photo_albums (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  cover_photo_id INT,
  shared BOOLEAN DEFAULT false,   -- visible to other users
  share_token VARCHAR(64),        -- public share link
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Features (Phased)
**Phase 1 — Foundation:**
- Upload API endpoint (single + batch)
- EXIF extraction (exifr/exif-reader)
- Thumbnail + medium size generation (sharp)
- WebP conversion
- Basic gallery UI (grid + lightbox)

**Phase 2 — Smart Features:**
- AI vision analysis on upload (auto-tag + describe)
- Natural language search ("photos of garden at sunset")
- Duplicate detection via perceptual hashing
- Timeline view (chronological scroll)
- Map view (GPS-tagged photos plotted)

**Phase 3 — Social & Sharing:**
- Albums (create, organize, reorder)
- Favorites / collections
- Shared albums (public link with token)
- Saba access (role-based — sees shared albums)
- Color palette extraction for aesthetic browsing

### Storage Estimates
- Web-optimized JPEG: 500KB-1.5MB per photo
- Thumbnail (300px): ~30KB
- Medium (1200px): ~200KB
- 1,000 photos ≈ 2-3 GB total (well within 87GB disk)

### UX
- **App page:** `/app/gallery.html` — grid browse, search bar, albums sidebar
- **Upload:** Drag-and-drop on web, or rsync/scp from local machine
- **Search:** Natural language bar at top ("sunset", "Saba", "backyard flowers")
- **Lightbox:** Full-size view with EXIF details, tags, map pin

---

## Still Open ❓

1. **Saba's unique sections** — anything Saba needs that's not listed?
2. **Home Assistant setup** — next action item before website coding
3. **Saba's smart home access** — which devices should Saba control?
