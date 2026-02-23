/* ═══════════════════════════════════════════════════════════
   Grocery Page — ashcroft.cloud
   ═══════════════════════════════════════════════════════════ */

// ─── State ───
var lists = [];
var items = [];
var stores = [];
var activeListId = null;
var shoppingMode = localStorage.getItem('shoppingMode') === 'true';

var CATEGORIES = [
    { key: 'produce', label: 'Produce', icon: 'leaf', emoji: '🥬' },
    { key: 'dairy', label: 'Dairy', icon: 'milk', emoji: '🥛' },
    { key: 'meat', label: 'Meat', icon: 'beef', emoji: '🥩' },
    { key: 'bakery', label: 'Bakery', icon: 'croissant', emoji: '🍞' },
    { key: 'pantry', label: 'Pantry', icon: 'package', emoji: '🥫' },
    { key: 'frozen', label: 'Frozen', icon: 'snowflake', emoji: '❄️' },
    { key: 'beverages', label: 'Beverages', icon: 'cup-soda', emoji: '🥤' },
    { key: 'snacks', label: 'Snacks', icon: 'popcorn', emoji: '🍿' },
    { key: 'household', label: 'Household', icon: 'spray-can', emoji: '🧹' },
    { key: 'other', label: 'Other', icon: 'package', emoji: '📦' },
];

function catInfo(key) {
    return CATEGORIES.find(function(c) { return c.key === key; }) || CATEGORIES[CATEGORIES.length - 1];
}
function catIconHtml(cat, size) {
    size = size || 16;
    return '<i data-lucide="' + cat.icon + '" style="width:' + size + 'px;height:' + size + 'px;display:inline-block;vertical-align:-3px"></i>';
}

// ─── Boot ───
(async function() {
    try { await requireAuth(); } catch(e) { return; }

    var shell = renderAppShell('Grocery', 'grocery');
    document.getElementById('appLayout').innerHTML =
        shell.sidebar +
        shell.bottomNav +
        '<div class="main-content">' +
            shell.topbar +
            '<div class="main-body" id="groceryBody">' +
                '<div id="listTabs"></div>' +
                '<div id="quickAdd"></div>' +
                '<div id="itemsContainer">' +
                    '<div class="skeleton skeleton-card" style="height:60px;margin-bottom:8px"></div>' +
                    '<div class="skeleton skeleton-card" style="height:60px;margin-bottom:8px"></div>' +
                    '<div class="skeleton skeleton-card" style="height:60px"></div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<button class="shopping-fab' + (shoppingMode ? ' active' : '') + '" id="shoppingFab" onclick="toggleShoppingMode()">' +
            '<i data-lucide="shopping-cart" style="width:20px;height:20px"></i>' +
            '<span class="fab-label" id="fabLabel">' + (shoppingMode ? 'Shopping Mode ON' : 'Shopping Mode') + '</span>' +
        '</button>';
    initAppShell('grocery');
    await loadStores();
    await loadLists();
})();

// ─── Data Loading ───
async function loadStores() {
    try { stores = await API.get('/stores'); } catch (e) { stores = []; }
}

function storeName(item) { return item.store_name || 'No Store Assigned'; }
function storeIcon(item) { return item.store_icon || '📦'; }
function storeIconHtml(item) { return item.store_icon || '<i data-lucide="package" style="width:14px;height:14px;display:inline-block;vertical-align:-2px"></i>'; }

async function loadLists() {
    try {
        lists = await API.get('/grocery-lists');
        if (!Array.isArray(lists)) lists = lists?.items || [];
        if (lists.length === 0) {
            var newList = await API.post('/grocery-lists', { name: 'Grocery', access: 'household' });
            lists = [newList];
        }
        if (!activeListId || !lists.find(function(l) { return l.id === activeListId; })) {
            activeListId = lists[0].id;
        }
        renderListTabs();
        renderQuickAdd();
        await loadItems();
    } catch (err) {
        showToast('Failed to load grocery lists', 'error');
    }
}

async function loadItems() {
    try {
        var data = await API.get('/grocery-items?list_id=' + activeListId);
        items = Array.isArray(data) ? data : (data?.items || []);
        renderItems();
    } catch (err) {
        showToast('Failed to load items', 'error');
    }
}

// ─── Render List Tabs ───
function renderListTabs() {
    var container = document.getElementById('listTabs');
    if (lists.length <= 1) {
        container.innerHTML = '';
        var topTitle = document.querySelector('.topbar-title');
        if (topTitle && lists[0]) {
            topTitle.innerHTML = esc(lists[0].name) + ' ' + (lists[0].access === 'household' ? '<i data-lucide="home" style="width:10px;height:10px;vertical-align:-1px"></i>' : '') + ' <span style="color:var(--text-tertiary);cursor:pointer;" onclick="addListModal()" title="Add list"><i data-lucide="plus" style="width:14px;height:14px;vertical-align:-2px"></i></span>';
        }
    } else {
        container.innerHTML = '<div class="list-tabs">' +
            lists.map(function(l) {
                return '<button class="list-tab' + (l.id === activeListId ? ' active' : '') + '" onclick="switchList(' + l.id + ')">' +
                    esc(l.name) +
                    '<span class="tab-count">' + (l.access === 'household' ? '<i data-lucide="home" style="width:10px;height:10px;vertical-align:-1px"></i>' : l.access === 'private' ? '<i data-lucide="lock" style="width:10px;height:10px;vertical-align:-1px"></i>' : '') + '</span>' +
                '</button>';
            }).join('') +
            '<button class="list-tab-add" onclick="addListModal()" title="New list"><i data-lucide="plus" style="width:14px;height:14px"></i></button>' +
        '</div>';
    }
    if (window.lucide) lucide.createIcons();
}

// ─── Render Quick Add ───
function renderQuickAdd() {
    var isMobile = window.innerWidth <= 600;
    var catOptions = CATEGORIES.map(function(c) { return '<option value="' + c.key + '">' + c.emoji + ' ' + c.label + '</option>'; }).join('');
    var storeOptions = shoppingMode ? getStoreOptions().map(function(s) { return '<option value="' + s.id + '">' + s.icon + ' ' + esc(s.name) + '</option>'; }).join('') : '';

    if (isMobile) {
        document.getElementById('quickAdd').innerHTML =
            '<div class="quick-add-compact">' +
                '<div class="quick-add-row">' +
                    '<input class="quick-add-input" id="quickAddInput" type="text" placeholder="Add item..." autocomplete="off" onkeydown="if(event.key===\'Enter\')quickAddItem()">' +
                    '<select class="quick-add-cat-inline" id="quickAddCat">' + catOptions + '</select>' +
                    (shoppingMode ? '<select class="quick-add-cat-inline" id="quickAddStore"><option value="">Store</option>' + storeOptions + '</select>' : '') +
                    '<button class="quick-add-btn" onclick="quickAddItem()" style="padding:10px 20px;">Add</button>' +
                '</div>' +
            '</div>';
    } else {
        document.getElementById('quickAdd').innerHTML =
            '<div class="quick-add">' +
                '<input class="quick-add-input" id="quickAddInput" type="text" placeholder="Add item..." autocomplete="off" onkeydown="if(event.key===\'Enter\')quickAddItem()">' +
                '<select class="quick-add-cat" id="quickAddCat">' + catOptions + '</select>' +
                (shoppingMode ? '<select class="quick-add-cat" id="quickAddStore" style="flex:0 1 150px"><option value="">Store...</option>' + storeOptions + '</select>' : '') +
                '<button class="quick-add-btn" onclick="quickAddItem()">Add</button>' +
                '<div class="mode-toggle-inline" onclick="toggleShoppingMode()" title="' + (shoppingMode ? 'Shopping Mode ON — click to turn off' : 'Enable Shopping Mode') + '">' +
                    '<span><i data-lucide="shopping-cart" style="width:16px;height:16px"></i></span>' +
                    '<span class="mode-toggle-inline-label">' + (shoppingMode ? 'Shopping' : 'Shop Mode') + '</span>' +
                    '<div class="mode-toggle-switch' + (shoppingMode ? ' active' : '') + '" style="width:36px;height:20px;border-radius:10px;flex-shrink:0;"></div>' +
                '</div>' +
            '</div>';
        setTimeout(function() { var el = document.getElementById('quickAddInput'); if (el) el.focus(); }, 100);
    }
}

// ─── Render Items ───
function toggleShoppingMode() {
    shoppingMode = !shoppingMode;
    localStorage.setItem('shoppingMode', shoppingMode);
    renderQuickAdd();
    renderItems();
    var fab = document.getElementById('shoppingFab');
    var label = document.getElementById('fabLabel');
    if (fab) {
        fab.classList.toggle('active', shoppingMode);
        if (label) label.textContent = shoppingMode ? 'Shopping Mode ON' : 'Shopping Mode';
    }
}

function getStoreOptions() {
    return stores.map(function(s) { return { id: s.id, name: s.name, icon: s.icon || '🏬' }; });
}

function renderItems() {
    var container = document.getElementById('itemsContainer');
    var unchecked = items.filter(function(i) { return !i.checked; });
    var checked = items.filter(function(i) { return i.checked; });

    if (items.length === 0) {
        container.innerHTML =
            '<div class="empty-state" style="padding:48px 16px">' +
                '<div class="emoji"><i data-lucide="shopping-cart"></i></div>' +
                '<p>Shopping list is empty — add items above!</p>' +
            '</div>';
        return;
    }

    var html = '';

    if (shoppingMode) {
        // ─── Shopping Mode: Group by store_id ───
        var byStoreId = {};
        var storeMetadata = {};

        for (var idx = 0; idx < unchecked.length; idx++) {
            var item = unchecked[idx];
            var storeId = item.store_id || 'unassigned';
            if (!byStoreId[storeId]) byStoreId[storeId] = [];
            byStoreId[storeId].push(item);
            storeMetadata[storeId] = {
                name: storeName(item),
                icon: storeIconHtml(item)
            };
        }

        var storeOrder = {};
        stores.forEach(function(s, i) { storeOrder[s.id] = i; });
        var storeIds = Object.keys(byStoreId).sort(function(a, b) {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            var oa = storeOrder[a] ?? 50, ob = storeOrder[b] ?? 50;
            return oa - ob || storeMetadata[a].name.localeCompare(storeMetadata[b].name);
        });

        for (var si = 0; si < storeIds.length; si++) {
            var sid = storeIds[si];
            var storeItems = byStoreId[sid];
            var checkedInStore = checked.filter(function(i) { return (i.store_id || 'unassigned') === sid; });
            var total = storeItems.length + checkedInStore.length;
            var done = checkedInStore.length;
            var storeMeta = storeMetadata[sid];
            var displayName = sid === 'unassigned' ? 'Unassigned' : storeMeta.name;

            html += '<div class="store-group">' +
                '<div class="store-header">' +
                    '<span class="store-icon">' + storeMeta.icon + '</span>' +
                    esc(displayName) +
                    '<span class="store-progress">' + done + ' of ' + total + ' checked</span>' +
                    '<span class="store-count">' + storeItems.length + ' left</span>' +
                '</div>' +
                '<div class="store-items">' +
                    storeItems.map(function(i) { return renderItem(i, true); }).join('') +
                    checkedInStore.map(function(i) { return renderItem(i, true); }).join('') +
                '</div>' +
            '</div>';
        }

        // Checked items from stores with no unchecked left
        var handledStoreIds = new Set(storeIds);
        var remainingChecked = checked.filter(function(i) { return !handledStoreIds.has(i.store_id || 'unassigned'); });
        if (remainingChecked.length > 0) {
            var byCheckedStoreId = {};
            for (var ri = 0; ri < remainingChecked.length; ri++) {
                var rItem = remainingChecked[ri];
                var rStoreId = rItem.store_id || 'unassigned';
                if (!byCheckedStoreId[rStoreId]) byCheckedStoreId[rStoreId] = [];
                byCheckedStoreId[rStoreId].push(rItem);
            }
            for (var csid in byCheckedStoreId) {
                var csi = byCheckedStoreId[csid];
                var cDisplayName = csid === 'unassigned' ? 'Unassigned' : storeName(csi[0]);
                html += '<div class="store-group" style="opacity:0.6">' +
                    '<div class="store-header">' +
                        '<span class="store-icon"><i data-lucide="check-circle" style="width:16px;height:16px;color:var(--green)"></i></span>' +
                        esc(cDisplayName) +
                        '<span class="store-progress">All done!</span>' +
                    '</div>' +
                    '<div class="store-items">' +
                        csi.map(function(i) { return renderItem(i, true); }).join('') +
                    '</div>' +
                '</div>';
            }
        }
    } else {
        // ─── Normal Mode: Group by category ───
        var grouped = {};
        CATEGORIES.forEach(function(cat) { grouped[cat.key] = []; });
        unchecked.forEach(function(item) {
            var key = item.category || 'other';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });

        CATEGORIES.forEach(function(cat) {
            var catItems = grouped[cat.key];
            if (!catItems || catItems.length === 0) return;
            html += '<div class="category-group">' +
                '<div class="category-header">' +
                    '<span>' + catIconHtml(cat) + ' ' + cat.label + '</span>' +
                    '<span class="cat-count">' + catItems.length + '</span>' +
                '</div>' +
                catItems.map(function(i) { return renderItem(i, false); }).join('') +
            '</div>';
        });

        if (checked.length > 0) {
            html += '<div class="checked-section">' +
                '<div class="checked-header">' +
                    '<span class="checked-label">Checked (' + checked.length + ')</span>' +
                    '<button class="clear-checked-btn" onclick="clearChecked()">Clear all</button>' +
                '</div>' +
                checked.map(function(i) { return renderItem(i, false); }).join('') +
            '</div>';
        }
    }

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function renderItem(item, showStoreAction) {
    var done = item.checked;
    var qty = item.quantity && item.quantity !== '1' && item.quantity !== 1;
    var storeOptHtml = '';
    if (showStoreAction && !done) {
        storeOptHtml = '<select class="move-store-select" onchange="event.stopPropagation();moveToStore(' + item.id + ',this.value === \'\' ? null : parseInt(this.value))" onclick="event.stopPropagation()">' +
            getStoreOptions().map(function(s) { return '<option value="' + s.id + '"' + (s.id === item.store_id ? ' selected' : '') + '>' + s.icon + ' ' + esc(s.name) + '</option>'; }).join('') +
            '<option value="" disabled>──────</option>' +
            '<option value=""' + (!item.store_id ? ' selected' : '') + '>No Store</option>' +
        '</select>';
    }
    return '<div class="grocery-item' + (done ? ' checked-item' : '') + '" id="item-' + item.id + '">' +
        '<div class="item-check' + (done ? ' done' : '') + '" onclick="event.stopPropagation();toggleItem(' + item.id + ',' + !done + ')"></div>' +
        '<span class="item-name">' + esc(item.name) + '</span>' +
        '<div class="item-badges">' +
            (qty ? '<span class="item-qty">' + esc(String(item.quantity)) + '</span>' : '') +
            (item.recurring ? '<span class="item-recurring" title="Recurring"><i data-lucide="repeat" style="width:12px;height:12px"></i></span>' : '') +
            (!showStoreAction && (item.store_name || item.store_id) ? '<span class="item-qty" style="background:var(--surface2);color:var(--text-tertiary);font-size:10px">' + storeIconHtml(item) + ' ' + esc(storeName(item)) + '</span>' : '') +
        '</div>' +
        '<div class="item-actions">' +
            storeOptHtml +
            '<button class="item-action-btn edit-btn" onclick="event.stopPropagation();editItemModal(' + item.id + ')" title="Edit"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>' +
            '<button class="item-action-btn" onclick="event.stopPropagation();deleteItem(' + item.id + ')" title="Delete"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>' +
        '</div>' +
    '</div>';
}

// ─── Actions ───
async function quickAddItem() {
    var input = document.getElementById('quickAddInput');
    var name = input.value.trim();
    if (!name) return;
    var category = document.getElementById('quickAddCat').value;
    var storeEl = document.getElementById('quickAddStore');
    var store_id = storeEl && storeEl.value ? parseInt(storeEl.value) : null;
    input.value = '';
    input.focus();

    try {
        var body = { list_id: activeListId, name: name, category: category, quantity: '1', recurring: false };
        if (store_id) body.store_id = store_id;
        var newItem = await API.post('/grocery-items', body);
        items.unshift(newItem);
        renderItems();
        var el = document.getElementById('item-' + newItem.id);
        if (el) el.classList.add('adding');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleItem(id, checked) {
    var item = items.find(function(i) { return i.id === id; });
    if (!item) return;
    item.checked = checked;
    renderItems();
    try {
        await API.put('/grocery-items/' + id, { checked: checked });
    } catch (err) {
        item.checked = !checked;
        renderItems();
        showToast(err.message, 'error');
    }
}

async function deleteItem(id) {
    var el = document.getElementById('item-' + id);
    if (el) {
        el.classList.add('removing');
        await new Promise(function(r) { setTimeout(r, 200); });
    }
    items = items.filter(function(i) { return i.id !== id; });
    renderItems();
    try {
        await API.delete('/grocery-items/' + id);
    } catch (err) {
        showToast(err.message, 'error');
        await loadItems();
    }
}

async function clearChecked() {
    var checked = items.filter(function(i) { return i.checked; });
    if (checked.length === 0) return;
    if (!confirm('Remove ' + checked.length + ' checked item' + (checked.length > 1 ? 's' : '') + '?')) return;

    var ids = checked.map(function(i) { return i.id; });
    items = items.filter(function(i) { return !i.checked; });
    renderItems();

    try {
        await Promise.all(ids.map(function(id) { return API.delete('/grocery-items/' + id); }));
        showToast('Cleared ' + ids.length + ' items ✓');
    } catch (err) {
        showToast(err.message, 'error');
        await loadItems();
    }
}

function switchList(id) {
    activeListId = id;
    renderListTabs();
    loadItems();
}

// ─── Modals ───
function addListModal() {
    createModal({
        title: 'New List',
        bodyHTML:
            '<div class="form-group">' +
                '<label>Name</label>' +
                '<input class="form-input" name="name" placeholder="e.g. Costco, Indian Store" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Access</label>' +
                '<select class="form-input" name="access">' +
                    '<option value="household">🏠 Household</option>' +
                    '<option value="private">🔒 Private</option>' +
                '</select>' +
            '</div>',
        submitLabel: 'Create List',
        async onSubmit(modal) {
            var name = modal.querySelector('[name="name"]').value.trim();
            if (!name) throw new Error('Name is required');
            var access = modal.querySelector('[name="access"]').value;
            var newList = await API.post('/grocery-lists', { name: name, access: access });
            lists.push(newList);
            activeListId = newList.id;
            renderListTabs();
            await loadItems();
            showToast('List created ✓');
        },
    });
}

function editItemModal(id) {
    var item = items.find(function(i) { return i.id === id; });
    if (!item) return;
    createModal({
        title: 'Edit Item',
        bodyHTML:
            '<div class="form-group">' +
                '<label>Name</label>' +
                '<input class="form-input" name="name" value="' + esc(item.name) + '" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Category</label>' +
                '<select class="form-input" name="category">' +
                    CATEGORIES.map(function(c) { return '<option value="' + c.key + '"' + (c.key === item.category ? ' selected' : '') + '>' + c.emoji + ' ' + c.label + '</option>'; }).join('') +
                '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Quantity</label>' +
                '<input class="form-input" name="quantity" value="' + esc(String(item.quantity || '1')) + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Recommended Store</label>' +
                '<select class="form-input" name="store_id">' +
                    '<option value="">— No store —</option>' +
                    getStoreOptions().map(function(s) { return '<option value="' + s.id + '"' + (s.id === item.store_id ? ' selected' : '') + '>' + s.icon + ' ' + esc(s.name) + '</option>'; }).join('') +
                '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" name="recurring" ' + (item.recurring ? 'checked' : '') + '>' +
                    ' Recurring item' +
                '</label>' +
            '</div>',
        submitLabel: 'Save',
        async onSubmit(modal) {
            var name = modal.querySelector('[name="name"]').value.trim();
            if (!name) throw new Error('Name is required');
            var storeVal = modal.querySelector('[name="store_id"]').value;
            var updates = {
                name: name,
                category: modal.querySelector('[name="category"]').value,
                quantity: modal.querySelector('[name="quantity"]').value || '1',
                store_id: storeVal ? parseInt(storeVal) : null,
                recurring: modal.querySelector('[name="recurring"]').checked,
            };
            var updated = await API.put('/grocery-items/' + id, updates);
            Object.assign(item, updated);
            renderItems();
            showToast('Item updated ✓');
        },
    });
}

// ─── Store Move (Shopping Mode) ───
async function moveToStore(itemId, storeId) {
    var item = items.find(function(i) { return i.id === itemId; });
    if (!item) return;

    var parsedStoreId = storeId === null ? null : parseInt(storeId);
    if (storeId !== null && isNaN(parsedStoreId)) return;

    var storeInfo = parsedStoreId ? stores.find(function(s) { return s.id === parsedStoreId; }) : null;
    var oldStoreId = item.store_id;
    var oldStoreName = item.store_name;
    var oldStoreIcon = item.store_icon;

    item.store_id = parsedStoreId;
    item.store_name = storeInfo?.name || null;
    item.store_icon = storeInfo?.icon || null;
    renderItems();

    try {
        await API.put('/grocery-items/' + itemId, { store_id: parsedStoreId });
        showToast('Moved to ' + (storeInfo?.name || 'No Store') + ' ✓');
    } catch (err) {
        item.store_id = oldStoreId;
        item.store_name = oldStoreName;
        item.store_icon = oldStoreIcon;
        renderItems();
        showToast(err.message, 'error');
    }
}

async function addAndMoveStore(itemId, name) {
    if (!name) return;
    try {
        var newStore = await API.post('/stores', { name: name });
        stores.push(newStore);
        await moveToStore(itemId, newStore.id, newStore.name);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Helpers ───
function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}
