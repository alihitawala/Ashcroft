/* ═══════════════════════════════════════════════════════════
   ashcroft.cloud — Auth
   Login check, user state, role checks, logout
   ═══════════════════════════════════════════════════════════ */

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
