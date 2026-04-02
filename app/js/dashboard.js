// ─── Boot ───
(async () => {
    try { await requireAuth(); } catch { return; }

    const shell = renderAppShell('Dashboard', 'dashboard');
    document.getElementById('appLayout').innerHTML = `
        ${shell.sidebar}
        ${shell.bottomNav}
        <div class="main-content">
            ${shell.topbar}
            <div class="main-body" id="dashBody">
                <div id="greeting"></div>
                <div id="summaryStrip"></div>
                <div class="quick-actions" id="quickActions"></div>
                <div class="dash-grid" id="widgets">${skeletonWidget()}${skeletonWidget()}${skeletonWidget()}</div>
            </div>
        </div>
    `;
    initAppShell('dashboard');
    renderQuickActions();
    await loadDashboard();
})();

// ─── State ───
let todayTasks = [];
let weatherData = null;

// ─── Grocery Emoji Map ───
const GROCERY_EMOJIS = {
    'milk':'🥛','bread':'🍞','egg':'🥚','eggs':'🥚','rice':'🍚','chicken':'🍗','meat':'🥩','beef':'🥩',
    'tomato':'🍅','tomatoes':'🍅','onion':'🧅','onions':'🧅','potato':'🥔','potatoes':'🥔',
    'banana':'🍌','apple':'🍎','orange':'🍊','lemon':'🍋','lime':'🍋','mango':'🥭','grape':'🍇',
    'strawberry':'🍓','avocado':'🥑','carrot':'🥕','corn':'🌽','broccoli':'🥦','lettuce':'🥬',
    'pepper':'🌶️','garlic':'🧄','mushroom':'🍄','cucumber':'🥒','eggplant':'🍆',
    'cheese':'🧀','yogurt':'🥛','butter':'🧈','cream':'🥛','oil':'🫒','sugar':'🍬',
    'honey':'🍯','salt':'🧂','coffee':'☕','tea':'🍵','water':'💧','juice':'🧃',
    'soda':'🥤','cereal':'🥣','pasta':'🍝','noodle':'🍜','fish':'🐟','shrimp':'🦐','salmon':'🐟',
    'paneer':'🧀','dal':'🫘','lentil':'🫘','bean':'🫘','chickpea':'🫘',
    'atta':'🌾','flour':'🌾','masala':'🌶️','spice':'🌶️','turmeric':'🌶️','cumin':'🌶️',
    'ghee':'🧈','naan':'🫓','roti':'🫓','tortilla':'🫓','pita':'🫓',
    'chocolate':'🍫','cookie':'🍪','cake':'🎂','ice cream':'🍦','chips':'🍿',
    'wine':'🍷','beer':'🍺','soap':'🧼','tissue':'🧻','toothpaste':'🪥',
    'almond':'🥜','nut':'🥜','peanut':'🥜','coconut':'🥥','pineapple':'🍍',
    'peach':'🍑','cherry':'🍒','watermelon':'🍉','kiwi':'🥝','pear':'🍐',
    'pizza':'🍕','taco':'🌮','burrito':'🌯','sausage':'🌭','bacon':'🥓',
    'shallot':'🧅','ginger':'🫚','herb':'🌿','basil':'🌿','cilantro':'🌿','mint':'🌿',
};

function groceryEmoji(name) {
    const lower = (name || '').toLowerCase();
    for (const [key, emoji] of Object.entries(GROCERY_EMOJIS)) {
        if (lower.includes(key)) return emoji;
    }
    return '🛒';
}

// ─── Load All Data ───
async function loadDashboard() {
    const [allTasks, todayRes, events, grocery, watering, gardenDash, sportsNext, recentCaptures, travelTrips, photoRes, weatherRes] = await Promise.all([
        API.get('/tasks').catch(() => []),
        API.get('/tasks?due=today').catch(() => []),
        API.get('/events?upcoming=5').catch(() => []),
        API.get('/grocery-items?list_id=1').catch(() => []),
        API.get('/garden/watering-schedule').catch(() => ({ overdue: [], today: [], soon: [], upcoming: [] })),
        API.get('/garden/plants/dashboard').catch(() => ({ needs_attention_count: 0, recommendations: [] })),
        API.get('/sports/next-up').catch(() => null),
        API.get('/captures/recent').catch(() => []),
        API.get('/travel/trips').catch(() => []),
        API.get('/captures?type=photo&limit=20').catch(() => ({ captures: [] })),
        fetch('/data/weather.json').then(r => r.json()).catch(() => null),
    ]);

    const norm = v => Array.isArray(v) ? v : (v?.items || []);
    const tasks = norm(allTasks);
    todayTasks = norm(todayRes);
    const evts = norm(events);
    const groceryItems = norm(grocery);

    const incompleteTasks = tasks.filter(t => !t.completed && t.status !== 'done').length;
    const uncheckedGrocery = groceryItems.filter(i => !i.checked);
    const needsAttention = gardenDash.needs_attention_count || 0;

    const photoCaptures = (photoRes?.captures || photoRes || []).filter(c => c.image_path);

    weatherData = weatherRes?.locations?.[0] || null;

    renderGreeting(needsAttention, sportsNext, weatherData);
    renderSummaryStrip(incompleteTasks, evts.length, uncheckedGrocery.length, needsAttention);
    renderWidgets(evts, watering, gardenDash, tasks, sportsNext, recentCaptures, travelTrips, photoCaptures, uncheckedGrocery);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Dynamic Greeting ───
function renderGreeting(gardenAlerts, sportsNext, weather) {
    const name = currentUser?.name?.split(' ')[0] || 'there';
    const h = new Date().getHours();
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    let greetWord, greetEmoji;
    if (h < 6) { greetWord = 'Good night'; greetEmoji = '🌃'; }
    else if (h < 12) { greetWord = 'Good morning'; greetEmoji = '🌅'; }
    else if (h < 17) { greetWord = 'Good afternoon'; greetEmoji = '☀️'; }
    else { greetWord = 'Good evening'; greetEmoji = '🌙'; }

    // Weather inline
    let weatherInline = '';
    if (weather) {
        weatherInline = ` · ${weather.temp}°F ${weather.emoji || ''}`;
    }

    // Fun one-liner
    const lines = [
        "Let's make today count! 💪",
        "What shall we build today? 🔨",
        "One step at a time 🚀",
        "Stay curious, stay awesome ✨",
        "You've got this! 🌟",
        "Make something beautiful today 🎨",
        "Keep the momentum going 🔥",
    ];
    const sportsEvents = sportsNext?.data || sportsNext || [];
    let oneLiner;
    if (gardenAlerts > 0) {
        oneLiner = "Your garden misses you 🌱";
    } else if (sportsEvents.length > 0) {
        oneLiner = "Game day! 🏏";
    } else {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        oneLiner = lines[dayOfYear % lines.length];
    }

    document.getElementById('greeting').innerHTML = `
        <h1 class="dash-greeting">${greetEmoji} ${greetWord}, ${name}${weatherInline}</h1>
        <p class="dash-date">${dateStr} — ${oneLiner}</p>
    `;
}

// ─── Quick Actions ───
function renderQuickActions() {
    const vp = currentUser?.visible_pages || [];
    const canSee = (page) => !vp.length || vp.includes(page);
    const actions = [];
    if (canSee('tasks')) actions.push('<button class="btn quick-action-btn qa-tasks" onclick="openAddTaskModal()"><span class="qa-emoji">✅</span><span>Task</span></button>');
    if (canSee('events')) actions.push('<button class="btn quick-action-btn qa-events" onclick="openAddEventModal()"><span class="qa-emoji">📅</span><span>Event</span></button>');
    if (canSee('grocery')) actions.push('<button class="btn quick-action-btn qa-grocery" onclick="openAddGroceryModal()"><span class="qa-emoji">🛒</span><span>Grocery</span></button>');
    if (canSee('notes')) actions.push('<button class="btn quick-action-btn qa-notes" onclick="openAddNoteModal()"><span class="qa-emoji">📝</span><span>Note</span></button>');
    if (canSee('captures')) actions.push('<a href="/app/captures.html" class="btn quick-action-btn qa-capture"><span class="qa-emoji">📸</span><span>Capture</span></a>');
    document.getElementById('quickActions').innerHTML = `<div class="quick-actions-grid dash-quick-actions">${actions.join('')}</div>`;
}

// ─── Summary Strip (pills) ───
function renderSummaryStrip(taskCount, eventCount, groceryCount, gardenCount) {
    const vp = currentUser?.visible_pages || [];
    const canSee = (page) => !vp.length || vp.includes(page);
    const pills = [];
    let i = 0;
    if (canSee('tasks')) pills.push(`<a href="/app/tasks.html" class="summary-pill pill-tasks" style="animation-delay:${i++ * 0.05}s">✅ ${taskCount} task${taskCount !== 1 ? 's' : ''}</a>`);
    if (canSee('events')) pills.push(`<a href="/app/events.html" class="summary-pill pill-events" style="animation-delay:${i++ * 0.05}s">📅 ${eventCount} event${eventCount !== 1 ? 's' : ''}</a>`);
    if (canSee('grocery')) pills.push(`<a href="/app/grocery.html" class="summary-pill pill-grocery" style="animation-delay:${i++ * 0.05}s">🛒 ${groceryCount} item${groceryCount !== 1 ? 's' : ''}</a>`);
    if (canSee('garden')) pills.push(`<a href="/app/garden.html" class="summary-pill pill-garden" style="animation-delay:${i++ * 0.05}s">🌱 ${gardenCount} alert${gardenCount !== 1 ? 's' : ''}</a>`);
    document.getElementById('summaryStrip').innerHTML = `<div class="summary-strip">${pills.join('')}</div>`;
}

// ─── Widgets ───
function renderWidgets(events, watering, gardenDash, allTasks, sportsNext, recentCaptures, travelTrips, photoCaptures, groceryItems) {
    const vp = currentUser?.visible_pages || [];
    const canSee = (page) => !vp.length || vp.includes(page);

    const hasTasks = todayTasks.length > 0;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const futureEvents = (events || []).filter(e => ((e.date || '').split('T')[0]) >= todayStr);
    const hasEvents = futureEvents.length > 0;

    let widgetIdx = 0;
    const delay = () => `style="animation-delay:${(widgetIdx++) * 0.08}s"`;

    document.getElementById('widgets').innerHTML = `
        ${canSee('captures') ? renderPhotoCarousel(photoCaptures) : ''}
        ${renderWeatherCard()}
        ${renderSportsNextUp(sportsNext)}
        ${canSee('grocery') ? renderGroceryWidget(groceryItems) : ''}
        ${hasTasks && canSee('tasks') ? `<div class="card widget-card widget-tasks" ${delay()}>
            <div class="card-header"><h3>📋 Today's Tasks</h3><a href="/app/tasks.html" class="link">View All →</a></div>
            <div class="card-body" id="tasksList">${renderTodayTasks()}</div>
        </div>` : ''}
        ${hasEvents && canSee('events') ? `<div class="card widget-card widget-events" ${delay()}>
            <div class="card-header"><h3>📅 Upcoming Events</h3><a href="/app/events.html" class="link">View All →</a></div>
            <div class="card-body">${renderEvents(events)}</div>
        </div>` : ''}
        ${canSee('travel') ? renderTravelWidget(travelTrips) : ''}
        ${canSee('garden') ? `<div class="card widget-card widget-garden" ${delay()}>
            <div class="card-header"><h3>🌿 Garden Overview</h3><a href="/app/garden.html" class="link">View All →</a></div>
            <div class="card-body">${renderGarden(watering, gardenDash)}</div>
        </div>` : ''}
        ${canSee('captures') ? `<div class="card widget-card widget-captures" ${delay()}>
            <div class="card-header"><h3>⚡ Recent Captures</h3><a href="/app/captures.html" class="link">View All →</a></div>
            <div class="card-body">${renderRecentCaptures(recentCaptures)}</div>
        </div>` : ''}
        <div class="card widget-card widget-activity" ${delay()}>
            <div class="card-header"><h3>📊 Recent Activity</h3></div>
            <div class="card-body">${renderActivity(allTasks, events)}</div>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initPhotoCarousel();
}

// ─── Weather Card ───
function renderWeatherCard() {
    if (!weatherData) return '';
    const w = weatherData;
    const isSunny = (w.description || '').toLowerCase().includes('clear') || (w.emoji || '').includes('☀');
    const gradClass = isSunny ? 'weather-sunny' : 'weather-cloudy';

    let forecastHtml = '';
    if (w.forecast?.length) {
        forecastHtml = w.forecast.slice(0, 4).map(f =>
            `<div class="weather-forecast-day">
                <span class="wf-label">${f.label}</span>
                <span class="wf-emoji">${f.emoji}</span>
                <span class="wf-temp">${f.high}°</span>
            </div>`
        ).join('');
    }

    return `<div class="weather-card ${gradClass}">
        <div class="weather-main">
            <div class="weather-temp">${w.emoji || '🌤️'} ${w.temp}°F</div>
            <div class="weather-desc">${w.description || ''}</div>
            <div class="weather-hl">H: ${w.high}° · L: ${w.low}°</div>
        </div>
        <div class="weather-location">${w.location || ''}</div>
        ${forecastHtml ? `<div class="weather-forecast">${forecastHtml}</div>` : ''}
    </div>`;
}

// ─── Grocery Widget ───
function renderGroceryWidget(items) {
    if (!items || !items.length) {
        return `<div class="card widget-card widget-grocery">
            <div class="card-header"><h3>🛒 Grocery List</h3><a href="/app/grocery.html" class="link">View All →</a></div>
            <div class="card-body">
                <div class="empty-state"><p>List is empty! 🎉</p>
                <button class="btn btn-secondary" onclick="openAddGroceryModal()">Add Items</button></div>
            </div>
        </div>`;
    }
    const gridItems = items.slice(0, 8).map(item => {
        const emoji = groceryEmoji(item.name || item.title || '');
        const name = esc(item.name || item.title || 'Item');
        const store = item.store ? `<span class="grocery-store">🏪 ${esc(item.store)}</span>` : '';
        return `<div class="grocery-grid-item">
            <span class="grocery-emoji">${emoji}</span>
            <span class="grocery-name">${name}</span>
            ${store}
        </div>`;
    }).join('');
    const more = items.length > 8 ? `<a href="/app/grocery.html" class="grocery-more">+${items.length - 8} more →</a>` : '';

    return `<div class="card widget-card widget-grocery">
        <div class="card-header"><h3>🛒 Grocery List</h3><a href="/app/grocery.html" class="link">View All →</a></div>
        <div class="card-body">
            <div class="grocery-grid">${gridItems}</div>
            ${more}
        </div>
    </div>`;
}

// ─── Photo Carousel ───
let _carouselInterval = null;
function renderPhotoCarousel(photos) {
    if (!photos || !photos.length) return '';
    return `<div class="card photo-carousel-card full-width">
        <div class="photo-carousel" id="photoCarousel">
            ${photos.map((p, i) => `
                <div class="carousel-slide${i === 0 ? ' active' : ''}" data-index="${i}">
                    <img src="${p.image_path}" alt="${esc(p.title || '')}" loading="${i < 2 ? 'eager' : 'lazy'}">
                    <div class="carousel-caption">${esc(p.title || '')}</div>
                </div>
            `).join('')}
            <div class="carousel-dots">
                ${photos.map((_, i) => `<span class="carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`).join('')}
            </div>
        </div>
    </div>`;
}

function initPhotoCarousel() {
    const el = document.getElementById('photoCarousel');
    if (!el) return;
    const slides = el.querySelectorAll('.carousel-slide');
    const dots = el.querySelectorAll('.carousel-dot');
    if (slides.length < 2) return;

    let current = 0;
    const show = (idx) => {
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');
        current = (idx + slides.length) % slides.length;
        slides[current].classList.add('active');
        dots[current].classList.add('active');
    };

    if (_carouselInterval) clearInterval(_carouselInterval);
    _carouselInterval = setInterval(() => show(current + 1), 5000);

    dots.forEach(d => d.addEventListener('click', () => {
        show(+d.dataset.index);
        clearInterval(_carouselInterval);
        _carouselInterval = setInterval(() => show(current + 1), 5000);
    }));

    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            show(diff > 0 ? current + 1 : current - 1);
            clearInterval(_carouselInterval);
            _carouselInterval = setInterval(() => show(current + 1), 5000);
        }
    }, { passive: true });
}

// ─── Today's Tasks ───
function renderTodayTasks() {
    if (!todayTasks.length) {
        return `<div class="empty-state">
            <div class="emoji"><i data-lucide="sparkles"></i></div>
            <p>No tasks for today — enjoy your day! ✨</p>
            <button class="btn btn-secondary" onclick="openAddTaskModal()">Add a task</button>
        </div>`;
    }
    return todayTasks.map(t => {
        const done = t.completed || t.status === 'done';
        const pColor = { urgent: 'var(--red)', high: 'var(--amber)', normal: 'var(--blue)', low: 'var(--green)' }[t.priority] || 'var(--blue)';
        return `<div class="task-item">
            <div class="priority-dot" style="background:${pColor}"></div>
            <div class="task-check${done ? ' done' : ''}" onclick="toggleTask(${t.id}, ${!done})"></div>
            <div class="task-title${done ? ' done' : ''}">${esc(t.title)}</div>
            <div class="task-due ${done ? 'due-done' : 'due-today'}">${done ? 'Done' : 'Today'}</div>
        </div>`;
    }).join('');
}

async function toggleTask(id, complete) {
    try {
        await API.put(`/tasks/${id}`, { completed: complete, status: complete ? 'done' : 'todo' });
        const t = todayTasks.find(t => t.id === id);
        if (t) { t.completed = complete; t.status = complete ? 'done' : 'todo'; }
        document.getElementById('tasksList').innerHTML = renderTodayTasks();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Events ───
function renderEvents(events) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const futureEvents = events.filter(e => {
        const eDate = (e.date || '').split('T')[0];
        return eDate >= todayStr;
    });
    if (!futureEvents.length) {
        return `<div class="empty-state"><div class="emoji"><i data-lucide="calendar"></i></div><p>No upcoming events</p></div>`;
    }
    return futureEvents.map(e => {
        const dateStr = (e.date || '').split('T')[0];
        const d = new Date(dateStr + 'T00:00:00Z');
        const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        const day = d.getUTCDate();
        const timeStr = e.time ? formatTime12(e.time) : '';
        const loc = e.location ? ` · ${esc(e.location)}` : '';
        return `<div class="event-item">
            <div class="event-date"><div class="month">${month}</div><div class="day">${day}</div></div>
            <div><div class="event-title">${esc(e.title)}</div><div class="event-meta">${timeStr}${loc}</div></div>
        </div>`;
    }).join('');
}

function formatTime12(time) {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── Garden ───
function renderGarden(watering, dashboard) {
    const alerts = [
        ...watering.overdue.map(p => ({ ...p, level: 'overdue' })),
        ...watering.today.map(p => ({ ...p, level: 'today' })),
        ...watering.soon.map(p => ({ ...p, level: 'soon' })),
    ];

    let html = '';
    if (!alerts.length && !dashboard.recommendations?.length) {
        return `<div class="empty-state"><div class="emoji"><i data-lucide="flower-2"></i></div><p>Garden is looking great! 🌱</p></div>`;
    }

    if (alerts.length) {
        const labels = { overdue: 'Overdue', today: 'Due today', soon: 'Due soon' };
        html += alerts.slice(0, 5).map(p => `<div class="water-alert">
            <div class="water-dot ${p.level}"></div>
            <div class="water-name">${esc(p.plant_name || p.name)}</div>
            <div class="water-info">${labels[p.level]}${p.water_gallons ? ` · ${p.water_gallons} gal` : ''}</div>
        </div>`).join('');
    }

    if (dashboard.recommendations?.length) {
        const rec = dashboard.recommendations[0];
        const recText = typeof rec === 'string' ? rec
            : (rec.description || rec.action || rec.message || rec.recommendation || rec.text || JSON.stringify(rec));
        const plantName = rec.plant_name ? `<strong>${esc(rec.plant_name)}:</strong> ` : '';
        html += `<div class="garden-rec"><i data-lucide="lightbulb" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> ${plantName}${esc(recText)}</div>`;
    }

    return html;
}

// ─── Sports Next Up ───
function renderSportsNextUp(data) {
    const events = data?.data || data;
    if (!events || !events.length) return '';
    const icons = { football: '⚽', cricket: '🏏', tennis: '🎾', f1: '🏎️' };
    const colors = { football: '#2D8544', cricket: '#FF9933', tennis: '#4CAF50', f1: '#FF1801' };
    const items = events.slice(0, 3).map(e => {
        const dt = e.date ? new Date(e.date) : null;
        const timeStr = dt ? dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
        const relTime = dt ? getRelativeTime(dt) : '';
        const isLive = relTime === 'Live/Past' || (e.status && e.status.toLowerCase() === 'live');
        const liveIndicator = isLive ? '<span class="live-dot"></span>' : '';
        return `<div class="sports-next-item" style="border-left: 3px solid ${colors[e.sport] || '#666'}">
            <div style="font-size:20px">${icons[e.sport] || '🏅'}</div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${liveIndicator}${esc(e.title || e.name || 'TBA')}</div>
                <div style="font-size:11px;opacity:0.6">${e.competition || e.series || ''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:11px;font-weight:600;color:${colors[e.sport] || '#888'}">${isLive ? '🔴 LIVE' : relTime}</div>
                <div style="font-size:10px;opacity:0.5">${timeStr}</div>
            </div>
        </div>`;
    }).join('');
    return `<div class="card widget-card widget-sports">
        <div class="card-header"><h3>⚡ Sports Next Up</h3><a href="/app/sports.html" class="link">View All →</a></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px">${items}</div>
    </div>`;
}

// ─── Travel Widget ───
function renderTravelWidget(trips) {
    if (!trips || !trips.length) return '';
    const active = trips.filter(t => t.status !== 'archived').slice(0, 2);
    if (!active.length) return '';
    const items = active.map(t => {
        const statusColors = { planning: 'var(--amber)', ready: 'var(--green)' };
        const statusColor = statusColors[t.status] || 'var(--text-secondary)';
        return `<div class="travel-widget-item" onclick="window.location='/app/travel.html'" style="cursor:pointer">
            <div style="font-size:24px">✈️</div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px">${esc(t.destination)}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${t.country || ''} · ${t.activity_count || 0} activities</div>
            </div>
            <div style="text-align:right">
                <span style="font-size:11px;font-weight:600;color:${statusColor};text-transform:uppercase">${t.status}</span>
            </div>
        </div>`;
    }).join('');
    return `<div class="card widget-card widget-travel">
        <div class="card-header"><h3>✈️ Trips</h3><a href="/app/travel.html" class="link">View All →</a></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px">${items}</div>
    </div>`;
}

// ─── Recent Captures ───
function renderRecentCaptures(captures) {
    if (!captures || !captures.length) {
        return `<div class="empty-state"><div class="emoji"><i data-lucide="zap"></i></div><p>No captures yet — <a href="/app/captures.html">start capturing!</a></p></div>`;
    }
    const typeIcons = { text: 'file-text', link: 'link', checklist: 'list-checks', photo: 'image' };
    return captures.slice(0, 5).map(c => {
        const icon = typeIcons[c.type] || 'file-text';
        const title = c.title || c.raw_input?.slice(0, 60) || 'Untitled';
        const ago = timeAgo(new Date(c.captured_at));
        const tagHtml = (c.tags || []).slice(0, 2).map(t =>
            `<span class="capture-tag-chip" style="background:${t.color}22;color:${t.color}">${esc(t.name)}</span>`
        ).join('');
        return `<div class="capture-widget-item">
            <div class="activity-icon capture-icon"><i data-lucide="${icon}"></i></div>
            <div style="flex:1;min-width:0">
                <div class="capture-widget-title">${esc(title)}</div>
                <div class="capture-widget-meta">${ago}${tagHtml ? ' · ' + tagHtml : ''}</div>
            </div>
        </div>`;
    }).join('');
}

// ─── Recent Activity ───
function renderActivity(allTasks, events) {
    const items = [];
    const tasks = Array.isArray(allTasks) ? allTasks : [];
    const evts = Array.isArray(events) ? events : [];

    tasks.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).forEach(t => {
        items.push({ type: 'task', title: t.title, date: new Date(t.created_at), label: 'Task added' });
    });
    evts.forEach(e => {
        const dateStr = (e.date || '').includes('T') ? e.date : e.date + 'T00:00:00Z';
        items.push({ type: 'event', title: e.title, date: new Date(dateStr), label: 'Event' });
    });

    items.sort((a, b) => b.date - a.date);
    const top = items.slice(0, 5);

    if (!top.length) {
        return `<div class="empty-state"><div class="emoji"><i data-lucide="activity"></i></div><p>No recent activity</p></div>`;
    }

    return top.map(i => {
        const icon = i.type === 'task' ? 'check-square' : 'calendar';
        const cls = i.type === 'task' ? 'task-icon' : 'event-icon';
        const ago = timeAgo(i.date);
        return `<div class="activity-item">
            <div class="activity-icon ${cls}"><i data-lucide="${icon}"></i></div>
            <div class="activity-text">${esc(i.title)}</div>
            <div class="activity-time">${ago}</div>
        </div>`;
    }).join('');
}

function timeAgo(date) {
    const s = Math.floor((Date.now() - date) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : `${d}d ago`;
}

function getRelativeTime(date) {
    const now = new Date();
    const diff = date - now;
    if (diff < 0) return 'Live/Past';
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}m`;
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

// ─── Helpers ───
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function skeletonWidget() { return `<div class="card"><div class="card-header"><div class="skeleton skeleton-line" style="width:40%"></div></div><div class="card-body">${Array(3).fill('<div class="skeleton skeleton-line"></div>').join('')}</div></div>`; }
