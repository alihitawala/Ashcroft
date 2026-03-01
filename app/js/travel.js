/* ═══════════════════════════════════════════════════════════
   Travel Planner — Main Controller (Phase 2)
   ═══════════════════════════════════════════════════════════ */

const Travel = {
    trips: [],
    currentTrip: null,
    activeDay: 1,
    activeSection: 'itinerary',
    map: null,
    markers: [],
    _autocompleteTimer: null,

    DAY_COLORS: ['#5b9cf6', '#3ecf8e', '#f5a623', '#a855f7', '#f45b69'],
    DAY_LABELS: ['blue', 'green', 'orange', 'purple', 'red'],

    GEN_STEPS: [
        { icon: '🔍', text: 'Researching destination...' },
        { icon: '🏛️', text: 'Finding attractions...' },
        { icon: '🍴', text: 'Discovering restaurants...' },
        { icon: '📋', text: 'Building itinerary...' },
        { icon: '✨', text: 'Polishing your plan...' },
    ],

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
                ${this.trips.map(t => {
                    const heroUrl = `https://source.unsplash.com/featured/600x300/?${encodeURIComponent(t.destination)}+travel`;
                    return `
                    <div class="trip-card" onclick="Travel.loadTrip(${t.id})">
                        <div class="trip-card-hero" style="background-image:url('${heroUrl}')">
                            <div class="trip-card-hero-overlay"></div>
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
                    </div>`;
                }).join('')}
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
        const heroUrl = `https://source.unsplash.com/featured/1200x400/?${encodeURIComponent(t.destination)}+travel`;

        body.innerHTML = `
            <div class="trip-hero-banner" id="tripHero">
                <img src="${heroUrl}" alt="${esc(t.destination)}" onerror="this.parentElement.classList.add('hero-fallback');this.remove()">
                <div class="trip-hero-overlay"></div>
                <div class="trip-hero-content">
                    <button class="trip-detail-back" onclick="Travel.showList()">← All Trips</button>
                    <h1>${esc(t.destination)}</h1>
                    ${t.country ? `<div class="trip-country-label">${esc(t.country)}</div>` : ''}
                </div>
            </div>
            <div class="trip-detail-actions">
                ${!hasDays ? `<button class="btn btn-primary" onclick="Travel.generate(${t.id})">✨ Generate Itinerary</button>` : ''}
                ${hasDays ? `<button class="btn btn-secondary" onclick="Travel.generate(${t.id})">🔄 Regenerate</button>` : ''}
                <button class="btn btn-danger" onclick="Travel.deleteTrip(${t.id})">Delete</button>
            </div>
            ${hasDays ? this.renderSectionTabs() : ''}
            <div id="tripContent">
                ${hasDays ? this.renderActiveSection() : '<div class="travel-empty"><div class="travel-empty-icon">🗺️</div><h3>Ready to plan</h3><p>Hit "Generate Itinerary" to create a 5-day plan with AI</p></div>'}
            </div>`;

        if (hasDays && this.activeSection === 'map') {
            this.initMap();
        }
    },

    renderActiveSection() {
        switch (this.activeSection) {
            case 'itinerary': return this.renderItinerary();
            case 'map': return '<div id="travelMap" class="travel-map"></div><button class="btn btn-secondary fit-markers-btn" onclick="Travel.fitMarkers()">📍 Fit All Markers</button>';
            case 'restaurants': return this.renderRestaurants();
            case 'stays': return this.renderStays();
            case 'budget': return this.renderBudget();
            case 'info': return this.renderInfo();
            default: return this.renderItinerary();
        }
    },

    renderSectionTabs() {
        const tabs = [
            { id: 'itinerary', label: '📋 Itinerary' },
            { id: 'map', label: '🗺️ Map' },
            { id: 'restaurants', label: '🍴 Restaurants' },
            { id: 'stays', label: '🏨 Stays' },
            { id: 'budget', label: '💰 Budget' },
            { id: 'info', label: 'ℹ️ Info' },
        ];
        return `<div class="section-tabs">${tabs.map(tab =>
            `<button class="section-tab${this.activeSection === tab.id ? ' active' : ''}" data-section="${tab.id}" onclick="Travel.switchSection('${tab.id}')">${tab.label}</button>`
        ).join('')}</div>`;
    },

    switchSection(section) {
        this.activeSection = section;
        document.querySelectorAll('.section-tab').forEach(t => {
            t.className = 'section-tab' + (t.dataset.section === section ? ' active' : '');
        });

        const content = document.getElementById('tripContent');
        content.innerHTML = this.renderActiveSection();
        if (section === 'map') this.initMap();
    },

    renderItinerary() {
        const days = this.currentTrip.days || [];
        if (!days.length) return '';

        const dayTabs = days.map((d, i) => {
            const color = this.DAY_COLORS[i % this.DAY_COLORS.length];
            return `<button class="day-tab${d.day_number === this.activeDay ? ' active' : ''}" style="${d.day_number === this.activeDay ? `background:${color};border-color:${color}` : ''}" onclick="Travel.switchDay(${d.day_number})">${d.title || 'Day ' + d.day_number}</button>`;
        }).join('');

        const day = days.find(d => d.day_number === this.activeDay) || days[0];
        const activities = day.activities || [];
        const slots = ['morning', 'afternoon', 'evening'];
        const slotIcons = { morning: '🌅', afternoon: '☀️', evening: '🌙' };

        let html = `<div class="day-tabs" id="dayTabsScroll">${dayTabs}</div>`;
        if (day.summary) {
            html += `<div class="day-summary">${esc(day.summary)}</div>`;
        }

        for (const slot of slots) {
            const slotActs = activities.filter(a => a.time_slot === slot);
            if (!slotActs.length) continue;
            html += `<div class="time-slot-group">
                <div class="time-slot-label">${slotIcons[slot]} ${slot}</div>
                ${slotActs.map(a => this.renderActivityCard(a, day.day_number)).join('')}
            </div>`;
        }
        return html;
    },

    renderActivityCard(a, dayNum) {
        const color = this.DAY_COLORS[(dayNum - 1) % this.DAY_COLORS.length];
        return `<div class="activity-card" style="border-left:3px solid ${color}">
            <h4>${esc(a.title)}</h4>
            ${a.description ? `<div class="activity-desc">${esc(a.description)}</div>` : ''}
            <div class="activity-meta">
                ${a.location_name ? `<span>📍 ${esc(a.location_name)}</span>` : ''}
                ${a.duration_hours ? `<span>⏱ ${a.duration_hours}h</span>` : ''}
                ${a.estimated_cost ? `<span>💰 ${a.currency || '$'}${Number(a.estimated_cost).toFixed(0)}</span>` : ''}
                ${a.category ? `<span class="activity-category-tag">${esc(a.category)}</span>` : ''}
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

    // ─── Budget Breakdown ───
    renderBudget() {
        const t = this.currentTrip;
        if (!t.budget_estimate) return '<div class="travel-empty"><p>No budget data available</p></div>';

        const b = typeof t.budget_estimate === 'string' ? JSON.parse(t.budget_estimate) : t.budget_estimate;
        const days = (t.days || []).length || 5;

        const categories = [
            { key: 'accommodation', label: 'Accommodation', icon: '🏨', color: '#5b9cf6' },
            { key: 'food', label: 'Food & Dining', icon: '🍴', color: '#3ecf8e' },
            { key: 'transport', label: 'Transport', icon: '🚌', color: '#f5a623' },
            { key: 'activities', label: 'Activities', icon: '🎯', color: '#a855f7' },
            { key: 'misc', label: 'Miscellaneous', icon: '📦', color: '#f45b69' },
        ];

        // Try to extract per-category values, or compute from per_day fields
        const midDaily = b.mid_per_day_usd || b.mid_range_per_day_usd || 0;
        const budgetDaily = b.budget_per_day_usd || 0;
        const luxuryDaily = b.luxury_per_day_usd || 0;

        // If detailed breakdown exists use it, otherwise estimate from mid-range
        const breakdown = b.breakdown || {};
        let catData = categories.map(c => ({
            ...c,
            amount: breakdown[c.key] || 0
        }));

        const hasBreakdown = catData.some(c => c.amount > 0);
        if (!hasBreakdown && midDaily > 0) {
            // Estimate breakdown from mid-range daily
            const total = midDaily * days;
            catData[0].amount = Math.round(total * 0.35); // accommodation
            catData[1].amount = Math.round(total * 0.25); // food
            catData[2].amount = Math.round(total * 0.15); // transport
            catData[3].amount = Math.round(total * 0.18); // activities
            catData[4].amount = Math.round(total * 0.07); // misc
        }

        const totalEst = catData.reduce((s, c) => s + c.amount, 0);
        const maxAmount = Math.max(...catData.map(c => c.amount), 1);

        let html = `<div class="budget-overview">`;

        // Tier cards
        html += `<div class="budget-tier-cards">
            ${budgetDaily ? `<div class="budget-tier-card budget-tier-budget"><div class="budget-tier-label">Budget</div><div class="budget-tier-amount">$${budgetDaily}</div><div class="budget-tier-sub">/day · $${budgetDaily * days} total</div></div>` : ''}
            ${midDaily ? `<div class="budget-tier-card budget-tier-mid"><div class="budget-tier-label">Mid-range</div><div class="budget-tier-amount">$${midDaily}</div><div class="budget-tier-sub">/day · $${midDaily * days} total</div></div>` : ''}
            ${luxuryDaily ? `<div class="budget-tier-card budget-tier-luxury"><div class="budget-tier-label">Luxury</div><div class="budget-tier-amount">$${luxuryDaily}</div><div class="budget-tier-sub">/day · $${luxuryDaily * days} total</div></div>` : ''}
        </div>`;

        // Category breakdown bars
        if (totalEst > 0) {
            html += `<div class="budget-breakdown">
                <h3>Estimated Breakdown (${days} days)</h3>
                <div class="budget-total">Total: <strong>$${totalEst.toLocaleString()}</strong></div>
                ${catData.map(c => `
                    <div class="budget-bar-row">
                        <div class="budget-bar-label">${c.icon} ${c.label}</div>
                        <div class="budget-bar-track">
                            <div class="budget-bar-fill" style="width:${(c.amount / maxAmount * 100).toFixed(1)}%;background:${c.color}"></div>
                        </div>
                        <div class="budget-bar-amount">$${c.amount.toLocaleString()}</div>
                    </div>
                `).join('')}
            </div>`;
        }

        html += `</div>`;
        return html;
    },

    renderInfo() {
        const t = this.currentTrip;
        let html = '';

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
            this.markers = [];
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
                        radius: 9, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9
                    }).addTo(this.map);
                    marker.bindPopup(`
                        <div style="min-width:160px">
                            <strong style="color:${color}">Day ${day.day_number}</strong> · <em>${a.time_slot || ''}</em>
                            <br><strong>${esc(a.title)}</strong>
                            ${a.description ? `<br><small>${esc(a.description).substring(0, 100)}${a.description.length > 100 ? '...' : ''}</small>` : ''}
                            ${a.location_name ? `<br><small>📍 ${esc(a.location_name)}</small>` : ''}
                        </div>
                    `);
                    bounds.push([a.latitude, a.longitude]);
                    this.markers.push(marker);
                });
            });

            // Restaurant markers - diamond shape using DivIcon
            (this.currentTrip.restaurants || []).forEach(r => {
                if (!r.latitude || !r.longitude) return;
                const icon = L.divIcon({
                    className: 'restaurant-marker-icon',
                    html: '<div class="restaurant-pin">🍴</div>',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
                const m = L.marker([r.latitude, r.longitude], { icon }).addTo(this.map);
                m.bindPopup(`<strong>🍴 ${esc(r.name)}</strong>${r.cuisine ? `<br><em>${esc(r.cuisine)}</em>` : ''}${r.address ? `<br><small>📍 ${esc(r.address)}</small>` : ''}`);
                bounds.push([r.latitude, r.longitude]);
                this.markers.push(m);
            });

            if (bounds.length) {
                this._mapBounds = bounds;
                this.map.fitBounds(bounds, { padding: [40, 40] });
            }

            // Legend
            const legend = L.control({ position: 'bottomright' });
            legend.onAdd = () => {
                const div = L.DomUtil.create('div', 'map-legend');
                div.innerHTML = days.map((d, i) => {
                    const c = this.DAY_COLORS[i % this.DAY_COLORS.length];
                    return `<div class="legend-item"><span class="legend-dot" style="background:${c}"></span>Day ${d.day_number}</div>`;
                }).join('') + '<div class="legend-item"><span class="legend-dot" style="background:#f5a623;font-size:10px">🍴</span>Restaurant</div>';
                return div;
            };
            legend.addTo(this.map);
        }, 100);
    },

    fitMarkers() {
        if (this.map && this._mapBounds && this._mapBounds.length) {
            this.map.fitBounds(this._mapBounds, { padding: [40, 40] });
        }
    },

    // ─── Generate with animated steps ───
    async generate(tripId) {
        const overlay = document.createElement('div');
        overlay.className = 'generating-overlay';
        overlay.innerHTML = `<div class="generating-card">
            <div class="gen-icon">✈️</div>
            <h3>Planning your trip...</h3>
            <div class="gen-steps" id="genSteps">
                ${this.GEN_STEPS.map((s, i) => `<div class="gen-step${i === 0 ? ' active' : ''}" data-step="${i}">${s.icon} ${s.text}</div>`).join('')}
            </div>
            <div class="gen-progress"><div class="gen-progress-bar"></div></div>
        </div>`;
        document.body.appendChild(overlay);

        // Animate through steps
        let stepIdx = 0;
        const stepInterval = setInterval(() => {
            stepIdx++;
            if (stepIdx >= this.GEN_STEPS.length) { clearInterval(stepInterval); return; }
            const steps = document.querySelectorAll('#genSteps .gen-step');
            steps.forEach((s, i) => {
                s.classList.toggle('active', i === stepIdx);
                if (i < stepIdx) s.classList.add('done');
            });
        }, 4000);

        try {
            this.currentTrip = await API.post(`/travel/trips/${tripId}/generate`);
            clearInterval(stepInterval);
            // Show done state briefly
            const steps = document.querySelectorAll('#genSteps .gen-step');
            steps.forEach(s => s.classList.add('done'));
            const card = overlay.querySelector('.generating-card');
            card.innerHTML = `<div class="gen-icon">🎉</div><h3>Your trip is ready!</h3><p style="color:var(--text-secondary);font-size:13px">Opening itinerary...</p>`;
            await new Promise(r => setTimeout(r, 800));
            overlay.remove();
            this.activeDay = 1;
            this.activeSection = 'itinerary';
            this.renderDetail();
            showToast('Itinerary generated! ✈️');
        } catch (e) {
            clearInterval(stepInterval);
            overlay.remove();
            showToast(e.message || 'Generation failed', 'error');
        }
    },

    // ─── Autocomplete ───
    setupAutocomplete(input) {
        const wrapper = input.parentElement;
        wrapper.style.position = 'relative';

        const dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        dropdown.style.display = 'none';
        wrapper.appendChild(dropdown);

        input.addEventListener('input', () => {
            clearTimeout(this._autocompleteTimer);
            const q = input.value.trim();
            if (q.length < 2) { dropdown.style.display = 'none'; return; }

            this._autocompleteTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`, {
                        headers: { 'User-Agent': 'ashcroft-cloud/1.0' }
                    });
                    const data = await res.json();
                    if (!data.length) { dropdown.style.display = 'none'; return; }

                    dropdown.innerHTML = data.map((place, i) => {
                        const city = place.address?.city || place.address?.town || place.address?.village || place.address?.state || place.name;
                        const country = place.address?.country || '';
                        return `<div class="autocomplete-item" data-index="${i}" data-city="${esc(city)}" data-country="${esc(country)}" data-display="${esc(place.display_name)}">${esc(city)}${country ? `, <span class="ac-country">${esc(country)}</span>` : ''}</div>`;
                    }).join('');
                    dropdown.style.display = 'block';

                    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                        item.addEventListener('click', () => {
                            input.value = item.dataset.city;
                            const countryInput = input.closest('.modal-body')?.querySelector('[name="country"]');
                            if (countryInput) countryInput.value = item.dataset.country;
                            dropdown.style.display = 'none';
                        });
                    });
                } catch (e) {
                    dropdown.style.display = 'none';
                }
            }, 300);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
        });
    },

    // ─── Create Trip ───
    openCreateModal() {
        createModal({
            title: '✈️ Plan a Trip',
            bodyHTML: `
                <div class="form-group">
                    <label>Destination</label>
                    <input class="form-input" name="destination" placeholder="e.g. Tokyo, Paris, Bali..." required autocomplete="off">
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

        // Attach autocomplete after modal renders
        setTimeout(() => {
            const destInput = document.querySelector('.modal [name="destination"]');
            if (destInput) this.setupAutocomplete(destInput);
        }, 50);
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
