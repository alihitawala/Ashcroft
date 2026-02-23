/* ═══════════════════════════════════════════════════════════
   ashcroft.cloud — API Helper
   Centralized fetch wrapper with auth error handling
   ═══════════════════════════════════════════════════════════ */

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
