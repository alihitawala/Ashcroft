// ═══════════════════════════════════════════════════════════
// Dashboard — Premium Glassmorphism Edition
// ═══════════════════════════════════════════════════════════

// ─── Boot ───
(async () => {
    try { await requireAuth(); } catch { return; }

    const shell = renderAppShell('Dashboard', 'dashboard');
    const gardenAlerts = await getGardenAlertCount();
    const bannerHtml = shouldShowGardenBanner() && gardenAlerts > 0 ? renderGardenBanner(gardenAlerts) : '';

    document.getElementById('appLayout').innerHTML = `
        ${shell.sidebar}
        ${shell.bottomNav}
        <div class="main-content">
            ${shell.topbar}
            <div class="main-body" id="dashBody">
                ${bannerHtml}
                <div class="dash-header">
                    <div id="greeting"></div>
                    <div class="dash-quick-actions" id="quickActions"></div>
                </div>
                <div class="dash-container" id="widgets">
                    ${renderSkeletonWidgets()}
                </div>
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
let widgetCounter = 0;
let gardenAlertCount = 0;

// ─── Garden Banner Functions ───
const GARDEN_BANNER_STORAGE_KEY = 'gardenBannerDismissed';
const GARDEN_BANNER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function shouldShowGardenBanner() {
    try {
        const dismissedAt = localStorage.getItem(GARDEN_BANNER_STORAGE_KEY);
        if (!dismissedAt) return true;
        const dismissedTime = parseInt(dismissedAt, 10);
        const now = Date.now();
        return (now - dismissedTime) >= GARDEN_BANNER_COOLDOWN_MS;
    } catch (e) {
        return true;
    }
}

function dismissGardenBanner() {
    const banner = document.getElementById('gardenBanner');
    if (banner) {
        banner.classList.add('dismissing');
        setTimeout(() => {
            banner.remove();
        }, 300);
    }
    try {
        localStorage.setItem(GARDEN_BANNER_STORAGE_KEY, Date.now().toString());
    } catch (e) {
        console.warn('Could not save banner dismiss state:', e);
    }
}

function renderGardenBanner(count) {
    return `
        <div class="garden-banner" id="gardenBanner">
            <div class="garden-banner-content">
                <span class="garden-banner-icon">🌱</span>
                <span class="garden-banner-text">Your garden needs attention — ${count} plant${count !== 1 ? 's' : ''} need${count === 1 ? 's' : ''} water</span>
            </div>
            <button class="garden-banner-close" onclick="dismissGardenBanner()" aria-label="Dismiss banner">×</button>
        </div>
    `;
}

async function getGardenAlertCount() {
    try {
        const gardenDash = await API.get('/garden/plants/dashboard').catch(() => ({ needs_attention_count: 0 }));
        gardenAlertCount = gardenDash.needs_attention_count || 0;
        return gardenAlertCount;
    } catch (e) {
        return 0;
    }
}

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

// ─── Skeleton Loading ───
function renderSkeletonWidgets() {
    return `
        <div class="glass-card widget-hero skeleton-card"></div>
        <div class="glass-card widget-large">
            <div class="widget-body">
                <div class="skeleton skeleton-header"></div>
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line"></div>
            </div>
        </div>
        <div class="glass-card widget-large">
            <div class="widget-body">
                <div class="skeleton skeleton-header"></div>
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line"></div>
            </div>
        </div>
        <div class="glass-card widget-medium">
            <div class="widget-body">
                <div class="skeleton skeleton-header"></div>
                <div class="skeleton skeleton-line"></div>
            </div>
        </div>
    `;
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

    renderGreeting(weatherData);
    renderSummaryStrip(incompleteTasks, evts.length, uncheckedGrocery.length, needsAttention);
    // summaryStrip container is now deprecated, pills render inside greeting
    renderWidgets(evts, watering, gardenDash, tasks, sportsNext, recentCaptures, travelTrips, photoCaptures, uncheckedGrocery);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Dynamic Greeting ───
function renderGreeting(weather) {
    const name = currentUser?.name?.split(' ')[0] || 'there';
    const h = new Date().getHours();

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

    document.getElementById('greeting').innerHTML = `
        <div class="dash-greeting-row">
            <h1 class="dash-greeting">${greetEmoji} ${greetWord}, ${name}${weatherInline}</h1>
            <div id="summaryPills" class="summary-pills-inline"></div>
        </div>
    `;
}

// ─── Quick Actions ───
function renderQuickActions() {
    const vp = currentUser?.visible_pages || [];
    const canSee = (page) => !vp.length || vp.includes(page);
    const actions = [];
    if (canSee('tasks')) actions.push('<button class="quick-action-btn qa-tasks" onclick="openAddTaskModal()"><span class="qa-emoji">✅</span><span>Task</span></button>');
    if (canSee('events')) actions.push('<button class="quick-action-btn qa-events" onclick="openAddEventModal()"><span class="qa-emoji">📅</span><span>Event</span></button>');
    if (canSee('grocery')) actions.push('<button class="quick-action-btn qa-grocery" onclick="openAddGroceryModal()"><span class="qa-emoji">🛒</span><span>Grocery</span></button>');
    if (canSee('notes')) actions.push('<button class="quick-action-btn qa-notes" onclick="openAddNoteModal()"><span class="qa-emoji">📝</span><span>Note</span></button>');
    if (canSee('captures')) actions.push('<a href="/app/captures.html" class="quick-action-btn qa-capture"><span class="qa-emoji">📸</span><span>Capture</span></a>');
    document.getElementById('quickActions').innerHTML = actions.join('');
}

// ─── Summary Strip (pills) ───
function renderSummaryStrip(taskCount, eventCount, groceryCount, gardenCount) {
    const vp = currentUser?.visible_pages || [];
    const canSee = (page) => !vp.length || vp.includes(page);
    const pills = [];
    let i = 0;
    // Only show pills with count > 0
    if (canSee('tasks') && taskCount > 0) pills.push(`<a href="/app/tasks.html" class="summary-pill pill-tasks" style="animation-delay:${i++ * 0.08}s">✅ ${taskCount}</a>`);
    if (canSee('events') && eventCount > 0) pills.push(`<a href="/app/events.html" class="summary-pill pill-events" style="animation-delay:${i++ * 0.08}s">📅 ${eventCount}</a>`);
    if (canSee('grocery') && groceryCount > 0) pills.push(`<a href="/app/grocery.html" class="summary-pill pill-grocery" style="animation-delay:${i++ * 0.08}s">🛒 ${groceryCount}</a>`);
    if (canSee('garden') && gardenCount > 0) pills.push(`<a href="/app/garden.html" class="summary-pill pill-garden" style="animation-delay:${i++ * 0.08}s">🌱 ${gardenCount}</a>`);
    
    const pillsContainer = document.getElementById('summaryPills');
    if (pillsContainer) {
        pillsContainer.innerHTML = pills.join('');
    }
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

    const widgets = [];

    // HERO: Photo Carousel
    if (canSee('captures')) {
        const carousel = renderPhotoCarousel(photoCaptures);
        if (carousel) widgets.push({ html: carousel, priority: 1 });
    }

    // HERO: Garden (actionable — most important)
    if (canSee('garden')) {
        widgets.push({ html: renderGardenWidget(watering, gardenDash), priority: 2 });
    }

    // LARGE: Weather (interactive)
    const weather = renderWeatherCard();
    if (weather) widgets.push({ html: weather, priority: 3 });

    // LARGE: Sports (if live/upcoming)
    if (sportsNext?.data?.length || sportsNext?.length) {
        widgets.push({ html: renderSportsNextUp(sportsNext), priority: 4 });
    }

    // MEDIUM: Tasks
    if (hasTasks && canSee('tasks')) {
        widgets.push({ html: renderTasksWidget(), priority: 5 });
    }

    // MEDIUM: Events
    if (hasEvents && canSee('events')) {
        widgets.push({ html: renderEventsWidget(events), priority: 6 });
    }

    // MEDIUM: Grocery
    if (canSee('grocery')) {
        widgets.push({ html: renderGroceryWidget(groceryItems), priority: 7 });
    }

    // SMALL: Travel
    if (canSee('travel') && travelTrips?.length) {
        const travel = renderTravelWidget(travelTrips);
        if (travel) widgets.push({ html: travel, priority: 8 });
    }

    // SMALL: Captures
    if (canSee('captures')) {
        widgets.push({ html: renderCapturesWidget(recentCaptures), priority: 9 });
    }

    // SMALL: Activity
    widgets.push({ html: renderActivityWidget(allTasks, events), priority: 10 });

    // Sort by priority and render
    widgets.sort((a, b) => a.priority - b.priority);
    document.getElementById('widgets').innerHTML = widgets.map(w => w.html).join('');
    
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

    return `
        <div class="glass-card widget-large weather-card ${gradClass}">
            <div class="weather-main">
                <div class="weather-temp">${w.emoji || '🌤️'} ${w.temp}°F</div>
                <div class="weather-desc">${w.description || ''}</div>
                <div class="weather-hl">H: ${w.high}° · L: ${w.low}°</div>
                <div class="weather-location">${w.location || ''}</div>
            </div>
            ${forecastHtml ? `<div class="weather-forecast">${forecastHtml}</div>` : ''}
        </div>
    `;
}

// ─── Photo Carousel ───
let _carouselInterval = null;
function renderPhotoCarousel(photos) {
    if (!photos || !photos.length) return '';
    return `
        <div class="widget-hero">
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
        </div>
    `;
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

// ─── Garden Widget ───
function renderGardenWidget(watering, dashboard) {
    const alerts = [
        ...watering.overdue.map(p => ({ ...p, level: 'overdue' })),
        ...watering.today.map(p => ({ ...p, level: 'today' })),
        ...watering.soon.map(p => ({ ...p, level: 'soon' })),
    ];

    const totalPlants = dashboard.total_plants || 20;
    const needsAttention = dashboard.needs_attention_count || alerts.length;
    const healthyCount = totalPlants - needsAttention;
    const healthPct = totalPlants > 0 ? Math.round((healthyCount / totalPlants) * 100) : 100;

    let content = '';
    if (!alerts.length && !dashboard.recommendations?.length) {
        content = `<div class="empty-state"><div class="emoji">🌿</div><p>Your garden is thriving!</p></div>`;
    } else {
        const labels = { overdue: '🔴 Overdue', today: '🟠 Today', soon: '🔵 Soon' };
        content = `<div class="garden-alerts-list">` + alerts.slice(0, 5).map(p => `
            <div class="water-alert" id="water-alert-${p.plant_id || p.id || ''}">
                <div class="water-dot ${p.level}"></div>
                <div class="water-name">${esc(p.plant_name || p.name)}</div>
                <div class="water-info">${labels[p.level]}${p.water_gallons ? ` · ${p.water_gallons} gal` : ''}</div>
                <button class="btn-water" onclick="markWatered(${p.plant_id || p.id}, this)" title="Mark as watered">💧</button>
            </div>
        `).join('') + `</div>`;

        if (alerts.length > 5) {
            content += `<a href="/app/garden.html" class="garden-see-more">+${alerts.length - 5} more plants →</a>`;
        }
        
        if (dashboard.recommendations?.length) {
            const rec = dashboard.recommendations[0];
            const recText = typeof rec === 'string' ? rec : (rec.description || rec.action || rec.message || JSON.stringify(rec));
            const plantName = rec.plant_name ? `<strong>${esc(rec.plant_name)}:</strong> ` : '';
            content += `<div class="garden-rec">💡 ${plantName}${esc(recText)}</div>`;
        }
    }

    return `
        <div class="glass-card widget-hero garden-widget">
            <div class="widget-header">
                <h3><span class="icon">🌱</span> Garden Health</h3>
                <a href="/app/garden.html" class="link">View All →</a>
            </div>
            <div class="widget-body">
                <div class="garden-stats-row">
                    <div class="garden-stat">
                        <span class="garden-stat-value" style="color: var(--green)">${healthyCount}</span>
                        <span class="garden-stat-label">Healthy</span>
                    </div>
                    <div class="garden-stat">
                        <span class="garden-stat-value" style="color: var(--amber)">${needsAttention}</span>
                        <span class="garden-stat-label">Need Water</span>
                    </div>
                    <div class="garden-stat">
                        <span class="garden-stat-value" style="color: var(--accent)">${totalPlants}</span>
                        <span class="garden-stat-label">Total</span>
                    </div>
                    <div class="garden-stat garden-stat-ring">
                        <div class="health-ring-mini" style="--pct: ${healthPct}%">
                            <span>${healthPct}%</span>
                        </div>
                    </div>
                </div>
                ${content}
            </div>
        </div>
    `;
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
        
        return `
            <div class="sports-next-item" style="border-left-color: ${colors[e.sport] || '#666'}">
                <span class="sports-icon">${icons[e.sport] || '🏅'}</span>
                <div style="flex:1;min-width:0">
                    <div class="sports-title">${isLive ? '<span class="live-indicator"><span class="live-dot"></span>LIVE</span> ' : ''}${esc(e.title || e.name || 'TBA')}</div>
                    <div class="sports-meta">${e.competition || e.series || ''}</div>
                </div>
                <div class="sports-time">
                    <div class="sports-countdown" style="color: ${isLive ? '#f45b69' : colors[e.sport] || '#888'}">${isLive ? 'Now' : relTime}</div>
                    <div style="font-size:10px;opacity:0.5">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
    
    return `
        <div class="glass-card widget-large sports-widget">
            <div class="widget-header">
                <h3><span class="icon">⚡</span> Sports Next Up</h3>
                <a href="/app/sports.html" class="link">View All →</a>
            </div>
            <div class="widget-body">${items}</div>
        </div>
    `;
}

// ─── Tasks Widget ───
function renderTasksWidget() {
    const tasksHtml = todayTasks.map(t => {
        const done = t.completed || t.status === 'done';
        const pColor = { urgent: 'var(--red)', high: 'var(--amber)', normal: 'var(--blue)', low: 'var(--green)' }[t.priority] || 'var(--blue)';
        return `
            <div class="task-item">
                <div class="priority-dot" style="background:${pColor}"></div>
                <div class="task-check${done ? ' done' : ''}" onclick="toggleTask(${t.id}, ${!done})"></div>
                <div class="task-title${done ? ' done' : ''}">${esc(t.title)}</div>
                <span class="task-due ${done ? 'due-done' : 'due-today'}">${done ? 'Done' : 'Today'}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="glass-card widget-medium tasks-widget">
            <div class="widget-header">
                <h3><span class="icon">📋</span> Today's Tasks</h3>
                <a href="/app/tasks.html" class="link">View All →</a>
            </div>
            <div class="widget-body">${tasksHtml}</div>
        </div>
    `;
}

async function toggleTask(id, complete) {
    try {
        await API.put(`/tasks/${id}`, { completed: complete, status: complete ? 'done' : 'todo' });
        const t = todayTasks.find(t => t.id === id);
        if (t) { t.completed = complete; t.status = complete ? 'done' : 'todo'; }
        renderTasksWidget();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Events Widget ───
function renderEventsWidget(events) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const futureEvents = events.filter(e => {
        const eDate = (e.date || '').split('T')[0];
        return eDate >= todayStr;
    });
    
    const eventsHtml = futureEvents.slice(0, 4).map(e => {
        const dateStr = (e.date || '').split('T')[0];
        const d = new Date(dateStr + 'T00:00:00Z');
        const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        const day = d.getUTCDate();
        const timeStr = e.time ? formatTime12(e.time) : '';
        const loc = e.location ? ` · ${esc(e.location)}` : '';
        
        return `
            <div class="event-item">
                <div class="event-date">
                    <div class="month">${month}</div>
                    <div class="day">${day}</div>
                </div>
                <div>
                    <div class="event-title">${esc(e.title)}</div>
                    <div class="event-meta">${timeStr}${loc}</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="glass-card widget-medium events-widget">
            <div class="widget-header">
                <h3><span class="icon">📅</span> Upcoming Events</h3>
                <a href="/app/events.html" class="link">View All →</a>
            </div>
            <div class="widget-body">${eventsHtml}</div>
        </div>
    `;
}

function formatTime12(time) {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── Grocery Widget ───
function renderGroceryWidget(items) {
    if (!items || !items.length) {
        return `
            <div class="glass-card widget-medium grocery-widget">
                <div class="widget-header">
                    <h3><span class="icon">🛒</span> Grocery List</h3>
                    <a href="/app/grocery.html" class="link">View All →</a>
                </div>
                <div class="widget-body">
                    <div class="empty-state">
                        <div class="emoji">🎉</div>
                        <p>List is empty!</p>
                        <button class="btn btn-secondary" onclick="openAddGroceryModal()">Add Items</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    const gridItems = items.slice(0, 8).map(item => {
        const emoji = groceryEmoji(item.name || item.title || '');
        const name = esc(item.name || item.title || 'Item');
        return `
            <div class="grocery-grid-item">
                <span class="grocery-emoji">${emoji}</span>
                <span class="grocery-name">${name}</span>
            </div>
        `;
    }).join('');
    
    const more = items.length > 8 ? `<a href="/app/grocery.html" class="grocery-more">+${items.length - 8} more →</a>` : '';

    return `
        <div class="glass-card widget-medium grocery-widget">
            <div class="widget-header">
                <h3><span class="icon">🛒</span> Grocery List</h3>
                <a href="/app/grocery.html" class="link">View All →</a>
            </div>
            <div class="widget-body">
                <div class="grocery-grid">${gridItems}</div>
                ${more}
            </div>
        </div>
    `;
}

// ─── Travel Widget ───
function renderTravelWidget(trips) {
    if (!trips || !trips.length) return '';
    const active = trips.filter(t => t.status !== 'archived').slice(0, 2);
    if (!active.length) return '';
    
    const items = active.map(t => {
        const statusColors = { planning: 'var(--amber)', ready: 'var(--green)' };
        const statusColor = statusColors[t.status] || 'var(--text-secondary)';
        return `
            <div class="travel-widget-item" onclick="window.location='/app/travel.html'">
                <span class="travel-emoji">✈️</span>
                <div style="flex:1;min-width:0">
                    <div class="travel-dest">${esc(t.destination)}</div>
                    <div class="travel-meta">${t.country || ''} · ${t.activity_count || 0} activities</div>
                </div>
                <span style="font-size:11px;font-weight:600;color:${statusColor};text-transform:uppercase">${t.status}</span>
            </div>
        `;
    }).join('');
    
    return `
        <div class="glass-card widget-small travel-widget">
            <div class="widget-header">
                <h3><span class="icon">✈️</span> Trips</h3>
                <a href="/app/travel.html" class="link">→</a>
            </div>
            <div class="widget-body">${items}</div>
        </div>
    `;
}

// ─── Captures Widget ───
function renderCapturesWidget(captures) {
    if (!captures || !captures.length) {
        return `
            <div class="glass-card widget-small captures-widget">
                <div class="widget-header">
                    <h3><span class="icon">⚡</span> Captures</h3>
                    <a href="/app/captures.html" class="link">→</a>
                </div>
                <div class="widget-body">
                    <div class="empty-state"><div class="emoji">📸</div><p>No captures yet</p></div>
                </div>
            </div>
        `;
    }
    
    const typeIcons = { text: 'file-text', link: 'link', checklist: 'list-checks', photo: 'image' };
    const items = captures.slice(0, 4).map(c => {
        const icon = typeIcons[c.type] || 'file-text';
        const title = c.title || c.raw_input?.slice(0, 40) || 'Untitled';
        const ago = timeAgo(new Date(c.captured_at));
        
        return `
            <div class="capture-widget-item">
                <div class="capture-icon">
                    <i data-lucide="${icon}"></i>
                </div>
                <div style="flex:1;min-width:0">
                    <div class="capture-title">${esc(title)}</div>
                    <div class="capture-meta">${ago}</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="glass-card widget-small captures-widget">
            <div class="widget-header">
                <h3><span class="icon">⚡</span> Recent Captures</h3>
                <a href="/app/captures.html" class="link">→</a>
            </div>
            <div class="widget-body">${items}</div>
        </div>
    `;
}

// ─── Activity Widget ───
function renderActivityWidget(allTasks, events) {
    const items = [];
    const tasks = Array.isArray(allTasks) ? allTasks : [];
    const evts = Array.isArray(events) ? events : [];

    tasks.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4).forEach(t => {
        items.push({ type: 'task', title: t.title, date: new Date(t.created_at) });
    });
    
    items.sort((a, b) => b.date - a.date);
    const top = items.slice(0, 5);

    if (!top.length) {
        return `
            <div class="glass-card widget-small activity-widget">
                <div class="widget-header"><h3><span class="icon">📊</span> Activity</h3></div>
                <div class="widget-body">
                    <div class="empty-state"><div class="emoji">📈</div><p>No recent activity</p></div>
                </div>
            </div>
        `;
    }

    const itemsHtml = top.map(i => {
        const icon = i.type === 'task' ? 'check-square' : 'calendar';
        const cls = i.type === 'task' ? 'task-icon' : 'event-icon';
        const ago = timeAgo(i.date);
        
        return `
            <div class="activity-item">
                <div class="activity-icon ${cls}"><i data-lucide="${icon}"></i></div>
                <div class="activity-text">${esc(i.title)}</div>
                <div class="activity-time">${ago}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="glass-card widget-small activity-widget">
            <div class="widget-header"><h3><span class="icon">📊</span> Activity</h3></div>
            <div class="widget-body">${itemsHtml}</div>
        </div>
    `;
}

// ─── Weather Expand ───
function toggleWeatherExpand(e) {
    e.preventDefault();
    e.stopPropagation();
    const card = document.getElementById('weatherCard');
    if (!card) return;
    card.classList.toggle('weather-collapsed');
    card.classList.toggle('weather-expanded');
}

// ─── Garden Actions ───
async function markWatered(plantId, btn) {
    if (!plantId) return;
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
        await API.post(`/garden/plants/${plantId}/log`, {
            action: 'watered',
            notes: 'Quick water from dashboard'
        });
        const row = btn.closest('.water-alert');
        if (row) {
            row.style.transition = 'all 0.3s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateX(20px)';
            setTimeout(() => row.remove(), 300);
        }
        showToast('Marked as watered! 💧', 'success');
    } catch (err) {
        btn.textContent = '💧';
        btn.disabled = false;
        showToast('Failed to log watering', 'error');
    }
}

// ─── Utilities ───
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

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}
