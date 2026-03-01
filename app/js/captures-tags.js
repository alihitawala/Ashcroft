/* ═══════════════════════════════════════════════════════════
   Captures Tags — Filter chips, search, autocomplete
   ═══════════════════════════════════════════════════════════ */

const CapturesTags = {
    allTags: [],
    activeTags: [],
    sharedOnly: false,
    searchTimeout: null,
    searchQuery: '',

    init() {
        this.renderSearch();
        this.renderFilterBar();
    },

    setTags(tags) {
        this.allTags = Array.isArray(tags) ? tags : [];
        this.renderFilterBar();
    },

    // ─── Search Bar ───
    renderSearch() {
        const el = document.getElementById('capturesSearch');
        if (!el) return;
        el.innerHTML = `
            <span class="search-icon">🔍</span>
            <input type="text" placeholder="Search captures..." id="capturesSearchInput" autocomplete="off">
            <div class="search-spinner"></div>
        `;
        const input = document.getElementById('capturesSearchInput');
        input.addEventListener('input', () => {
            clearTimeout(this.searchTimeout);
            const wrap = el;
            wrap.classList.add('loading');
            this.searchTimeout = setTimeout(() => {
                this.searchQuery = input.value.trim();
                wrap.classList.remove('loading');
                CapturesFeed.reset();
                CapturesFeed.loadMore().then(() => {
                    if (typeof CapturesMap !== 'undefined') CapturesMap.onFilterChange();
                });
            }, 300);
        });
    },

    // ─── Tag Filter Bar ───
    renderFilterBar() {
        const el = document.getElementById('capturesTagFilters');
        if (!el) return;
        let html = '<button class="tag-chip' + (this.activeTags.length === 0 && !this.sharedOnly ? ' active' : '') + '" data-tag="">All</button>';
        html += '<button class="tag-chip shared-chip' + (this.sharedOnly ? ' active' : '') + '" data-tag="__shared">👨‍👩 Shared</button>';
        this.allTags.forEach(tag => {
            const isActive = this.activeTags.includes(tag.name);
            html += '<button class="tag-chip' + (isActive ? ' active' : '') + '" data-tag="' + this._esc(tag.name) + '">';
            html += '<span class="tag-dot" style="background:' + this._esc(tag.color || '#635bff') + '"></span>';
            html += this._esc(tag.name);
            if (tag.count) html += ' <span style="opacity:0.6;font-size:10px">' + tag.count + '</span>';
            html += '</button>';
        });
        el.innerHTML = html;

        el.querySelectorAll('.tag-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const tagName = chip.getAttribute('data-tag');
                if (!tagName) {
                    this.activeTags = [];
                    this.sharedOnly = false;
                } else if (tagName === '__shared') {
                    this.sharedOnly = !this.sharedOnly;
                } else {
                    const idx = this.activeTags.indexOf(tagName);
                    if (idx >= 0) this.activeTags.splice(idx, 1);
                    else this.activeTags.push(tagName);
                }
                this.renderFilterBar();
                CapturesFeed.reset();
                CapturesFeed.loadMore().then(() => {
                    if (typeof CapturesMap !== 'undefined') CapturesMap.onFilterChange();
                });
            });
        });
    },

    getFilters() {
        const f = {};
        if (this.searchQuery) f.q = this.searchQuery;
        if (this.activeTags.length) f.tags = this.activeTags;
        if (this.sharedOnly) f.shared_only = true;
        return f;
    },

    // ─── Autocomplete for Modal ───
    renderAutocomplete(inputEl, containerEl, selectedTags, onUpdate) {
        let dropdown = containerEl.querySelector('.tag-autocomplete');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'tag-autocomplete';
            containerEl.appendChild(dropdown);
        }

        inputEl.addEventListener('input', () => {
            const q = inputEl.value.trim().toLowerCase();
            if (!q) { dropdown.classList.remove('visible'); return; }
            const matches = this.allTags.filter(t =>
                t.name.toLowerCase().includes(q) && !selectedTags.find(s => s.name === t.name)
            ).slice(0, 6);
            if (!matches.length) { dropdown.classList.remove('visible'); return; }
            dropdown.innerHTML = matches.map(t =>
                '<div class="tag-autocomplete-item" data-name="' + this._esc(t.name) + '" data-color="' + this._esc(t.color || '#635bff') + '">' +
                '<span class="tag-dot" style="background:' + this._esc(t.color || '#635bff') + '"></span>' +
                this._esc(t.name) +
                '</div>'
            ).join('');
            dropdown.classList.add('visible');
            dropdown.querySelectorAll('.tag-autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    selectedTags.push({ name: item.dataset.name, color: item.dataset.color });
                    inputEl.value = '';
                    dropdown.classList.remove('visible');
                    onUpdate();
                });
            });
        });

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inputEl.value.trim()) {
                e.preventDefault();
                const name = inputEl.value.trim().toLowerCase();
                if (!selectedTags.find(s => s.name === name)) {
                    const existing = this.allTags.find(t => t.name === name);
                    selectedTags.push({ name, color: existing?.color || '#635bff' });
                }
                inputEl.value = '';
                dropdown.classList.remove('visible');
                onUpdate();
            }
            if (e.key === 'Backspace' && !inputEl.value && selectedTags.length) {
                selectedTags.pop();
                onUpdate();
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!containerEl.contains(e.target)) dropdown.classList.remove('visible');
        });
    },

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }
};
