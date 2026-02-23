// ─── State ───
let notes = [];
let activeNoteId = null;
let searchQuery = '';
let sortBy = 'updated';
let saveTimer = null;
let isSaving = false;

// ─── Boot ───
(async () => {
    try { await requireAuth(); } catch { return; }

    const shell = renderAppShell('Notes', 'notes');
    document.getElementById('appLayout').innerHTML = `
        ${shell.sidebar}
        ${shell.bottomNav}
        <div class="main-content">
            ${shell.topbar}
            <div class="main-body">
                <div class="notes-layout" id="notesLayout">
                    <div class="notes-sidebar">
                        <div class="notes-sidebar-header">
                            <div class="notes-sidebar-top">
                                <span class="notes-sidebar-title">Notes</span>
                                <button class="btn btn-primary" style="padding:6px 12px;font-size:12px" onclick="createNote()">＋ New</button>
                            </div>
                            <input class="notes-search" placeholder="Search notes..." oninput="searchQuery=this.value;renderNoteList()">
                        </div>
                        <div class="notes-sort">
                            <button class="sort-btn active" data-sort="updated" onclick="setSort('updated',this)">Recent</button>
                            <button class="sort-btn" data-sort="created" onclick="setSort('created',this)">Created</button>
                            <button class="sort-btn" data-sort="title" onclick="setSort('title',this)">A-Z</button>
                        </div>
                        <div class="notes-list" id="notesList">
                            <div class="skeleton skeleton-card" style="height:60px;margin-bottom:6px"></div>
                            <div class="skeleton skeleton-card" style="height:60px;margin-bottom:6px"></div>
                            <div class="skeleton skeleton-card" style="height:60px"></div>
                        </div>
                    </div>
                    <div class="note-editor" id="noteEditor">
                        <div class="note-editor-empty">
                            <div class="empty-state">
                                <div class="emoji"><i data-lucide="file-text"></i></div>
                                <p>Select a note or create a new one</p>
                                <button class="btn btn-secondary" onclick="createNote()">＋ New Note</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    initAppShell('notes');
    await loadNotes();
})();

// ─── Data ───
async function loadNotes() {
    try {
        const data = await API.get('/notes');
        notes = Array.isArray(data) ? data : (data?.items || []);
        renderNoteList();
        if (activeNoteId) {
            const note = notes.find(n => n.id === activeNoteId);
            if (note) renderEditor(note);
        }
    } catch (err) {
        showToast('Failed to load notes', 'error');
    }
}

// ─── Note List ───
function getFilteredNotes() {
    let filtered = [...notes];
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(n =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.content || '').toLowerCase().includes(q)
        );
    }
    // Sort
    filtered.sort((a, b) => {
        if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
        const da = new Date(sortBy === 'created' ? (a.created_at || 0) : (a.updated_at || a.created_at || 0));
        const db = new Date(sortBy === 'created' ? (b.created_at || 0) : (b.updated_at || b.created_at || 0));
        return db - da;
    });
    return filtered;
}

function renderNoteList() {
    const container = document.getElementById('notesList');
    const filtered = getFilteredNotes();

    if (filtered.length === 0 && notes.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:32px 16px">
                <div class="emoji"><i data-lucide="file-text"></i></div>
                <p>No notes yet — create one!</p>
                <button class="btn btn-secondary" onclick="createNote()">＋ New Note</button>
            </div>`;
        return;
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No matching notes</p></div>`;
        return;
    }

    const pinned = filtered.filter(n => n.pinned);
    const unpinned = filtered.filter(n => !n.pinned);
    let html = '';

    if (pinned.length > 0) {
        html += `<div class="pinned-section-label"><i data-lucide="pin" style="width:10px;height:10px;vertical-align:-1px"></i> Pinned</div>`;
        html += pinned.map(n => renderNoteCard(n)).join('');
        if (unpinned.length > 0) {
            html += `<div class="pinned-section-label" style="margin-top:8px">All Notes</div>`;
        }
    }
    html += unpinned.map(n => renderNoteCard(n)).join('');
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function renderNoteCard(note) {
    const preview = (note.content || '').replace(/<[^>]*>/g, '').substring(0, 100);
    const date = formatDate(note.updated_at || note.created_at || new Date().toISOString());
    const tags = (note.tags || []).slice(0, 2);
    return `
        <div class="note-card${note.id === activeNoteId ? ' active' : ''}" onclick="openNote(${note.id})">
            <div class="note-card-title">
                ${note.pinned ? '<span class="pin-icon"><i data-lucide="pin" style="width:11px;height:11px"></i></span>' : ''}
                ${esc(note.title || 'Untitled')}
            </div>
            <div class="note-card-preview">${esc(preview) || 'Empty note'}</div>
            <div class="note-card-meta">
                <span>${date}</span>
                ${note.access === 'household' ? '<span class="access-badge access-household"><i data-lucide="home" style="width:10px;height:10px;vertical-align:-1px"></i> Household</span>' : note.access === 'admin' ? '<span class="access-badge access-admin"><i data-lucide="shield" style="width:10px;height:10px;vertical-align:-1px"></i> Admin</span>' : ''}
                ${tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}
            </div>
        </div>`;
}

function setSort(sort, btn) {
    sortBy = sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderNoteList();
}

// ─── Open / Create Note ───
function openNote(id) {
    activeNoteId = id;
    const note = notes.find(n => n.id === id);
    if (!note) return;
    renderNoteList();
    renderEditor(note);
    document.getElementById('notesLayout').classList.add('editor-open');
}

async function createNote() {
    try {
        const note = await API.post('/notes', { title: '', content: '', access: 'private', tags: [], pinned: false });
        notes.unshift(note);
        openNote(note.id);
        showToast('Note created ✓');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function goBack() {
    document.getElementById('notesLayout').classList.remove('editor-open');
    activeNoteId = null;
    renderNoteList();
}

// ─── Editor ───
function renderEditor(note) {
    const tags = note.tags || [];
    document.getElementById('noteEditor').innerHTML = `
        <div class="editor-toolbar">
            <button class="mobile-back-btn" onclick="goBack()"><i data-lucide="arrow-left" style="width:14px;height:14px;vertical-align:-2px"></i> Back</button>
            <button class="toolbar-btn" onclick="execCmd('bold')" title="Bold"><b>B</b></button>
            <button class="toolbar-btn" onclick="execCmd('italic')" title="Italic"><i>I</i></button>
            <button class="toolbar-btn" onclick="execCmd('insertUnorderedList')" title="Bullet list">•≡</button>
            <span class="save-indicator" id="saveIndicator"></span>
        </div>
        <input class="editor-title-input" id="editorTitle" placeholder="Note title..."
            value="${esc(note.title || '')}" oninput="onEditorChange()">
        <div class="editor-tags" id="editorTags">
            ${tags.map(t => `<span class="tag-chip">${esc(t)} <span class="tag-remove" onclick="removeTag('${esc(t)}')"><i data-lucide="x" style="width:10px;height:10px"></i></span></span>`).join('')}
            <input class="tag-add-input" placeholder="+ tag" onkeydown="if(event.key==='Enter'){addTag(this.value);this.value='';event.preventDefault()}">
        </div>
        <div class="editor-content">
            <textarea id="editorContent" placeholder="Write something..."
                oninput="onEditorChange()">${esc(note.content || '')}</textarea>
        </div>
        <div class="editor-footer">
            <select class="footer-select" id="accessSelect" onchange="changeNoteAccess(this.value)">
                <option value="private"${note.access === 'private' ? ' selected' : ''}>🔒 Private</option>
                <option value="household"${note.access === 'household' ? ' selected' : ''}>🏠 Household</option>
                ${currentUser?.role === 'admin' ? `<option value="admin"${note.access === 'admin' ? ' selected' : ''}>👑 Admin</option>` : ''}
            </select>
            <button class="footer-toggle${note.pinned ? ' active' : ''}" id="togglePinned" onclick="toggleNoteProp('pinned')">
                <i data-lucide="pin" style="width:12px;height:12px;vertical-align:-2px"></i> Pinned
            </button>
            <span class="footer-spacer"></span>
            <button class="delete-note-btn" onclick="deleteNote(${note.id})"><i data-lucide="trash-2" style="width:12px;height:12px;vertical-align:-2px"></i> Delete</button>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function execCmd(cmd) {
    // For textarea, we do simple wrapping
    const ta = document.getElementById('editorContent');
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);

    let prefix = '', suffix = '';
    if (cmd === 'bold') { prefix = '**'; suffix = '**'; }
    else if (cmd === 'italic') { prefix = '_'; suffix = '_'; }
    else if (cmd === 'insertUnorderedList') { prefix = '- '; }

    ta.value = ta.value.substring(0, start) + prefix + selected + suffix + ta.value.substring(end);
    ta.focus();
    ta.selectionStart = start + prefix.length;
    ta.selectionEnd = start + prefix.length + selected.length;
    onEditorChange();
}

function onEditorChange() {
    clearTimeout(saveTimer);
    setSaveIndicator('saving');
    saveTimer = setTimeout(() => autoSave(), 1000);
}

async function autoSave() {
    if (!activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;

    const title = document.getElementById('editorTitle')?.value || '';
    const content = document.getElementById('editorContent')?.value || '';

    note.title = title;
    note.content = content;
    renderNoteList(); // Update sidebar preview

    try {
        isSaving = true;
        await API.put(`/notes/${activeNoteId}`, { title, content });
        setSaveIndicator('saved');
    } catch (err) {
        setSaveIndicator('error');
        showToast('Failed to save', 'error');
    } finally {
        isSaving = false;
    }
}

function setSaveIndicator(state) {
    const el = document.getElementById('saveIndicator');
    if (!el) return;
    el.className = 'save-indicator';
    if (state === 'saving') { el.classList.add('saving'); el.textContent = 'Saving...'; }
    else if (state === 'saved') { el.classList.add('saved'); el.textContent = 'Saved ✓'; }
    else if (state === 'error') { el.textContent = 'Error!'; el.style.color = 'var(--red)'; }
    else { el.textContent = ''; }
}

// ─── Tags ───
function addTag(tag) {
    tag = tag.trim();
    if (!tag || !activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    if (!note.tags) note.tags = [];
    if (note.tags.includes(tag)) return;
    note.tags.push(tag);
    renderEditor(note);
    API.put(`/notes/${activeNoteId}`, { tags: note.tags }).catch(() => showToast('Failed to save tag', 'error'));
}

function removeTag(tag) {
    if (!activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note || !note.tags) return;
    note.tags = note.tags.filter(t => t !== tag);
    renderEditor(note);
    API.put(`/notes/${activeNoteId}`, { tags: note.tags }).catch(() => showToast('Failed to remove tag', 'error'));
}

// ─── Toggle Properties ───
async function toggleNoteProp(prop) {
    if (!activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    note[prop] = !note[prop];
    renderEditor(note);
    renderNoteList();
    try {
        await API.put(`/notes/${activeNoteId}`, { [prop]: note[prop] });
    } catch (err) {
        note[prop] = !note[prop];
        renderEditor(note);
        showToast(err.message, 'error');
    }
}

async function changeNoteAccess(newAccess) {
    if (!activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    const oldAccess = note.access;
    note.access = newAccess;
    renderEditor(note);
    renderNoteList();
    try {
        await API.put(`/notes/${activeNoteId}`, { access: newAccess });
    } catch (err) {
        note.access = oldAccess;
        renderEditor(note);
        renderNoteList();
        showToast(err.message, 'error');
    }
}

// ─── Delete ───
async function deleteNote(id) {
    if (!confirm('Delete this note?')) return;
    try {
        await API.delete(`/notes/${id}`);
        notes = notes.filter(n => n.id !== id);
        if (activeNoteId === id) {
            activeNoteId = null;
            document.getElementById('noteEditor').innerHTML = `
                <div class="note-editor-empty">
                    <div class="empty-state">
                        <div class="emoji"><i data-lucide="file-text"></i></div>
                        <p>Select a note or create a new one</p>
                        <button class="btn btn-secondary" onclick="createNote()">＋ New Note</button>
                    </div>
                </div>`;
            document.getElementById('notesLayout').classList.remove('editor-open');
        }
        renderNoteList();
        showToast('Note deleted ✓');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Helpers ───
function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}
