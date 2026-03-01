/* ═══════════════════════════════════════════════════════════
   Captures Map — Leaflet + OpenStreetMap + MarkerCluster
   ═══════════════════════════════════════════════════════════ */

const CapturesMap = {
    map: null,
    markers: null,
    initialized: false,
    currentCaptures: [],

    _isDark() {
        return document.documentElement.classList.contains('dark') ||
               document.body.classList.contains('dark') ||
               window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    },

    _tileUrl() {
        return this._isDark()
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    },

    _tileAttr() {
        return this._isDark()
            ? '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/">OSM</a>'
            : '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>';
    },

    tileLayer: null,

    init(container) {
        if (this.initialized) return;
        if (typeof L === 'undefined') return;
        this.initialized = true;

        this.map = L.map(container, { zoomControl: false }).setView([37.3688, -122.0363], 13);
        L.control.zoom({ position: 'topright' }).addTo(this.map);

        this.tileLayer = L.tileLayer(this._tileUrl(), {
            attribution: this._tileAttr(),
            maxZoom: 19
        }).addTo(this.map);

        // MarkerCluster
        if (L.markerClusterGroup) {
            this.markers = L.markerClusterGroup({
                maxClusterRadius: 50,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                iconCreateFunction: function(cluster) {
                    const count = cluster.getChildCount();
                    let size = 36, cls = 'small';
                    if (count >= 100) { size = 50; cls = 'large'; }
                    else if (count >= 10) { size = 44; cls = 'medium'; }
                    return L.divIcon({
                        html: '<div class="map-cluster map-cluster-' + cls + '">' + count + '</div>',
                        className: 'map-cluster-icon',
                        iconSize: [size, size]
                    });
                }
            });
        } else {
            this.markers = L.layerGroup();
        }
        this.map.addLayer(this.markers);

        // Controls container
        const ctrlDiv = L.DomUtil.create('div', 'map-controls-wrap');

        // Center on me
        const locBtn = L.control({ position: 'bottomleft' });
        locBtn.onAdd = () => {
            const div = L.DomUtil.create('div', 'map-ctrl-group');
            div.innerHTML =
                '<button class="map-ctrl-btn" title="Center on me">📍</button>' +
                '<button class="map-ctrl-btn" title="Fit all markers">🔄</button>';
            L.DomEvent.disableClickPropagation(div);

            div.querySelector('[title="Center on me"]').addEventListener('click', (e) => {
                e.preventDefault();
                navigator.geolocation?.getCurrentPosition(
                    (pos) => { this.map.setView([pos.coords.latitude, pos.coords.longitude], 14); },
                    () => { if (typeof showToast === 'function') showToast('Location access denied', 'error'); },
                    { timeout: 10000 }
                );
            });

            div.querySelector('[title="Fit all markers"]').addEventListener('click', (e) => {
                e.preventDefault();
                this._fitAll();
            });

            return div;
        };
        locBtn.addTo(this.map);

        // Watch for dark mode changes
        window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => this._updateTiles());
        const obs = new MutationObserver(() => this._updateTiles());
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    },

    _updateTiles() {
        if (!this.tileLayer) return;
        const newUrl = this._tileUrl();
        if (this.tileLayer._url !== newUrl) {
            this.tileLayer.setUrl(newUrl);
            this.tileLayer.options.attribution = this._tileAttr();
        }
    },

    _fitAll() {
        if (!this.markers || !this.map) return;
        const layers = this.markers.getLayers();
        if (!layers.length) return;
        const bounds = [];
        layers.forEach(l => bounds.push(l.getLatLng()));
        if (bounds.length) this.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
    },

    _buildPopup(cap) {
        const theme = CapturesFeed.getTheme(cap.id);
        let html = '<div class="map-popup">';

        // Thumbnail
        if (cap.type === 'photo' && (cap.image_thumb_path || cap.image_path)) {
            html += '<img class="map-popup-thumb" src="' + CapturesFeed._esc(cap.image_thumb_path || cap.image_path) + '" alt="">';
        }

        html += '<strong>' + CapturesFeed._esc(cap.title || 'Untitled') + '</strong>';

        if (cap.body) {
            const preview = (cap.body.length > 80) ? cap.body.substring(0, 80) + '…' : cap.body;
            html += '<p class="map-popup-body">' + CapturesFeed._esc(preview) + '</p>';
        }

        // Tags
        if (cap.tags && cap.tags.length) {
            html += '<div class="map-popup-tags">';
            cap.tags.forEach(tag => {
                const color = tag.color || '#635bff';
                html += '<span class="map-popup-tag" style="background:' + color + '">' + CapturesFeed._esc(tag.name) + '</span>';
            });
            html += '</div>';
        }

        html += '<div class="map-popup-footer">';
        html += '<span class="map-popup-time">' + CapturesFeed.relativeTime(cap.captured_at) + '</span>';
        html += '<a href="#" class="map-popup-view" data-id="' + cap.id + '">View →</a>';
        html += '</div></div>';
        return html;
    },

    render(captures) {
        const container = document.getElementById('capturesMapContainer');
        const msgEl = document.getElementById('capturesMapEmpty');
        if (!container) return;

        this.init(container);
        if (!this.map) return;

        this.currentCaptures = captures || [];
        this.markers.clearLayers();

        // Apply tag filters
        let filtered = this.currentCaptures;
        if (typeof CapturesTags !== 'undefined') {
            const f = CapturesTags.getFilters();
            if (f.tags && f.tags.length) {
                filtered = filtered.filter(c =>
                    c.tags && c.tags.some(t => f.tags.includes(t.name))
                );
            }
        }

        const withLocation = filtered.filter(c => c.latitude && c.longitude);

        if (!withLocation.length) {
            if (msgEl) msgEl.style.display = 'flex';
            return;
        }
        if (msgEl) msgEl.style.display = 'none';

        withLocation.forEach(cap => {
            const theme = CapturesFeed.getTheme(cap.id);
            const icon = L.divIcon({
                className: 'captures-map-marker',
                html: '<div class="map-dot" style="background:' + theme.border + '"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const marker = L.marker([cap.latitude, cap.longitude], { icon })
                .bindPopup(this._buildPopup(cap), {
                    maxWidth: 260,
                    minWidth: 180,
                    className: 'map-popup-container'
                });

            // Popup view link handler
            marker.on('popupopen', () => {
                const link = document.querySelector('.map-popup-view[data-id="' + cap.id + '"]');
                if (link) {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        CapturesPage.switchView('timeline');
                        setTimeout(() => {
                            const card = document.querySelector('.capture-card[data-id="' + cap.id + '"]');
                            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 200);
                    });
                }
            });

            this.markers.addLayer(marker);
        });

        this._fitAll();
    },

    addCapture(cap) {
        if (!cap.latitude || !cap.longitude || !this.initialized) return;
        this.currentCaptures.unshift(cap);
        // Re-render to include the new capture
        if (CapturesPage.currentView === 'map') {
            this.render(this.currentCaptures);
        }
    },

    onFilterChange() {
        if (CapturesPage.currentView === 'map') {
            this.render(this.currentCaptures.length ? this.currentCaptures : CapturesFeed.captures);
        }
    },

    invalidate() {
        if (this.map) {
            setTimeout(() => this.map.invalidateSize(), 100);
        }
    }
};
