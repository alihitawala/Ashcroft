/* ═══════════════════════════════════════════════════════════
   Travel Planner — Main Controller
   ═══════════════════════════════════════════════════════════ */

const Travel = {
    trips: [],
    currentTrip: null,
    activeDay: 1,
    activeSection: 'itinerary',
    map: null,
    markers: [],

    DAY_COLORS: ['#635bff', '#3ecf8e', '#f5a623', '#f45b69', '#5b9cf6'],

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
                    <div class="travel-empty-icon">✈️</div>
                    <h3>No trips yet</h3>
                    <p>Plan your next adventure — tap the + button to start</p>
                </div>`;
            return;
        }

        body.innerHTML = `
            <div class="travel-subtitle">${this.trips.length} trip${this.trips.length !== 1 ? 's' : ''}</div>
            <div class="trip-grid">
                ${this.trips.map(t => `
                    <div class="trip-card" onclick="Travel.loadTrip(${t.id})">
                        <div class="trip-card-hero">
                            <div class="trip-card-hero-text">
                                <h3>${esc(t.destination)}</h3>
                                ${t.country ? `<div class="trip-country">${esc(t.country)}</div>` : ''}
                            </div>
                        </div>
                        <div class="trip-card-body">
                            <div class="trip-card-meta">
                                <span class="trip-status ${t.status}">${t.status}</span>
                                <span>${formatDate(t.created_at)}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    },

    // ─── Load Trip Detail ───
    async loadTrip(id) {
        const body = document.getElementById('travelBody');
        body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Loading trip...</div>';
        try {
            this.currentTrip = await API.get(`/travel/trips/${id}`);
            this.activeDay = 1;
            this.activeSection = 'itinerary';
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

        body.innerHTML = `
            <button class="trip-detail-back" onclick="Travel.showList()">← All Trips</button>
            <div class="trip-detail-header">
                <h1>${esc(t.destination)}</h1>
                ${t.country ? `<div class="trip-country-label">${esc(t.country)}</div>` : ''}
            </div>
            <div class="trip-detail-actions">
                ${!hasDays ? `<button class="btn btn-primary" onclick="Travel.generate(${t.id})">✨ Generate Itinerary</button>` : ''}
                ${hasDays ? `<button class="btn btn-secondary" onclick="Travel.generate(${t.id})">🔄 Regenerate</button>` : ''}
                <button class="btn btn-danger" onclick="Travel.deleteTrip(${t.id})">Delete</button>
            </div>
            ${hasDays ? this.renderSectionTabs() : ''}
            <div id="tripContent">
                ${hasDays ? this.renderItinerary() : '<div class="travel-empty"><div class="travel-empty-icon">🗺️</div><h3>Ready to plan</h3><p>Hit "Generate Itinerary" to create a 5-day plan with AI</p></div>'}
            </div>`;

        if (hasDays && this.activeSection === 'map') {
            this.initMap();
        }
    },

    renderSectionTabs() {
        const tabs = [
            { id: 'itinerary', label: '📋 Itinerary' },
            { id: 'map', label: '🗺️ Map' },
            { id: 'restaurants', label: '🍴 Restaurants' },
            { id: 'stays', label: '🏨 Stays' },
            { id: 'info', label: 'ℹ️ Info' },
        ];
        return `<div class="section-tabs">${tabs.map(tab =>
            `<button class="section-tab${this.activeSection === tab.id ? ' active' : ''}" onclick="Travel.switchSection('${tab.id}')">${tab.label}</button>`
        ).join('')}</div>`;
    },

    switchSection(section) {
        this.activeSection = section;
        const tabs = document.querySelectorAll('.section-tab');
        tabs.forEach(t => t.classList.toggle('active', t.textContent.toLowerCase().includes(section) || t.onclick.toString().includes(`'${section}'`)));
        // Re-query active state
        document.querySelectorAll('.section-tab').forEach(t => {
            t.className = 'section-tab' + (t.getAttribute('onclick')?.includes(`'${section}'`) ? ' active' : '');
        });

        const content = document.getElementById('tripContent');
        switch (section) {
            case 'itinerary': content.innerHTML = this.renderItinerary(); break;
            case 'map': content.innerHTML = '<div id="travelMap" class="travel-map"></div>'; this.initMap(); break;
            case 'restaurants': content.innerHTML = this.renderRestaurants(); break;
            case 'stays': content.innerHTML = this.renderStays(); break;
            case 'info': content.innerHTML = this.renderInfo(); break;
        }
    },

    renderItinerary() {
        const days = this.currentTrip.days || [];
        if (!days.length) return '';

        const dayTabs = days.map(d =>
            `<button class="day-tab${d.day_number === this.activeDay ? ' active' : ''}" onclick="Travel.switchDay(${d.day_number})">${d.title || 'Day ' + d.day_number}</button>`
        ).join('');

        const day = days.find(d => d.day_number === this.activeDay) || days[0];
        const activities = day.activities || [];
        const slots = ['morning', 'afternoon', 'evening'];
        const slotIcons = { morning: '🌅', afternoon: '☀️', evening: '🌙' };

        let html = `<div class="day-tabs">${dayTabs}</div>`;
        if (day.summary) {
            html += `<div class="day-summary">${esc(day.summary)}</div>`;
        }

        for (const slot of slots) {
            const slotActs = activities.filter(a => a.time_slot === slot);
            if (!slotActs.length) continue;
            html += `<div class="time-slot-group">
                <div class="time-slot-label">${slotIcons[slot]} ${slot}</div>
                ${slotActs.map(a => this.renderActivityCard(a)).join('')}
            </div>`;
        }
        return html;
    },

    renderActivityCard(a) {
        return `<div class="activity-card">
            <h4>${esc(a.title)}</h4>
            ${a.description ? `<div class="activity-desc">${esc(a.description)}</div>` : ''}
            <div class="activity-meta">
                ${a.location_name ? `<span>📍 ${esc(a.location_name)}</span>` : ''}
                ${a.duration_hours ? `<span>⏱ ${a.duration_hours}h</span>` : ''}
                ${a.estimated_cost ? `<span>💰 ${a.currency || '$'}${Number(a.estimated_cost).toFixed(0)}</span>` : ''}
                ${a.category ? `<span>🏷️ ${esc(a.category)}</span>` : ''}
            </div>
            ${a.tips ? `<div class="activity-tips">💡 ${esc(a.tips)}</div>` : ''}
        </div>`;
    },

    switchDay(num) {
        this.activeDay = num;
        const content = document.getElementById('tripContent');
        if (content) content.innerHTML = this.renderItinerary();
    },

    renderRestaurants() {
        const rests = this.currentTrip.restaurants || [];
        if (!rests.length) return '<div class="travel-empty"><p>No restaurants found</p></div>';
        return `<div class="restaurant-grid">${rests.map(r => `
            <div class="restaurant-card">
                <h4>${esc(r.name)}</h4>
                <span class="cuisine-tag">${esc(r.cuisine || 'Local')} · ${esc(r.price_range || '$$')}</span>
                ${r.description ? `<div class="rest-desc">${esc(r.description)}</div>` : ''}
                ${r.must_try_dishes ? `<div class="must-try">🍽️ Must try: ${esc(r.must_try_dishes)}</div>` : ''}
                <div class="rest-meta">
                    ${r.address ? `📍 ${esc(r.address)}` : ''}
                    ${r.reservation_needed ? ' · 📞 Reservation recommended' : ''}
                </div>
            </div>
        `).join('')}</div>`;
    },

    renderStays() {
        const stays = this.currentTrip.stays || [];
        if (!stays.length) return '<div class="travel-empty"><p>No stays found</p></div>';
        return `<div class="stays-grid">${stays.map(s => `
            <div class="stay-card">
                <span class="stay-tier ${s.tier}">${s.tier}</span>
                <h4>${esc(s.name)}</h4>
                <div class="stay-price">${s.currency || '$'}${Number(s.price_per_night).toFixed(0)} <small>/night</small></div>
                ${s.notes ? `<div class="stay-notes">${esc(s.notes)}</div>` : ''}
                ${s.address ? `<div class="rest-meta" style="margin-top:6px">📍 ${esc(s.address)}</div>` : ''}
                ${s.url ? `<a href="${esc(s.url)}" target="_blank" style="font-size:12px;margin-top:6px;display:inline-block">Book →</a>` : ''}
            </div>
        `).join('')}</div>`;
    },

    renderInfo() {
        const t = this.currentTrip;
        let html = '';

        if (t.budget_estimate) {
            const b = typeof t.budget_estimate === 'string' ? JSON.parse(t.budget_estimate) : t.budget_estimate;
            html += `<div class="info-section">
                <h3>💰 Budget Estimate (per day)</h3>
                <div class="budget-grid">
                    <div class="budget-item"><div class="budget-label">Budget</div><div class="budget-amount">$${b.budget_per_day_usd || '?'}</div></div>
                    <div class="budget-item"><div class="budget-label">Mid-range</div><div class="budget-amount">$${b.mid_per_day_usd || '?'}</div></div>
                    <div class="budget-item"><div class="budget-label">Luxury</div><div class="budget-amount">$${b.luxury_per_day_usd || '?'}</div></div>
                </div>
            </div>`;
        }

        if (t.weather_summary) {
            html += `<div class="info-section"><h3>🌤️ Weather</h3><p>${esc(t.weather_summary)}</p></div>`;
        }
        if (t.transport_notes) {
            html += `<div class="info-section"><h3>🚌 Transport</h3><p>${esc(t.transport_notes)}</p></div>`;
        }
        if (t.visa_info) {
            html += `<div class="info-section"><h3>🛂 Visa Info</h3><p>${esc(t.visa_info)}</p></div>`;
        }
        if (t.packing_list) {
            const list = typeof t.packing_list === 'string' ? JSON.parse(t.packing_list) : t.packing_list;
            if (Array.isArray(list) && list.length) {
                html += `<div class="info-section"><h3>🎒 Packing List</h3><ul>${list.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
            }
        }

        return html || '<div class="travel-empty"><p>No additional info available</p></div>';
    },

    // ─── Map ───
    initMap() {
        setTimeout(() => {
            const el = document.getElementById('travelMap');
            if (!el) return;

            if (this.map) { this.map.remove(); this.map = null; }
            this.map = L.map('travelMap').setView([20, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(this.map);

            const bounds = [];
            const days = this.currentTrip.days || [];

            days.forEach((day, di) => {
                const color = this.DAY_COLORS[di % this.DAY_COLORS.length];
                (day.activities || []).forEach(a => {
                    if (!a.latitude || !a.longitude) return;
                    const marker = L.circleMarker([a.latitude, a.longitude], {
                        radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9
                    }).addTo(this.map);
                    marker.bindPopup(`<strong>Day ${day.day_number}: ${esc(a.title)}</strong><br>${esc(a.location_name || '')}`);
                    bounds.push([a.latitude, a.longitude]);
                });
            });

            // Add restaurants
            (this.currentTrip.restaurants || []).forEach(r => {
                if (!r.latitude || !r.longitude) return;
                L.circleMarker([r.latitude, r.longitude], {
                    radius: 6, fillColor: '#f5a623', color: '#fff', weight: 2, fillOpacity: 0.8
                }).addTo(this.map).bindPopup(`<strong>🍴 ${esc(r.name)}</strong>`);
                bounds.push([r.latitude, r.longitude]);
            });

            if (bounds.length) {
                this.map.fitBounds(bounds, { padding: [30, 30] });
            }
        }, 100);
    },

    // ─── Generate ───
    async generate(tripId) {
        const overlay = document.createElement('div');
        overlay.className = 'generating-overlay';
        overlay.innerHTML = `<div class="generating-card">
            <div class="gen-icon">✈️</div>
            <h3>Planning your trip...</h3>
            <p>Researching destinations, finding the best spots, and crafting your itinerary</p>
            <div class="gen-progress"><div class="gen-progress-bar"></div></div>
        </div>`;
        document.body.appendChild(overlay);

        try {
            this.currentTrip = await API.post(`/travel/trips/${tripId}/generate`);
            overlay.remove();
            this.activeDay = 1;
            this.activeSection = 'itinerary';
            this.renderDetail();
            showToast('Itinerary generated! ✈️');
        } catch (e) {
            overlay.remove();
            showToast(e.message || 'Generation failed', 'error');
        }
    },

    // ─── Create Trip ───
    openCreateModal() {
        createModal({
            title: '✈️ Plan a Trip',
            bodyHTML: `
                <div class="form-group">
                    <label>Destination</label>
                    <input class="form-input" name="destination" placeholder="e.g. Tokyo, Paris, Bali..." required>
                </div>
                <div class="form-group">
                    <label>Country</label>
                    <input class="form-input" name="country" placeholder="e.g. Japan, France, Indonesia...">
                </div>
            `,
            submitLabel: 'Create Trip',
            async onSubmit(modal) {
                const destination = modal.querySelector('[name="destination"]').value.trim();
                if (!destination) throw new Error('Destination is required');
                const country = modal.querySelector('[name="country"]').value.trim();
                const trip = await API.post('/travel/trips', { destination, country: country || null });
                showToast('Trip created ✓');
                Travel.loadTrip(trip.id);
            }
        });
    },

    // ─── Delete Trip ───
    async deleteTrip(id) {
        if (!confirm('Delete this trip?')) return;
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
