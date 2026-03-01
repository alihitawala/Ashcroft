/* ═══════════════════════════════════════════════════════════
   Travel Planner — Main Controller (Phase 3)
   ═══════════════════════════════════════════════════════════ */

const Travel = {
    trips: [],
    currentTrip: null,
    activeDay: 1,
    activeSection: 'itinerary',
    map: null,
    markers: [],
    editingActivityId: null,

    DAY_COLORS: ['#635bff', '#3ecf8e', '#f5a623', '#f45b69', '#5b9cf6'],

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
                                <span>${t.activity_count || 0} activities</span>
                                <span>${formatDate(t.created_at)}</span>
                            </div>
                            <div class="trip-card-actions">
                                ${t.status !== 'archived' ? `<button class="btn-icon-sm" onclick="event.stopPropagation();Travel.archiveTrip(${t.id})" title="Archive">📦</button>` : `<button class="btn-icon-sm" onclick="event.stopPropagation();Travel.unarchiveTrip(${t.id})" title="Unarchive">📤</button>`}
                                <button class="btn-icon-sm" onclick="event.stopPropagation();Travel.confirmDeleteTrip(${t.id},'${esc(t.destination)}')" title="Delete">🗑️</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
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
        body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Loading trip...</div>';
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

        body.innerHTML = `
            <button class="trip-detail-back" onclick="Travel.showList()">← All Trips</button>
            <div class="trip-detail-header">
                <h1>${esc(t.destination)}</h1>
                ${t.country ? `<div class="trip-country-label">${esc(t.country)}</div>` : ''}
            </div>
            <div class="trip-detail-actions">
                ${!hasDays ? `<button class="btn btn-primary" onclick="Travel.generate(${t.id})">✨ Generate Itinerary</button>` : ''}
                ${hasDays ? `<button class="btn btn-secondary" onclick="Travel.generate(${t.id})">🔄 Regenerate</button>` : ''}
                ${hasDays ? `<button class="btn btn-secondary" onclick="Travel.shareTrip(${t.id})">🔗 Share</button>` : ''}
                <button class="btn btn-danger" onclick="Travel.confirmDeleteTrip(${t.id},'${esc(t.destination)}')">Delete</button>
            </div>
            ${hasDays ? this.renderSectionTabs() : ''}
            <div id="tripContent">
                ${hasDays ? this.renderActiveSection() : '<div class="travel-empty"><div class="travel-empty-icon">🗺️</div><h3>Ready to plan</h3><p>Hit "Generate Itinerary" to create a 5-day plan with AI</p></div>'}
            </div>`;

        if (hasDays && this.activeSection === 'map') {
            this.initMap();
        }
    },

    renderSectionTabs() {
        const tabs = [
            { id: 'itinerary', label: '📋 Itinerary' },
            { id: 'map', label: '🗺️ Map' },
            { id: 'packing', label: '🎒 Packing' },
            { id: 'restaurants', label: '🍴 Restaurants' },
            { id: 'stays', label: '🏨 Stays' },
            { id: 'info', label: 'ℹ️ Info' },
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
            case 'map': return '<div id="travelMap" class="travel-map"></div>';
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
        if (section === 'map') this.initMap();
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
                ${slotActs.map((a, i) => this.renderActivityCard(a, i, slotActs.length)).join('')}
            </div>`;
        }
        return html;
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

        return `<div class="activity-card" onclick="Travel.startEdit(${a.id})">
            <div class="activity-card-top">
                <h4>${esc(a.title)}</h4>
                <div class="activity-reorder">
                    ${index > 0 ? `<button class="btn-icon-xs" onclick="event.stopPropagation();Travel.moveActivity(${a.id},-1)" title="Move up">▲</button>` : ''}
                    ${index < totalInSlot - 1 ? `<button class="btn-icon-xs" onclick="event.stopPropagation();Travel.moveActivity(${a.id},1)" title="Move down">▼</button>` : ''}
                </div>
            </div>
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

    startEdit(activityId) {
        this.editingActivityId = activityId;
        const content = document.getElementById('tripContent');
        content.innerHTML = this.renderItinerary();
    },

    cancelEdit() {
        this.editingActivityId = null;
        const content = document.getElementById('tripContent');
        content.innerHTML = this.renderItinerary();
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
            this.activeSection = 'itinerary';
            this.renderDetail();
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
            this.activeSection = 'itinerary';
            this.renderDetail();
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
            // Swap sort_orders
            const a1 = acts[idx], a2 = acts[swapIdx];
            await Promise.all([
                API.patch(`/travel/trips/${t.id}/activities/${a1.id}`, { sort_order: a2.sort_order }),
                API.patch(`/travel/trips/${t.id}/activities/${a2.id}`, { sort_order: a1.sort_order }),
            ]);
            await this.loadTrip(t.id);
            this.activeSection = 'itinerary';
            this.renderDetail();
        } catch (e) { showToast(e.message, 'error'); }
    },

    // ─── Packing List ───
    renderPacking() {
        const t = this.currentTrip;
        let list = t.packing_list;
        if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
        if (!Array.isArray(list) || !list.length) {
            return '<div class="travel-empty"><p>No packing list generated for this trip</p></div>';
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

        let html = `<div class="packing-progress">
            <div class="packing-progress-text">${totalChecked} / ${list.length} packed</div>
            <div class="packing-progress-bar"><div class="packing-progress-fill" style="width:${(totalChecked/list.length*100).toFixed(0)}%"></div></div>
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
        // Update UI without full re-render
        const content = document.getElementById('tripContent');
        if (content) content.innerHTML = this.renderPacking();
    },

    switchDay(num) {
        this.activeDay = num;
        this.editingActivityId = null;
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

        return html || '<div class="travel-empty"><p>No additional info available</p></div>';
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
                    <div style="position:relative">
                        <input class="form-input" name="destination" id="tripDestInput" placeholder="e.g. Tokyo, Paris, Bali..." autocomplete="off" required>
                        <div id="tripDestSuggestions" style="position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface2);border:1px solid var(--border);border-radius:8px;display:none;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.2)"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Country</label>
                    <input class="form-input" name="country" id="tripCountryInput" placeholder="Auto-filled from selection">
                </div>
                <div style="display:flex;gap:12px">
                    <div class="form-group" style="flex:1">
                        <label>Start Date</label>
                        <input class="form-input" name="start_date" type="date">
                    </div>
                    <div class="form-group" style="flex:1">
                        <label>Days</label>
                        <input class="form-input" name="num_days" type="number" min="1" max="14" value="5" placeholder="5">
                    </div>
                </div>
            `,
            submitLabel: 'Create Trip',
            async onSubmit(modal) {
                const destination = modal.querySelector('[name="destination"]').value.trim();
                if (!destination) throw new Error('Destination is required');
                const country = modal.querySelector('[name="country"]').value.trim();
                const start_date = modal.querySelector('[name="start_date"]').value || null;
                const num_days = parseInt(modal.querySelector('[name="num_days"]').value) || 5;
                const trip = await API.post('/travel/trips', { destination, country: country || null, start_date, num_days });
                showToast('Trip created ✓');
                Travel.loadTrip(trip.id);
            }
        });

        // Nominatim autocomplete
        setTimeout(() => {
            const input = document.getElementById('tripDestInput');
            const suggestions = document.getElementById('tripDestSuggestions');
            const countryInput = document.getElementById('tripCountryInput');
            if (!input || !suggestions) return;

            let debounceTimer = null;
            input.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                const q = input.value.trim();
                if (q.length < 2) { suggestions.style.display = 'none'; return; }
                debounceTimer = setTimeout(async () => {
                    try {
                        const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1&featuretype=city`, {
                            headers: { 'User-Agent': 'ashcroft-cloud/1.0' }
                        });
                        const results = await resp.json();
                        if (!results.length) { suggestions.style.display = 'none'; return; }
                        suggestions.innerHTML = results.map(r => {
                            const city = r.address?.city || r.address?.town || r.address?.village || r.name || '';
                            const country = r.address?.country || '';
                            const display = city + (country ? ', ' + country : '');
                            return `<div style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:14px;color:var(--text)" data-city="${esc(city)}" data-country="${esc(country)}" onmouseover="this.style.background='var(--surface3)'" onmouseout="this.style.background=''">${esc(display)}</div>`;
                        }).join('');
                        suggestions.style.display = 'block';
                        suggestions.querySelectorAll('div').forEach(div => {
                            div.addEventListener('click', () => {
                                input.value = div.dataset.city;
                                if (countryInput) countryInput.value = div.dataset.country;
                                suggestions.style.display = 'none';
                            });
                        });
                    } catch (e) { suggestions.style.display = 'none'; }
                }, 300);
            });

            // Close suggestions on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#tripDestInput') && !e.target.closest('#tripDestSuggestions')) {
                    suggestions.style.display = 'none';
                }
            });
        }, 100);
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
    // Check if this is a public view
    const params = new URLSearchParams(window.location.search);
    if (params.get('token')) {
        // Public mode handled by travel-public.html
        return;
    }

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
