/* ═══════════════════════════════════════════════════════════
   Kanban Board — Ali & Bittu Collaboration Space
   ═══════════════════════════════════════════════════════════ */

var LABELS = {
    'Website':   { bg: 'rgba(99,91,255,0.2)',  color: '#635BFF' },
    'Home Auto': { bg: 'rgba(16,185,129,0.2)', color: '#10B981' },
    'Infra':     { bg: 'rgba(245,158,11,0.2)', color: '#F59E0B' },
    'Design':    { bg: 'rgba(236,72,153,0.2)', color: '#EC4899' },
    'Bug':       { bg: 'rgba(239,68,68,0.2)',  color: '#EF4444' },
    'Feature':   { bg: 'rgba(59,130,246,0.2)', color: '#3B82F6' },
    'Personal':  { bg: 'rgba(139,92,246,0.2)', color: '#8B5CF6' },
    'Garden':    { bg: 'rgba(34,197,94,0.2)',   color: '#22C55E' },
    'Photo':     { bg: 'rgba(236,72,153,0.2)', color: '#EC4899' },
};

var COL_COLORS = {
    'backlog': '#9CA3AF', 'to do': '#3B82F6', 'in progress': '#F59E0B',
    'review': '#8B5CF6', 'done': '#10B981',
};
function getColColor(name) {
    var lower = name.toLowerCase();
    for (var key in COL_COLORS) {
        if (lower.includes(key)) return COL_COLORS[key];
    }
    return '#6B7280';
}

var BOARD_ID = 1;
var columns = [];
var cards = [];
var dragCard = null;

// ─── Boot ───
(async function() {
    try { await requireAuth(); } catch(e) { return; }

    if (currentUser.role !== 'admin') {
        document.getElementById('appLayout').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary)">Access denied</div>';
        return;
    }

    var shell = renderAppShell('Kanban', 'kanban');
    document.getElementById('appLayout').innerHTML =
        shell.sidebar +
        shell.bottomNav +
        '<div class="main-content">' +
            shell.topbar +
            '<div class="main-body">' +
                '<div class="kanban-header">' +
                    '<h1><span class="header-emoji">🐢</span> Ali & Bittu <span class="header-sub">— collaboration board</span></h1>' +
                '</div>' +
                '<div id="boardContent">' +
                    '<div class="kanban-loading">' +
                        '<div class="skeleton skeleton-col"></div>' +
                        '<div class="skeleton skeleton-col"></div>' +
                        '<div class="skeleton skeleton-col"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    initAppShell('kanban');
    await loadBoard();
})();

async function loadBoard() {
    try {
        var results = await Promise.all([
            API.get('/kanban/columns?board_id=' + BOARD_ID),
            API.get('/kanban/cards?board_id=' + BOARD_ID),
        ]);
        columns = results[0];
        cards = results[1];
        columns.sort(function(a, b) { return a.position - b.position; });
        renderBoard();
    } catch (e) { showToast(e.message, 'error'); }
}

// ─── Rendering ───
function renderBoard() {
    var container = document.getElementById('boardContent');
    if (!columns.length) {
        container.innerHTML =
            '<div class="empty-state"><div class="emoji"><i data-lucide="kanban"></i></div>' +
            '<p>Board is empty — add a column to get started!</p>' +
            '<button class="btn btn-primary" onclick="addColumn()">+ Add Column</button></div>';
        if (window.lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = '<div class="columns-container" id="columnsContainer">' +
        columns.map(function(col) { return renderColumn(col); }).join('') +
        '<div class="add-column-btn" onclick="addColumn()">+ Add Column</div>' +
    '</div>';

    document.querySelectorAll('.kanban-column').forEach(setupColumnDnD);
    if (window.lucide) lucide.createIcons();
}

function renderColumn(col) {
    var colCards = cards.filter(function(c) { return c.column_id === col.id; }).sort(function(a, b) { return a.position - b.position; });
    var color = getColColor(col.name);
    return '<div class="kanban-column" data-col-id="' + col.id + '">' +
        '<div class="col-header">' +
            '<div class="col-color-strip" style="background:' + color + '"></div>' +
            '<span class="col-name">' + esc(col.name) + '</span>' +
            '<span class="col-count">' + colCards.length + '</span>' +
            '<button class="col-add-btn" onclick="quickAddFocus(' + col.id + ')" title="Add card">+</button>' +
            '<button class="col-menu-btn" onclick="toggleColMenu(this, ' + col.id + ')" title="Column options"><i data-lucide="more-horizontal"></i></button>' +
            '<div class="col-menu" id="colMenu' + col.id + '">' +
                '<button onclick="renameColumn(' + col.id + ')">Rename</button>' +
                '<button class="danger" onclick="deleteColumn(' + col.id + ')">Delete Column</button>' +
            '</div>' +
        '</div>' +
        '<div class="quick-add" id="quickAdd' + col.id + '">' +
            '<input type="text" placeholder="Add a card…" onkeydown="quickAddKey(event, ' + col.id + ')">' +
        '</div>' +
        '<div class="col-cards" data-col-id="' + col.id + '">' +
            colCards.map(function(c) { return renderCard(c); }).join('') +
        '</div>' +
    '</div>';
}

function getAssignee(card) {
    if (card.assignee_label === 'Bittu') return { name: 'Bittu', cls: 'bittu', letter: '🐢' };
    if (card.assigned_name) return { name: card.assigned_name, cls: 'ali', letter: card.assigned_name[0].toUpperCase() };
    if (card.assigned_to === 1) return { name: 'Ali', cls: 'ali', letter: 'A' };
    return null;
}

function renderCard(card) {
    var labelsArr = parseLabels(card.labels);
    var labelsHTML = labelsArr.map(function(l) {
        var s = LABELS[l] || { bg: 'var(--surface3)', color: 'var(--text-secondary)' };
        return '<span class="label-chip" style="background:' + s.bg + ';color:' + s.color + '">' + esc(l) + '</span>';
    }).join('');

    var dueBadge = '';
    if (card.due_date) {
        var d = new Date(card.due_date);
        var today = new Date(); today.setHours(0,0,0,0);
        var diff = Math.round((d - today) / 86400000);
        var cls = diff <= 0 ? 'due-today' : 'due-normal';
        dueBadge = '<span class="card-due ' + cls + '"><i data-lucide="calendar" style="width:11px;height:11px;vertical-align:-1px"></i> ' + formatDate(card.due_date) + '</span>';
    }

    var assignee = getAssignee(card);
    var assignedBadge = assignee
        ? '<span class="card-assigned ' + assignee.cls + '" title="' + esc(assignee.name) + '">' + assignee.letter + '</span>'
        : '';

    return '<div class="kanban-card" draggable="true" data-card-id="' + card.id + '"' +
         ' ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"' +
         ' onclick="openCardDetail(' + card.id + ')">' +
        '<div class="card-title">' + esc(card.title) + '</div>' +
        '<div class="card-labels">' + labelsHTML + '</div>' +
        '<div class="card-meta">' + dueBadge + assignedBadge + '</div>' +
    '</div>';
}

function parseLabels(labels) {
    if (!labels) return [];
    if (Array.isArray(labels)) return labels;
    try { return JSON.parse(labels); } catch(e) { return []; }
}

function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// ─── Drag and Drop ───
function onDragStart(e) {
    dragCard = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.cardId);
}

function onDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.drop-placeholder').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.kanban-column.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
    dragCard = null;
}

function setupColumnDnD(colEl) {
    var cardsArea = colEl.querySelector('.col-cards');

    cardsArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        colEl.classList.add('drag-over');
        var afterCard = getDragAfterElement(cardsArea, e.clientY);
        var placeholder = cardsArea.querySelector('.drop-placeholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'drop-placeholder';
        }
        if (afterCard) cardsArea.insertBefore(placeholder, afterCard);
        else cardsArea.appendChild(placeholder);
    });

    cardsArea.addEventListener('dragleave', function(e) {
        if (!cardsArea.contains(e.relatedTarget)) {
            colEl.classList.remove('drag-over');
            var ph = cardsArea.querySelector('.drop-placeholder');
            if (ph) ph.remove();
        }
    });

    cardsArea.addEventListener('drop', async function(e) {
        e.preventDefault();
        colEl.classList.remove('drag-over');
        var placeholder = cardsArea.querySelector('.drop-placeholder');
        var cardId = e.dataTransfer.getData('text/plain');
        var colId = parseInt(cardsArea.dataset.colId);
        var position = 0;
        if (placeholder) {
            position = Array.from(cardsArea.children).indexOf(placeholder);
            placeholder.remove();
        }
        try {
            await API.put('/kanban/cards/' + cardId + '/move', { column_id: colId, position: position });
            await loadBoard();
        } catch (err) {
            showToast(err.message, 'error');
            await loadBoard();
        }
    });
}

function getDragAfterElement(container, y) {
    var els = Array.from(container.querySelectorAll('.kanban-card:not(.dragging)'));
    var closest = null, closestOffset = Number.POSITIVE_INFINITY;
    for (var i = 0; i < els.length; i++) {
        var box = els[i].getBoundingClientRect();
        var offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > -closestOffset) {
            closestOffset = -offset;
            closest = els[i];
        }
    }
    return closest;
}

// ─── Quick Add ───
function quickAddFocus(colId) {
    var el = document.querySelector('#quickAdd' + colId + ' input');
    if (el) el.focus();
}

async function quickAddKey(e, colId) {
    if (e.key !== 'Enter') return;
    var input = e.target;
    var title = input.value.trim();
    if (!title) return;
    input.disabled = true;
    try {
        var colCards = cards.filter(function(c) { return c.column_id === colId; });
        await API.post('/kanban/cards', { column_id: colId, title: title, position: colCards.length });
        input.value = '';
        await loadBoard();
        showToast('Card added ✓');
    } catch (err) { showToast(err.message, 'error'); }
    finally { input.disabled = false; input.focus(); }
}

// ─── Card Detail Modal ───
function openCardDetail(cardId) {
    var card = cards.find(function(c) { return c.id === cardId; });
    if (!card) return;

    var labelsArr = parseLabels(card.labels);
    var labelsHTML = Object.keys(LABELS).map(function(name) {
        var s = LABELS[name];
        return '<span class="label-chip ' + (labelsArr.includes(name) ? 'active' : '') + '"' +
              ' style="background:' + s.bg + ';color:' + s.color + '"' +
              ' data-label="' + esc(name) + '" onclick="this.classList.toggle(\'active\')">' + esc(name) + '</span>';
    }).join('');

    var colOptions = columns.map(function(c) {
        return '<option value="' + c.id + '" ' + (c.id === card.column_id ? 'selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    var assigneeVal = card.assignee_label === 'Bittu' ? 'bittu' : (card.assigned_to === 1 ? '1' : '');

    var bodyHTML =
    '<div class="card-detail-body">' +
        '<div class="field-row">' +
            '<input class="title-input" name="title" value="' + esc(card.title) + '" placeholder="Card title" style="font-size:16px">' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-label">Description</div>' +
            '<textarea class="form-input" name="description" rows="3" placeholder="Add a description…" style="font-size:16px">' + esc(card.description || '') + '</textarea>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-label">Labels</div>' +
            '<div class="labels-picker">' + labelsHTML + '</div>' +
        '</div>' +
        '<div class="field-row" style="display:flex;gap:12px;">' +
            '<div style="flex:1">' +
                '<div class="field-label">Due Date</div>' +
                '<input class="form-input" type="date" name="due_date" value="' + (card.due_date || '') + '" style="font-size:16px">' +
            '</div>' +
            '<div style="flex:1">' +
                '<div class="field-label">Assigned To</div>' +
                '<select class="form-input" name="assignee" style="font-size:16px">' +
                    '<option value="">Unassigned</option>' +
                    '<option value="1" ' + (assigneeVal === '1' ? 'selected' : '') + '>👤 Ali</option>' +
                    '<option value="bittu" ' + (assigneeVal === 'bittu' ? 'selected' : '') + '>🐢 Bittu</option>' +
                '</select>' +
            '</div>' +
        '</div>' +
        '<div class="field-row">' +
            '<div class="field-label">Move to Column</div>' +
            '<select class="form-input" name="move_to" style="font-size:16px">' + colOptions + '</select>' +
        '</div>' +
        '<div style="padding-top:10px;border-top:1px solid var(--border);margin-top:14px">' +
            '<button class="btn btn-ghost" style="color:var(--red);font-size:13px" onclick="deleteCard(' + card.id + ')">' +
                '<i data-lucide="trash-2" style="width:14px;height:14px"></i> Delete Card' +
            '</button>' +
        '</div>' +
    '</div>';

    createModal({
        title: 'Card Details',
        bodyHTML: bodyHTML,
        submitLabel: 'Save',
        async onSubmit(modal) {
            var activeLabels = Array.from(modal.querySelectorAll('.label-chip.active')).map(function(el) { return el.dataset.label; });
            var assigneeSelect = modal.querySelector('[name="assignee"]').value;
            var body = {
                title: modal.querySelector('[name="title"]').value.trim(),
                description: modal.querySelector('[name="description"]').value.trim(),
                labels: activeLabels,
                due_date: modal.querySelector('[name="due_date"]').value || null,
                assigned_to: assigneeSelect === '1' ? 1 : null,
                assignee_label: assigneeSelect === 'bittu' ? 'Bittu' : null,
            };
            if (!body.title) throw new Error('Title is required');
            await API.put('/kanban/cards/' + card.id, body);

            var newColId = parseInt(modal.querySelector('[name="move_to"]').value);
            if (newColId !== card.column_id) {
                await API.put('/kanban/cards/' + card.id + '/move', { column_id: newColId, position: 0 });
            }

            showToast('Card updated ✓');
            await loadBoard();
        },
    });
}

async function deleteCard(cardId) {
    if (!confirm('Delete this card?')) return;
    try {
        await API.delete('/kanban/cards/' + cardId);
        var backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        showToast('Card deleted');
        await loadBoard();
    } catch (e) { showToast(e.message, 'error'); }
}

// ─── Column CRUD ───
function toggleColMenu(btn, colId) {
    document.querySelectorAll('.col-menu.visible').forEach(function(m) { m.classList.remove('visible'); });
    var menu = document.getElementById('colMenu' + colId);
    menu.classList.toggle('visible');
    var handler = function(e) {
        if (!menu.contains(e.target) && e.target !== btn) {
            menu.classList.remove('visible');
            document.removeEventListener('click', handler);
        }
    };
    setTimeout(function() { document.addEventListener('click', handler); }, 0);
}

async function addColumn() {
    var name = prompt('Column name:');
    if (!name?.trim()) return;
    try {
        await API.post('/kanban/columns', { board_id: BOARD_ID, name: name.trim(), position: columns.length });
        showToast('Column added ✓');
        await loadBoard();
    } catch (e) { showToast(e.message, 'error'); }
}

async function renameColumn(colId) {
    var col = columns.find(function(c) { return c.id === colId; });
    var name = prompt('Rename column:', col?.name);
    if (!name?.trim()) return;
    try {
        await API.put('/kanban/columns/' + colId, { name: name.trim() });
        showToast('Column renamed ✓');
        await loadBoard();
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteColumn(colId) {
    var col = columns.find(function(c) { return c.id === colId; });
    if (!confirm('Delete column "' + (col?.name || '') + '"? All cards in it will be deleted.')) return;
    try {
        await API.delete('/kanban/columns/' + colId);
        showToast('Column deleted');
        await loadBoard();
    } catch (e) { showToast(e.message, 'error'); }
}
