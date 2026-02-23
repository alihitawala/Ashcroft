/* ═══════════════════════════════════════════════════════════
   ashcroft.cloud — Reusable Components
   Quick-add modals, date formatters, UI builders
   ═══════════════════════════════════════════════════════════ */

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
