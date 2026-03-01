/* ═══════════════════════════════════════════════════════════
   Captures Feed — Timeline rendering + infinite scroll
   ═══════════════════════════════════════════════════════════ */

const CapturesFeed = {
    captures: [],
    page: 1,
    limit: 20,
    total: 0,
    loading: false,
    done: false,
    observer: null,

    TYPE_ICONS: { text: '📝', link: '🔗', checklist: '☑️', photo: '📸' },

    initialized: false,

    init() {
        // Don't set up infinite scroll here — wait until initial data is loaded
    },

    startInfiniteScroll() {
        if (this.initialized) return;
        this.initialized = true;
        this.setupInfiniteScroll();
    },

    reset() {
        this.captures = [];
        this.page = 1;
        this.total = 0;
        this.done = false;
        const el = document.getElementById('capturesFeed');
        if (el) el.innerHTML = '';
    },

    async loadMore() {
        if (this.loading || this.done) return;
        this.loading = true;
        this.showLoading(true);
        try {
            const filters = Object.assign({}, CapturesTags.getFilters(), {
                page: this.page,
                limit: this.limit,
            });
            const data = await CapturesService.getCaptures(filters);
            const items = data.captures || [];
            this.total = data.total || 0;
            if (!items.length || items.length < this.limit) this.done = true;
            this.captures = this.captures.concat(items);
            this.page++;
            this.renderAppend(items);
            CapturesPage.updateSubtitle(this.total);
        } catch (err) {
            showToast(err.message || 'Failed to load captures', 'error');
        } finally {
            this.loading = false;
            this.showLoading(false);
        }
    },

    renderAppend(items) {
        const el = document.getElementById('capturesFeed');
        if (!el) return;

        // Remove empty state if present
        const empty = el.querySelector('.captures-empty');
        if (empty && items.length) empty.remove();

        // Show empty state if no captures at all
        if (!items.length && !this.captures.length) {
            el.innerHTML = this.renderEmpty();
            return;
        }

        // Separate pinned from unpinned
        const pinned = items.filter(c => c.pinned);
        const unpinned = items.filter(c => !c.pinned);

        // Show pinned separator if this is the first render and there are pinned items
        const existingPinSep = el.querySelector('.pin-sep');
        if (pinned.length && !existingPinSep && !el.querySelector('.capture-card')) {
            const pinSep = document.createElement('div');
            pinSep.className = 'pin-sep';
            pinSep.textContent = '📌 Pinned';
            el.appendChild(pinSep);
            pinned.forEach(cap => {
                const card = this.createCard(cap);
                card.classList.add('entering');
                el.appendChild(card);
            });
        }

        // Re-order: process unpinned items with date separators
        const sortedItems = unpinned.length ? unpinned : (pinned.length ? [] : items);

        let lastDate = '';
        // Get last rendered date separator
        const seps = el.querySelectorAll('.date-sep');
        if (seps.length) lastDate = seps[seps.length - 1].getAttribute('data-date') || '';

        const frag = document.createDocumentFragment();
        sortedItems.forEach(cap => {
            const dateKey = this.dateKey(cap.captured_at);
            if (dateKey !== lastDate) {
                lastDate = dateKey;
                const sep = document.createElement('div');
                sep.className = 'date-sep';
                sep.setAttribute('data-date', dateKey);
                sep.textContent = this.formatDateSep(cap.captured_at);
                frag.appendChild(sep);
            }
            const card = this.createCard(cap);
            card.classList.add('entering');
            frag.appendChild(card);
        });
        el.appendChild(frag);
        if (window.lucide) lucide.createIcons();
    },

    CARD_THEMES: [
        { bg: '#F0EEFF', border: '#635BFF', accent: '#635BFF' },   // indigo
        { bg: '#FFF0F0', border: '#FF6B6B', accent: '#FF6B6B' },   // coral
        { bg: '#EEFAF9', border: '#4ECDC4', accent: '#4ECDC4' },   // teal
        { bg: '#EEF6FF', border: '#45B7D1', accent: '#45B7D1' },   // sky
        { bg: '#F0F9F4', border: '#2D9E6F', accent: '#2D9E6F' },   // green
        { bg: '#FFF8E6', border: '#F5A623', accent: '#F5A623' },   // amber
        { bg: '#F8F0FF', border: '#A855F7', accent: '#A855F7' },   // purple
        { bg: '#FFF3EE', border: '#FF8C42', accent: '#FF8C42' },   // orange
    ],
    CARD_THEMES_DARK: [
        { bg: 'rgba(99,91,255,0.1)', border: '#635BFF', accent: '#635BFF' },
        { bg: 'rgba(255,107,107,0.1)', border: '#FF6B6B', accent: '#FF6B6B' },
        { bg: 'rgba(78,205,196,0.1)', border: '#4ECDC4', accent: '#4ECDC4' },
        { bg: 'rgba(69,183,209,0.1)', border: '#45B7D1', accent: '#45B7D1' },
        { bg: 'rgba(45,158,111,0.1)', border: '#2D9E6F', accent: '#2D9E6F' },
        { bg: 'rgba(245,166,35,0.1)', border: '#F5A623', accent: '#F5A623' },
        { bg: 'rgba(168,85,247,0.1)', border: '#A855F7', accent: '#A855F7' },
        { bg: 'rgba(255,140,66,0.1)', border: '#FF8C42', accent: '#FF8C42' },
    ],

    getTheme(id) {
        const isDark = document.documentElement.classList.contains('dark') ||
                       document.body.classList.contains('dark') ||
                       window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        const themes = isDark ? this.CARD_THEMES_DARK : this.CARD_THEMES;
        const idx = (id || Math.floor(Math.random() * 8)) % themes.length;
        return themes[idx];
    },

    createCard(cap, isOptimistic) {
        const card = document.createElement('div');
        card.className = 'capture-card' + (isOptimistic ? ' optimistic' : '');
        card.setAttribute('data-id', cap.id || cap._tempId || '');
        const theme = this.getTheme(cap.id);
        card.style.background = theme.bg;
        card.style.borderLeft = '4px solid ' + theme.border;

        let inner = '';
        // Image
        if (cap.type === 'photo' && cap.image_path) {
            inner += '<img class="capture-img" src="' + this._esc(cap.image_thumb_path || cap.image_path) + '" alt="" loading="lazy" data-full="' + this._esc(cap.image_path) + '">';
        }

        inner += '<div class="capture-body">';

        // Link preview
        if (cap.type === 'link' && (cap.og_title || cap.url)) {
            if (cap.og_image) {
                // Full-width image link card
                inner += '<img class="capture-link-hero" src="' + this._esc(cap.og_image) + '" alt="" loading="lazy">';
                inner += '<div class="capture-link-info-full">';
                inner += '<div class="capture-link-title">' + this._esc(cap.og_title || cap.url) + '</div>';
                try { inner += '<div class="capture-link-domain">' + new URL(cap.url).hostname + '</div>'; } catch(e) {}
                if (cap.og_description) inner += '<div class="capture-link-desc">' + this._esc(cap.og_description) + '</div>';
                inner += '</div>';
            } else {
                inner += '<div class="capture-link-preview">';
                inner += '<div class="capture-link-thumb">🔗</div><div class="capture-link-info">';
                inner += '<div class="capture-link-title">' + this._esc(cap.og_title || cap.url) + '</div>';
                if (cap.url) {
                    try { inner += '<div class="capture-link-domain">' + new URL(cap.url).hostname + '</div>'; } catch(e) {}
                }
                if (cap.og_description) inner += '<div class="capture-link-desc">' + this._esc(cap.og_description) + '</div>';
                inner += '</div></div>';
            }
        }

        // Title row with actions button
        if (cap.title) {
            const theme = this.getTheme(cap.id);
            const lucideIcons = {text:'file-text',link:'external-link',checklist:'list-checks',photo:'image'};
            inner += '<div class="capture-title-row"><div class="capture-title"><i data-lucide="' + (lucideIcons[cap.type] || 'file-text') + '" class="capture-type-lucide" style="color:' + theme.border + '"></i>' + this._esc(cap.title) + '</div>';
            if (!isOptimistic) inner += '<button class="capture-actions-btn" aria-label="Actions">⋯</button>';
            inner += '</div>';
        }

        // Body
        if (cap.body) {
            inner += '<div class="capture-text">' + this._esc(cap.body) + '</div>';
        } else if (cap.raw_input && isOptimistic) {
            inner += '<div class="capture-text">' + this._esc(cap.raw_input) + '</div>';
        }

        // Checklist
        if (cap.type === 'checklist' && cap.checklist && cap.checklist.length) {
            inner += '<ul class="capture-checklist">';
            cap.checklist.forEach((item, idx) => {
                inner += '<li class="' + (item.checked ? 'checked' : '') + '" data-capture-id="' + (cap.id || '') + '" data-idx="' + idx + '">';
                inner += '<span class="check-box' + (item.checked ? ' done' : '') + '"></span>';
                inner += this._esc(item.text);
                inner += '</li>';
            });
            inner += '</ul>';
        }

        // Meta
        inner += '<div class="capture-meta">';
        if (cap.place_name) inner += '<span class="capture-location">📍 ' + this._esc(cap.place_name) + '</span>';
        if (cap.shared) {
            const isFromOther = cap.owner_name && typeof currentUser !== 'undefined' && currentUser && cap.user_id != currentUser.id;
            inner += '<span class="capture-shared">👨‍👩 ' + (isFromOther ? 'Shared by ' + this._esc(cap.owner_name) : 'Shared') + '</span>';
        }
        inner += '<span class="capture-time">' + this.relativeTime(cap.captured_at) + '</span>';
        inner += '</div></div>';

        card.innerHTML = inner;

        // Actions menu
        const actBtn = card.querySelector('.capture-actions-btn');
        if (actBtn) {
            actBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showActionsMenu(card, cap);
            });
        }

        // Photo click → fullscreen lightbox
        const img = card.querySelector('.capture-img[data-full]');
        if (img) {
            img.style.cursor = 'pointer';
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openLightbox(img.getAttribute('data-full'), cap.title);
            });
        }

        // Checklist click handlers
        card.querySelectorAll('.capture-checklist li').forEach(li => {
            li.addEventListener('click', () => this.toggleCheckItem(li));
        });

        return card;
    },

    async toggleCheckItem(li) {
        const captureId = li.getAttribute('data-capture-id');
        const idx = parseInt(li.getAttribute('data-idx'));
        if (!captureId) return;

        const cap = this.captures.find(c => c.id == captureId);
        if (!cap || !cap.checklist || !cap.checklist[idx]) return;

        // Optimistic toggle
        cap.checklist[idx].checked = !cap.checklist[idx].checked;
        li.classList.toggle('checked');
        li.querySelector('.check-box').classList.toggle('done');

        try {
            await CapturesService.updateCapture(captureId, { checklist: cap.checklist });
        } catch (err) {
            // Revert
            cap.checklist[idx].checked = !cap.checklist[idx].checked;
            li.classList.toggle('checked');
            li.querySelector('.check-box').classList.toggle('done');
            showToast('Failed to update checklist', 'error');
        }
    },

    // ─── Optimistic Create ───
    addOptimistic(tempData) {
        const el = document.getElementById('capturesFeed');
        if (!el) return;
        // Remove empty state
        const empty = el.querySelector('.captures-empty');
        if (empty) empty.remove();

        const todayKey = this.dateKey(new Date().toISOString());
        const firstSep = el.querySelector('.date-sep');
        const needsSep = !firstSep || firstSep.getAttribute('data-date') !== todayKey;

        if (needsSep) {
            const sep = document.createElement('div');
            sep.className = 'date-sep';
            sep.setAttribute('data-date', todayKey);
            sep.textContent = 'Today';
            el.insertBefore(sep, el.firstChild);
        }

        const card = this.createCard(tempData, true);
        card.classList.add('entering');
        const afterSep = el.querySelector('.date-sep');
        if (afterSep && afterSep.nextSibling) {
            el.insertBefore(card, afterSep.nextSibling);
        } else {
            el.appendChild(card);
        }
        return card;
    },

    replaceOptimistic(tempId, capture) {
        const el = document.getElementById('capturesFeed');
        if (!el) return;
        const old = el.querySelector('[data-id="' + tempId + '"]');
        if (old) {
            const card = this.createCard(capture, false);
            card.classList.add('entering');
            old.replaceWith(card);
            if (window.lucide) lucide.createIcons();
        }
        // Add to local array
        this.captures.unshift(capture);
        this.total++;
        CapturesPage.updateSubtitle(this.total);
    },

    removeOptimistic(tempId) {
        const el = document.getElementById('capturesFeed');
        if (!el) return;
        const card = el.querySelector('[data-id="' + tempId + '"]');
        if (card) card.remove();
        // Remove empty "Today" sep if no cards after it
        if (!el.querySelector('.capture-card')) {
            el.innerHTML = this.renderEmpty();
        }
    },

    // ─── Photo Lightbox ───
    openLightbox(src, title) {
        // Remove existing
        document.getElementById('captureLightbox')?.remove();

        const lb = document.createElement('div');
        lb.id = 'captureLightbox';
        lb.className = 'capture-lightbox';
        lb.innerHTML = `
            <div class="lightbox-backdrop"></div>
            <button class="lightbox-close">✕</button>
            ${title ? '<div class="lightbox-title">' + this._esc(title) + '</div>' : ''}
            <div class="lightbox-img-wrap">
                <img src="${this._esc(src)}" alt="" class="lightbox-img">
            </div>
        `;

        document.body.appendChild(lb);
        requestAnimationFrame(() => lb.classList.add('open'));

        const close = () => {
            lb.classList.remove('open');
            setTimeout(() => lb.remove(), 300);
        };

        lb.querySelector('.lightbox-backdrop').addEventListener('click', close);
        lb.querySelector('.lightbox-close').addEventListener('click', close);
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
        });

        // Pinch-zoom support
        let scale = 1, lastDist = 0;
        const imgEl = lb.querySelector('.lightbox-img');
        imgEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            }
        }, {passive: true});
        imgEl.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                scale = Math.min(4, Math.max(0.5, scale * (dist / lastDist)));
                imgEl.style.transform = `scale(${scale})`;
                lastDist = dist;
            }
        }, {passive: true});
        imgEl.addEventListener('touchend', () => {
            if (scale < 1.1) { scale = 1; imgEl.style.transform = 'scale(1)'; }
        }, {passive: true});

        // Double-tap to zoom
        let lastTap = 0;
        imgEl.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastTap < 300) {
                scale = scale > 1.5 ? 1 : 2.5;
                imgEl.style.transform = `scale(${scale})`;
            }
            lastTap = now;
        });
    },

    // ─── Actions Menu ───
    showActionsMenu(card, cap) {
        // Remove any existing menu
        document.querySelectorAll('.capture-actions-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'capture-actions-menu';
        const isOwner = !currentUser || cap.user_id == currentUser.id;
        let menuHtml = '';
        if (isOwner) {
            menuHtml += `<button class="action-item action-pin">${cap.pinned ? '📌 Unpin' : '📌 Pin'}</button>`;
            menuHtml += `<button class="action-item action-share">${cap.shared ? '🔒 Unshare' : '👥 Share'}</button>`;
            menuHtml += `<button class="action-item action-archive">📦 Archive</button>`;
            menuHtml += `<button class="action-item action-delete danger">🗑️ Delete</button>`;
        } else {
            menuHtml += `<div style="padding:8px 12px;opacity:0.5;font-size:13px">Shared by ${cap.owner_name || 'someone'}</div>`;
        }
        menu.innerHTML = menuHtml;

        // Position menu relative to the button, appended to body so no overflow clipping
        const btn = card.querySelector('.capture-actions-btn');
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        document.body.appendChild(menu);

        // Pin (only if owner)
        if (!isOwner) {
            const close = (e) => {
                if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
            };
            setTimeout(() => document.addEventListener('click', close), 10);
            return;
        }
        menu.querySelector('.action-pin').addEventListener('click', async (e) => {
            e.stopPropagation();
            menu.remove();
            try {
                await CapturesService.updateCapture(cap.id, { pinned: !cap.pinned });
                cap.pinned = !cap.pinned;
                showToast(cap.pinned ? 'Pinned!' : 'Unpinned', 'success');
            } catch (err) { showToast('Failed to update', 'error'); }
        });

        // Share toggle
        menu.querySelector('.action-share').addEventListener('click', async (e) => {
            e.stopPropagation();
            menu.remove();
            try {
                await CapturesService.updateCapture(cap.id, { shared: !cap.shared });
                cap.shared = !cap.shared;
                const sharedBadge = card.querySelector('.capture-shared');
                if (cap.shared && !sharedBadge) {
                    const meta = card.querySelector('.capture-meta');
                    if (meta) { const s = document.createElement('span'); s.className = 'capture-shared'; s.textContent = '👨‍👩 Shared'; meta.insertBefore(s, meta.querySelector('.capture-time')); }
                } else if (!cap.shared && sharedBadge) { sharedBadge.remove(); }
                showToast(cap.shared ? 'Shared with Saba' : 'Unshared', 'success');
            } catch (err) { showToast('Failed to update', 'error'); }
        });

        // Archive
        menu.querySelector('.action-archive').addEventListener('click', async (e) => {
            e.stopPropagation();
            menu.remove();
            card.style.transition = 'opacity 0.3s, transform 0.3s';
            card.style.opacity = '0';
            card.style.transform = 'translateX(-100px)';
            try {
                await CapturesService.updateCapture(cap.id, { archived: true });
                setTimeout(() => card.remove(), 300);
                this.captures = this.captures.filter(c => c.id !== cap.id);
                this.total--;
                CapturesPage.updateSubtitle(this.total);
                showToast('Archived', 'success');
            } catch (err) {
                card.style.opacity = '1';
                card.style.transform = 'none';
                showToast('Failed to archive', 'error');
            }
        });

        // Delete
        menu.querySelector('.action-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            menu.remove();
            // Confirm
            if (!confirm('Delete this capture?')) return;
            // Optimistic remove
            card.style.transition = 'opacity 0.3s, transform 0.3s';
            card.style.opacity = '0';
            card.style.transform = 'translateX(100px)';
            try {
                await CapturesService.deleteCapture(cap.id);
                setTimeout(() => card.remove(), 300);
                this.captures = this.captures.filter(c => c.id !== cap.id);
                this.total--;
                CapturesPage.updateSubtitle(this.total);
                showToast('Deleted', 'success');
                // Refresh tags — removed capture may have been the last with that tag
                CapturesService.getTags().then(tags => CapturesTags.setTags(tags)).catch(() => {});
            } catch (err) {
                card.style.opacity = '1';
                card.style.transform = 'none';
                showToast('Failed to delete', 'error');
            }
        });

        // Close on outside click
        const close = (e) => {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
        };
        setTimeout(() => document.addEventListener('click', close), 10);
    },

    // ─── Infinite Scroll ───
    setupInfiniteScroll() {
        const sentinel = document.getElementById('scrollSentinel');
        if (!sentinel) return;
        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) this.loadMore();
        }, { rootMargin: '200px' });
        this.observer.observe(sentinel);
    },

    showLoading(show) {
        const el = document.getElementById('feedLoading');
        if (el) el.style.display = show ? 'block' : 'none';
    },

    // ─── Helpers ───
    renderEmpty() {
        return '<div class="captures-empty"><div class="empty-icon">✨</div><h3>No captures yet</h3><p>Tap the + button to capture your first thought, link, or moment.</p></div>';
    },

    dateKey(dateStr) {
        const d = new Date(dateStr);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    formatDateSep(dateStr) {
        const d = new Date(dateStr);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diff = Math.round((today - target) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    },

    relativeTime(dateStr) {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return days + 'd ago';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    // Compute readable tag background — stronger version of the color
    _tagBg(hex) {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
        if (isDark) {
            return `rgba(${r},${g},${b},0.2)`;
        }
        // Light mode: mix color with white at ~20% to get a pastel bg
        const mix = (c) => Math.round(c * 0.2 + 255 * 0.8);
        return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    },

    // Compute readable tag text color — darken light colors, use as-is for dark ones
    _tagFg(hex) {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const luminance = (0.299*r + 0.587*g + 0.114*b);
        const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
        if (isDark) {
            // In dark mode, lighten dark colors, keep bright ones
            return luminance < 140 ? `rgb(${Math.min(r+60,255)},${Math.min(g+60,255)},${Math.min(b+60,255)})` : hex;
        }
        // In light mode, darken bright colors so they're readable on pastel bg
        if (luminance > 180) {
            const darken = (c) => Math.round(c * 0.4);
            return `rgb(${darken(r)},${darken(g)},${darken(b)})`;
        }
        return hex;
    },

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }
};
