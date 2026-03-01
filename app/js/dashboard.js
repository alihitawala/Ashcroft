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
                <div class="quick-actions" id="quickActions"></div>
                <div class="summary-grid" id="summaryGrid">${skeletonCards(4)}</div>
                <div class="dash-grid" id="widgets">${skeletonWidget()}${skeletonWidget()}${skeletonWidget()}${skeletonWidget()}</div>
            </div>
        </div>
    `;
    initAppShell('dashboard');
    renderGreeting();
    renderQuickActions();
    await loadDashboard();
})();

// ─── State ───
let todayTasks = [];

// ─── Load All Data ───
async function loadDashboard() {
    const [allTasks, todayRes, events, grocery, watering, gardenDash, sportsNext, recentCaptures] = await Promise.all([
        API.get('/tasks').catch(() => []),
        API.get('/tasks?due=today').catch(() => []),
        API.get('/events?upcoming=5').catch(() => []),
        API.get('/grocery-items?list_id=1').catch(() => []),
        API.get('/garden/watering-schedule').catch(() => ({ overdue: [], today: [], soon: [], upcoming: [] })),
        API.get('/garden/plants/dashboard').catch(() => ({ needs_attention_count: 0, recommendations: [] })),
        API.get('/sports/next-up').catch(() => null),
        API.get('/captures/recent').catch(() => []),
    ]);

    const norm = v => Array.isArray(v) ? v : (v?.items || []);
    const tasks = norm(allTasks);
    todayTasks = norm(todayRes);
    const evts = norm(events);
    const groceryItems = norm(grocery);

    const incompleteTasks = tasks.filter(t => !t.completed && t.status !== 'done').length;
    const uncheckedGrocery = groceryItems.filter(i => !i.checked).length;
    const needsAttention = gardenDash.needs_attention_count || 0;

    renderSummary(incompleteTasks, evts.length, uncheckedGrocery, needsAttention);
    renderWidgets(evts, watering, gardenDash, tasks, sportsNext, recentCaptures);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Greeting ───
function renderGreeting() {
    const name = currentUser?.name?.split(' ')[0] || 'there';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    document.getElementById('greeting').innerHTML = `
        <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:4px;">${getGreeting()}, ${name}</h1>
        <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:20px;">${dateStr}</p>
    `;
}

// ─── Quick Actions ───
function renderQuickActions() {
    document.getElementById('quickActions').innerHTML = `
        <div class="quick-actions-grid">
            <button class="btn btn-secondary quick-action-btn" onclick="openAddTaskModal()"><i data-lucide="check-square" class="quick-action-icon"></i><span>Task</span></button>
            <button class="btn btn-secondary quick-action-btn" onclick="openAddEventModal()"><i data-lucide="calendar" class="quick-action-icon"></i><span>Event</span></button>
            <button class="btn btn-secondary quick-action-btn" onclick="openAddGroceryModal()"><i data-lucide="shopping-cart" class="quick-action-icon"></i><span>Grocery</span></button>
            <button class="btn btn-secondary quick-action-btn" onclick="openAddNoteModal()"><i data-lucide="file-text" class="quick-action-icon"></i><span>Note</span></button>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Summary Cards ───
function renderSummary(taskCount, eventCount, groceryCount, gardenCount) {
    document.getElementById('summaryGrid').innerHTML = `
        <a href="/app/tasks.html" class="summary-card">
            <div class="summary-label">Tasks</div>
            <div class="summary-value val-blue">${taskCount}</div>
            <div class="summary-sub">Incomplete</div>
        </a>
        <a href="/app/events.html" class="summary-card">
            <div class="summary-label">Events</div>
            <div class="summary-value val-amber">${eventCount}</div>
            <div class="summary-sub">Upcoming</div>
        </a>
        <a href="/app/grocery.html" class="summary-card">
            <div class="summary-label">Grocery</div>
            <div class="summary-value val-green">${groceryCount}</div>
            <div class="summary-sub">Items needed</div>
        </a>
        <a href="/app/garden.html" class="summary-card">
            <div class="summary-label">Garden</div>
            <div class="summary-value val-accent">${gardenCount}</div>
            <div class="summary-sub">Needs attention</div>
        </a>
    `;
}

// ─── Widgets ───
function renderWidgets(events, watering, gardenDash, allTasks, sportsNext, recentCaptures) {
    document.getElementById('widgets').innerHTML = `
        ${renderSportsNextUp(sportsNext)}
        <div class="card">
            <div class="card-header"><h3>Today's Tasks</h3><a href="/app/tasks.html" class="link">View All →</a></div>
            <div class="card-body" id="tasksList">${renderTodayTasks()}</div>
        </div>
        <div class="card">
            <div class="card-header"><h3>Upcoming Events</h3><a href="/app/events.html" class="link">View All →</a></div>
            <div class="card-body">${renderEvents(events)}</div>
        </div>
        <div class="card">
            <div class="card-header"><h3>Recent Captures</h3><a href="/app/captures.html" class="link">View All →</a></div>
            <div class="card-body">${renderRecentCaptures(recentCaptures)}</div>
        </div>
        <div class="card">
            <div class="card-header"><h3>Garden Overview</h3><a href="/app/garden.html" class="link">View All →</a></div>
            <div class="card-body">${renderGarden(watering, gardenDash)}</div>
        </div>
        <div class="card">
            <div class="card-header"><h3>Recent Activity</h3></div>
            <div class="card-body">${renderActivity(allTasks, events)}</div>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
    // Filter out past events client-side as safety net
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
        const dateStr = (e.date || '').split('T')[0]; // "2026-02-28"
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
        // Recommendations can be strings or objects with description/action fields
        const recText = typeof rec === 'string' ? rec
            : (rec.description || rec.action || rec.message || rec.recommendation || rec.text || JSON.stringify(rec));
        const plantName = rec.plant_name ? `<strong>${esc(rec.plant_name)}:</strong> ` : '';
        html += `<div class="garden-rec"><i data-lucide="lightbulb" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px;"></i> ${plantName}${esc(recText)}</div>`;
    }

    return html;
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

// ─── Sports Next Up Widget ───
function renderSportsNextUp(data) {
    const events = data?.data || data;
    if (!events || !events.length) return '';
    const icons = { football: '⚽', cricket: '🏏', tennis: '🎾', f1: '🏎️' };
    const colors = { football: '#2D8544', cricket: '#FF9933', tennis: '#4CAF50', f1: '#FF1801' };
    const items = events.slice(0, 3).map(e => {
        const dt = e.date ? new Date(e.date) : null;
        const timeStr = dt ? dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
        const relTime = dt ? getRelativeTime(dt) : '';
        return `<div class="sports-next-item" style="border-left: 3px solid ${colors[e.sport] || '#666'}">
            <div style="font-size:20px">${icons[e.sport] || '🏅'}</div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title || e.name || 'TBA')}</div>
                <div style="font-size:11px;opacity:0.6">${e.competition || e.series || ''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:11px;font-weight:600;color:${colors[e.sport] || '#888'}">${relTime}</div>
                <div style="font-size:10px;opacity:0.5">${timeStr}</div>
            </div>
        </div>`;
    }).join('');
    return `<div class="card">
        <div class="card-header"><h3>⚡ Sports Next Up</h3><a href="/app/sports.html" class="link">View All →</a></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px">${items}</div>
    </div>`;
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
function skeletonCards(n) { return Array(n).fill('<div class="summary-card"><div class="skeleton skeleton-line" style="width:60%"></div><div class="skeleton skeleton-line" style="width:30%;height:28px"></div><div class="skeleton skeleton-line" style="width:40%"></div></div>').join(''); }
function skeletonWidget() { return `<div class="card"><div class="card-header"><div class="skeleton skeleton-line" style="width:40%"></div></div><div class="card-body">${Array(3).fill('<div class="skeleton skeleton-line"></div>').join('')}</div></div>`; }
