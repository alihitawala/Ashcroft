/* ═══════════════════════════════════════════════════════════
   Tasks Page — ashcroft.cloud (rebuilt)
   ═══════════════════════════════════════════════════════════ */

// ─── State ───
var taskLists = [];
var tasks = [];
var activeListId = 'all';
var filters = { status: 'active', priority: 'all', assignee: 'all' };
var sortBy = 'due_date';
var selectedIds = new Set();
var showCompleted = false;
var selectMode = false;

// ─── Helpers ───
function isDone(t) { return t.status === 'done'; }

function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function extractDateStr(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('T')) return dateStr.split('T')[0];
    return dateStr.substring(0, 10);
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    var ymd = extractDateStr(dateStr);
    var parts = ymd.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diffDays = Math.round((d - today) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    if (diffDays > 1 && diffDays <= 6) return days[d.getDay()];
    return months[d.getMonth()] + ' ' + d.getDate();
}

function dueDateClass(dateStr, done) {
    if (done) return 'task-due-done';
    var ymd = extractDateStr(dateStr);
    var parts = ymd.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((d - today) / 86400000);
    if (diff < 0) return 'task-due-overdue';
    if (diff === 0) return 'task-due-today';
    if (diff <= 3) return 'task-due-soon';
    return 'task-due-normal';
}

// ─── Boot ───
(async function() {
    try { await requireAuth(); } catch(e) { return; }

    var shell = renderAppShell('Tasks', 'tasks');
    document.getElementById('appLayout').innerHTML =
        shell.sidebar +
        shell.bottomNav +
        '<div class="main-content">' +
            shell.topbar +
            '<div class="main-body" id="tasksBody">' +
                '<div class="skeleton skeleton-card" style="height:40px;margin-bottom:12px"></div>' +
                '<div class="skeleton skeleton-card" style="height:300px"></div>' +
            '</div>' +
        '</div>';
    initAppShell('tasks');
    await loadData();
})();

// ─── Data Loading ───
async function loadData() {
    try {
        var results = await Promise.all([
            API.get('/task-lists').catch(function() { return []; }),
            API.get('/tasks').catch(function() { return []; }),
        ]);
        taskLists = Array.isArray(results[0]) ? results[0] : (results[0]?.items || []);
        tasks = Array.isArray(results[1]) ? results[1] : (results[1]?.items || []);
    } catch (err) {
        showToast('Failed to load tasks', 'error');
        taskLists = [];
        tasks = [];
    }
    render();
}

// ─── Render ───
function render() {
    var body = document.getElementById('tasksBody');
    if (!body) return;
    body.innerHTML =
        '<div class="tasks-toolbar">' +
            '<div class="tasks-toolbar-left">' +
                '<div class="list-selector" id="listSelector">' + renderListTabs() + '</div>' +
                '<button class="btn btn-ghost" onclick="openAddListModal()" title="New List" style="font-size:16px;padding:4px 8px;">+</button>' +
            '</div>' +
            '<div class="tasks-toolbar-right">' +
                '<button class="btn btn-secondary" onclick="toggleSelectMode()" style="font-size:11px;padding:5px 10px;">' +
                    (selectMode ? '<i data-lucide="x" style="width:12px;height:12px;vertical-align:-2px"></i> Cancel' : '<i data-lucide="check-square" style="width:12px;height:12px;vertical-align:-2px"></i> Select') +
                '</button>' +
                '<button class="btn btn-primary" onclick="openFullAddTaskModal()">+ Add Task</button>' +
            '</div>' +
        '</div>' +
        '<div class="filters-row">' +
            '<select class="filter-select" onchange="filters.status=this.value;render()">' +
                '<option value="active"' + (filters.status==='active'?' selected':'') + '>Active</option>' +
                '<option value="all"' + (filters.status==='all'?' selected':'') + '>All</option>' +
                '<option value="completed"' + (filters.status==='completed'?' selected':'') + '>Completed</option>' +
            '</select>' +
            '<select class="filter-select" onchange="filters.priority=this.value;render()">' +
                '<option value="all"' + (filters.priority==='all'?' selected':'') + '>Any Priority</option>' +
                '<option value="urgent"' + (filters.priority==='urgent'?' selected':'') + '>Urgent</option>' +
                '<option value="high"' + (filters.priority==='high'?' selected':'') + '>High</option>' +
                '<option value="normal"' + (filters.priority==='normal'?' selected':'') + '>Normal</option>' +
                '<option value="low"' + (filters.priority==='low'?' selected':'') + '>Low</option>' +
            '</select>' +
            '<select class="filter-select" onchange="filters.assignee=this.value;render()">' +
                '<option value="all"' + (filters.assignee==='all'?' selected':'') + '>Anyone</option>' +
                '<option value="Ali"' + (filters.assignee==='Ali'?' selected':'') + '>Ali</option>' +
                '<option value="Saba"' + (filters.assignee==='Saba'?' selected':'') + '>Saba</option>' +
            '</select>' +
            '<select class="filter-select" onchange="sortBy=this.value;render()">' +
                '<option value="due_date"' + (sortBy==='due_date'?' selected':'') + '>Sort: Due Date</option>' +
                '<option value="priority"' + (sortBy==='priority'?' selected':'') + '>Sort: Priority</option>' +
                '<option value="created"' + (sortBy==='created'?' selected':'') + '>Sort: Created</option>' +
            '</select>' +
        '</div>' +
        (selectedIds.size > 0 ? renderBulkBar() : '') +
        '<div class="tasks-card" id="tasksCard">' + renderTaskRows() + '</div>';
    if (window.lucide) lucide.createIcons();
}

function renderListTabs() {
    var allCount = tasks.filter(function(t) { return !isDone(t); }).length;
    var html = '<button class="list-tab' + (activeListId==='all'?' active':'') + '" onclick="activeListId=\'all\';render()">' +
        'All<span class="list-count">' + allCount + '</span></button>';
    taskLists.forEach(function(l) {
        var count = tasks.filter(function(t) { return t.list_id === l.id && !isDone(t); }).length;
        html += '<button class="list-tab' + (activeListId===l.id?' active':'') + '" onclick="activeListId=' + l.id + ';render()">' +
            esc(l.name) + '<span class="list-count">' + count + '</span></button>';
    });
    return html;
}

function renderBulkBar() {
    return '<div class="bulk-bar">' +
        '<span>' + selectedIds.size + ' selected</span>' +
        '<button class="btn btn-secondary" onclick="bulkComplete()"><i data-lucide="check" style="width:12px;height:12px;vertical-align:-2px"></i> Done</button>' +
        '<button class="btn btn-secondary" onclick="bulkDelete()" style="color:var(--red)"><i data-lucide="trash-2" style="width:12px;height:12px;vertical-align:-2px"></i> Delete</button>' +
        '<button class="btn btn-ghost" onclick="selectedIds.clear();render()">Clear</button>' +
    '</div>';
}

function renderTaskRows() {
    var filtered = getFilteredTasks();
    var active = filtered.filter(function(t) { return !isDone(t); });
    var completed = filtered.filter(function(t) { return isDone(t); });

    if (active.length === 0 && completed.length === 0) {
        return '<div class="empty-state" style="padding:48px 16px;">' +
            '<div class="emoji"><i data-lucide="sparkles"></i></div>' +
            '<p>No tasks yet — add one!</p>' +
            '<button class="btn btn-primary" onclick="openFullAddTaskModal()" style="margin-top:8px;">+ Add Task</button>' +
        '</div>';
    }

    var html = active.map(function(t) { return taskRowHTML(t); }).join('');

    html += '<div class="inline-add">' +
        '<span style="color:var(--accent);font-size:16px;cursor:pointer;" onclick="this.nextElementSibling.focus()">+</span>' +
        '<input type="text" placeholder="Quick add task…" onkeydown="if(event.key===\'Enter\')quickAdd(this)">' +
    '</div>';

    if (completed.length > 0) {
        html += '<div class="completed-toggle" onclick="showCompleted=!showCompleted;render()">' +
            '<span class="arrow' + (showCompleted?' open':'') + '">▶</span>' +
            ' Completed (' + completed.length + ')' +
        '</div>';
        if (showCompleted) {
            html += completed.map(function(t) { return taskRowHTML(t); }).join('');
        }
    }

    return html;
}

function taskRowHTML(t) {
    var done = isDone(t);
    var p = t.priority || 'normal';
    var checked = selectedIds.has(t.id);
    var assigneeName = t.assigned_to_name || '';
    var initial = assigneeName ? assigneeName[0].toUpperCase() : '';

    return '<div class="task-row' + (done ? ' completed' : '') + '" onclick="openTaskDetail(' + t.id + ')">' +
        (selectMode ? '<input type="checkbox" class="task-select-box" ' + (checked?'checked':'') + ' onclick="event.stopPropagation();toggleSelect(' + t.id + ')">' : '') +
        '<div class="task-check' + (done ? ' done' : '') + '" onclick="event.stopPropagation();toggleTaskDone(' + t.id + ',' + !done + ')"></div>' +
        '<div class="task-info">' +
            '<div class="task-row-title' + (done ? ' done' : '') + '">' + esc(t.title) + '</div>' +
            (t.description ? '<div class="task-row-meta">' + esc(t.description).substring(0,60) + '</div>' : '') +
        '</div>' +
        '<span class="priority-badge priority-' + esc(p) + '">' + esc(p) + '</span>' +
        (t.due_date ? '<span class="task-due-badge ' + dueDateClass(t.due_date, done) + '">' + formatRelativeDate(t.due_date) + '</span>' : '') +
        (t.access === 'household' ? '<span style="font-size:10px;"><i data-lucide="home" style="width:10px;height:10px;vertical-align:-1px"></i></span>' : t.access === 'admin' ? '<span style="font-size:10px;"><i data-lucide="shield" style="width:10px;height:10px;vertical-align:-1px"></i></span>' : '') +
        (initial ? '<span class="assigned-avatar" title="' + esc(assigneeName) + '">' + initial + '</span>' : '') +
    '</div>';
}

// ─── Filtering & Sorting ───
function getFilteredTasks() {
    var list = tasks.slice();

    if (activeListId !== 'all') {
        list = list.filter(function(t) { return t.list_id === activeListId; });
    }

    if (filters.status === 'active') list = list.filter(function(t) { return !isDone(t); });
    else if (filters.status === 'completed') list = list.filter(function(t) { return isDone(t); });

    if (filters.priority !== 'all') list = list.filter(function(t) { return t.priority === filters.priority; });

    if (filters.assignee !== 'all') {
        list = list.filter(function(t) { return t.assigned_to_name === filters.assignee; });
    }

    var priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    list.sort(function(a, b) {
        if (sortBy === 'priority') return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
        if (sortBy === 'created') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        var da = a.due_date ? new Date(a.due_date) : new Date('9999-12-31');
        var db = b.due_date ? new Date(b.due_date) : new Date('9999-12-31');
        return da - db;
    });

    return list;
}

// ─── Actions ───
async function toggleTaskDone(id, done) {
    var t = tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    var oldStatus = t.status;
    t.status = done ? 'done' : 'todo';
    render();
    try {
        var updated = await API.put('/tasks/' + id, { status: t.status });
        if (updated) Object.assign(t, updated);
        showToast(done ? 'Task completed ✓' : 'Task reopened');
    } catch (err) {
        t.status = oldStatus;
        render();
        showToast(err.message, 'error');
    }
}

async function quickAdd(input) {
    var title = input.value.trim();
    if (!title) return;
    input.value = '';
    var body = { title: title, priority: 'normal', status: 'todo' };
    if (activeListId !== 'all') body.list_id = activeListId;
    try {
        var newTask = await API.post('/tasks', body);
        if (newTask) tasks.unshift(newTask);
        else await loadData();
        render();
        showToast('Task added ✓');
    } catch (err) { showToast(err.message, 'error'); }
}

function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    render();
}

function toggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) selectedIds.clear();
    render();
}

async function bulkComplete() {
    var ids = Array.from(selectedIds);
    ids.forEach(function(id) { var t = tasks.find(function(x) { return x.id === id; }); if (t) t.status = 'done'; });
    selectedIds.clear();
    render();
    try {
        await Promise.all(ids.map(function(id) { return API.put('/tasks/' + id, { status: 'done' }); }));
        showToast(ids.length + ' tasks completed ✓');
    } catch (err) { showToast(err.message, 'error'); await loadData(); }
}

async function bulkDelete() {
    var ids = Array.from(selectedIds);
    if (!confirm('Delete ' + ids.length + ' task(s)?')) return;
    tasks = tasks.filter(function(t) { return !ids.includes(t.id); });
    selectedIds.clear();
    render();
    try {
        await Promise.all(ids.map(function(id) { return API.delete('/tasks/' + id); }));
        showToast(ids.length + ' tasks deleted');
    } catch (err) { showToast(err.message, 'error'); await loadData(); }
}

async function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    tasks = tasks.filter(function(t) { return t.id !== id; });
    render();
    try {
        await API.delete('/tasks/' + id);
        showToast('Task deleted');
    } catch (err) { showToast(err.message, 'error'); await loadData(); }
}

// ─── Modals ───
function openFullAddTaskModal() {
    var listOpts = taskLists.map(function(l) {
        return '<option value="' + l.id + '"' + (l.id===activeListId?' selected':'') + '>' + esc(l.name) + '</option>';
    }).join('');

    createModal({
        title: 'New Task',
        bodyHTML:
            '<div class="form-group">' +
                '<label>Title</label>' +
                '<input class="form-input" name="title" placeholder="What needs to be done?" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Description</label>' +
                '<textarea class="form-input" name="description" rows="2" placeholder="Details (optional)"></textarea>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group">' +
                    '<label>Priority</label>' +
                    '<select class="form-input" name="priority">' +
                        '<option value="normal">Normal</option>' +
                        '<option value="low">Low</option>' +
                        '<option value="high">High</option>' +
                        '<option value="urgent">Urgent</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Due Date</label>' +
                    '<input class="form-input" name="due_date" type="date" value="' + getTodayStr() + '">' +
                '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
                '<div class="form-group">' +
                    '<label>Assign To</label>' +
                    '<select class="form-input" name="assigned_to">' +
                        '<option value="">Unassigned</option>' +
                        '<option value="ali">Ali</option>' +
                        '<option value="saba">Saba</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>List</label>' +
                    '<select class="form-input" name="list_id">' +
                        '<option value="">None</option>' +
                        listOpts +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Visibility</label>' +
                    '<select class="form-input" name="access">' +
                        '<option value="private" selected>🔒 Private</option>' +
                        '<option value="household">🏠 Family</option>' +
                        (currentUser?.role === 'admin' ? '<option value="admin">👑 Admin</option>' : '') +
                    '</select>' +
                '</div>' +
            '</div>',
        submitLabel: 'Add Task',
        async onSubmit(modal) {
            var title = modal.querySelector('[name="title"]').value.trim();
            if (!title) throw new Error('Title is required');
            var body = {
                title: title,
                description: modal.querySelector('[name="description"]').value.trim(),
                priority: modal.querySelector('[name="priority"]').value,
                due_date: modal.querySelector('[name="due_date"]').value,
                assigned_to: modal.querySelector('[name="assigned_to"]').value,
                list_id: modal.querySelector('[name="list_id"]').value || null,
                status: 'todo',
                access: modal.querySelector('[name="access"]').value,
            };
            var newTask = await API.post('/tasks', body);
            if (newTask) tasks.unshift(newTask);
            else await loadData();
            render();
            showToast('Task added ✓');
        },
    });
}

function openTaskDetail(id) {
    if (selectMode) { toggleSelect(id); return; }
    var t = tasks.find(function(x) { return x.id === id; });
    if (!t) return;

    var listOpts = taskLists.map(function(l) {
        return '<option value="' + l.id + '"' + (l.id===t.list_id?' selected':'') + '>' + esc(l.name) + '</option>';
    }).join('');
    var done = isDone(t);
    var dueDateVal = extractDateStr(t.due_date);

    var aName = (t.assigned_to_name || '').toLowerCase();
    var aliSel = aName === 'ali' ? ' selected' : '';
    var sabaSel = aName === 'saba' ? ' selected' : '';

    createModal({
        title: 'Edit Task',
        bodyHTML:
            '<div class="form-group">' +
                '<label>Title</label>' +
                '<input class="form-input" name="title" value="' + esc(t.title) + '" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Description</label>' +
                '<textarea class="form-input" name="description" rows="3">' + esc(t.description || '') + '</textarea>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group">' +
                    '<label>Priority</label>' +
                    '<select class="form-input" name="priority">' +
                        '<option value="normal"' + (t.priority==='normal'?' selected':'') + '>Normal</option>' +
                        '<option value="low"' + (t.priority==='low'?' selected':'') + '>Low</option>' +
                        '<option value="high"' + (t.priority==='high'?' selected':'') + '>High</option>' +
                        '<option value="urgent"' + (t.priority==='urgent'?' selected':'') + '>Urgent</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Due Date</label>' +
                    '<input class="form-input" name="due_date" type="date" value="' + dueDateVal + '">' +
                '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
                '<div class="form-group">' +
                    '<label>Assign To</label>' +
                    '<select class="form-input" name="assigned_to">' +
                        '<option value="">Unassigned</option>' +
                        '<option value="ali"' + aliSel + '>Ali</option>' +
                        '<option value="saba"' + sabaSel + '>Saba</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>List</label>' +
                    '<select class="form-input" name="list_id">' +
                        '<option value="">None</option>' +
                        listOpts +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Visibility</label>' +
                    '<select class="form-input" name="access">' +
                        '<option value="private"' + (t.access==='private'||!t.access?' selected':'') + '>🔒 Private</option>' +
                        '<option value="household"' + (t.access==='household'?' selected':'') + '>🏠 Family</option>' +
                        (currentUser?.role === 'admin' ? '<option value="admin"' + (t.access==='admin'?' selected':'') + '>👑 Admin</option>' : '') +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" name="completed" ' + (done?'checked':'') + '>' +
                    ' Mark as completed' +
                '</label>' +
                '<button type="button" class="btn btn-ghost" onclick="document.querySelector(\'.modal-backdrop\')?.remove();deleteTask(' + t.id + ')" style="color:var(--red);font-size:12px;"><i data-lucide="trash-2" style="width:12px;height:12px;vertical-align:-2px"></i> Delete</button>' +
            '</div>',
        submitLabel: 'Save Changes',
        async onSubmit(modal) {
            var title = modal.querySelector('[name="title"]').value.trim();
            if (!title) throw new Error('Title is required');
            var completed = modal.querySelector('[name="completed"]').checked;
            var body = {
                title: title,
                description: modal.querySelector('[name="description"]').value.trim(),
                priority: modal.querySelector('[name="priority"]').value,
                due_date: modal.querySelector('[name="due_date"]').value,
                assigned_to: modal.querySelector('[name="assigned_to"]').value,
                list_id: modal.querySelector('[name="list_id"]').value || null,
                status: completed ? 'done' : 'todo',
                access: modal.querySelector('[name="access"]').value,
            };
            var updated = await API.put('/tasks/' + t.id, body);
            if (updated) Object.assign(t, updated);
            render();
            showToast('Task updated ✓');
        },
    });
    if (window.lucide) lucide.createIcons();
}

function openAddListModal() {
    createModal({
        title: 'New List',
        bodyHTML:
            '<div class="form-group">' +
                '<label>Name</label>' +
                '<input class="form-input" name="name" placeholder="e.g. Home, Work, Shopping…" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Visibility</label>' +
                '<select class="form-input" name="access">' +
                    '<option value="private" selected>🔒 Private</option>' +
                    '<option value="household">🏠 Family</option>' +
                    (currentUser?.role === 'admin' ? '<option value="admin">👑 Admin</option>' : '') +
                '</select>' +
            '</div>',
        submitLabel: 'Create List',
        async onSubmit(modal) {
            var name = modal.querySelector('[name="name"]').value.trim();
            if (!name) throw new Error('Name is required');
            var newList = await API.post('/task-lists', {
                name: name,
                access: modal.querySelector('[name="access"]').value,
            });
            if (newList) taskLists.push(newList);
            else await loadData();
            render();
            showToast('List created ✓');
        },
    });
}
