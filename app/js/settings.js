let userInfo = null;
let allUsers = [];
let householdInfo = null;
let householdMembers = [];

(async () => {
    try { await requireAuth(); } catch { return; }
    userInfo = currentUser;

    const shell = renderAppShell('Settings', 'settings');
    document.getElementById('appLayout').innerHTML = `
        ${shell.sidebar}
            ${shell.bottomNav}
        <div class="main-content">
            ${shell.topbar}
            <div class="main-body" id="settingsBody"></div>
        </div>
    `;
    initAppShell('settings');

    // Load full profile
    try {
        const data = await API.get('/auth/me');
        userInfo = data.user || data;
    } catch {}

    // Load users if admin
    if (userInfo.role === 'admin') {
        try { allUsers = await API.get('/auth/users'); } catch {}
    }

    // Use household name from /auth/me response
    if (userInfo.household_id) {
        householdInfo = { name: userInfo.household_name || 'Unknown' };
        if (userInfo.role === 'admin') {
            householdMembers = allUsers.filter(u => u.household_id === userInfo.household_id);
        } else {
            householdMembers = [userInfo];
        }
    }

    render();
})();

function render() {
    const body = document.getElementById('settingsBody');
    body.innerHTML = `
        <div class="settings-section">
            <h2><i data-lucide="user"></i> Profile</h2>
            <div class="form-group">
                <label>Display Name</label>
                <input class="form-input" id="nameInput" value="${esc(userInfo.name || '')}" style="max-width:400px">
            </div>
            <button class="btn btn-primary" onclick="saveName()">Save Name</button>
        </div>

        <div class="settings-section">
            <h2><i data-lucide="palette"></i> Theme</h2>
            <div class="theme-picker">
                <div class="theme-option ${getTheme()==='dark'?'active':''}" onclick="pickTheme('dark')">
                    <div class="preview dark-preview"></div>
                    <div class="label"><i data-lucide="moon" style="width:14px;height:14px;vertical-align:-2px"></i> Dark</div>
                </div>
                <div class="theme-option ${getTheme()==='light'?'active':''}" onclick="pickTheme('light')">
                    <div class="preview light-preview"></div>
                    <div class="label"><i data-lucide="sun" style="width:14px;height:14px;vertical-align:-2px"></i> Light</div>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h2><i data-lucide="key-round"></i> Change Password</h2>
            <div class="password-form">
                <div class="form-group">
                    <label>Current Password</label>
                    <input class="form-input" id="currentPw" type="password" autocomplete="current-password">
                </div>
                <div class="form-group">
                    <label>New Password</label>
                    <input class="form-input" id="newPw" type="password" autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label>Confirm New Password</label>
                    <input class="form-input" id="confirmPw" type="password" autocomplete="new-password">
                </div>
                <button class="btn btn-primary" onclick="changePassword()">Update Password</button>
            </div>
        </div>

        <div class="settings-section">
            <h2><i data-lucide="info"></i> Account Info</h2>
            <div class="settings-row">
                <div><div class="settings-row-label">Email</div></div>
                <div class="settings-row-value">${esc(userInfo.email)}</div>
            </div>
            <div class="settings-row">
                <div><div class="settings-row-label">Role</div></div>
                <div class="settings-row-value"><span class="role-badge role-${userInfo.role}">${userInfo.role}</span></div>
            </div>
            <div class="settings-row">
                <div><div class="settings-row-label">Member Since</div></div>
                <div class="settings-row-value">${userInfo.created_at ? new Date(userInfo.created_at).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) : '—'}</div>
            </div>
        </div>

        <div class="settings-section">
            <h2><i data-lucide="home"></i> Household</h2>
            <div class="form-group" style="margin-bottom:12px">
                <label>Household Name</label>
                <div style="display:flex;gap:8px;align-items:center;max-width:400px">
                    <input class="form-input" id="householdNameInput" value="${esc(householdInfo?.name || '')}" style="flex:1">
                    <button class="btn btn-primary" onclick="saveHouseholdName()" style="white-space:nowrap">Save</button>
                </div>
            </div>
            <div class="settings-row">
                <div><div class="settings-row-label">Your Role</div></div>
                <div class="settings-row-value"><span class="role-badge role-${userInfo.household_role}">${userInfo.household_role}</span></div>
            </div>
            <div class="settings-row">
                <div><div class="settings-row-label">Household Members</div></div>
                <div class="settings-row-value">${householdMembers?.length || 0} members</div>
            </div>
        </div>

        ${userInfo.role === 'admin' ? renderUserManagement() : ''}
    `;
    if (window.lucide) lucide.createIcons();
}

function renderUserManagement() {
    return `
    <div class="settings-section">
        <h2><i data-lucide="users"></i> User Management</h2>
        <table class="user-table">
            <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
                ${allUsers.map(u => `
                    <tr>
                        <td>${esc(u.name || '—')}</td>
                        <td>${esc(u.email)}</td>
                        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                        <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
                        <td>${u.id !== userInfo.id ? `<button class="btn btn-ghost" style="color:var(--red);font-size:11px" onclick="deleteUser(${u.id},'${esc(u.name||u.email)}')">Delete</button>` : '<span style="font-size:11px;color:var(--text-tertiary)">You</span>'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    <div class="settings-section" style="border-top: 1px solid var(--border); margin-top: 16px; padding-top: 16px;">
        <div style="display:flex;gap:10px">
            <button class="btn" style="flex:1;background:var(--surface2);color:var(--text-secondary);border:1px solid var(--border);padding:12px;border-radius:10px;font-size:14px;cursor:pointer" onclick="hardRefresh()"><i data-lucide="refresh-cw" style="width:14px;height:14px;vertical-align:-2px"></i> Clear Cache & Reload</button>
            <button class="btn" style="flex:1;background:var(--red-bg,#fee);color:var(--red,#e74c3c);border:1px solid var(--red,#e74c3c);padding:12px;border-radius:10px;font-size:14px;cursor:pointer" onclick="logout()"><i data-lucide="log-out" style="width:14px;height:14px;vertical-align:-2px"></i> Sign Out</button>
        </div>
    </div>`;
}

async function saveHouseholdName() {
    const name = document.getElementById('householdNameInput').value.trim();
    if (!name) return showToast('Household name cannot be empty', 'error');
    try {
        await API.put('/auth/me', { household_name: name });
        householdInfo.name = name;
        showToast('Household name updated ✓');
    } catch (err) { showToast(err.message, 'error'); }
}

async function saveName() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) return showToast('Name cannot be empty', 'error');
    try {
        const data = await API.put('/auth/me', { name });
        userInfo = data.user || data;
        showToast('Name updated ✓');
        // Update sidebar
        document.querySelectorAll('.user-display-name').forEach(el => el.textContent = userInfo.name);
    } catch (err) { showToast(err.message, 'error'); }
}

function pickTheme(theme) {
    setTheme(theme);
    API.put('/auth/me', { theme }).catch(() => {});
    render();
}

async function changePassword() {
    const current = document.getElementById('currentPw').value;
    const newPw = document.getElementById('newPw').value;
    const confirm = document.getElementById('confirmPw').value;
    if (!current) return showToast('Enter current password', 'error');
    if (!newPw || newPw.length < 8) return showToast('New password must be at least 8 characters', 'error');
    if (newPw !== confirm) return showToast('Passwords do not match', 'error');
    try {
        await API.put('/auth/me', { password: newPw, currentPassword: current });
        showToast('Password updated ✓');
        document.getElementById('currentPw').value = '';
        document.getElementById('newPw').value = '';
        document.getElementById('confirmPw').value = '';
    } catch (err) { showToast(err.message, 'error'); }
}

async function deleteUser(id, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
        await API.delete(`/auth/users/${id}`);
        allUsers = allUsers.filter(u => u.id !== id);
        render();
        showToast('User deleted ✓');
    } catch (err) { showToast(err.message, 'error'); }
}

async function hardRefresh() {
    try {
        // 1. Unregister all service workers
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
        // 2. Clear all caches
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        // 3. Hard reload (bypass browser cache)
        window.location.reload(true);
    } catch (err) {
        window.location.reload(true);
    }
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}
