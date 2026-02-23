/* ═══════════════════════════════════════════════════════════
   ashcroft.cloud — Navigation
   Sidebar, bottom nav, theme toggle, PWA registration
   ═══════════════════════════════════════════════════════════ */

// ─── Theme ───
function getTheme() {
    return localStorage.getItem('theme') || 'light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
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

window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
        document.body.style.overflow = '';
        closeSidebar();
    }
});

// ─── Render App Shell HTML ───
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
                    <a href="/app/flights.html" data-page="flights"><i data-lucide="plane" class="nav-icon"></i> Flights</a>
                    <a href="/app/events.html" data-page="events"><i data-lucide="calendar" class="nav-icon"></i> Events</a>
                    <a href="/app/notes.html" data-page="notes"><i data-lucide="file-text" class="nav-icon"></i> Notes</a>
                    ${currentUser?.role === 'admin' ? '<a href="/app/kanban.html" data-page="kanban"><i data-lucide="kanban" class="nav-icon"></i> Kanban</a>' : ''}
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
                <a href="/app/flights.html" class="bottom-nav-item${activePage==='flights'?' active':''}" data-page="flights">
                    <i data-lucide="plane" class="bottom-nav-icon"></i><span class="bottom-nav-label">Flights</span>
                </a>
                <a href="#" class="bottom-nav-item bottom-nav-more" data-page="more">
                    <i data-lucide="more-horizontal" class="bottom-nav-icon"></i><span class="bottom-nav-label">More</span>
                </a>
                <div class="bottom-nav-menu">
                    <a href="/app/events.html" class="bottom-nav-menu-item${activePage==='events'?' active':''}"><i data-lucide="calendar" class="menu-icon"></i> Events</a>
                    <a href="/app/notes.html" class="bottom-nav-menu-item${activePage==='notes'?' active':''}"><i data-lucide="file-text" class="menu-icon"></i> Notes</a>
                    ${currentUser?.role === 'admin' ? `<a href="/app/kanban.html" class="bottom-nav-menu-item${activePage==='kanban'?' active':''}"><i data-lucide="kanban" class="menu-icon"></i> Kanban</a>` : ''}
                    <a href="/app/tasks.html" class="bottom-nav-menu-item${activePage==='tasks'?' active':''}"><i data-lucide="check-square" class="menu-icon"></i> Tasks</a>
                    <a href="/app/settings.html" class="bottom-nav-menu-item${activePage==='settings'?' active':''}"><i data-lucide="settings" class="menu-icon"></i> Settings</a>
                    <a href="#" class="bottom-nav-menu-item" onclick="event.preventDefault();clearCacheReload()"><i data-lucide="refresh-cw" class="menu-icon"></i> Clear Cache</a>
                </div>
            </nav>
        `,
    };
}

// ─── App Shell Initialization ───
function initAppShell(activePage) {
    document.querySelector('.sidebar-backdrop')?.addEventListener('click', closeSidebar);
    document.querySelector('.hamburger')?.addEventListener('click', openSidebar);

    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });

    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        if (a.getAttribute('data-page') === activePage) {
            a.classList.add('active');
        }
    });

    const moreBtn = document.querySelector('.bottom-nav-more');
    const moreMenu = document.querySelector('.bottom-nav-menu');
    if (moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            moreMenu.classList.toggle('visible');
            moreBtn.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.bottom-nav-more') && !e.target.closest('.bottom-nav-menu')) {
                moreMenu.classList.remove('visible');
                moreBtn.classList.remove('active');
            }
        });
    }

    if (['notes','kanban','settings'].includes(activePage)) {
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
