    // ═══════════════════════════════════════════════════════
    // BLURHASH DECODER — ported from woltapp/blurhash
    // ═══════════════════════════════════════════════════════
    const BlurHash = (() => {
        const digitChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-./:;=?@[]^_{|}~';
        const decode83 = (str) => {
            let v = 0;
            for (let i = 0; i < str.length; i++) {
                v = v * 83 + digitChars.indexOf(str[i]);
            }
            return v;
        };
        const sRGBToLinear = (v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const linearToSRGB = (v) => {
            const c = Math.max(0, Math.min(1, v));
            return c <= 0.0031308 ? Math.round(c * 12.92 * 255 + 0.5) : Math.round((1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255 + 0.5);
        };
        const sign = (n) => (n < 0 ? -1 : 1);
        const signPow = (v, exp) => sign(v) * Math.pow(Math.abs(v), exp);

        const decodeDC = (v) => [sRGBToLinear(v >> 16), sRGBToLinear((v >> 8) & 255), sRGBToLinear(v & 255)];
        const decodeAC = (v, maxAC) => {
            const qR = Math.floor(v / (19 * 19));
            const qG = Math.floor(v / 19) % 19;
            const qB = v % 19;
            return [signPow((qR - 9) / 9, 2) * maxAC, signPow((qG - 9) / 9, 2) * maxAC, signPow((qB - 9) / 9, 2) * maxAC];
        };

        return {
            decode(hash, width, height, punch = 1) {
                if (!hash || hash.length < 6) return null;
                const sizeFlag = decode83(hash[0]);
                const numY = Math.floor(sizeFlag / 9) + 1;
                const numX = (sizeFlag % 9) + 1;
                const quantMaxVal = decode83(hash[1]);
                const maxAC = (quantMaxVal + 1) / 166 * punch;
                const colors = new Array(numX * numY);
                colors[0] = decodeDC(decode83(hash.substring(2, 6)));
                for (let i = 1; i < numX * numY; i++) {
                    colors[i] = decodeAC(decode83(hash.substring(4 + i * 2, 6 + i * 2)), maxAC);
                }
                const pixels = new Uint8ClampedArray(width * height * 4);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        let r = 0, g = 0, b = 0;
                        for (let j = 0; j < numY; j++) {
                            for (let i = 0; i < numX; i++) {
                                const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
                                const c = colors[j * numX + i];
                                r += c[0] * basis;
                                g += c[1] * basis;
                                b += c[2] * basis;
                            }
                        }
                        const idx = 4 * (y * width + x);
                        pixels[idx] = linearToSRGB(r);
                        pixels[idx + 1] = linearToSRGB(g);
                        pixels[idx + 2] = linearToSRGB(b);
                        pixels[idx + 3] = 255;
                    }
                }
                return pixels;
            }
        };
    })();

    // ═══════════════════════════════════════════════════════
    // MAIN APP
    // ═══════════════════════════════════════════════════════
    (async () => {
        const user = await requireAuth();
        const shell = renderAppShell('Gallery', 'gallery');
        document.getElementById('shell-sidebar').innerHTML = shell.sidebar;
        document.getElementById('shell-topbar').innerHTML = shell.topbar;
        document.getElementById('shell-bottom-nav').innerHTML = shell.bottomNav;
        initAppShell('gallery');

        // ─── State ───
        let allPhotos = [];
        let filteredPhotos = [];
        let currentView = 'timeline';
        let currentLightboxIdx = -1;
        let selectMode = false;
        let selectedIds = new Set();
        let favOnly = false;
        let activeTag = null;
        let activeAlbum = null;
        let activeColor = null;
        let searchQuery = '';
        let map = null;
        let lastScrollY = 0;
        let colorsData = [];
        let collectionsData = [];
        let contextPhotoId = null;
        let longPressTimer = null;

        // ─── Target row heights ───
        const TARGET_ROW_HEIGHT = window.innerWidth <= 768 ? 140 : 220;
        const GAP = window.innerWidth <= 768 ? 2 : 4;

        // ─── Data fetching ───
        async function loadPhotos() {
            const params = new URLSearchParams();
            if (favOnly) params.set('favorite', 'true');
            if (activeTag) params.set('tag', activeTag);
            if (activeAlbum) params.set('album_id', activeAlbum);
            if (activeColor) params.set('color', activeColor);
            if (searchQuery) params.set('search', searchQuery);
            params.set('limit', '200');
            try {
                allPhotos = await API.get(`/gallery/photos?${params}`);
                filteredPhotos = allPhotos;
            } catch (e) {
                allPhotos = []; filteredPhotos = [];
            }
            render();
        }

        async function loadColors() {
            try {
                colorsData = await API.get('/gallery/colors');
            } catch { colorsData = []; }
        }

        async function loadCollections() {
            try {
                collectionsData = await API.get('/gallery/collections');
            } catch { collectionsData = []; }
        }

        // ─── Render dispatcher ───
        function render() {
            const views = ['grid', 'timeline', 'tags', 'map', 'stats'];
            views.forEach(v => {
                const el = document.getElementById(v + 'View');
                if (el) el.style.display = v === currentView ? '' : 'none';
            });

            // Show collections only in grid view with no active filters
            const showCollections = currentView === 'grid' && !favOnly && !activeTag && !activeAlbum && !activeColor && !searchQuery;
            document.getElementById('collectionsBar').style.display = showCollections && collectionsData.length ? '' : 'none';

            if (currentView === 'grid') renderGrid();
            else if (currentView === 'timeline') renderTimeline();
            else if (currentView === 'tags') renderTags();
            else if (currentView === 'map') renderMap();
            else if (currentView === 'stats') renderStats();

            renderFilters();
        }

        // ═══════════════════════════════════════════════════════
        // JUSTIFIED GRID — Google Photos algorithm
        // ═══════════════════════════════════════════════════════
        function renderGrid() {
            const grid = document.getElementById('gridView');
            if (selectMode) grid.classList.add('select-mode');
            else grid.classList.remove('select-mode');

            if (filteredPhotos.length === 0) {
                grid.innerHTML = `<div class="gallery-empty"><div class="icon"><i data-lucide="camera" style="width:48px;height:48px;stroke-width:1.5"></i></div><h3>No photos</h3><p>Upload some memories to get started</p></div>`;
                if (window.lucide) lucide.createIcons();
                return;
            }

            const containerWidth = grid.clientWidth - (GAP * 2); // subtract padding
            const rows = buildJustifiedRows(filteredPhotos, containerWidth, TARGET_ROW_HEIGHT, GAP);

            grid.innerHTML = rows.map(row => {
                const rowHTML = row.items.map(item => {
                    const p = item.photo;
                    const w = Math.floor(item.width);
                    const h = Math.floor(row.height);
                    return `
                    <div class="photo-card${selectedIds.has(p.id) ? ' selected' : ''}" data-idx="${item.idx}" data-id="${p.id}" 
                         style="width:${w}px;height:${h}px;">
                        <div class="select-check${selectedIds.has(p.id) ? ' checked' : ''}" data-id="${p.id}"><i data-lucide="check" style="width:14px;height:14px"></i></div>
                        ${p.blurhash ? `<canvas class="blurhash-canvas" data-hash="${p.blurhash}" width="32" height="32"></canvas>` : ''}
                        <img data-src="${p.thumbnail_path}" alt="${p.filename}" style="width:${w}px;height:${h}px;">
                        <div class="overlay">
                            <div class="actions-row">
                                <button class="overlay-btn ${p.is_favorite ? 'favorited' : ''}" data-fav="${p.id}"><i data-lucide="heart"></i></button>
                            </div>
                        </div>
                    </div>`;
                }).join('');
                return `<div class="justified-row">${rowHTML}</div>`;
            }).join('');

            // Decode blurhashes
            requestAnimationFrame(decodeBlurhashes);
            // Lazy load images
            requestAnimationFrame(setupLazyLoad);
            // Initialize Lucide icons in new content
            if (window.lucide) lucide.createIcons();
            // Click handlers — setup once
            if (!grid._eventsAttached) {
                setupGridEvents(grid);
                grid._eventsAttached = true;
            }
        }

        function buildJustifiedRows(photos, containerWidth, targetHeight, gap) {
            const rows = [];
            let currentRow = [];
            let currentRowWidth = 0;

            photos.forEach((p, idx) => {
                const aspect = (p.width && p.height) ? p.width / p.height : 1.5;
                const scaledWidth = aspect * targetHeight;
                currentRow.push({ photo: p, idx, aspect, scaledWidth });
                currentRowWidth += scaledWidth + (currentRow.length > 1 ? gap : 0);

                if (currentRowWidth >= containerWidth) {
                    // Scale row to fit exactly
                    const totalGap = (currentRow.length - 1) * gap;
                    const availWidth = containerWidth - totalGap;
                    const totalAspect = currentRow.reduce((s, i) => s + i.aspect, 0);
                    const rowHeight = availWidth / totalAspect;
                    rows.push({
                        height: rowHeight,
                        items: currentRow.map(item => ({ ...item, width: item.aspect * rowHeight }))
                    });
                    currentRow = [];
                    currentRowWidth = 0;
                }
            });

            // Last partial row — use target height (don't stretch)
            if (currentRow.length > 0) {
                const rowHeight = Math.min(targetHeight, TARGET_ROW_HEIGHT);
                rows.push({
                    height: rowHeight,
                    items: currentRow.map(item => ({ ...item, width: item.aspect * rowHeight }))
                });
            }
            return rows;
        }

        function decodeBlurhashes() {
            document.querySelectorAll('canvas.blurhash-canvas[data-hash]').forEach(canvas => {
                const hash = canvas.dataset.hash;
                if (!hash || hash.length < 6 || canvas.dataset.decoded) return;
                canvas.dataset.decoded = '1';
                try {
                    const w = 32, h = 32;
                    const pixels = BlurHash.decode(hash, w, h);
                    if (!pixels) return;
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    const imageData = ctx.createImageData(w, h);
                    imageData.data.set(pixels);
                    ctx.putImageData(imageData, 0, 0);
                } catch (e) {}
            });
        }

        // ─── Lazy loading with IntersectionObserver ───
        let lazyObserver;
        function setupLazyLoad() {
            if (lazyObserver) lazyObserver.disconnect();
            lazyObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src && !img.src) {
                            img.src = img.dataset.src;
                            img.onload = () => img.classList.add('loaded');
                        }
                        // Also add viewport animation
                        const card = img.closest('.photo-card');
                        if (card) card.classList.add('viewport-visible');
                        lazyObserver.unobserve(img);
                    }
                });
            }, { rootMargin: '200px' });

            document.querySelectorAll('.photo-card img[data-src]').forEach(img => {
                lazyObserver.observe(img);
            });
        }

        function setupGridEvents(grid) {
            grid.addEventListener('click', (e) => {
                const favBtn = e.target.closest('[data-fav]');
                if (favBtn) { e.stopPropagation(); toggleFav(parseInt(favBtn.dataset.fav)); return; }

                const selectCheck = e.target.closest('.select-check');
                const card = e.target.closest('.photo-card');
                if (!card) return;
                const id = parseInt(card.dataset.id);
                const idx = parseInt(card.dataset.idx);

                if (selectCheck || selectMode) {
                    if (selectedIds.has(id)) selectedIds.delete(id);
                    else selectedIds.add(id);
                    updateBatchBar();
                    card.classList.toggle('selected', selectedIds.has(id));
                    const check = card.querySelector('.select-check');
                    if (check) check.classList.toggle('checked', selectedIds.has(id));
                    // Auto-exit selection when nothing selected
                    if (selectedIds.size === 0) clearSelection();
                    return;
                }
                openLightbox(idx);
            });

            // Right-click context menu (desktop)
            grid.addEventListener('contextmenu', (e) => {
                const card = e.target.closest('.photo-card');
                if (!card) return;
                e.preventDefault();
                contextPhotoId = parseInt(card.dataset.id);
                showContextMenu(e.clientX, e.clientY);
            });

            // Long press (mobile)
            grid.addEventListener('touchstart', (e) => {
                const card = e.target.closest('.photo-card');
                if (!card) return;
                longPressTimer = setTimeout(() => {
                    // Long-press starts selection mode and selects this photo
                    const id = parseInt(card.dataset.id);
                    if (!selectMode) {
                        selectMode = true;
                        ['gridView', 'timelineView', 'tagsView'].forEach(vid => {
                            const el = document.getElementById(vid);
                            if (el) el.classList.add('select-mode');
                        });
                    }
                    selectedIds.add(id);
                    updateBatchBar();
                    card.classList.add('selected');
                    const check = card.querySelector('.select-check');
                    if (check) check.classList.add('checked');
                    // Haptic feedback if available
                    if (navigator.vibrate) navigator.vibrate(30);
                    e.preventDefault();
                }, 400);
            }, { passive: false });
            grid.addEventListener('touchend', () => clearTimeout(longPressTimer));
            grid.addEventListener('touchmove', () => clearTimeout(longPressTimer));
        }

        // ═══════════════════════════════════════════════════════
        // TIMELINE VIEW
        // ═══════════════════════════════════════════════════════
        async function renderTimeline() {
            const container = document.getElementById('timelineView');
            try {
                const groups = await API.get('/gallery/timeline');
                if (!groups.length) {
                    container.innerHTML = '<div class="gallery-empty"><div class="icon"><i data-lucide="calendar" style="width:48px;height:48px;stroke-width:1.5"></i></div><h3>No timeline yet</h3><p>Upload photos with dates</p></div>';
                    if (window.lucide) lucide.createIcons();
                    return;
                }
                container.innerHTML = groups.map(g => {
                    const d = new Date(g.date + 'T12:00:00');
                    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
                    const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

                    // Build justified grid for this group
                    const groupWidth = container.clientWidth - 8;
                    const rows = buildJustifiedRows(g.photos, groupWidth, 140, GAP);

                    const photosHTML = rows.map(row => {
                        return `<div class="justified-row">${row.items.map(item => {
                            const p = item.photo;
                            const globalIdx = allPhotos.findIndex(ap => ap.id === p.id);
                            return `<div class="photo-card${selectedIds.has(p.id) ? ' selected' : ''}" data-idx="${globalIdx >= 0 ? globalIdx : 0}" data-id="${p.id}" 
                                         style="width:${Math.floor(item.width)}px;height:${Math.floor(row.height)}px;">
                                <div class="select-check${selectedIds.has(p.id) ? ' checked' : ''}" data-id="${p.id}"><i data-lucide="check" style="width:14px;height:14px"></i></div>
                                ${p.blurhash ? `<canvas class="blurhash-canvas" data-hash="${p.blurhash}" width="32" height="32"></canvas>` : ''}
                                <img data-src="${p.thumbnail_path}" alt="${p.filename}" style="width:${Math.floor(item.width)}px;height:${Math.floor(row.height)}px;">
                                <div class="overlay">
                                    <div class="actions-row">
                                        <button class="overlay-btn ${p.is_favorite ? 'favorited' : ''}" data-fav="${p.id}"><i data-lucide="heart"></i></button>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}</div>`;
                    }).join('');

                    return `
                    <div class="timeline-group">
                        <div class="timeline-date-header">
                            ${dateStr}<span class="day-name">• ${weekday}</span>
                            <span class="count">${g.photos.length} photo${g.photos.length > 1 ? 's' : ''}</span>
                        </div>
                        <div class="photo-grid" style="padding:2px 4px;">${photosHTML}</div>
                    </div>`;
                }).join('');

                requestAnimationFrame(decodeBlurhashes);
                requestAnimationFrame(setupLazyLoad);
                if (window.lucide) lucide.createIcons();

                // Click handling — selection + lightbox
                if (selectMode) container.classList.add('select-mode');
                else container.classList.remove('select-mode');
                container.querySelectorAll('.photo-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        const favBtn = e.target.closest('[data-fav]');
                        if (favBtn) { e.stopPropagation(); toggleFav(parseInt(favBtn.dataset.fav)); return; }

                        const id = parseInt(card.dataset.id);
                        if (e.target.closest('.select-check') || selectMode) {
                            if (selectedIds.has(id)) selectedIds.delete(id);
                            else selectedIds.add(id);
                            updateBatchBar();
                            card.classList.toggle('selected', selectedIds.has(id));
                            const check = card.querySelector('.select-check');
                            if (check) check.classList.toggle('checked', selectedIds.has(id));
                            // Auto-exit selection when nothing selected
                            if (selectedIds.size === 0) clearSelection();
                            return;
                        }
                        openLightbox(parseInt(card.dataset.idx));
                    });

                    // Long-press to start selection
                    let lpt;
                    card.addEventListener('touchstart', (e) => {
                        lpt = setTimeout(() => {
                            const id = parseInt(card.dataset.id);
                            if (!selectMode) {
                                selectMode = true;
                                ['gridView', 'timelineView', 'tagsView'].forEach(vid => {
                                    const el = document.getElementById(vid);
                                    if (el) el.classList.add('select-mode');
                                });
                            }
                            selectedIds.add(id);
                            updateBatchBar();
                            card.classList.add('selected');
                            const check = card.querySelector('.select-check');
                            if (check) check.classList.add('checked');
                            if (navigator.vibrate) navigator.vibrate(30);
                            e.preventDefault();
                        }, 400);
                    }, { passive: false });
                    card.addEventListener('touchend', () => clearTimeout(lpt));
                    card.addEventListener('touchmove', () => clearTimeout(lpt));
                });
            } catch (e) {
                container.innerHTML = '<div class="gallery-empty"><div class="icon"><i data-lucide="alert-triangle"></i></div><h3>Failed to load</h3></div>';
            }
        }

        // ═══════════════════════════════════════════════════════
        // TAGS VIEW
        // ═══════════════════════════════════════════════════════
        let tagsViewSelectedTag = null;

        async function renderTags() {
            const container = document.getElementById('tagsView');
            try {
                const stats = await API.get('/gallery/stats');
                if (!stats.tags.length) {
                    container.innerHTML = '<div class="gallery-empty"><div class="icon"><i data-lucide="tag" style="width:48px;height:48px;stroke-width:1.5"></i></div><h3>No tags</h3></div>'; if (window.lucide) lucide.createIcons();
                    return;
                }
                const maxCount = Math.max(...stats.tags.map(t => parseInt(t.count)));
                const tagCloud = stats.tags.map(t => {
                    const size = 13 + (parseInt(t.count) / maxCount) * 16;
                    const isActive = tagsViewSelectedTag === t.tag;
                    return `<span class="tag-pill${isActive ? ' active' : ''}" style="font-size:${size}px" data-tag="${t.tag}">${t.tag} <span class="count">${t.count}</span></span>`;
                }).join('');

                container.innerHTML = `
                    <h2 class="tags-heading">Browse by Tag</h2>
                    <div class="tag-cloud">${tagCloud}</div>
                    <div class="tag-results" id="tagResults"></div>
                `;

                container.querySelectorAll('.tag-pill').forEach(pill => {
                    pill.addEventListener('click', async () => {
                        const tag = pill.dataset.tag;
                        tagsViewSelectedTag = tagsViewSelectedTag === tag ? null : tag;
                        container.querySelectorAll('.tag-pill').forEach(p => p.classList.toggle('active', p.dataset.tag === tagsViewSelectedTag));
                        if (tagsViewSelectedTag) {
                            const photos = await API.get(`/gallery/photos?tag=${encodeURIComponent(tag)}&limit=50`);
                            renderTagResults(photos);
                        } else {
                            document.getElementById('tagResults').innerHTML = '';
                        }
                    });
                });

                if (tagsViewSelectedTag) {
                    const photos = await API.get(`/gallery/photos?tag=${encodeURIComponent(tagsViewSelectedTag)}&limit=50`);
                    renderTagResults(photos);
                }
            } catch (e) {
                container.innerHTML = '<div class="gallery-empty"><div class="icon"><i data-lucide="alert-triangle"></i></div><h3>Failed to load</h3></div>';
            }
        }

        function renderTagResults(photos) {
            const resultsEl = document.getElementById('tagResults');
            if (!photos.length) { resultsEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">No photos with this tag</p>'; return; }
            const width = resultsEl.clientWidth - 8;
            const rows = buildJustifiedRows(photos, width, 180, GAP);
            resultsEl.innerHTML = rows.map(row => {
                return `<div class="justified-row">${row.items.map(item => {
                    const p = item.photo;
                    const globalIdx = allPhotos.findIndex(ap => ap.id === p.id);
                    return `<div class="photo-card" data-idx="${globalIdx >= 0 ? globalIdx : 0}" data-id="${p.id}"
                                 style="width:${Math.floor(item.width)}px;height:${Math.floor(row.height)}px;">
                        <img src="${p.thumbnail_path}" alt="${p.filename}" class="loaded" style="width:${Math.floor(item.width)}px;height:${Math.floor(row.height)}px;">
                    </div>`;
                }).join('')}</div>`;
            }).join('');
            resultsEl.querySelectorAll('.photo-card').forEach(card => {
                card.addEventListener('click', () => openLightbox(parseInt(card.dataset.idx)));
            });
        }

        // ═══════════════════════════════════════════════════════
        // MAP VIEW
        // ═══════════════════════════════════════════════════════
        async function renderMap() {
            const container = document.getElementById('mapView');
            try {
                const mapPhotos = await API.get('/gallery/map');
                if (!mapPhotos.length) {
                    container.innerHTML = '<div class="map-empty"><div class="icon"><i data-lucide="map" style="width:48px;height:48px;stroke-width:1.5"></i></div><p>No photos with GPS data</p></div>'; if (window.lucide) lucide.createIcons();
                    return;
                }
                container.innerHTML = '<div id="photoMap"></div>';
                if (map) map.remove();
                map = L.map('photoMap').setView([mapPhotos[0].gps_lat, mapPhotos[0].gps_lon], 10);

                // Theme-aware tiles
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                L.tileLayer(isDark
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                    { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }
                ).addTo(map);

                mapPhotos.forEach(p => {
                    const icon = L.divIcon({
                        className: 'photo-marker',
                        html: `<img src="${p.thumbnail_path}" alt="">`,
                        iconSize: [48, 48],
                        iconAnchor: [24, 24],
                    });
                    const marker = L.marker([p.gps_lat, p.gps_lon], { icon }).addTo(map);
                    marker.on('click', () => {
                        const idx = allPhotos.findIndex(ap => ap.id === p.id);
                        if (idx >= 0) openLightbox(idx);
                    });
                });
                setTimeout(() => map.invalidateSize(), 100);
            } catch (e) {
                container.innerHTML = '<div class="map-empty"><div class="icon"><i data-lucide="alert-triangle"></i></div><p>Failed to load map</p></div>';
            }
        }

        // ═══════════════════════════════════════════════════════
        // STATS VIEW
        // ═══════════════════════════════════════════════════════
        async function renderStats() {
            const container = document.getElementById('statsView');
            try {
                const stats = await API.get('/gallery/stats');
                const sizeMB = (stats.total_size / 1024 / 1024).toFixed(1);
                const sizeStr = stats.total_size > 1024*1024*1024 ? `${(stats.total_size/1024/1024/1024).toFixed(1)} GB` : `${sizeMB} MB`;
                const earliest = stats.date_range?.earliest ? new Date(stats.date_range.earliest).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
                const latest = stats.date_range?.latest ? new Date(stats.date_range.latest).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';

                const barColors = ['#635BFF', '#3ecf8e', '#f5a623', '#5b9cf6', '#f45b69', '#a855f7', '#06b6d4', '#ec4899'];

                container.innerHTML = `
                <div class="stats-hero">
                    <h2><i data-lucide="camera"></i> Your Photography</h2>
                    <p>${stats.total} photos · ${sizeStr} · ${earliest} – ${latest}</p>
                </div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="label">Photos</div><div class="value val-accent">${stats.total}</div></div>
                    <div class="stat-card"><div class="label">Storage</div><div class="value">${sizeStr}</div></div>
                    <div class="stat-card"><div class="label">Tags</div><div class="value val-blue">${stats.tags.length}</div></div>
                    <div class="stat-card"><div class="label">Cameras</div><div class="value val-green">${stats.cameras.length}</div></div>
                </div>

                ${stats.cameras.length ? `
                <div class="stat-section">
                    <h3><i data-lucide="camera"></i> Cameras</h3>
                    ${stats.cameras.map((c, i) => `
                    <div class="stat-bar">
                        <span class="stat-bar-label">${c.camera_model}</span>
                        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(parseInt(c.count)/stats.total*100)}%;background:${barColors[i % barColors.length]}"></div></div>
                        <span class="stat-bar-count">${c.count}</span>
                    </div>`).join('')}
                </div>` : ''}

                ${stats.lenses.length ? `
                <div class="stat-section">
                    <h3><i data-lucide="aperture"></i> Lenses</h3>
                    ${stats.lenses.map((l, i) => `
                    <div class="stat-bar">
                        <span class="stat-bar-label">${l.lens}</span>
                        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(parseInt(l.count)/stats.total*100)}%;background:${barColors[(i+2) % barColors.length]}"></div></div>
                        <span class="stat-bar-count">${l.count}</span>
                    </div>`).join('')}
                </div>` : ''}

                ${stats.tags.length ? `
                <div class="stat-section">
                    <h3><i data-lucide="tag"></i> Top Tags</h3>
                    ${stats.tags.slice(0, 15).map((t, i) => `
                    <div class="stat-bar">
                        <span class="stat-bar-label">${t.tag}</span>
                        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(parseInt(t.count)/stats.total*100)}%;background:${barColors[(i+4) % barColors.length]}"></div></div>
                        <span class="stat-bar-count">${t.count}</span>
                    </div>`).join('')}
                </div>` : ''}

                ${stats.day_of_week?.length ? `
                <div class="stat-section">
                    <h3><i data-lucide="calendar"></i> Shooting Days</h3>
                    <div class="heatmap">
                        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => {
                            const d = stats.day_of_week.find(x => parseInt(x.dow) === i);
                            const count = d ? parseInt(d.count) : 0;
                            const maxDow = Math.max(...stats.day_of_week.map(x => parseInt(x.count)));
                            const intensity = maxDow > 0 ? count / maxDow : 0;
                            const bg = `rgba(99,91,255,${0.1 + intensity * 0.8})`;
                            return `<div class="heatmap-cell" style="background:${bg};border-radius:6px;" title="${day}: ${count}">
                                <span class="heatmap-label">${day}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>` : ''}

                ${stats.colors?.length ? `
                <div class="stat-section">
                    <h3><i data-lucide="palette"></i> Color Palette</h3>
                    <div class="color-palette">
                        ${stats.colors.map(c => `<div class="color-swatch" style="background:${c.color}" title="${c.color} (${c.count})"><span class="swatch-count">${c.count}</span></div>`).join('')}
                    </div>
                </div>` : ''}

                ${stats.aperture_stats?.length ? `
                <div class="stat-section">
                    <h3><i data-lucide="aperture"></i> Aperture</h3>
                    ${stats.aperture_stats.slice(0, 8).map((a, i) => `
                    <div class="stat-bar">
                        <span class="stat-bar-label">${a.aperture}</span>
                        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(parseInt(a.count)/stats.total*100)}%;background:${barColors[(i+1) % barColors.length]}"></div></div>
                        <span class="stat-bar-count">${a.count}</span>
                    </div>`).join('')}
                </div>` : ''}

                ${stats.iso_stats?.length ? `
                <div class="stat-section">
                    <h3><i data-lucide="sun"></i> ISO</h3>
                    ${stats.iso_stats.slice(0, 8).map((s, i) => `
                    <div class="stat-bar">
                        <span class="stat-bar-label">ISO ${s.iso}</span>
                        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(parseInt(s.count)/stats.total*100)}%;background:${barColors[(i+3) % barColors.length]}"></div></div>
                        <span class="stat-bar-count">${s.count}</span>
                    </div>`).join('')}
                </div>` : ''}
                `;

                if (window.lucide) lucide.createIcons();
                // Animate bars on scroll
                setTimeout(() => {
                    container.querySelectorAll('.stat-bar-fill').forEach(bar => {
                        const w = bar.style.width;
                        bar.style.width = '0';
                        requestAnimationFrame(() => { bar.style.width = w; });
                    });
                }, 100);

            } catch (e) {
                container.innerHTML = '<div class="gallery-empty"><div class="icon"><i data-lucide="alert-triangle"></i></div><h3>Failed to load stats</h3></div>';
            }
        }

        // ─── Filter chips ───
        function renderFilters() {
            const bar = document.getElementById('filterBar');
            let chips = '';
            if (favOnly) chips += '<span class="filter-chip" data-clear="fav"><i data-lucide="heart" style="width:12px;height:12px;vertical-align:-2px"></i> Favorites <span class="remove"><i data-lucide="x" style="width:10px;height:10px"></i></span></span>';
            if (activeTag) chips += `<span class="filter-chip" data-clear="tag"><i data-lucide="tag" style="width:12px;height:12px;vertical-align:-2px"></i> ${activeTag} <span class="remove"><i data-lucide="x" style="width:10px;height:10px"></i></span></span>`;
            if (activeAlbum) chips += '<span class="filter-chip" data-clear="album"><i data-lucide="folder" style="width:12px;height:12px;vertical-align:-2px"></i> Album <span class="remove"><i data-lucide="x" style="width:10px;height:10px"></i></span></span>';
            if (activeColor) chips += `<span class="filter-chip" data-clear="color"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${activeColor};margin-right:4px;"></span> ${activeColor} <span class="remove"><i data-lucide="x" style="width:10px;height:10px"></i></span></span>`;
            if (searchQuery) chips += `<span class="filter-chip" data-clear="search"><i data-lucide="search" style="width:12px;height:12px;vertical-align:-2px"></i> ${searchQuery} <span class="remove"><i data-lucide="x" style="width:10px;height:10px"></i></span></span>`;
            bar.innerHTML = chips;
            bar.querySelectorAll('.filter-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const t = chip.dataset.clear;
                    if (t === 'fav') { favOnly = false; document.getElementById('favFilter')?.classList.remove('active'); }
                    if (t === 'tag') activeTag = null;
                    if (t === 'album') activeAlbum = null;
                    if (t === 'color') { activeColor = null; document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active')); }
                    if (t === 'search') { searchQuery = ''; document.getElementById('searchInput').value = ''; }
                    loadPhotos();
                });
            });
        }

        // ─── Collections ───
        function renderCollections() {
            const bar = document.getElementById('collectionsBar');
            if (!collectionsData.length) { bar.style.display = 'none'; return; }
            bar.innerHTML = collectionsData.map(c => `
                <div class="collection-card" data-collection='${JSON.stringify(c.filter)}'>
                    ${c.cover ? `<img src="${c.cover}" alt="">` : ''}
                    <div class="label">${c.emoji} ${c.name}<br><span class="count">${c.count} photos</span></div>
                </div>
            `).join('');
            bar.querySelectorAll('.collection-card').forEach(card => {
                card.addEventListener('click', () => {
                    const filter = JSON.parse(card.dataset.collection);
                    if (filter.favorite) { favOnly = true; document.getElementById('favFilter')?.classList.add('active'); }
                    if (filter.tag) activeTag = filter.tag;
                    if (filter.date_from) { /* could add date filter */ }
                    loadPhotos();
                });
            });
        }

        // ─── Color bar ───
        function renderColorBar() {
            const bar = document.getElementById('colorBar');
            if (!colorsData.length) return;
            bar.innerHTML = colorsData.map(c => 
                `<div class="color-dot${activeColor === c.color ? ' active' : ''}" style="background:${c.color}" data-color="${c.color}" title="${c.color} (${c.count})"></div>`
            ).join('');
            bar.querySelectorAll('.color-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    const color = dot.dataset.color;
                    activeColor = activeColor === color ? null : color;
                    bar.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === activeColor));
                    loadPhotos();
                });
            });
        }

        // ═══════════════════════════════════════════════════════
        // LIGHTBOX
        // ═══════════════════════════════════════════════════════
        function updateInfoPanel(p) {
            document.getElementById('lbDesc').textContent = p.ai_description || '';
            document.getElementById('lbTags').innerHTML = (p.ai_tags || []).map(t =>
                `<span class="ai-tag" data-tag="${t}">${t}</span>`
            ).join('');
            document.getElementById('lbExif').innerHTML = [
                p.camera_model && { label: 'Camera', val: p.camera_model },
                p.lens && { label: 'Lens', val: p.lens },
                p.focal_length && { label: 'Focal', val: p.focal_length },
                p.aperture && { label: 'Aperture', val: p.aperture },
                p.shutter_speed && { label: 'Shutter', val: p.shutter_speed },
                p.iso && { label: 'ISO', val: p.iso },
                p.taken_at && { label: 'Date', val: new Date(p.taken_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) },
                p.width && { label: 'Resolution', val: `${p.width} × ${p.height}` },
            ].filter(Boolean).map(e => `<div class="exif-item"><div class="label">${e.label}</div><div class="val">${e.val}</div></div>`).join('');
            document.querySelectorAll('#lbTags .ai-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    closeLightbox();
                    activeTag = tag.dataset.tag;
                    loadPhotos();
                });
            });
            document.getElementById('lbSimilarRow').style.display = 'none';
        }

        function photoSrc(idx) {
            if (idx < 0 || idx >= filteredPhotos.length) return '';
            const p = filteredPhotos[idx];
            return p.medium_path || p.original_path;
        }

        // Two layers: activeLayer shows current photo, backLayer is used for transitions
        let activeLayerId = 'A';
        function getActiveLayer() { return document.getElementById('lbLayer' + activeLayerId); }
        function getBackLayer() { return document.getElementById('lbLayer' + (activeLayerId === 'A' ? 'B' : 'A')); }
        function getActiveImg() { return document.getElementById('lbImg' + activeLayerId); }
        function getBackImg() { return document.getElementById('lbImg' + (activeLayerId === 'A' ? 'B' : 'A')); }
        function getWrapper() { return getActiveLayer(); }

        function resetLayers() {
            const active = getActiveLayer();
            const back = getBackLayer();
            active.style.transition = 'none';
            active.style.transform = '';
            active.style.visibility = 'visible';
            active.style.zIndex = '2';
            back.style.transition = 'none';
            back.style.transform = '';
            back.style.visibility = 'hidden';
            back.style.zIndex = '1';
        }

        function openLightbox(idx) {
            if (idx < 0 || idx >= filteredPhotos.length) return;
            currentLightboxIdx = idx;
            zoomScale = 1; zoomX = 0; zoomY = 0;
            resetLayers();
            const p = filteredPhotos[idx];
            getActiveImg().src = p.medium_path || p.original_path;
            // Preload neighbors
            if (idx > 0) { const i = new Image(); i.src = photoSrc(idx - 1); }
            if (idx < filteredPhotos.length - 1) { const i = new Image(); i.src = photoSrc(idx + 1); }
            document.getElementById('lightbox').classList.add('active');
            document.getElementById('lbFilename').textContent = p.filename;
            document.getElementById('lbFav').innerHTML = '<i data-lucide="heart"></i>';
            if (window.lucide) lucide.createIcons();
            document.getElementById('lbFav').classList.toggle('favorited', p.is_favorite);
            updateInfoPanel(p);
            document.body.style.overflow = 'hidden';
        }

        function closeLightbox() {
            document.getElementById('lightbox').classList.remove('active');
            document.body.style.overflow = '';
            currentLightboxIdx = -1;
        }

        // Lightbox controls
        document.getElementById('lbClose').onclick = closeLightbox;
        document.getElementById('lbPrev').onclick = () => openLightbox(currentLightboxIdx - 1);
        document.getElementById('lbNext').onclick = () => openLightbox(currentLightboxIdx + 1);

        document.getElementById('lbFav').onclick = async () => {
            if (currentLightboxIdx < 0) return;
            const p = filteredPhotos[currentLightboxIdx];
            await toggleFav(p.id);
            const btn = document.getElementById('lbFav');
            btn.classList.add('heart-bounce');
            setTimeout(() => btn.classList.remove('heart-bounce'), 400);
            openLightbox(currentLightboxIdx);
        };

        document.getElementById('lbDownload').onclick = () => {
            if (currentLightboxIdx < 0) return;
            const p = filteredPhotos[currentLightboxIdx];
            const a = document.createElement('a');
            a.href = p.original_path; a.download = p.filename; a.click();
        };

        document.getElementById('lbInfo').onclick = () => {
            document.getElementById('lbInfoPanel').classList.toggle('collapsed');
        };
        document.getElementById('lbDragHandle').onclick = () => {
            document.getElementById('lbInfoPanel').classList.toggle('collapsed');
        };

        // Swipe to open/close info panel
        const infoPanel = document.getElementById('lbInfoPanel');
        let panelTouchStartY = 0, panelStartCollapsed = false, panelAtTop = false, panelDragging = false;
        infoPanel.addEventListener('touchstart', e => {
            panelTouchStartY = e.touches[0].clientY;
            panelStartCollapsed = infoPanel.classList.contains('collapsed');
            panelAtTop = infoPanel.scrollTop <= 0;
            panelDragging = false;
            e.stopPropagation();
        }, { passive: true });
        infoPanel.addEventListener('touchmove', e => {
            e.stopPropagation();
            const dy = e.touches[0].clientY - panelTouchStartY;
            // If panel is open, scrolled to top, and swiping down — intercept to close
            if (!panelStartCollapsed && panelAtTop && dy > 10) {
                e.preventDefault();
                panelDragging = true;
                // Visual feedback: translate panel down as user drags
                infoPanel.style.transition = 'none';
                infoPanel.style.transform = `translateY(${dy}px)`;
            }
            // If collapsed and swiping up — drag to open
            if (panelStartCollapsed && dy < -10) {
                panelDragging = true;
            }
        }, { passive: false });
        infoPanel.addEventListener('touchend', e => {
            e.stopPropagation();
            const dy = e.changedTouches[0].clientY - panelTouchStartY;
            infoPanel.style.transition = '';
            infoPanel.style.transform = '';

            if (panelStartCollapsed && dy < -40) {
                infoPanel.classList.remove('collapsed');
            } else if (!panelStartCollapsed && panelDragging && dy > 50) {
                infoPanel.classList.add('collapsed');
            }
            panelDragging = false;
        }, { passive: true });

        // Similar photos
        document.getElementById('lbSimilar').onclick = async () => {
            if (currentLightboxIdx < 0) return;
            const p = filteredPhotos[currentLightboxIdx];
            const row = document.getElementById('lbSimilarRow');
            const photosEl = document.getElementById('lbSimilarPhotos');
            try {
                const similar = await API.get(`/gallery/photos/${p.id}/similar`);
                if (similar.length) {
                    photosEl.innerHTML = similar.map(s => {
                        const idx = allPhotos.findIndex(ap => ap.id === s.id);
                        return `<div class="similar-thumb" data-idx="${idx >= 0 ? idx : 0}"><img src="${s.thumbnail_path}" alt=""></div>`;
                    }).join('');
                    row.style.display = '';
                    document.getElementById('lbInfoPanel').classList.remove('collapsed');
                    photosEl.querySelectorAll('.similar-thumb').forEach(thumb => {
                        thumb.addEventListener('click', () => openLightbox(parseInt(thumb.dataset.idx)));
                    });
                }
            } catch (e) {}
        };

        // Touch gestures — two-layer swap, pinch-to-zoom, double-tap, swipe-to-dismiss
        let touchStartX = 0, touchStartY = 0, isDraggingDown = false, swipeDX = 0, swipeLocked = '';
        let zoomScale = 1, zoomX = 0, zoomY = 0;
        let pinchStartDist = 0, pinchStartScale = 1;
        let isPinching = false, lastTap = 0, isAnimating = false;
        const lbBody = document.getElementById('lbBody');

        function applyZoom(animate) {
            const w = getActiveLayer();
            if (!w) return;
            w.style.transition = animate ? 'transform 0.25s ease' : 'none';
            if (zoomScale <= 1) { zoomScale = 1; zoomX = 0; zoomY = 0; }
            w.style.transform = `translate(${zoomX}px, ${zoomY}px) scale(${zoomScale})`;
        }
        function resetZoom() { zoomScale = 1; zoomX = 0; zoomY = 0; applyZoom(true); }
        function isZoomed() { return zoomScale > 1.05; }
        function pinchDist(t) { return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY); }

        lbBody.addEventListener('touchstart', e => {
            if (isAnimating) return;
            if (e.touches.length === 2) {
                e.preventDefault();
                isPinching = true;
                pinchStartDist = pinchDist(e.touches);
                pinchStartScale = zoomScale;
            } else if (e.touches.length === 1) {
                isPinching = false;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isDraggingDown = false;
                swipeDX = 0;
                swipeLocked = '';
            }
        }, { passive: false });

        lbBody.addEventListener('touchmove', e => {
            if (isAnimating) return;
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = pinchDist(e.touches);
                zoomScale = Math.min(5, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
                applyZoom(false);
                return;
            }
            if (isPinching || e.touches.length !== 1) return;

            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;

            if (isZoomed()) {
                e.preventDefault();
                zoomX += dx; zoomY += dy;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                applyZoom(false);
                return;
            }

            if (!swipeLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
                swipeLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            }

            if (swipeLocked === 'x') {
                e.preventDefault();
                swipeDX = dx;
                const active = getActiveLayer();
                const back = getBackLayer();
                const atStart = currentLightboxIdx === 0 && dx > 0;
                const atEnd = currentLightboxIdx === filteredPhotos.length - 1 && dx < 0;
                const atEdge = atStart || atEnd;
                const moveDX = atEdge ? dx * 0.25 : dx;

                // Move current photo with finger
                active.style.transition = 'none';
                active.style.transform = `translateX(${moveDX}px)`;

                // Show and position incoming photo
                if (!atEdge) {
                    const nextIdx = dx > 0 ? currentLightboxIdx - 1 : currentLightboxIdx + 1;
                    const backImg = getBackImg();
                    const src = photoSrc(nextIdx);
                    if (!backImg.src.endsWith(src) && src) backImg.src = src;
                    const inX = dx > 0 ? moveDX - window.innerWidth : moveDX + window.innerWidth;
                    back.style.transition = 'none';
                    back.style.transform = `translateX(${inX}px)`;
                    back.style.visibility = 'visible';
                } else {
                    back.style.visibility = 'hidden';
                }
                return;
            }

            // Vertical — swipe to dismiss
            if (swipeLocked === 'y' && dy > 30) {
                isDraggingDown = true;
                const active = getActiveLayer();
                active.style.transition = 'none';
                active.style.transform = `translateY(${dy}px) scale(${1 - dy * 0.001})`;
            }
        }, { passive: false });

        lbBody.addEventListener('touchend', e => {
            if (isAnimating) return;
            if (isPinching) {
                if (e.touches.length < 2) { isPinching = false; if (zoomScale < 1.1) resetZoom(); }
                return;
            }

            const dy = e.changedTouches[0].clientY - touchStartY;
            if (isZoomed()) return;

            const active = getActiveLayer();
            const back = getBackLayer();

            // Dismiss
            if (isDraggingDown && dy > 120) { closeLightbox(); return; }
            if (isDraggingDown) {
                active.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
                active.style.transform = '';
                return;
            }

            const THRESHOLD = 50;

            if (swipeLocked === 'x' && Math.abs(swipeDX) > THRESHOLD) {
                const nextIdx = swipeDX > 0 ? currentLightboxIdx - 1 : currentLightboxIdx + 1;
                if (nextIdx >= 0 && nextIdx < filteredPhotos.length) {
                    isAnimating = true;
                    const dir = swipeDX > 0 ? 1 : -1;
                    const vw = window.innerWidth;

                    // Animate current photo off-screen
                    active.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
                    active.style.transform = `translateX(${dir * vw}px)`;

                    // Animate incoming photo to center
                    back.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
                    back.style.transform = 'translateX(0px)';

                    setTimeout(() => {
                        // Swap layers — back becomes active, no src changes on visible elements
                        activeLayerId = activeLayerId === 'A' ? 'B' : 'A';
                        // Now getActiveLayer() returns what was the back layer (visible, centered)
                        // Hide old active (now the back layer, off-screen)
                        const newBack = getBackLayer();
                        newBack.style.transition = 'none';
                        newBack.style.transform = '';
                        newBack.style.visibility = 'hidden';
                        newBack.style.zIndex = '1';
                        // Ensure new active is on top
                        const newActive = getActiveLayer();
                        newActive.style.zIndex = '2';

                        currentLightboxIdx = nextIdx;
                        zoomScale = 1; zoomX = 0; zoomY = 0;
                        const p = filteredPhotos[nextIdx];
                        document.getElementById('lbFilename').textContent = p.filename;
                        document.getElementById('lbFav').classList.toggle('favorited', p.is_favorite);
                        updateInfoPanel(p);
                        // Preload neighbors
                        if (nextIdx > 0) { const i = new Image(); i.src = photoSrc(nextIdx - 1); }
                        if (nextIdx < filteredPhotos.length - 1) { const i = new Image(); i.src = photoSrc(nextIdx + 1); }
                        isAnimating = false;
                    }, 310);

                    swipeDX = 0;
                    return;
                }
            }

            // Snap back — return both to original positions
            active.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
            active.style.transform = '';
            back.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
            back.style.transform = `translateX(${swipeDX > 0 ? '-' : ''}100vw)`;
            setTimeout(() => { back.style.visibility = 'hidden'; }, 310);
            swipeDX = 0;
        }, { passive: true });

        // Double-tap to zoom
        lbBody.addEventListener('touchend', e => {
            if (isAnimating || isPinching || e.touches.length > 0) return;
            const now = Date.now();
            if (now - lastTap < 300) {
                if (isZoomed()) { resetZoom(); }
                else {
                    zoomScale = 2.5;
                    const rect = lbBody.getBoundingClientRect();
                    const tapX = e.changedTouches[0].clientX - rect.left - rect.width / 2;
                    const tapY = e.changedTouches[0].clientY - rect.top - rect.height / 2;
                    zoomX = -tapX * 0.6; zoomY = -tapY * 0.6;
                    applyZoom(true);
                }
                lastTap = 0;
                return;
            }
            lastTap = now;
        }, { passive: true });

        // Click to toggle controls
        lbBody.addEventListener('click', (e) => {
            if (e.target.closest('.lightbox-nav') || e.target.closest('.similar-thumb')) return;
            document.getElementById('lightbox').classList.toggle('controls-hidden');
        });

        // Keyboard
        document.addEventListener('keydown', e => {
            if (!document.getElementById('lightbox').classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') openLightbox(currentLightboxIdx - 1);
            else if (e.key === 'ArrowRight') openLightbox(currentLightboxIdx + 1);
            else if (e.key === 'f' || e.key === 'F') document.getElementById('lbFav').click();
            else if (e.key === 'i' || e.key === 'I') document.getElementById('lbInfo').click();
        });

        // ═══════════════════════════════════════════════════════
        // FAVORITE TOGGLE
        // ═══════════════════════════════════════════════════════
        async function toggleFav(id) {
            const photo = allPhotos.find(p => p.id === id);
            if (!photo) return;
            const updated = await API.request('PATCH', `/gallery/photos/${id}`, { is_favorite: !photo.is_favorite });
            Object.assign(photo, updated);
            render();
        }

        // ═══════════════════════════════════════════════════════
        // CONTEXT MENU
        // ═══════════════════════════════════════════════════════
        function showContextMenu(x, y) {
            const menu = document.getElementById('contextMenu');
            menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
            menu.style.top = Math.min(y, window.innerHeight - 250) + 'px';
            menu.classList.add('visible');
        }

        document.addEventListener('click', () => document.getElementById('contextMenu').classList.remove('visible'));
        document.getElementById('contextMenu').addEventListener('click', async (e) => {
            const item = e.target.closest('.context-menu-item');
            if (!item || !contextPhotoId) return;
            const action = item.dataset.action;
            const photo = allPhotos.find(p => p.id === contextPhotoId);

            if (action === 'favorite') { await toggleFav(contextPhotoId); }
            if (action === 'similar') {
                const idx = allPhotos.findIndex(p => p.id === contextPhotoId);
                if (idx >= 0) { openLightbox(idx); document.getElementById('lbSimilar').click(); }
            }
            if (action === 'download' && photo) {
                const a = document.createElement('a'); a.href = photo.original_path; a.download = photo.filename; a.click();
            }
            if (action === 'share') {
                try {
                    const result = await API.post('/gallery/share', { photo_id: contextPhotoId });
                    const url = `${window.location.origin}${result.url}`;
                    await navigator.clipboard.writeText(url);
                    showToast('Share link copied!');
                } catch (e) { showToast('Failed to create share link', 'error'); }
            }
            if (action === 'delete') {
                if (!confirm('Delete this photo?')) return;
                await API.request('DELETE', `/gallery/photos/${contextPhotoId}`);
                showToast('Photo deleted');
                loadPhotos();
            }
            document.getElementById('contextMenu').classList.remove('visible');
        });

        // ═══════════════════════════════════════════════════════
        // TOOLBAR EVENTS
        // ═══════════════════════════════════════════════════════

        // Auto-hide toolbar on scroll
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const scrollY = window.scrollY;
                    const toolbar = document.getElementById('toolbar');
                    if (scrollY > lastScrollY && scrollY > 100) {
                        toolbar.classList.add('hidden');
                    } else {
                        toolbar.classList.remove('hidden');
                    }
                    lastScrollY = scrollY;
                    ticking = false;
                });
                ticking = true;
            }
        });

        // View switching
        function switchView(view) {
            currentView = view;
            // Clear selection when switching views
            if (selectMode || selectedIds.size > 0) {
                selectMode = false;
                selectedIds.clear();
                updateBatchBar();
                document.getElementById('selectBtn').classList.remove('active');
                ['gridView', 'timelineView', 'tagsView'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.classList.remove('select-mode');
                    el.querySelectorAll('.photo-card.selected').forEach(c => c.classList.remove('selected'));
                    el.querySelectorAll('.select-check.checked').forEach(c => c.classList.remove('checked'));
                });
            }
            // Highlight active view in more menu
            document.querySelectorAll('.more-menu-item[data-view]').forEach(t => t.classList.toggle('active-view', t.dataset.view === view));
            render();
        }

        // 3-dot more menu
        document.getElementById('moreBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('moreMenu').classList.toggle('open');
        });
        document.addEventListener('click', () => document.getElementById('moreMenu').classList.remove('open'));
        document.querySelectorAll('.more-menu-item[data-view]').forEach(item => {
            item.addEventListener('click', () => {
                switchView(item.dataset.view);
                document.getElementById('moreMenu').classList.remove('open');
            });
        });
        document.getElementById('albumsMenuBtn').addEventListener('click', () => {
            document.getElementById('albumsPanel').classList.toggle('open');
            loadAlbums();
            document.getElementById('moreMenu').classList.remove('open');
        });
        document.getElementById('colorMenuBtn').addEventListener('click', () => {
            const bar = document.getElementById('colorBar');
            bar.style.display = bar.style.display === 'none' ? '' : 'none';
            document.getElementById('moreMenu').classList.remove('open');
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('focus', () => searchInput.classList.add('expanded'));
        searchInput.addEventListener('blur', () => { if (!searchInput.value) searchInput.classList.remove('expanded'); });
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery = e.target.value.trim();
                loadPhotos();
            }, 400);
        });

        // Favorites filter (button removed, available via collections)
        document.getElementById('favFilter')?.addEventListener('click', () => {
            favOnly = !favOnly;
            document.getElementById('favFilter')?.classList.toggle('active', favOnly);
            loadPhotos();
        });

        // Color filter toggle moved to 3-dot menu

        // Select mode
        document.getElementById('selectBtn').addEventListener('click', () => {
            if (selectMode) {
                clearSelection();
            } else {
                selectMode = true;
                document.getElementById('selectBtn').classList.add('active');
                ['gridView', 'timelineView', 'tagsView'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.add('select-mode');
                });
            }
        });

        function updateBatchBar() {
            document.getElementById('selectedCount').textContent = selectedIds.size;
            document.getElementById('batchBar').classList.toggle('visible', selectedIds.size > 0);
        }

        function clearSelection() {
            selectMode = false;
            selectedIds.clear();
            updateBatchBar();
            document.getElementById('selectBtn').classList.remove('active');
            ['gridView', 'timelineView', 'tagsView'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.classList.remove('select-mode');
                el.querySelectorAll('.photo-card.selected').forEach(c => c.classList.remove('selected'));
                el.querySelectorAll('.select-check.checked').forEach(c => c.classList.remove('checked'));
            });
        }
        document.getElementById('batchCancel').onclick = clearSelection;
        document.getElementById('batchFav').onclick = async () => {
            for (const id of selectedIds) await API.request('PATCH', `/gallery/photos/${id}`, { is_favorite: true });
            showToast(`${selectedIds.size} photos favorited ✓`);
            selectedIds.clear(); updateBatchBar(); loadPhotos();
        };
        document.getElementById('batchDel').onclick = async () => {
            if (!confirm(`Delete ${selectedIds.size} photos?`)) return;
            for (const id of selectedIds) await API.request('DELETE', `/gallery/photos/${id}`);
            showToast(`${selectedIds.size} photos deleted`);
            selectedIds.clear(); updateBatchBar(); loadPhotos();
        };

        // ─── Albums ───
        // Albums button moved to 3-dot menu
        async function loadAlbums() {
            const albums = await API.get('/gallery/albums');
            document.getElementById('albumsList').innerHTML = `
                <div class="album-card" style="background:var(--surface2)" onclick="clearAlbumFilter()"><div class="name"><i data-lucide="camera" style="width:14px;height:14px;vertical-align:-2px"></i> All Photos</div></div>
                ${albums.map(a => `<div class="album-card" data-album="${a.id}"><div class="name">${a.name}</div><div class="count">${a.photo_count} photos</div></div>`).join('')}
            `;
            document.querySelectorAll('.album-card[data-album]').forEach(card => {
                card.addEventListener('click', () => {
                    activeAlbum = parseInt(card.dataset.album);
                    document.getElementById('albumsPanel').classList.remove('open');
                    loadPhotos();
                });
            });
        }
        window.clearAlbumFilter = () => { activeAlbum = null; loadPhotos(); };

        document.getElementById('createAlbumBtn').onclick = () => {
            createModal({
                title: 'New Album',
                bodyHTML: `<div class="form-group"><label>Name</label><input class="form-input" name="name" placeholder="Album name" required></div>
                           <div class="form-group"><label>Description</label><textarea class="form-input" name="desc" rows="2" placeholder="Optional"></textarea></div>`,
                submitLabel: 'Create',
                async onSubmit(modal) {
                    const name = modal.querySelector('[name="name"]').value.trim();
                    if (!name) throw new Error('Name required');
                    await API.post('/gallery/albums', { name, description: modal.querySelector('[name="desc"]').value.trim() });
                    showToast('Album created ✓');
                    loadAlbums();
                }
            });
        };

        document.getElementById('batchAlbum').onclick = async () => {
            const albums = await API.get('/gallery/albums');
            if (!albums.length) { showToast('Create an album first', 'error'); return; }
            createModal({
                title: 'Add to Album',
                bodyHTML: `<div class="form-group"><label>Album</label><select class="form-input" name="album">
                    ${albums.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</select></div>`,
                submitLabel: 'Add',
                async onSubmit(modal) {
                    const albumId = modal.querySelector('[name="album"]').value;
                    for (const id of selectedIds) await API.request('PATCH', `/gallery/photos/${id}`, { album_id: parseInt(albumId) });
                    showToast(`${selectedIds.size} photos added to album ✓`);
                    selectedIds.clear(); updateBatchBar(); loadPhotos();
                }
            });
        };

        // ═══════════════════════════════════════════════════════
        // UPLOAD
        // ═══════════════════════════════════════════════════════
        document.getElementById('uploadBtn').onclick = () => document.getElementById('uploadOverlay').classList.add('active');
        document.getElementById('uploadOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('uploadOverlay')) {
                document.getElementById('uploadOverlay').classList.remove('active');
                document.getElementById('uploadProgress').innerHTML = '';
            }
        });

        const uploadZone = document.getElementById('uploadZone');
        uploadZone.onclick = (e) => {
            if (e.target === uploadZone || e.target.closest('.icon') || e.target.closest('h3') || e.target.closest('p')) {
                document.getElementById('fileInput').click();
            }
        };
        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault(); uploadZone.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });
        document.getElementById('fileInput').addEventListener('change', (e) => handleFiles(e.target.files));

        // Global drag-and-drop
        document.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                document.getElementById('uploadOverlay').classList.add('active');
            }
        });

        async function handleFiles(files) {
            if (!files.length) return;
            const prog = document.getElementById('uploadProgress');
            prog.innerHTML = '';

            for (const file of files) {
                // Create thumbnail preview
                const thumbURL = URL.createObjectURL(file);
                const item = document.createElement('div');
                item.className = 'upload-item';
                item.innerHTML = `
                    <img class="thumb" src="${thumbURL}" alt="">
                    <span class="name">${file.name}</span>
                    <div class="prog-bar"><div class="prog-fill" style="width:0%"></div></div>
                    <span class="status"><i data-lucide="camera" style="width:14px;height:14px"></i></span>
                    <div class="upload-stages"></div>
                `;
                prog.appendChild(item);
                lucide.createIcons({node: item});

                try {
                    item.querySelector('.status').innerHTML = '<i data-lucide="upload" style="width:14px;height:14px"></i>'; lucide.createIcons({node: item});
                    const fd = new FormData();
                    fd.append('photos', file);
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', '/api/gallery/upload');
                    xhr.withCredentials = true;
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) item.querySelector('.prog-fill').style.width = (e.loaded / e.total * 100) + '%';
                    };
                    await new Promise((resolve, reject) => {
                        xhr.onload = () => {
                            if (xhr.status === 200) {
                                item.querySelector('.status').innerHTML = '<i data-lucide="check-circle" style="width:14px;height:14px"></i>'; lucide.createIcons({node: item});
                                resolve();
                            } else reject(new Error('Upload failed'));
                        };
                        xhr.onerror = () => reject(new Error('Network error'));
                        xhr.send(fd);
                    });
                } catch (e) {
                    item.querySelector('.status').innerHTML = '<i data-lucide="x-circle" style="width:14px;height:14px"></i>'; lucide.createIcons({node: item});
                }
            }
            showToast(`${files.length} photo(s) uploaded ✓`);
            setTimeout(() => {
                document.getElementById('uploadOverlay').classList.remove('active');
                prog.innerHTML = '';
                loadPhotos();
            }, 1200);
        }

        // ═══════════════════════════════════════════════════════
        // INIT
        // ═══════════════════════════════════════════════════════
        // Show skeleton while loading
        document.getElementById('gridView').innerHTML = `<div class="grid-skeleton">${Array(8).fill('<div class="skel-item"></div>').join('')}</div>`;

        // Load everything in parallel
        await Promise.all([loadPhotos(), loadColors(), loadCollections()]);
        renderColorBar();
        renderCollections();
        // Mark default view in menu
        document.querySelectorAll('.more-menu-item[data-view]').forEach(t => t.classList.toggle('active-view', t.dataset.view === currentView));
    })();
