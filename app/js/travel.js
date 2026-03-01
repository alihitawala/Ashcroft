/* ═══════════════════════════════════════════════════════════
   Travel Planner — World-Class UI
   Wanderlog + Google Travel + Apple Maps inspired
   ═══════════════════════════════════════════════════════════ */

const Travel = {
    trips: [],
    currentTrip: null,
    activeDay: 1,
    activeSection: 'itinerary',
    map: null,
    markers: [],
    markerMap: {},
    editingActivityId: null,

    DAY_COLORS: ['#635bff', '#3ecf8e', '#f5a623', '#f45b69', '#5b9cf6', '#a855f7', '#ec4899', '#14b8a6'],

    TRAVEL_FACTS: [
        "Japan has over 6,800 islands but most people live on just four of them.",
        "Iceland has no mosquitoes — one of the only countries in the world without them!",
        "France is the most visited country in the world with over 89 million tourists per year.",
        "The shortest commercial flight in the world is 1.5 minutes between two Scottish islands.",
        "Singapore's Changi Airport has a butterfly garden, rooftop pool, and free movie theater.",
        "You can walk from the African continent to Asia across the Sinai Peninsula.",
        "There are more ancient pyramids in Sudan than in Egypt.",
        "Monaco is smaller than Central Park in New York City.",
        "The Trans-Siberian Railway crosses 3,901 bridges across Russia.",
        "Bhutan measures success by Gross National Happiness instead of GDP.",
        "The Great Wall of China is not visible from space with the naked eye — that's a myth!",
        "Australia is wider than the moon (about 600 km wider).",
        "There's a village in Norway called Hell, and it freezes over every winter.",
        "The Amazon River has no bridges crossing it anywhere along its entire length.",
        "Venice is built on 118 small islands connected by over 400 bridges.",
    ],

    PACKING_CATEGORIES: {
        'Clothing': ['jacket', 'shirt', 'pants', 'shorts', 'underwear', 'socks', 'shoes', 'sandals', 'hat', 'scarf', 'gloves', 'dress', 'swimsuit', 'sweater', 'hoodie', 'coat', 'raincoat', 'clothing', 'wear', 'outfit', 'boot', 'sneaker', 'flip-flop', 'pajama', 'thermal', 'layer', 'belt', 'sunglasses', 'umbrella'],
        'Electronics': ['charger', 'adapter', 'phone', 'camera', 'laptop', 'tablet', 'headphone', 'earphone', 'power bank', 'cable', 'battery', 'electronic', 'plug', 'converter'],
        'Documents': ['passport', 'visa', 'ticket', 'insurance', 'id', 'document', 'itinerary', 'booking', 'confirmation', 'copy', 'license', 'card', 'certificate'],
        'Toiletries': ['toothbrush', 'toothpaste', 'shampoo', 'soap', 'deodorant', 'sunscreen', 'moisturizer', 'razor', 'medicine', 'medication', 'first aid', 'band-aid', 'sanitizer', 'tissue', 'towel', 'toiletri', 'lotion', 'lip balm', 'insect repellent', 'bug spray'],
        'Misc': []
    },

    categorizeItem(item) {
        const lower = item.toLowerCase();
        for (const [cat, keywords] of Object.entries(this.PACKING_CATEGORIES)) {
            if (cat === 'Misc') continue;
            if (keywords.some(k => lower.includes(k))) return cat;
        }
        return 'Misc';
    },

    getCheckedItems(tripId) {
        try { return JSON.parse(localStorage.getItem(`travel_packing_${tripId}`) || '{}'); } catch { return {}; }
    },

    saveCheckedItems(tripId, checked) {
        localStorage.setItem(`travel_packing_${tripId}`, JSON.stringify(checked));
    },

    formatDateRange(startDate, numDays) {
        if (!startDate) return '';
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + (numDays || 5) - 1);
        const opts = { month: 'short', day: 'numeric' };
        return `${start.toLocaleDateString('en-US', opts)} — ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`;
    },

    // ─── List View ───
    async showList() {
        this.currentTrip = null;
        try {
            this.trips = await API.get('/travel/trips');
        } catch (e) {
            this.trips = [];
        }
        this.renderList();
    },

    renderList() {
        const body = document.getElementById('travelBody');
        if (!this.trips.length) {
            body.innerHTML = `
                <div class="travel-empty">
                    <div class="travel-empty-icon">🌍</div>
                    <h3>No trips yet — where to next?</h3>
                    <p>Your next adventure is waiting. Tap the + button to start planning.</p>
                </div>`;
            return;
        }

        body.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <h2 style="font-size:20px;font-weight:700">Your Trips</h2>
                <span style="font-size:13px;color:var(--text-secondary)">${this.trips.length} trip${this.trips.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="trip-grid">
                ${this.trips.map(t => {
                    const heroStyle = t.hero_image ? `background-image:url('${esc(t.hero_image)}');background-size:cover;background-position:center;` : '';
                    const dateStr = t.start_date ? this.formatDateRange(t.start_date, t.num_days) : '';
                    return `
                    <div class="trip-card" onclick="Travel.loadTrip(${t.id})">
                        <div class="trip-card-hero" style="${heroStyle}">
                            <div class="trip-card-hero-overlay"></div>
                            <div class="trip-card-hero-text">
                                <h3>${esc(t.destination)}</h3>
                                ${t.country ? `<div class="trip-country">${esc(t.country)}</div>` : ''}
                            </div>
                        </div>
                        <div class="trip-card-body">
                            ${dateStr ? `<div class="trip-card-date">📅 ${dateStr}</div>` : ''}
                            <div class="trip-card-meta">
                                <span class="trip-status ${t.status}">${t.status}</span>
                                <span>${formatDate(t.created_at)}</span>
                            </div>
                            <div class="trip-card-actions">
                                ${t.status !== 'archived' ? `<button class="btn-icon-sm" onclick="event.stopPropagation();Travel.archiveTrip(${t.id})" title="Archive">📦</button>` : `<button class="btn-icon-sm" onclick="event.stopPropagation();Travel.unarchiveTrip(${t.id})" title="Unarchive">📤</button>`}
                                <button class="btn-icon-sm" onclick="event.stopPropagation();Travel.confirmDeleteTrip(${t.id},'${esc(t.destination)}')" title="Delete">🗑️</button>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    },

    async archiveTrip(id) {
        try {
            await API.put(`/travel/trips/${id}`, { status: 'archived' });
            showToast('Trip archived');
            this.showList();
        } catch (e) { showToast(e.message, 'error'); }
    },

    async unarchiveTrip(id) {
        try {
            await API.put(`/travel/trips/${id}`, { status: 'ready' });
            showToast('Trip restored');
            this.showList();
        } catch (e) { showToast(e.message, 'error'); }
    },

    confirmDeleteTrip(id, name) {
        createModal({
            title: '🗑️ Delete Trip',
            bodyHTML: `<p>Are you sure you want to delete <strong>${name}</strong>? This cannot be undone.</p>`,
            submitLabel: 'Delete',
            submitClass: 'btn-danger',
            async onSubmit() {
                await API.delete(`/travel/trips/${id}`);
                showToast('Trip deleted');
                Travel.showList();
            }
        });
    },

    // ─── Load Trip Detail ───
    async loadTrip(id) {
        const body = document.getElementById('travelBody');
        body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)"><div style="font-size:32px;margin-bottom:12px">✈️</div>Loading trip...</div>';
        try {
            this.currentTrip = await API.get(`/travel/trips/${id}`);
            this.activeDay = 1;
            this.activeSection = 'itinerary';
            this.editingActivityId = null;
            this.renderDetail();
        } catch (e) {
            showToast(e.message, 'error');
            this.showList();
        }
    },

    renderDetail() {
        const t = this.currentTrip;
        if (!t) return;

        const days = t.days || [];
        const hasDays = days.length > 0;
        const body = document.getElementById('travelBody');
        const dateStr = t.start_date ? this.formatDateRange(t.start_date, t.num_days) : '';
        const heroStyle = t.hero_image ? `background-image:url('${esc(t.hero_image)}');background-size:cover;background-position:center;` : '';
        const dayCount = t.num_days || days.length || 5;

        body.innerHTML = `
            <div class="trip-hero-banner ${!t.hero_image ? 'hero-fallback' : ''}" style="${heroStyle}">
                ${!t.hero_image ? `<div class="trip-hero-fallback-text">${esc(t.destination)}</div>` : ''}
                <div class="trip-hero-overlay"></div>
                <div class="trip-hero-top">
                    <button class="trip-detail-back" onclick="Travel.showList()">← Back</button>
                    <div class="trip-hero-actions">
                        ${hasDays ? `<button class="hero-action-btn" onclick="Travel.shareTrip(${t.id})" title="Share">🔗</button>` : ''}
                        <button class="hero-action-btn danger" onclick="Travel.confirmDeleteTrip(${t.id},'${esc(t.destination)}')" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="trip-hero-content">
                    <h1>${esc(t.destination)}</h1>
                    ${t.country ? `<div class="trip-country-label">${esc(t.country)}</div>` : ''}
                    <div class="trip-hero-badges">
                        ${dateStr ? `<span class="hero-badge">📅 ${dateStr}</span>` : ''}
                        <span class="hero-badge">📆 ${dayCount} days</span>
                        ${t.weather_summary ? `<span class="hero-badge">☀️ ${esc(t.weather_summary.split('.')[0])}</span>` : ''}
                    </div>
                    ${!hasDays ? `<button class="generate-hero-btn" onclick="Travel.generate(${t.id})">✨ Generate Itinerary</button>` : ''}
                </div>
            </div>
            ${hasDays ? this.renderSectionTabs() : ''}
            <div id="tripContent">
                ${hasDays ? this.renderActiveSection() : `
                    <div class="travel-empty">
                        <div class="travel-empty-icon">🗺️</div>
                        <h3>Ready to explore ${esc(t.destination)}</h3>
                        <p>Hit "Generate Itinerary" above to create your personalized travel plan with AI</p>
                    </div>`}
            </div>`;

        if (hasDays && this.activeSection === 'itinerary') {
            this.initSplitMap();
        }
        if (hasDays && this.activeSection === 'map') {
            this.initMap('travelMapFull');
        }
    },

    renderSectionTabs() {
        const t = this.currentTrip;
        const tabs = [
            { id: 'itinerary', label: '📋 Itinerary' },
            { id: 'map', label: '🗺️ Map' },
            { id: 'restaurants', label: '🍴 Eat' },
            { id: 'stays', label: '🏨 Stay' },
            { id: 'info', label: 'ℹ️ Info' },
            { id: 'packing', label: '🎒 Pack' },
        ];
        return `<div class="section-tabs">${tabs.map(tab =>
            `<button class="section-tab${this.activeSection === tab.id ? ' active' : ''}" onclick="Travel.switchSection('${tab.id}')">${tab.label}</button>`
        ).join('')}</div>`;
    },

    renderActiveSection() {
        switch (this.activeSection) {
            case 'itinerary': return this.renderItinerary();
            case 'packing': return this.renderPacking();
            case 'restaurants': return this.renderRestaurants();
            case 'stays': return this.renderStays();
            case 'info': return this.renderInfo();
            case 'map': return '<div id="travelMapFull" class="travel-map travel-map-standalone" style="height:500px"></div>';
            default: return '';
        }
    },

    switchSection(section) {
        this.activeSection = section;
        document.querySelectorAll('.section-tab').forEach(t => {
            t.className = 'section-tab' + (t.getAttribute('onclick')?.includes(`'${section}'`) ? ' active' : '');
        });

        const content = document.getElementById('tripContent');
        content.innerHTML = this.renderActiveSection();
        if (section === 'itinerary') this.initSplitMap();
        if (section === 'map') this.initMap('travelMapFull');
    },

    // ─── Itinerary with Timeline + Split Map ───
    renderItinerary() {
        const days = this.currentTrip.days || [];
        if (!days.length) return '';

        const today = new Date();
        const tripStart = this.currentTrip.start_date ? new Date(this.currentTrip.start_date) : null;

        const dayTabs = days.map(d => {
            let isToday = false;
            if (tripStart) {
                const dayDate = new Date(tripStart);
                dayDate.setDate(dayDate.getDate() + d.day_number - 1);
                isToday = dayDate.toDateString() === today.toDateString();
            }
            const shortTitle = (d.title || '').length > 18 ? (d.title || '').substring(0, 18) + '…' : (d.title || `Day ${d.day_number}`);
            return `<button class="day-tab${d.day_number === this.activeDay ? ' active' : ''}${isToday ? ' today' : ''}" onclick="Travel.switchDay(${d.day_number})">
                <span class="day-tab-num">Day ${d.day_number}</span>
                <span class="day-tab-title">${esc(shortTitle)}</span>
            </button>`;
        }).join('');

        const day = days.find(d => d.day_number === this.activeDay) || days[0];
        const activities = day.activities || [];
        const slots = ['morning', 'afternoon', 'evening'];
        const slotIcons = { morning: '🌅', afternoon: '🌞', evening: '🌙' };

        let itineraryHtml = `<div class="day-tabs-wrapper">
            <div class="day-tabs-fade-left"></div>
            <div class="day-tabs" id="dayTabsScroll">${dayTabs}</div>
            <div class="day-tabs-fade-right"></div>
        </div>`;
        if (day.summary) {
            itineraryHtml += `<div class="day-summary">${esc(day.summary)}</div>`;
        }

        itineraryHtml += '<div class="timeline-container"><div class="timeline-line"></div>';

        for (const slot of slots) {
            const slotActs = activities.filter(a => a.time_slot === slot);
            if (!slotActs.length) continue;
            itineraryHtml += `<div class="timeline-slot">
                <div class="timeline-dot ${slot}">${slotIcons[slot]}</div>
                <div class="time-slot-label">${slot}</div>
                ${slotActs.map((a, i) => this.renderActivityCard(a, i, slotActs.length)).join('')}
            </div>`;
        }
        itineraryHtml += '</div>';

        // Desktop: split view with map
        return `<div class="split-view">
            <div class="split-itinerary">${itineraryHtml}</div>
            <div class="split-map"><div id="travelMapSplit" class="travel-map"></div></div>
        </div>`;
    },

    renderActivityCard(a, index, totalInSlot) {
        const isEditing = this.editingActivityId === a.id;

        if (isEditing) {
            return `<div class="activity-card editing">
                <div class="activity-edit-form">
                    <input class="form-input" id="edit-title-${a.id}" value="${esc(a.title)}" placeholder="Title">
                    <textarea class="form-input" id="edit-desc-${a.id}" rows="2" placeholder="Description">${esc(a.description || '')}</textarea>
                    <div class="edit-row">
                        <input class="form-input" id="edit-duration-${a.id}" type="number" step="0.5" value="${a.duration_hours || ''}" placeholder="Hours">
                        <input class="form-input" id="edit-cost-${a.id}" type="number" step="1" value="${a.estimated_cost || ''}" placeholder="Cost">
                    </div>
                    <input class="form-input" id="edit-tips-${a.id}" value="${esc(a.tips || '')}" placeholder="Tips">
                    <div class="edit-actions">
                        <button class="btn btn-primary btn-sm" onclick="Travel.saveActivity(${a.id})">Save</button>
                        <button class="btn btn-secondary btn-sm" onclick="Travel.cancelEdit()">Cancel</button>
                        <button class="btn btn-danger btn-sm" onclick="Travel.deleteActivity(${a.id})" style="margin-left:auto">Delete</button>
                    </div>
                </div>
            </div>`;
        }

        const timeLabel = { morning: '🌅 Morning', afternoon: '🌞 Afternoon', evening: '🌙 Evening' }[a.time_slot] || '';

        return `<div class="activity-card" id="activity-${a.id}" onclick="Travel.toggleExpand(this, event)">
            ${a.image_url ? `<img class="activity-card-image" src="${esc(a.image_url)}" alt="${esc(a.title)}" loading="lazy" onerror="this.remove()">` : ''}
            <div class="activity-card-body">
                <div class="activity-card-top">
                    <h4>${esc(a.title)}</h4>
                    <div class="activity-reorder">
                        ${index > 0 ? `<button class="btn-icon-xs" onclick="event.stopPropagation();Travel.moveActivity(${a.id},-1)" title="Move up">▲</button>` : ''}
                        ${index < totalInSlot - 1 ? `<button class="btn-icon-xs" onclick="event.stopPropagation();Travel.moveActivity(${a.id},1)" title="Move down">▼</button>` : ''}
                    </div>
                </div>
                <div class="activity-badges">
                    <span class="activity-badge time-badge">${timeLabel}</span>
                    ${a.duration_hours ? `<span class="activity-badge">⏱ ${a.duration_hours}h</span>` : ''}
                    ${a.estimated_cost && parseFloat(a.estimated_cost) > 0 ? `<span class="activity-badge cost-badge">💰 ${a.currency || '$'}${Number(a.estimated_cost).toFixed(0)}</span>` : ''}
                    ${a.category ? `<span class="activity-badge category-badge">${esc(a.category)}</span>` : ''}
                </div>
                ${a.description ? `<div class="activity-desc">${esc(a.description)}</div>` : ''}
                <div class="activity-footer">
                    ${a.latitude && a.longitude ? `<button class="activity-map-btn" onclick="event.stopPropagation();Travel.focusPin(${a.id})">📍 Show on map</button>` : '<span></span>'}
                    <button class="activity-map-btn" onclick="event.stopPropagation();Travel.startEdit(${a.id})">✏️ Edit</button>
                </div>
            </div>
            <div class="activity-expand">
                ${a.address ? `<div class="activity-expand-row"><span class="expand-icon">📍</span> ${esc(a.address)}</div>` : ''}
                ${a.duration_hours ? `<div class="activity-expand-row"><span class="expand-icon">⏱</span> ${a.duration_hours} hours</div>` : ''}
                ${a.estimated_cost && parseFloat(a.estimated_cost) > 0 ? `<div class="activity-expand-row"><span class="expand-icon">💰</span> ${a.currency || '$'}${Number(a.estimated_cost).toFixed(0)}</div>` : ''}
                ${a.tips ? `<div class="activity-tips">💡 ${esc(a.tips)}</div>` : ''}
                ${a.booking_url ? `<div class="activity-expand-row"><span class="expand-icon">🔗</span> <a href="${esc(a.booking_url)}" target="_blank">Book now →</a></div>` : ''}
            </div>
        </div>`;
    },

    toggleExpand(el, event) {
        if (event.target.closest('.activity-map-btn') || event.target.closest('.btn-icon-xs')) return;
        el.classList.toggle('expanded');
    },

    focusPin(activityId) {
        const marker = this.markerMap[activityId];
        if (!marker || !this.map) return;
        const ll = marker.getLatLng();
        this.map.setView(ll, 14, { animate: true });
        marker.openPopup();
        // Pulse effect
        const el = marker.getElement?.();
        if (el) {
            const pin = el.querySelector('.day-pin');
            if (pin) { pin.classList.add('pulse'); setTimeout(() => pin.classList.remove('pulse'), 600); }
        }
    },

    startEdit(activityId) {
        this.editingActivityId = activityId;
        const content = document.getElementById('tripContent');
        content.innerHTML = this.renderActiveSection();
        if (this.activeSection === 'itinerary') this.initSplitMap();
    },

    cancelEdit() {
        this.editingActivityId = null;
        const content = document.getElementById('tripContent');
        content.innerHTML = this.renderActiveSection();
        if (this.activeSection === 'itinerary') this.initSplitMap();
    },

    async saveActivity(activityId) {
        const t = this.currentTrip;
        const data = {
            title: document.getElementById(`edit-title-${activityId}`).value.trim(),
            description: document.getElementById(`edit-desc-${activityId}`).value.trim(),
            duration_hours: parseFloat(document.getElementById(`edit-duration-${activityId}`).value) || null,
            estimated_cost: parseFloat(document.getElementById(`edit-cost-${activityId}`).value) || null,
            tips: document.getElementById(`edit-tips-${activityId}`).value.trim() || null,
        };
        if (!data.title) { showToast('Title is required', 'error'); return; }
        try {
            await API.patch(`/travel/trips/${t.id}/activities/${activityId}`, data);
            this.editingActivityId = null;
            await this.loadTrip(t.id);
            showToast('Activity updated ✓');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async deleteActivity(activityId) {
        if (!confirm('Delete this activity?')) return;
        const t = this.currentTrip;
        try {
            await API.delete(`/travel/trips/${t.id}/activities/${activityId}`);
            this.editingActivityId = null;
            await this.loadTrip(t.id);
            showToast('Activity deleted');
        } catch (e) { showToast(e.message, 'error'); }
    },

    async moveActivity(activityId, direction) {
        const t = this.currentTrip;
        const day = t.days.find(d => d.day_number === this.activeDay);
        if (!day) return;
        const acts = day.activities;
        const idx = acts.findIndex(a => a.id === activityId);
        if (idx < 0) return;
        const swapIdx = idx + direction;
        if (swapIdx < 0 || swapIdx >= acts.length) return;

        try {
            const a1 = acts[idx], a2 = acts[swapIdx];
            await Promise.all([
                API.patch(`/travel/trips/${t.id}/activities/${a1.id}`, { sort_order: a2.sort_order }),
                API.patch(`/travel/trips/${t.id}/activities/${a2.id}`, { sort_order: a1.sort_order }),
            ]);
            await this.loadTrip(t.id);
        } catch (e) { showToast(e.message, 'error'); }
    },

    switchDay(num) {
        this.activeDay = num;
        this.editingActivityId = null;
        const content = document.getElementById('tripContent');
        if (content) {
            content.innerHTML = this.renderActiveSection();
            if (this.activeSection === 'itinerary') this.initSplitMap();
        }
    },

    // ─── Map ───
    initSplitMap() {
        setTimeout(() => this.initMap('travelMapSplit'), 100);
    },

    initMap(containerId) {
        setTimeout(() => {
            const el = document.getElementById(containerId);
            if (!el || el.offsetHeight === 0) {
                // Retry if container not visible yet
                setTimeout(() => this.initMap(containerId), 300);
                return;
            }

            if (this.map) { this.map.remove(); this.map = null; }
            this.markerMap = {};

            this.map = L.map(el, { zoomControl: true }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap © CARTO',
                maxZoom: 19
            }).addTo(this.map);

            const bounds = [];
            const days = this.currentTrip.days || [];

            // Draw route lines per day
            days.forEach((day, di) => {
                const color = this.DAY_COLORS[di % this.DAY_COLORS.length];
                const dayCoords = [];
                (day.activities || []).forEach(a => {
                    if (!a.latitude || !a.longitude) return;
                    dayCoords.push([a.latitude, a.longitude]);

                    const icon = L.divIcon({
                        className: 'day-number-marker',
                        html: `<div class="day-pin" style="background:${color}" title="Day ${day.day_number}: ${esc(a.title)}">${day.day_number}</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    });

                    const marker = L.marker([a.latitude, a.longitude], { icon }).addTo(this.map);
                    marker.bindPopup(`<strong>Day ${day.day_number}: ${esc(a.title)}</strong><br><small>${esc(a.location_name || '')}</small>`);
                    // Click pin to scroll to activity
                    marker.on('click', () => {
                        const card = document.getElementById(`activity-${a.id}`);
                        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                    this.markerMap[a.id] = marker;
                    bounds.push([a.latitude, a.longitude]);
                });

                // Route line per day
                if (dayCoords.length > 1) {
                    L.polyline(dayCoords, { color, weight: 3, opacity: 0.5, dashArray: '8,6' }).addTo(this.map);
                }
            });

            // Restaurant markers
            (this.currentTrip.restaurants || []).forEach(r => {
                if (!r.latitude || !r.longitude) return;
                const icon = L.divIcon({
                    className: 'restaurant-marker-icon',
                    html: '<div class="restaurant-pin">🍴</div>',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
                L.marker([r.latitude, r.longitude], { icon }).addTo(this.map)
                    .bindPopup(`<strong>🍴 ${esc(r.name)}</strong><br><small>${esc(r.cuisine || '')}</small>`);
                bounds.push([r.latitude, r.longitude]);
            });

            // Stay markers
            (this.currentTrip.stays || []).forEach(s => {
                if (!s.latitude || !s.longitude) return;
                const icon = L.divIcon({
                    className: 'hotel-marker-icon',
                    html: '<div class="hotel-pin">🏨</div>',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
                L.marker([s.latitude, s.longitude], { icon }).addTo(this.map)
                    .bindPopup(`<strong>🏨 ${esc(s.name)}</strong><br><small>${esc(s.tier || '')} · ${s.currency || '$'}${Number(s.price_per_night).toFixed(0)}/night</small>`);
                bounds.push([s.latitude, s.longitude]);
            });

            if (bounds.length) {
                this.map.fitBounds(bounds, { padding: [40, 40] });
            }
            // Force map to recalculate size
            setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 200);
        }, 150);
    },

    // ─── Restaurants ───
    renderRestaurants() {
        const rests = this.currentTrip.restaurants || [];
        if (!rests.length) return '<div class="travel-empty"><div class="travel-empty-icon">🍴</div><h3>No restaurants yet</h3><p>Generate an itinerary to discover local dining spots</p></div>';

        return `<div class="restaurant-grid">${rests.map(r => {
            const cuisineIcon = { 'Seafood': '🦐', 'Italian': '🍝', 'Japanese': '🍣', 'Mexican': '🌮', 'Chinese': '🥡', 'Indian': '🍛', 'Thai': '🍜', 'French': '🥐', 'American': '🍔', 'Fine Dining': '🥂' }[r.cuisine] || '🍽️';
            return `
            <div class="restaurant-card">
                <div class="restaurant-card-header">
                    <h4>${esc(r.name)}</h4>
                    <span class="restaurant-price">${esc(r.price_range || '$$')}</span>
                </div>
                <span class="cuisine-tag">${cuisineIcon} ${esc(r.cuisine || 'Local')}</span>
                ${r.reservation_needed ? '<span class="reservation-badge">📞 Reservation</span>' : ''}
                ${r.description ? `<div class="rest-desc">${esc(r.description)}</div>` : ''}
                ${r.must_try_dishes ? `<div class="must-try">🍽️ Must try: ${esc(r.must_try_dishes)}</div>` : ''}
                ${r.address ? `<div class="rest-meta" style="margin-top:8px">📍 ${esc(r.address)}</div>` : ''}
            </div>`;
        }).join('')}</div>`;
    },

    // ─── Stays ───
    renderStays() {
        const stays = this.currentTrip.stays || [];
        if (!stays.length) return '<div class="travel-empty"><div class="travel-empty-icon">🏨</div><h3>No stays yet</h3><p>Generate an itinerary to find accommodation options</p></div>';

        const tierOrder = ['budget', 'mid', 'luxury'];
        const sorted = [...stays].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
        const tierIcons = { budget: '🏕️', mid: '🏨', luxury: '✨' };
        const tierLabels = { budget: 'Budget', mid: 'Mid-Range', luxury: 'Luxury' };

        return `<div class="stays-grid">${sorted.map(s => `
            <div class="stay-card tier-${s.tier}">
                <span class="stay-tier ${s.tier}">${tierIcons[s.tier] || ''} ${tierLabels[s.tier] || s.tier}</span>
                <h4>${esc(s.name)}</h4>
                <div class="stay-price">${s.currency || '$'}${Number(s.price_per_night).toFixed(0)} <small>/night</small></div>
                ${s.notes ? `<div class="stay-notes">${esc(s.notes)}</div>` : ''}
                ${s.address ? `<div class="rest-meta" style="margin-top:8px">📍 ${esc(s.address)}</div>` : ''}
                ${s.url ? `<a href="${esc(s.url)}" target="_blank" style="font-size:13px;margin-top:10px;display:inline-flex;align-items:center;gap:4px;color:var(--accent)">Book now →</a>` : ''}
            </div>
        `).join('')}</div>`;
    },

    // ─── Info ───
    renderInfo() {
        const t = this.currentTrip;
        let cards = '';

        // Flights
        if (t.flights_info || t.source_city) {
            const fi = t.flights_info ? (typeof t.flights_info === 'string' ? JSON.parse(t.flights_info) : t.flights_info) : null;
            cards += `<div class="info-section">
                <h3>✈️ Flights</h3>
                ${t.source_city ? `<div class="flight-route">
                    <div class="flight-city">${esc(t.source_city)}<small>From</small></div>
                    <div class="flight-arrow">✈️ →</div>
                    <div class="flight-city">${esc(t.destination)}<small>To</small></div>
                </div>` : ''}
                ${fi ? `<p>${esc(typeof fi === 'string' ? fi : JSON.stringify(fi))}</p>` : '<p style="color:var(--text-secondary)">No flight info available</p>'}
            </div>`;
        }

        // Budget
        if (t.budget_estimate) {
            const b = typeof t.budget_estimate === 'string' ? JSON.parse(t.budget_estimate) : t.budget_estimate;
            const breakdown = b.breakdown || '';
            const items = breakdown.split(';').map(s => s.trim()).filter(Boolean);
            const colors = ['var(--green)', 'var(--blue)', 'var(--amber)'];
            const maxVal = Math.max(b.budget_per_day_usd || 0, b.mid_per_day_usd || 0, b.luxury_per_day_usd || 0) || 1;

            cards += `<div class="info-section">
                <h3>💰 Daily Budget</h3>
                <div class="budget-tier-cards">
                    <div class="budget-tier-card budget-tier-budget">
                        <div class="budget-tier-label">Budget</div>
                        <div class="budget-tier-amount">$${b.budget_per_day_usd || '?'}</div>
                        <div class="budget-tier-sub">per day</div>
                    </div>
                    <div class="budget-tier-card budget-tier-mid">
                        <div class="budget-tier-label">Mid-Range</div>
                        <div class="budget-tier-amount">$${b.mid_per_day_usd || '?'}</div>
                        <div class="budget-tier-sub">per day</div>
                    </div>
                    <div class="budget-tier-card budget-tier-luxury">
                        <div class="budget-tier-label">Luxury</div>
                        <div class="budget-tier-amount">$${b.luxury_per_day_usd || '?'}</div>
                        <div class="budget-tier-sub">per day</div>
                    </div>
                </div>
                ${breakdown ? `<div class="budget-breakdown">
                    <h3>Breakdown</h3>
                    <div style="font-size:13px;color:var(--text-secondary);line-height:1.8">${esc(breakdown)}</div>
                </div>` : ''}
            </div>`;
        }

        // Weather
        if (t.weather_summary) {
            cards += `<div class="info-section"><h3>☀️ Weather</h3><p>${esc(t.weather_summary)}</p></div>`;
        }

        // Transport
        if (t.transport_notes) {
            cards += `<div class="info-section"><h3>🚇 Getting Around</h3><p>${esc(t.transport_notes)}</p></div>`;
        }

        // Visa
        if (t.visa_info) {
            cards += `<div class="info-section"><h3>📋 Visa Information</h3><p>${esc(t.visa_info)}</p></div>`;
        }

        if (!cards) return '<div class="travel-empty"><div class="travel-empty-icon">ℹ️</div><h3>No info available</h3><p>Generate an itinerary to get practical travel info</p></div>';
        return `<div class="info-grid">${cards}</div>`;
    },

    // ─── Packing List ───
    renderPacking() {
        const t = this.currentTrip;
        let list = t.packing_list;
        if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
        if (!Array.isArray(list) || !list.length) {
            return '<div class="travel-empty"><div class="travel-empty-icon">🎒</div><h3>No packing list</h3><p>Generate an itinerary to get a personalized packing list</p></div>';
        }

        const checked = this.getCheckedItems(t.id);
        const grouped = {};
        for (const item of list) {
            const cat = this.categorizeItem(item);
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        }

        const catIcons = { Clothing: '👕', Electronics: '🔌', Documents: '📄', Toiletries: '🧴', Misc: '📦' };
        const catOrder = ['Documents', 'Clothing', 'Electronics', 'Toiletries', 'Misc'];
        const totalChecked = Object.values(checked).filter(Boolean).length;
        const pct = (totalChecked / list.length * 100).toFixed(0);

        let html = `<div class="packing-progress">
            <div class="packing-progress-text"><span><strong>${totalChecked}</strong> of <strong>${list.length}</strong> packed</span><span>${pct}%</span></div>
            <div class="packing-progress-bar"><div class="packing-progress-fill" style="width:${pct}%"></div></div>
        </div>`;

        for (const cat of catOrder) {
            const items = grouped[cat];
            if (!items || !items.length) continue;
            const catChecked = items.filter(i => checked[i]).length;
            html += `<div class="packing-category">
                <div class="packing-category-header">
                    <span>${catIcons[cat] || '📦'} ${cat}</span>
                    <span class="packing-cat-count">${catChecked}/${items.length}</span>
                </div>
                ${items.map(item => `
                    <label class="packing-item${checked[item] ? ' checked' : ''}">
                        <input type="checkbox" ${checked[item] ? 'checked' : ''} onchange="Travel.togglePackingItem(${t.id},'${esc(item).replace(/'/g, "\\'")}',this.checked)">
                        <span class="packing-item-text">${esc(item)}</span>
                    </label>
                `).join('')}
            </div>`;
        }
        return html;
    },

    togglePackingItem(tripId, item, isChecked) {
        const checked = this.getCheckedItems(tripId);
        checked[item] = isChecked;
        this.saveCheckedItems(tripId, checked);
        const content = document.getElementById('tripContent');
        if (content) content.innerHTML = this.renderPacking();
    },

    // ─── Share ───
    async shareTrip(tripId) {
        try {
            const res = await API.post(`/travel/trips/${tripId}/share`);
            await navigator.clipboard.writeText(res.url);
            showToast('Link copied! 🔗');
        } catch (e) {
            showToast(e.message || 'Failed to share', 'error');
        }
    },

    // ─── Generate with Animated Steps ───
    async generate(tripId) {
        const dest = this.currentTrip?.destination || 'your destination';
        const facts = this.TRAVEL_FACTS;
        const randomFact = facts[Math.floor(Math.random() * facts.length)];

        const steps = [
            { icon: '✈️', text: `Researching ${dest}...` },
            { icon: '🏛️', text: 'Finding top attractions...' },
            { icon: '🍜', text: 'Discovering local restaurants...' },
            { icon: '🏨', text: 'Selecting best hotels...' },
            { icon: '📸', text: 'Gathering photos...' },
            { icon: '✅', text: 'Your trip is ready!' },
        ];

        const overlay = document.createElement('div');
        overlay.className = 'generating-overlay';
        overlay.innerHTML = `<div class="generating-card">
            <span class="gen-icon">✈️</span>
            <h3>Planning your trip to ${esc(dest)}</h3>
            <div class="gen-subtitle">This usually takes about 30 seconds</div>
            <div class="gen-steps">
                ${steps.map((s, i) => `<div class="gen-step" id="genStep${i}"><span class="step-icon">${s.icon}</span> ${s.text}<span class="step-check">✓</span></div>`).join('')}
            </div>
            <div class="gen-fact"><div class="fact-label">✨ Did you know?</div>${randomFact}</div>
            <div class="gen-progress"><div class="gen-progress-bar"></div></div>
        </div>`;
        document.body.appendChild(overlay);

        // Animate steps
        let stepIndex = 0;
        const stepInterval = setInterval(() => {
            if (stepIndex >= steps.length - 1) { clearInterval(stepInterval); return; }
            const prev = document.getElementById(`genStep${stepIndex}`);
            if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
            stepIndex++;
            const curr = document.getElementById(`genStep${stepIndex}`);
            if (curr) curr.classList.add('active');
        }, 4000);

        // Activate first step
        const first = document.getElementById('genStep0');
        if (first) first.classList.add('active');

        // Rotate facts
        let factIdx = 0;
        const factInterval = setInterval(() => {
            factIdx = (factIdx + 1) % facts.length;
            const factEl = overlay.querySelector('.gen-fact');
            if (factEl) {
                factEl.style.opacity = '0';
                setTimeout(() => {
                    factEl.innerHTML = `<div class="fact-label">✨ Did you know?</div>${facts[factIdx]}`;
                    factEl.style.opacity = '1';
                }, 300);
            }
        }, 6000);

        try {
            this.currentTrip = await API.post(`/travel/trips/${tripId}/generate`);
            clearInterval(stepInterval);
            clearInterval(factInterval);

            // Mark all done
            for (let i = 0; i < steps.length; i++) {
                const el = document.getElementById(`genStep${i}`);
                if (el) { el.classList.remove('active'); el.classList.add('done'); }
            }

            setTimeout(() => {
                overlay.remove();
                this.activeDay = 1;
                this.activeSection = 'itinerary';
                this.renderDetail();
                showToast('Itinerary generated! ✈️');
            }, 800);
        } catch (e) {
            clearInterval(stepInterval);
            clearInterval(factInterval);
            overlay.remove();
            showToast(e.message || 'Generation failed', 'error');
        }
    },

    // ─── Create Trip ───
    _selectedCountry: null,
    _selectedSourceCity: null,

    openCreateModal() {
        this._selectedCountry = null;
        this._selectedSourceCity = null;
        createModal({
            title: '✈️ Plan a Trip',
            bodyHTML: `
                <div class="form-group" style="position:relative">
                    <label>Where to?</label>
                    <input class="form-input" name="destination" id="tripDestInput" placeholder="Start typing a city..." autocomplete="off" required>
                    <div id="tripDestDropdown" class="autocomplete-dropdown" style="display:none"></div>
                </div>
                <div class="form-group" style="position:relative">
                    <label>Flying from</label>
                    <input class="form-input" name="source_city" id="tripSourceInput" placeholder="Your departure city (optional)" autocomplete="off">
                    <div id="tripSourceDropdown" class="autocomplete-dropdown" style="display:none"></div>
                </div>
                <div class="form-group">
                    <label>Start Date</label>
                    <input class="form-input" name="start_date" type="date">
                </div>
                <div class="form-group">
                    <label>Number of Days</label>
                    <input class="form-input" name="num_days" type="number" min="1" max="14" value="5">
                </div>
            `,
            submitLabel: 'Create Trip',
            async onSubmit(modal) {
                const destination = modal.querySelector('[name="destination"]').value.trim();
                if (!destination) throw new Error('Please pick a destination');
                const source_city = modal.querySelector('[name="source_city"]').value.trim() || null;
                const start_date = modal.querySelector('[name="start_date"]').value || null;
                const num_days = parseInt(modal.querySelector('[name="num_days"]').value) || 5;
                const trip = await API.post('/travel/trips', {
                    destination,
                    country: Travel._selectedCountry || null,
                    source_city,
                    start_date,
                    num_days
                });
                showToast('Trip created ✓');
                Travel.loadTrip(trip.id);
            }
        });

        setTimeout(() => {
            this._initAutocomplete('tripDestInput', 'tripDestDropdown', (place, country) => {
                Travel._selectedCountry = country;
            });
            this._initAutocomplete('tripSourceInput', 'tripSourceDropdown', () => {});
        }, 50);
    },

    _initAutocomplete(inputId, dropdownId, onSelect) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;

        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            const q = input.value.trim();
            if (q.length < 2) { dropdown.style.display = 'none'; return; }
            timer = setTimeout(() => this._fetchSuggestions(q, input, dropdown, onSelect), 300);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${dropdownId}`)) {
                dropdown.style.display = 'none';
            }
        });
    },

    async _fetchSuggestions(query, input, dropdown, onSelect) {
        try {
            const results = await API.get(`/travel/geocode?q=${encodeURIComponent(query)}`);
            if (!results.length) { dropdown.style.display = 'none'; return; }

            dropdown.innerHTML = results.map(r => {
                const label = r.place + (r.country ? ', ' + r.country : '');
                return `<div class="autocomplete-item" data-place="${esc(r.place)}" data-country="${esc(r.country || '')}">📍 ${esc(label)}</div>`;
            }).join('');

            dropdown.style.display = 'block';
            dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    input.value = item.dataset.place;
                    onSelect(item.dataset.place, item.dataset.country);
                    dropdown.style.display = 'none';
                });
            });
        } catch (e) {
            dropdown.style.display = 'none';
        }
    },

    // ─── Delete Trip ───
    async deleteTrip(id) {
        try {
            await API.delete(`/travel/trips/${id}`);
            showToast('Trip deleted');
            this.showList();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }
};

// ─── Escape HTML ───
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ─── Boot ───
(async function () {
    const params = new URLSearchParams(window.location.search);
    if (params.get('token')) return;

    try { await requireAuth(); } catch (e) { return; }

    const shell = renderAppShell('Travel', 'travel');
    document.getElementById('appLayout').innerHTML =
        shell.sidebar +
        shell.bottomNav +
        '<div class="main-content">' +
            shell.topbar +
            '<div class="main-body" id="travelBody"></div>' +
        '</div>' +
        '<button class="travel-fab" onclick="Travel.openCreateModal()" title="Plan a Trip">+</button>';

    initAppShell('travel');
    Travel.showList();
})();
