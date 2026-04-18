/* ═══════════════════════════════════════════════════════════
   ashcroft.cloud — Shared JavaScript
   Auth, theme, sidebar, API helpers, modals, toasts
   ═══════════════════════════════════════════════════════════ */

// ─── API Helper ───
const API = {
    _refreshing: null,
    async request(method, path, body, _retried) {
        const opts = {
            method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`/api${path}`, opts);
        // Auto-refresh on 401 (expired access token)
        if (res.status === 401 && !_retried && path !== '/auth/refresh' && path !== '/auth/login' && path !== '/auth/me') {
            const refreshed = await this._tryRefresh();
            if (refreshed) return this.request(method, path, body, true);
            // Refresh failed — redirect to login (unless already there)
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = '/app/login.html';
            }
            throw new Error('Session expired');
        }
        const data = res.headers.get('content-type')?.includes('json')
            ? await res.json()
            : null;
        if (!res.ok) {
            const err = new Error(data?.error || `Request failed (${res.status})`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    },
    async _tryRefresh() {
        // Dedupe concurrent refresh calls
        if (this._refreshing) return this._refreshing;
        this._refreshing = (async () => {
            try {
                const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
                return res.ok;
            } catch { return false; }
            finally { this._refreshing = null; }
        })();
        return this._refreshing;
    },
    get(path) { return this.request('GET', path); },
    post(path, body) { return this.request('POST', path, body); },
    put(path, body) { return this.request('PUT', path, body); },
    delete(path) { return this.request('DELETE', path); },
};

// ─── Auth ───
let currentUser = null;

async function checkAuth() {
    try {
        const data = await API.get('/auth/me');
        currentUser = data?.user || data;
        return currentUser;
    } catch {
        currentUser = null;
        return null;
    }
}

async function requireAuth() {
    const user = await checkAuth();
    if (!user) {
        window.location.href = '/app/login.html';
        throw new Error('Not authenticated');
    }
    return user;
}

async function clearCacheReload() {
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
    } catch {}
    window.location.reload(true);
}

async function logout() {
    try { await API.post('/auth/logout'); } catch {}
    window.location.href = '/app/login.html';
}

// ─── Theme ───
function getTheme() {
    return localStorage.getItem('theme') || 'light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    // Update any theme toggle buttons
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    });
}

function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// Apply saved theme immediately
setTheme(getTheme());

// ─── Sidebar ───
function openSidebar() {
    document.querySelector('.sidebar')?.classList.add('open');
    document.querySelector('.sidebar-backdrop')?.classList.add('visible');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-backdrop')?.classList.remove('visible');
    document.body.style.overflow = '';
}

// Reset overflow if resized to desktop while sidebar was open
window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
        document.body.style.overflow = '';
        closeSidebar();
    }
});

// ─── Time Formatting ───
function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelativeDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((target - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 0 && diff <= 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
    return formatDate(dateStr);
}

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Toast Notifications ───
function ensureToastContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) {
        c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
    }
    return c;
}

function showToast(message, type = 'success') {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Modal ───
function createModal({ title, bodyHTML, onSubmit, submitLabel = 'Save' }) {
    // Remove any existing modal
    document.querySelector('.modal-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop visible';

    backdrop.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">${bodyHTML}</div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
                <button class="btn btn-primary modal-submit-btn">${submitLabel}</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const close = () => { backdrop.remove(); document.removeEventListener('keydown', escHandler); };
    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    backdrop.querySelector('.modal-close').onclick = close;
    backdrop.querySelector('.modal-cancel-btn').onclick = close;
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });

    const submitBtn = backdrop.querySelector('.modal-submit-btn');
    submitBtn.onclick = async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>';
        try {
            await onSubmit(backdrop);
            close();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
        }
    };

    // Focus first input
    setTimeout(() => {
        backdrop.querySelector('input, textarea, select')?.focus();
    }, 50);

    return { close, backdrop };
}

// ─── Quick-Add Modals ───
function openAddTaskModal() {
    createModal({
        title: '➕ Add Task',
        bodyHTML: `
            <div class="form-group">
                <label>Title</label>
                <input class="form-input" name="title" placeholder="What needs to be done?" required>
            </div>
            <div class="form-group">
                <label>Due Date</label>
                <input class="form-input" name="due_date" type="date" value="${getTodayStr()}">
            </div>
            <div class="form-group">
                <label>Priority</label>
                <select class="form-input" name="priority">
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                </select>
            </div>
        `,
        submitLabel: 'Add Task',
        async onSubmit(modal) {
            const title = modal.querySelector('[name="title"]').value.trim();
            if (!title) throw new Error('Title is required');
            await API.post('/tasks', {
                title,
                due_date: modal.querySelector('[name="due_date"]').value || null,
                priority: modal.querySelector('[name="priority"]').value,
            });
            showToast('Task added ✓');
            if (typeof refreshDashboard === 'function') refreshDashboard();
        },
    });
}

function openAddGroceryModal() {
    createModal({
        title: '🛒 Add Grocery Item',
        bodyHTML: `
            <div class="form-group">
                <label>Item</label>
                <input class="form-input" name="name" placeholder="e.g. Milk, Eggs..." required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <select class="form-input" name="category">
                    <option value="produce">Produce</option>
                    <option value="dairy">Dairy</option>
                    <option value="pantry">Pantry</option>
                    <option value="meat">Meat</option>
                    <option value="frozen">Frozen</option>
                    <option value="household">Household</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Quantity</label>
                <input class="form-input" name="quantity" placeholder="e.g. 2, 1 lb" value="1">
            </div>
        `,
        submitLabel: 'Add Item',
        async onSubmit(modal) {
            const name = modal.querySelector('[name="name"]').value.trim();
            if (!name) throw new Error('Item name is required');
            // Get or create default list
            let lists = await API.get('/grocery-lists').catch(() => []);
            if (!Array.isArray(lists)) lists = [];
            if (lists.length === 0) {
                const newList = await API.post('/grocery-lists', { name: 'Grocery', type: 'shared' });
                lists = [newList];
            }
            await API.post('/grocery-items', {
                list_id: lists[0].id,
                name,
                category: modal.querySelector('[name="category"]').value,
                quantity: modal.querySelector('[name="quantity"]').value || '1',
            });
            showToast('Grocery item added ✓');
            if (typeof refreshDashboard === 'function') refreshDashboard();
        },
    });
}

function openAddEventModal() {
    const today = new Date();
    const defaultDate = today.toISOString().split('T')[0];
    const defaultTime = '12:00';
    
    createModal({
        title: '📅 Add Event',
        bodyHTML: `
            <div class="form-group">
                <label>Title</label>
                <input class="form-input" name="title" placeholder="Event title" required>
            </div>
            <div class="form-group">
                <label>Date</label>
                <input class="form-input" name="date" type="date" value="${defaultDate}" required>
            </div>
            <div class="form-group">
                <label>Time</label>
                <input class="form-input" name="time" type="time" value="${defaultTime}">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea class="form-input" name="description" rows="2" placeholder="Optional details..."></textarea>
            </div>
        `,
        submitLabel: 'Add Event',
        async onSubmit(modal) {
            const title = modal.querySelector('[name="title"]').value.trim();
            if (!title) throw new Error('Event title is required');
            
            const date = modal.querySelector('[name="date"]').value;
            const time = modal.querySelector('[name="time"]').value;
            const description = modal.querySelector('[name="description"]').value.trim();
            
            await API.post('/events', {
                title,
                date: date || defaultDate,
                time: time || null,
                description: description || null,
            });
            showToast('Event added ✓');
            if (typeof refreshDashboard === 'function') refreshDashboard();
        },
    });
}

function openAddNoteModal() {
    createModal({
        title: '📝 Quick Note',
        bodyHTML: `
            <div class="form-group">
                <label>Title</label>
                <input class="form-input" name="title" placeholder="Note title">
            </div>
            <div class="form-group">
                <label>Content</label>
                <textarea class="form-input" name="content" rows="4" placeholder="Write something..."></textarea>
            </div>
        `,
        submitLabel: 'Save Note',
        async onSubmit(modal) {
            const title = modal.querySelector('[name="title"]').value.trim();
            const content = modal.querySelector('[name="content"]').value.trim();
            if (!title && !content) throw new Error('Note cannot be empty');
            await API.post('/notes', { title, content });
            showToast('Note saved ✓');
            if (typeof refreshDashboard === 'function') refreshDashboard();
        },
    });
}

// ─── App Shell Initialization ───
function initAppShell(activePage) {
    // Close sidebar on backdrop click
    document.querySelector('.sidebar-backdrop')?.addEventListener('click', closeSidebar);

    // Hamburger
    document.querySelector('.hamburger')?.addEventListener('click', openSidebar);

    // Theme toggle
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    // Logout
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });

    // Highlight active nav
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        if (a.getAttribute('data-page') === activePage) {
            a.classList.add('active');
        }
    });

    // Bottom nav "More" toggle
    const moreBtn = document.querySelector('.bottom-nav-more');
    const moreMenu = document.querySelector('.bottom-nav-menu');
    if (moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            moreMenu.classList.toggle('visible');
            moreBtn.classList.toggle('active');
        });
        // Close menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.bottom-nav-more') && !e.target.closest('.bottom-nav-menu')) {
                moreMenu.classList.remove('visible');
                moreBtn.classList.remove('active');
            }
        });
    }

    // Mark active bottom nav for notes/settings
    if (['notes','settings'].includes(activePage)) {
        const moreEl = document.querySelector('.bottom-nav-more');
        if (moreEl) moreEl.classList.add('active');
    }

    // Load Lucide icons
    const lucideScript = document.createElement('script');
    lucideScript.src = '/libs/lucide.min.js';
    lucideScript.onload = () => lucide.createIcons();
    document.head.appendChild(lucideScript);

    // Set user info
    if (currentUser) {
        document.querySelectorAll('.user-display-name').forEach(el => {
            el.textContent = currentUser.name || currentUser.email;
        });
        document.querySelectorAll('.user-display-role').forEach(el => {
            el.textContent = currentUser.role || 'User';
        });
        document.querySelectorAll('.user-avatar-initial').forEach(el => {
            el.textContent = (currentUser.name || currentUser.email)[0].toUpperCase();
        });
    }
}

// ─── Render App Shell HTML ───
// Call this to inject the sidebar + topbar into a page
function renderAppShell(pageTitle, activePage) {
    return {
        sidebar: `
            <div class="sidebar-backdrop"></div>
            <aside class="sidebar">
                <div class="sidebar-header">
                    <a href="/app/dashboard.html" class="sidebar-logo">ashcroft<span class="dot">.</span>cloud</a>
                </div>
                <nav class="sidebar-nav">
                    <a href="/app/dashboard.html" data-page="dashboard"><i data-lucide="home" class="nav-icon"></i> Dashboard</a>
                    <a href="/app/grocery.html" data-page="grocery"><i data-lucide="shopping-cart" class="nav-icon"></i> Grocery</a>
                    <a href="/app/gallery.html" data-page="gallery"><i data-lucide="camera" class="nav-icon"></i> Gallery</a>
                    <a href="/app/garden.html" data-page="garden"><i data-lucide="flower-2" class="nav-icon"></i> Garden</a>
                    <a href="/app/captures.html" data-page="captures"><i data-lucide="aperture" class="nav-icon"></i> Captures</a>
                    <a href="/app/events.html" data-page="events"><i data-lucide="calendar" class="nav-icon"></i> Events</a>
                    <a href="/app/notes.html" data-page="notes"><i data-lucide="file-text" class="nav-icon"></i> Notes</a>
                    <a href="/app/tasks.html" data-page="tasks"><i data-lucide="check-square" class="nav-icon"></i> Tasks</a>
                    <a href="/app/settings.html" data-page="settings"><i data-lucide="settings" class="nav-icon"></i> Settings</a>
                </nav>
                <div class="sidebar-bottom">
                    <div class="user-info">
                        <div class="avatar user-avatar-initial">A</div>
                        <div>
                            <div class="user-name user-display-name">User</div>
                            <div class="user-role user-display-role">User</div>
                        </div>
                    </div>
                </div>
            </aside>
        `,
        topbar: `
            <div class="topbar">
                <div class="topbar-left">
                    <button class="hamburger" aria-label="Menu"><i data-lucide="menu"></i></button>
                    <span class="topbar-title">${pageTitle}</span>
                </div>
                <div class="topbar-right">
                </div>
            </div>
        `,
        bottomNav: `
            <nav class="bottom-nav">
                <a href="/app/dashboard.html" class="bottom-nav-item${activePage==='dashboard'?' active':''}" data-page="dashboard">
                    <i data-lucide="home" class="bottom-nav-icon"></i><span class="bottom-nav-label">Home</span>
                </a>
                <a href="/app/grocery.html" class="bottom-nav-item${activePage==='grocery'?' active':''}" data-page="grocery">
                    <i data-lucide="shopping-cart" class="bottom-nav-icon"></i><span class="bottom-nav-label">Grocery</span>
                </a>
                <a href="/app/gallery.html" class="bottom-nav-item${activePage==='gallery'?' active':''}" data-page="gallery">
                    <i data-lucide="camera" class="bottom-nav-icon"></i><span class="bottom-nav-label">Gallery</span>
                </a>
                <a href="/app/garden.html" class="bottom-nav-item${activePage==='garden'?' active':''}" data-page="garden">
                    <i data-lucide="flower-2" class="bottom-nav-icon"></i><span class="bottom-nav-label">Garden</span>
                </a>
                <a href="/app/sports.html" class="bottom-nav-item${activePage==='sports'?' active':''}" data-page="sports">
                    <i data-lucide="trophy" class="bottom-nav-icon"></i><span class="bottom-nav-label">Sports</span>
                </a>
                <a href="#" class="bottom-nav-item bottom-nav-more" data-page="more">
                    <i data-lucide="more-horizontal" class="bottom-nav-icon"></i><span class="bottom-nav-label">More</span>
                </a>
                <div class="bottom-nav-menu">
                    <a href="/app/captures.html" class="bottom-nav-menu-item${activePage==='captures'?' active':''}"><i data-lucide="aperture" class="menu-icon"></i> Captures</a>
                    <a href="/app/events.html" class="bottom-nav-menu-item${activePage==='events'?' active':''}"><i data-lucide="calendar" class="menu-icon"></i> Events</a>
                    <a href="/app/notes.html" class="bottom-nav-menu-item${activePage==='notes'?' active':''}"><i data-lucide="file-text" class="menu-icon"></i> Notes</a>
                    <a href="/app/tasks.html" class="bottom-nav-menu-item${activePage==='tasks'?' active':''}"><i data-lucide="check-square" class="menu-icon"></i> Tasks</a>
                    <a href="/app/settings.html" class="bottom-nav-menu-item${activePage==='settings'?' active':''}"><i data-lucide="settings" class="menu-icon"></i> Settings</a>
                    <a href="#" class="bottom-nav-menu-item" onclick="event.preventDefault();clearCacheReload()"><i data-lucide="refresh-cw" class="menu-icon"></i> Clear Cache</a>
                </div>
            </nav>
        `,
    };
}

// ─── Service Worker Registration ───
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/app/sw.js')
            .then((registration) => {
                console.log('SW: Registered successfully', registration.scope);
            })
            .catch((error) => {
                console.log('SW: Registration failed', error);
            });
    });
}
