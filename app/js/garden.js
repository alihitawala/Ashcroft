/* ═══════════════════════════════════════════════════════
   GARDEN TRACKER — Main Application Script
   ═══════════════════════════════════════════════════════ */

(async function() {
    'use strict';

    // ─── Auth ───
    const user = await requireAuth();
    const shell = renderAppShell('Garden', 'garden');
    document.getElementById('appShell').innerHTML = `
        ${shell.sidebar}
        <div class="main-content">
            ${shell.topbar}
            <div class="main-body">
                <div class="garden-toolbar">
                    <div class="toolbar-left">
                        <span class="toolbar-title">🌱 My Garden</span>
                        <span class="plant-count" id="plantCount"></span>
                    </div>
                    <div class="toolbar-right">
                        <button class="toolbar-btn" id="sortBtn" title="Sort">
                            <i data-lucide="arrow-up-down"></i>
                        </button>
                        <button class="add-plant-btn" id="addPlantBtnTop">
                            <i data-lucide="plus"></i>
                            <span>Add Plant</span>
                        </button>
                    </div>
                </div>
                <div class="garden-tabs">
                    <button class="garden-tab active" data-tab="plants" id="tabPlants">
                        <i data-lucide="sprout"></i> Plants
                    </button>
                    <button class="garden-tab" data-tab="plans" id="tabPlans">
                        <i data-lucide="clipboard-list"></i> Plans
                    </button>
                    <button class="garden-tab" data-tab="supplies" id="tabSupplies">
                        <i data-lucide="shopping-cart"></i> Supplies
                    </button>
                </div>
                <div class="content-area" id="contentArea">
                    <!-- Plants grid will render here -->
                </div>
                <div class="plans-content hidden" id="plansContent">
                    <div id="plansInner">
                        <div class="plans-empty"><i data-lucide="loader"></i><div>Loading...</div></div>
                    </div>
                </div>
                <div class="supplies-content hidden" id="suppliesContent">
                    <div id="suppliesInner">
                        <div class="shopping-empty"><i data-lucide="loader"></i><div>Loading...</div></div>
                    </div>
                </div>
            </div>
            ${shell.bottomNav}
        </div>
        <!-- Detail overlay -->
        <div class="detail-overlay" id="detailOverlay">
            <div class="detail-backdrop" id="detailBackdrop"></div>
            <div class="detail-panel" id="detailPanel"></div>
            <div class="quick-action-bar" id="quickActionBar"></div>
        </div>
        <!-- Garden Photo Lightbox (dual-layer) -->
        <div class="garden-lightbox" id="gardenLightbox">
            <div class="garden-lightbox-header">
                <div>
                    <div class="garden-lightbox-title" id="glbTitle"></div>
                    <div class="garden-lightbox-date" id="glbDate"></div>
                </div>
                <button class="garden-lightbox-close" id="glbClose"><i data-lucide="x"></i></button>
            </div>
            <div class="garden-lightbox-body" id="glbBody">
                <div class="glb-layer" id="glbLayerA"><img id="glbImgA" src="" alt=""></div>
                <div class="glb-layer" id="glbLayerB" style="visibility:hidden"><img id="glbImgB" src="" alt=""></div>
                <button class="garden-lightbox-nav garden-lightbox-prev" id="glbPrev"><i data-lucide="chevron-left"></i></button>
                <button class="garden-lightbox-nav garden-lightbox-next" id="glbNext"><i data-lucide="chevron-right"></i></button>
            </div>
            <div class="garden-lightbox-counter" id="glbCounter"></div>
        </div>
        <!-- Growth Animation Overlay -->
        <div class="growth-overlay" id="growthOverlay">
            <div class="growth-header">
                <div class="growth-plant-name" id="growthPlantName"></div>
                <button class="growth-close" id="growthClose"><i data-lucide="x"></i></button>
            </div>
            <div class="growth-canvas" id="growthCanvas"></div>
            <div class="growth-date" id="growthDate"></div>
            <div class="growth-controls">
                <button class="growth-play-btn" id="growthPlayBtn"><i data-lucide="pause"></i></button>
                <div class="growth-progress-bar"><div class="growth-progress-fill" id="growthProgressFill"></div></div>
            </div>
            <div class="growth-summary hidden" id="growthSummary"></div>
        </div>
    `;
    initAppShell('garden');

    // ─── State ───
    let plants = [];
    let zones = [];
    let activeZoneFilter = null; // null = All
    let currentPlant = null;
    let currentTimeline = [];
    let currentLogs = [];
    let activeTimelineIdx = 0;
    let sortMode = 'attention'; // attention | alpha | health
    let wateringData = null;
    let wateringExpanded = false;

    // ─── Load Zones ───
    async function loadZones() {
        try {
            zones = await API.get('/garden/zones') || [];
        } catch { zones = []; }
    }

    // ─── Load Plants ───
    async function loadPlants() {
        const area = document.getElementById('contentArea');
        area.innerHTML = renderSkeletons(8);
        try {
            await loadZones();
            plants = await API.get('/garden/plants') || [];
            renderPlantGrid();
        } catch (err) {
            area.innerHTML = `<div class="empty-state"><div class="emoji">❌</div><p>Failed to load plants: ${err.message}</p></div>`;
        }
    }

    function renderSkeletons(count) {
        let html = '<div class="plants-grid">';
        for (let i = 0; i < count; i++) {
            html += `<div class="skeleton-card" style="animation-delay:${i * 80}ms"></div>`;
        }
        html += '</div>';
        return html;
    }

    // ─── Sort Plants ───
    function sortPlants(list) {
        const copy = [...list];
        if (sortMode === 'alpha') {
            copy.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } else if (sortMode === 'health') {
            copy.sort((a, b) => (a.overall_health_score ?? 999) - (b.overall_health_score ?? 999));
        } else {
            // attention: low health first, then no score (new), then by name
            copy.sort((a, b) => {
                const sa = a.overall_health_score;
                const sb = b.overall_health_score;
                if (sa == null && sb == null) return (a.name || '').localeCompare(b.name || '');
                if (sa == null) return 1;
                if (sb == null) return -1;
                if (sa !== sb) return sa - sb;
                return (a.name || '').localeCompare(b.name || '');
            });
        }
        return copy;
    }

    // ─── Watering Schedule ───
    async function loadWateringSchedule() {
        try {
            wateringData = await API.get('/garden/watering-schedule');
        } catch { wateringData = null; }
        renderWateringSchedule();
    }

    function renderWateringSchedule() {
        let el = document.getElementById('wateringSchedule');
        if (!wateringData) { if (el) el.remove(); return; }
        const { overdue = [], today = [], soon = [], upcoming = [] } = wateringData;
        const total = overdue.length + today.length + soon.length + upcoming.length;
        if (total === 0) { if (el) el.remove(); return; }

        // Build summary text
        let summaryParts = [];
        if (overdue.length) summaryParts.push(`<span class="ws-overdue">${overdue.length} overdue</span>`);
        if (today.length) summaryParts.push(`<span class="ws-today">${today.length} due today</span>`);
        if (soon.length) summaryParts.push(`<span class="ws-soon">${soon.length} next 2 days</span>`);
        let summaryText;
        if (summaryParts.length) {
            summaryText = '💧 ' + summaryParts.join(' · ');
            if (upcoming.length) summaryText += ` · ${upcoming.length} upcoming`;
        } else {
            const next = upcoming[0];
            summaryText = next
                ? `💧 All plants watered — next: ${esc(next.name)} in ${next.days_until_watering} day${next.days_until_watering !== 1 ? 's' : ''}`
                : '💧 All plants watered';
        }

        // Build groups
        function renderGroup(label, items, cls) {
            if (!items.length) return '';
            let h = `<div class="watering-group-header ${cls}">${label}</div>`;
            items.forEach(p => {
                const thumb = p.latest_thumbnail_url
                    ? `<img class="watering-thumb" src="${esc(p.latest_thumbnail_url)}" alt="" loading="lazy">`
                    : `<div class="watering-thumb-placeholder"><i data-lucide="sprout"></i></div>`;
                const due = p.next_watering ? formatDate(p.next_watering) : '';
                const last = p.last_watered ? formatDate(p.last_watered) : '';
                const zoneName = p.zone_name ? ` · ${p.zone_name}` : '';
                const meta = [due ? `Due ${due}` : '', last ? `Last ${last}` : ''].filter(Boolean).join(' · ') + zoneName;
                const gal = p.water_gallons || '';
                h += `<div class="watering-plant-row" data-plant-id="${p.id}">
                    ${thumb}
                    <div class="watering-plant-info">
                        <div class="watering-plant-name">${esc(p.name)}</div>
                        <div class="watering-plant-meta">${meta}</div>
                    </div>
                    ${gal ? `<span class="watering-gallons">${esc(String(gal))}</span>` : ''}
                    <button class="watering-btn" data-plant-id="${p.id}" data-plant-name="${esc(p.name)}"><i data-lucide="droplets"></i> Water</button>
                </div>`;
            });
            return h;
        }

        const detailsHTML = renderGroup('🔴 Overdue', overdue, 'wg-overdue')
            + renderGroup('🔵 Today', today, 'wg-today')
            + renderGroup('🟡 Next 2 Days', soon, 'wg-soon')
            + renderGroup('⚪ Upcoming', upcoming, 'wg-upcoming');

        const html = `<div class="watering-summary" id="wateringSummaryToggle">
                <span class="watering-summary-text">${summaryText}</span>
                <span class="watering-chevron ${wateringExpanded ? 'open' : ''}" id="wateringChevron"><i data-lucide="chevron-down"></i></span>
            </div>
            <div class="watering-details ${wateringExpanded ? 'open' : ''}" id="wateringDetails">
                ${detailsHTML}
            </div>`;

        if (!el) {
            el = document.createElement('div');
            el.id = 'wateringSchedule';
            el.className = 'watering-schedule';
            const area = document.getElementById('contentArea');
            area.insertBefore(el, area.firstChild);
        }
        el.innerHTML = html;
        lucide.createIcons();

        // Toggle
        document.getElementById('wateringSummaryToggle')?.addEventListener('click', () => {
            wateringExpanded = !wateringExpanded;
            document.getElementById('wateringDetails')?.classList.toggle('open', wateringExpanded);
            document.getElementById('wateringChevron')?.classList.toggle('open', wateringExpanded);
        });

        // Water buttons
        el.querySelectorAll('.watering-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const plantId = btn.dataset.plantId;
                const plantName = btn.dataset.plantName;
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>';
                try {
                    await API.post(`/garden/plants/${plantId}/logs`, { type: 'watering', notes: 'Scheduled watering' });
                    const row = btn.closest('.watering-plant-row');
                    if (row) row.classList.add('watered-out');
                    // Refetch schedule after animation
                    setTimeout(async () => {
                        await loadWateringSchedule();
                        // Find next watering from refreshed data
                        let nextDate = '';
                        if (wateringData) {
                            for (const list of [wateringData.today, wateringData.soon, wateringData.upcoming]) {
                                const found = (list || []).find(p => p.id == plantId);
                                if (found?.next_watering) { nextDate = formatDate(found.next_watering); break; }
                            }
                        }
                        showToast(`Watered ${plantName} ✓${nextDate ? ` — next watering: ${nextDate}` : ''}`);
                    }, 350);
                } catch (err) {
                    showToast(err.message, 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="droplets"></i> Water';
                    lucide.createIcons();
                }
            });
        });
    }

    // ─── Render Zone Filter Pills ───
    function renderZoneFilter() {
        if (zones.length === 0) return '';
        let html = '<div class="zone-filter-bar">';
        html += `<button class="zone-pill ${activeZoneFilter === null ? 'active' : ''}" data-zone-id="">All</button>`;
        zones.forEach(z => {
            html += `<button class="zone-pill ${activeZoneFilter === z.id ? 'active' : ''}" data-zone-id="${z.id}">${esc(z.name)}</button>`;
        });
        html += `<button class="zone-pill zone-pill-manage" data-action="manage-zones" title="Manage Zones"><i data-lucide="settings"></i></button>`;
        html += '</div>';
        return html;
    }

    // ─── Render Plant Grid ───
    function renderPlantGrid() {
        const area = document.getElementById('contentArea');
        const countEl = document.getElementById('plantCount');
        countEl.textContent = `${plants.length} plant${plants.length !== 1 ? 's' : ''}`;

        if (plants.length === 0) {
            area.innerHTML = renderZoneFilter() + `
                <div class="garden-empty">
                    <div class="garden-empty-icon"><i data-lucide="sprout"></i></div>
                    <h2>Start Your Garden</h2>
                    <p>Add your first plant to begin tracking health, growth, and care recommendations.</p>
                    <button class="btn btn-primary" onclick="document.getElementById('addPlantBtnTop').click()">
                        <i data-lucide="plus"></i> Add Your First Plant
                    </button>
                </div>
            `;
            lucide.createIcons();
            bindZoneFilterEvents();
            return;
        }

        let filtered = plants;
        if (activeZoneFilter !== null) {
            filtered = plants.filter(p => p.zone_id === activeZoneFilter);
        }

        const sorted = sortPlants(filtered);
        let html = renderZoneFilter();

        // Group by zone when no filter active
        if (activeZoneFilter === null && zones.length > 0) {
            // Group: each zone, then unassigned
            zones.forEach(z => {
                const zonePlants = sorted.filter(p => p.zone_id === z.id);
                if (zonePlants.length === 0) return;
                html += `<div class="zone-group-header">${esc(z.name)}</div>`;
                html += '<div class="plants-grid">';
                zonePlants.forEach((plant, i) => { html += renderPlantCard(plant, i * 50); });
                html += '</div>';
            });
            const unassigned = sorted.filter(p => !p.zone_id);
            if (unassigned.length > 0) {
                html += `<div class="zone-group-header">Unassigned</div>`;
                html += '<div class="plants-grid">';
                unassigned.forEach((plant, i) => { html += renderPlantCard(plant, i * 50); });
                html += '</div>';
            }
        } else {
            html += '<div class="plants-grid">';
            sorted.forEach((plant, i) => { html += renderPlantCard(plant, i * 50); });
            html += '</div>';
        }

        // Add plant card
        html += `
            <div class="plants-grid" style="margin-top:12px">
                <div class="add-plant-card" onclick="document.getElementById('addPlantBtnTop').click()">
                    <i data-lucide="plus"></i>
                    <span>Add Plant</span>
                </div>
            </div>
        `;
        area.innerHTML = html;
        lucide.createIcons();
        bindZoneFilterEvents();

        // Click handlers
        area.querySelectorAll('.plant-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.plantId);
                const plant = plants.find(p => p.id === id);
                if (plant) openDetail(plant);
            });
        });

        // Quick water CTA buttons
        area.querySelectorAll('.plant-card-water-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const plantId = btn.dataset.plantId;
                const plantName = btn.dataset.plantName;
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader"></i> ...';
                lucide.createIcons({ nodes: [btn] });
                try {
                    await API.post(`/garden/plants/${plantId}/logs`, { type: 'watering', notes: 'Quick water from garden view' });
                    // Refresh data and re-render
                    [wateringData, plants] = await Promise.all([
                        API.get('/garden/watering-schedule').catch(() => null),
                        API.get('/garden/plants').catch(() => plants)
                    ]);
                    renderPlantGrid();
                    // Find next watering date for toast
                    let nextDate = '';
                    if (wateringData) {
                        for (const list of [wateringData.today, wateringData.soon, wateringData.upcoming]) {
                            const found = (list || []).find(p => p.id == plantId);
                            if (found?.next_watering) { nextDate = ' — next: ' + formatDate(found.next_watering); break; }
                        }
                    }
                    showToast(`💧 Watered ${plantName} ✓${nextDate}`);
                } catch (err) {
                    showToast('Failed to log watering', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="droplets"></i> Water';
                    lucide.createIcons({ nodes: [btn] });
                }
            });
        });

        // Re-render watering schedule (since innerHTML replaced it)
        if (wateringData) renderWateringSchedule();
    }

    function bindZoneFilterEvents() {
        document.querySelectorAll('.zone-pill[data-zone-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const zid = btn.dataset.zoneId;
                activeZoneFilter = zid === '' ? null : parseInt(zid);
                renderPlantGrid();
            });
        });
        document.querySelector('.zone-pill-manage')?.addEventListener('click', openZoneManager);
    }

    function renderPlantCard(plant, delay) {
        const score = plant.overall_health_score;
        const scoreClass = getScoreClass(score);
        const trend = plant.health_trend;
        const type = (plant.type || 'default').toLowerCase();
        const gradientClass = `gradient-${['tree','herb','flower','vegetable','fruit','succulent'].includes(type) ? type : 'default'}`;

        let heroHTML;
        if (plant.latest_thumbnail_url || plant.latest_photo_url) {
            const src = plant.latest_thumbnail_url || plant.latest_photo_url;
            heroHTML = `<img src="${src}" alt="${esc(plant.name)}" loading="lazy">`;
        } else {
            heroHTML = `<div class="plant-card-placeholder ${gradientClass}"><i data-lucide="${getPlantIcon(type)}"></i></div>`;
        }

        let badgeHTML = '';
        if (score != null) {
            badgeHTML = `<span class="health-score-circle ${scoreClass}">${score}</span>`;
        } else {
            badgeHTML = `<span class="health-score-circle new-plant">NEW</span>`;
        }

        let trendHTML = '';
        if (trend === 'improving') trendHTML = '<span class="trend-arrow improving">↑</span>';
        else if (trend === 'declining') trendHTML = '<span class="trend-arrow declining">↓</span>';
        else if (trend === 'stable' && score != null) trendHTML = '<span class="trend-arrow stable">→</span>';

        // Watering info
        let wateringLabel = '';
        let wateringClass = '';
        let wateringGal = '';
        if (plant.next_watering && wateringData) {
            const allPlants = [...(wateringData.overdue||[]), ...(wateringData.today||[]), ...(wateringData.soon||[]), ...(wateringData.upcoming||[])];
            const wp = allPlants.find(w => w.id === plant.id);
            if (wp) {
                const d = wp.days_until_watering;
                wateringGal = wp.water_gallons ? wp.water_gallons.replace(/\s*gallons?/i,'').replace(/\s*gal\.?/i,'').trim() : '';
                if (d < 0) { wateringLabel = `Overdue ${Math.abs(d)}d`; wateringClass = 'pcw-overdue'; }
                else if (d === 0) { wateringLabel = 'Today'; wateringClass = 'pcw-today'; }
                else { wateringLabel = `In ${d}d`; wateringClass = d <= 2 ? 'pcw-soon' : ''; }
            }
        }

        const wateringFooter = wateringLabel ? `
            <div class="plant-card-footer ${wateringClass}">
                <span class="pcw-label ${wateringClass}">💧 ${wateringLabel}</span>
                <button class="plant-card-water-btn ${wateringClass}" data-plant-id="${plant.id}" data-plant-name="${esc(plant.name)}" title="Log watering">
                    <i data-lucide="droplets"></i>${wateringGal ? ` ${wateringGal}` : ' Water'}
                </button>
            </div>` : '';

        return `
            <div class="plant-card" data-plant-id="${plant.id}" style="animation-delay:${delay}ms">
                <div class="plant-card-hero">
                    ${heroHTML}
                    <div class="health-badge">${badgeHTML}${trendHTML}</div>
                    <div class="plant-card-info">
                        <div class="plant-card-name">${esc(plant.name)}</div>
                        ${plant.species ? `<div class="plant-card-species">${esc(plant.species)}</div>` : ''}
                    </div>
                </div>
                ${wateringFooter}
            </div>
        `;
    }

    // ─── Open Plant Detail ───
    async function openDetail(plant) {
        currentPlant = plant;
        const overlay = document.getElementById('detailOverlay');
        const panel = document.getElementById('detailPanel');

        // Show loading state
        panel.innerHTML = `
            <div class="detail-hero">
                <div class="skeleton" style="width:100%;height:100%"></div>
            </div>
            <div class="detail-body" style="padding-top:20px">
                <div class="skeleton skeleton-line" style="width:60%;height:20px;margin-bottom:16px"></div>
                <div class="skeleton skeleton-line" style="width:40%;height:14px"></div>
            </div>
        `;
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';

        // Fetch data in parallel
        try {
            const [timeline, logs] = await Promise.all([
                API.get(`/garden/plants/${plant.id}/timeline`).catch(() => []),
                API.get(`/garden/plants/${plant.id}/logs`).catch(() => []),
            ]);
            currentTimeline = timeline || [];
            currentLogs = logs || [];
            activeTimelineIdx = 0;
            renderDetail();
        } catch (err) {
            panel.innerHTML = `<div style="padding:40px;text-align:center">
                <p>Failed to load plant details.</p>
                <button class="btn btn-secondary" onclick="closeDetail()">Close</button>
            </div>`;
        }
    }

    function closeDetail() {
        const overlay = document.getElementById('detailOverlay');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        currentPlant = null;
    }

    function renderDetail() {
        const plant = currentPlant;
        if (!plant) return;
        const panel = document.getElementById('detailPanel');
        const qbar = document.getElementById('quickActionBar');

        const activeEntry = currentTimeline[activeTimelineIdx];
        // Timeline returns flat objects with assessment fields directly on them
        const assessment = activeEntry?.overall_score != null ? activeEntry : null;
        const photoUrl = activeEntry?.photo_url || plant.latest_photo_url;
        const thumbUrl = activeEntry?.thumbnail_url || plant.latest_thumbnail_url;
        const type = (plant.type || 'default').toLowerCase();
        const gradientClass = `gradient-${['tree','herb','flower','vegetable','fruit','succulent'].includes(type) ? type : 'default'}`;

        // Hero
        let heroImgHTML;
        if (photoUrl || thumbUrl) {
            heroImgHTML = `<img src="${photoUrl || thumbUrl}" alt="${esc(plant.name)}">`;
        } else {
            heroImgHTML = `<div class="detail-hero-placeholder ${gradientClass}"><i data-lucide="${getPlantIcon(type)}"></i></div>`;
        }

        // Health dashboard
        let healthHTML = '';
        const score = assessment?.overall_score ?? plant.overall_health_score;
        const trend = assessment?.overall_trend || plant.health_trend;

        if (score != null) {
            const color = getScoreColor(score);
            const circumference = 2 * Math.PI * 58;
            healthHTML = `
                <div class="health-dashboard">
                    <div class="health-gauge">
                        <svg viewBox="0 0 140 140">
                            <circle class="health-gauge-bg" cx="70" cy="70" r="58"></circle>
                            <circle class="health-gauge-fill" cx="70" cy="70" r="58"
                                stroke="${color}"
                                stroke-dasharray="0 ${circumference}"
                                data-target="${(score / 100) * circumference} ${circumference}">
                            </circle>
                        </svg>
                        <div class="health-gauge-value">
                            <div class="health-gauge-number" data-target="${score}" style="color:${color}">0</div>
                            <div class="health-gauge-label">Health</div>
                        </div>
                    </div>
                    ${trend ? `<div class="health-trend-badge ${trend}">
                        ${trend === 'improving' ? '↑ Improving' : trend === 'declining' ? '↓ Declining' : '→ Stable'}
                    </div>` : ''}
                    ${renderDimensions(assessment)}
                </div>
            `;
        } else {
            healthHTML = `
                <div class="no-health-state">
                    <i data-lucide="scan-line"></i>
                    <h3>No Health Data Yet</h3>
                    <p>Upload a photo to get an AI health assessment</p>
                </div>
            `;
        }

        // AI Summary
        let aiHTML = '';
        if (assessment?.ai_summary) {
            aiHTML = `
                <div class="ai-summary">
                    <div class="ai-summary-label"><i data-lucide="sparkles"></i> AI Analysis</div>
                    ${esc(assessment.ai_summary)}
                </div>
            `;
        }

        // Recommendations
        let recsHTML = '';
        const recs = assessment?.ai_recommendations;
        if (recs && recs.length > 0) {
            recsHTML = `<div class="detail-section">
                <div class="detail-section-header">
                    <span class="detail-section-title"><i data-lucide="lightbulb"></i> Recommendations</span>
                </div>`;
            recs.forEach(r => {
                // Support both schemas: {urgency,action,description} and {priority,text,category}
                const rawUrgency = r.urgency || r.priority || 'routine';
                const urgencyMap = { high: 'urgent', medium: 'soon', low: 'routine', urgent: 'urgent', soon: 'soon', routine: 'routine' };
                const urgency = (urgencyMap[rawUrgency.toLowerCase()] || 'routine');
                const borderClass = urgency === 'urgent' ? 'urgent' : urgency === 'soon' ? 'soon' : 'routine';
                const title = r.action || r.title || r.category || 'Recommendation';
                const desc = r.description || r.text || '';
                const urgencyLabel = urgency === 'urgent' ? '🔴' : urgency === 'soon' ? '🟡' : '🟢';
                recsHTML += `
                    <div class="rec-card">
                        <div class="rec-card-border ${borderClass}"></div>
                        <div class="rec-card-content">
                            <div class="rec-card-title">${urgencyLabel} ${esc(title.charAt(0).toUpperCase() + title.slice(1))}</div>
                            <div class="rec-card-desc">${esc(desc)}</div>
                            ${r.product_link ? `<a class="rec-card-link" href="${esc(r.product_link)}" target="_blank"><i data-lucide="external-link"></i> Buy at Home Depot</a>` : ''}
                        </div>
                    </div>
                `;
            });
            recsHTML += '</div>';
        } else if (score != null) {
            recsHTML = `<div class="detail-section">
                <div class="detail-section-header">
                    <span class="detail-section-title"><i data-lucide="lightbulb"></i> Recommendations</span>
                </div>
                <div class="rec-empty">Looking great! No action needed 🌟</div>
            </div>`;
        }

        // Photo Timeline
        let timelineHTML = '';
        if (currentTimeline.length > 0) {
            timelineHTML = `<div class="detail-section">
                <div class="detail-section-header">
                    <span class="detail-section-title"><i data-lucide="images"></i> Photo Timeline</span>
                    ${currentTimeline.length >= 2 ? `<button class="btn btn-ghost growth-anim-btn" id="growthBtn" title="Growth Animation" style="font-size:12px;padding:4px 8px">🎬 Growth</button>` : ''}
                </div>
                <div class="photo-timeline" id="photoTimeline">`;
            currentTimeline.forEach((entry, i) => {
                const src = entry.thumbnail_url || entry.photo_url;
                const date = entry.taken_at ? formatDate(entry.taken_at) : '';
                timelineHTML += `
                    <div class="timeline-photo ${i === activeTimelineIdx ? 'active' : ''}" data-idx="${i}">
                        <img class="timeline-photo-img" src="${src}" alt="" loading="lazy">
                        <div class="timeline-photo-date">${date}</div>
                    </div>
                `;
            });
            timelineHTML += '</div>';

            // Comparison text
            if (activeTimelineIdx > 0 && currentTimeline[activeTimelineIdx]?.assessment && currentTimeline[activeTimelineIdx - 1]?.assessment) {
                const curr = currentTimeline[activeTimelineIdx].assessment.overall_score;
                const prev = currentTimeline[activeTimelineIdx - 1].assessment.overall_score;
                if (curr != null && prev != null) {
                    const diff = curr - prev;
                    const cls = diff > 0 ? 'comparison-positive' : diff < 0 ? 'comparison-negative' : 'comparison-neutral';
                    const sign = diff > 0 ? '+' : '';
                    timelineHTML += `<div class="timeline-comparison ${cls}">vs. previous: ${sign}${diff} overall</div>`;
                }
            }
            timelineHTML += '</div>';
        }

        // Care Log
        let logHTML = `<div class="detail-section">
            <div class="detail-section-header">
                <span class="detail-section-title"><i data-lucide="clipboard-list"></i> Care Log</span>
                <button class="btn btn-ghost" id="addLogBtn" style="font-size:12px;padding:4px 8px"><i data-lucide="plus" style="width:14px;height:14px"></i> Add</button>
            </div>`;
        if (currentLogs.length > 0) {
            currentLogs.slice(0, 10).forEach(log => {
                const iconClass = getLogIconClass(log.type || log.type);
                const actionLabel = capitalize(log.type || log.type || 'Note');
                logHTML += `
                    <div class="care-log-item">
                        <div class="care-log-icon ${iconClass}">${getLogEmoji(log.type || log.type)}</div>
                        <div class="care-log-content">
                            <div class="care-log-action">${esc(actionLabel)}</div>
                            ${log.notes ? `<div class="care-log-notes">${esc(log.notes)}</div>` : ''}
                        </div>
                        <div class="care-log-date">${log.logged_at ? formatRelativeDate(log.logged_at) : ''}</div>
                    </div>
                `;
            });
        } else {
            logHTML += '<div class="care-log-empty">No care actions logged yet</div>';
        }
        logHTML += '</div>';

        // Plant meta
        const metaParts = [];
        if (plant.zone_name) metaParts.push(`<span><i data-lucide="map"></i> ${esc(plant.zone_name)}</span>`);
        if (plant.type) metaParts.push(`<span><i data-lucide="tag"></i> ${esc(plant.type)}</span>`);
        if (plant.location) metaParts.push(`<span><i data-lucide="map-pin"></i> ${esc(plant.location)}</span>`);
        if (plant.sunlight) metaParts.push(`<span><i data-lucide="sun"></i> ${esc(plant.sunlight)}</span>`);

        panel.innerHTML = `
            <div class="detail-hero">
                ${heroImgHTML}
                <button class="detail-back" id="detailBackBtn"><i data-lucide="arrow-left"></i></button>
                <div class="detail-actions-top">
                    <button id="editPlantBtn" title="Edit"><i data-lucide="pencil"></i></button>
                    <button id="deletePlantBtn" title="Delete"><i data-lucide="trash-2"></i></button>
                </div>
                <div class="detail-hero-overlay">
                    <div class="detail-hero-name">${esc(plant.name)}</div>
                    ${plant.species ? `<div class="detail-hero-species">${esc(plant.species)}</div>` : ''}
                    ${metaParts.length ? `<div class="detail-hero-meta">${metaParts.join('')}</div>` : ''}
                </div>
            </div>
            <div class="detail-body">
                ${aiHTML}
                ${healthHTML}
                ${recsHTML}
                ${timelineHTML}
                ${logHTML}
            </div>
        `;

        // Quick action bar
        qbar.innerHTML = `
            <div class="quick-actions-row">
                <button class="quick-act-btn" id="qPhoto"><span class="emoji">📸</span>Photo</button>
                <button class="quick-act-btn" id="qWater"><span class="emoji">💧</span>Water</button>
                <button class="quick-act-btn" id="qPrune"><span class="emoji">✂️</span>Prune</button>
                <button class="quick-act-btn" id="qFertilize"><span class="emoji">🌿</span>Fertilize</button>
            </div>
        `;

        lucide.createIcons();
        bindDetailEvents();
        animateHealthGauge();
    }

    function renderDimensions(assessment) {
        if (!assessment) return '';
        const dims = [
            { key: 'leaf_health', label: 'Leaf Health' },
            { key: 'hydration_level', label: 'Hydration' },
            { key: 'pest_damage', label: 'Pest Resistance' },
            { key: 'disease_signs', label: 'Disease Free' },
            { key: 'growth_vigor', label: 'Growth Vigor' },
            { key: 'fruit_status', label: 'Fruit Status' },
        ];
        const visible = dims.filter(d => assessment[d.key] != null);
        if (visible.length === 0) return '';

        let html = '<div class="health-dimensions">';
        visible.forEach(d => {
            const val = assessment[d.key];
            const color = getScoreColor(val);
            html += `
                <div class="health-dim">
                    <div class="health-dim-header">
                        <span class="health-dim-label">${d.label}</span>
                        <span class="health-dim-score" style="color:${color}">${val}</span>
                    </div>
                    <div class="health-dim-bar">
                        <div class="health-dim-bar-fill" style="background:${color}" data-width="${val}%"></div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    // ─── Animate Health Gauge ───
    function animateHealthGauge() {
        // Animate SVG stroke
        const fillEl = document.querySelector('.health-gauge-fill');
        if (fillEl) {
            const target = fillEl.dataset.target;
            requestAnimationFrame(() => {
                setTimeout(() => { fillEl.setAttribute('stroke-dasharray', target); }, 50);
            });
        }

        // Animate number countup
        const numEl = document.querySelector('.health-gauge-number');
        if (numEl) {
            const target = parseInt(numEl.dataset.target) || 0;
            animateCountUp(numEl, 0, target, 1000);
        }

        // Animate dimension bars
        document.querySelectorAll('.health-dim-bar-fill').forEach(bar => {
            const w = bar.dataset.width;
            requestAnimationFrame(() => {
                setTimeout(() => { bar.style.width = w; }, 100);
            });
        });
    }

    function animateCountUp(el, from, to, duration) {
        const start = performance.now();
        function frame(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.round(from + (to - from) * eased);
            el.textContent = current;
            if (progress < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // ─── Detail Event Bindings ───
    function bindDetailEvents() {
        document.getElementById('detailBackBtn')?.addEventListener('click', closeDetail);
        document.getElementById('detailBackdrop')?.addEventListener('click', closeDetail);

        // Timeline photo clicks — open lightbox
        document.querySelectorAll('.timeline-photo').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx);
                activeTimelineIdx = idx;
                renderDetail();
                openGardenLightbox(currentTimeline, idx);
            });
        });

        // Hero image click — open lightbox at active photo
        const heroImg = document.querySelector('.detail-hero img');
        if (heroImg) {
            heroImg.style.cursor = 'pointer';
            heroImg.addEventListener('click', () => {
                if (currentTimeline.length > 0) {
                    openGardenLightbox(currentTimeline, activeTimelineIdx);
                }
            });
        }

        // Quick actions
        document.getElementById('qPhoto')?.addEventListener('click', () => triggerPhotoUpload());
        document.getElementById('qWater')?.addEventListener('click', () => logCareAction('water'));
        document.getElementById('qPrune')?.addEventListener('click', () => logCareAction('prune'));
        document.getElementById('qFertilize')?.addEventListener('click', () => logCareAction('fertilize'));

        // Add log
        document.getElementById('addLogBtn')?.addEventListener('click', openAddLogModal);

        // Edit plant
        document.getElementById('editPlantBtn')?.addEventListener('click', () => openEditPlantModal());

        // Delete plant
        document.getElementById('deletePlantBtn')?.addEventListener('click', () => confirmDeletePlant());

        // Growth animation
        document.getElementById('growthBtn')?.addEventListener('click', openGrowthAnimation);
    }

    // ─── Photo Upload ───
    function triggerPhotoUpload() {
        const input = document.getElementById('photoUploadInput');
        input.onchange = async () => {
            const file = input.files[0];
            if (!file || !currentPlant) return;
            const fd = new FormData();
            fd.append('photo', file);
            try {
                showToast('Uploading photo...', 'success');
                const res = await fetch(`/api/garden/plants/${currentPlant.id}/photos`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    body: fd,
                });
                if (!res.ok) throw new Error('Upload failed');
                showToast('Photo uploaded! ✓');
                // Refresh
                await refreshPlantDetail();
            } catch (err) {
                showToast(err.message, 'error');
            }
            input.value = '';
        };
        input.click();
    }

    // ─── Log Care Action ───
    async function logCareAction(type) {
        if (!currentPlant) return;
        try {
            await API.post(`/garden/plants/${currentPlant.id}/logs`, { type: type });
            showToast(`${capitalize(type)} logged ✓`);
            currentLogs = await API.get(`/garden/plants/${currentPlant.id}/logs`).catch(() => []);
            renderDetail();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ─── Add Log Modal ───
    function openAddLogModal() {
        createModal({
            title: '📝 Log Care Action',
            bodyHTML: `
                <div class="form-group">
                    <label>Action Type</label>
                    <select class="form-input" name="type">
                        <option value="water">💧 Water</option>
                        <option value="fertilize">🌿 Fertilize</option>
                        <option value="prune">✂️ Prune</option>
                        <option value="repot">🪴 Repot</option>
                        <option value="pest_treatment">🐛 Pest Treatment</option>
                        <option value="harvest">🍎 Harvest</option>
                        <option value="other">📋 Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Notes (optional)</label>
                    <textarea class="form-input" name="notes" rows="3" placeholder="Any details..."></textarea>
                </div>
            `,
            submitLabel: 'Log Action',
            async onSubmit(modal) {
                const type = modal.querySelector('[name="type"]').value;
                const notes = modal.querySelector('[name="notes"]').value.trim();
                await API.post(`/garden/plants/${currentPlant.id}/logs`, { type, notes: notes || undefined });
                showToast(`${capitalize(type)} logged ✓`);
                currentLogs = await API.get(`/garden/plants/${currentPlant.id}/logs`).catch(() => []);
                renderDetail();
            },
        });
    }

    // ─── Add Plant Modal ───
    function openAddPlantModal() {
        let selectedFile = null;
        const modal = createModal({
            title: '🌱 Add New Plant',
            bodyHTML: `
                <div class="form-group">
                    <label>Name *</label>
                    <input class="form-input" name="name" placeholder="e.g. Meyer Lemon Tree" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Species</label>
                        <input class="form-input" name="species" placeholder="e.g. Citrus × meyeri">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select class="form-input" name="type">
                            <option value="">Select...</option>
                            <option value="fruit_tree">Fruit Tree</option>
                            <option value="vegetable">Vegetable</option>
                            <option value="herb">Herb</option>
                            <option value="flower">Flower</option>
                            <option value="succulent">Succulent</option>
                            <option value="shrub">Shrub</option>
                            <option value="vine">Vine</option>
                            <option value="houseplant">Houseplant</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Location</label>
                        <input class="form-input" name="location" placeholder="e.g. Backyard">
                    </div>
                    <div class="form-group">
                        <label>Sunlight</label>
                        <select class="form-input" name="sunlight">
                            <option value="">Select...</option>
                            <option value="Full Sun">Full Sun</option>
                            <option value="Partial Sun">Partial Sun</option>
                            <option value="Partial Shade">Partial Shade</option>
                            <option value="Full Shade">Full Shade</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Planted Date</label>
                        <input class="form-input" name="planted_date" type="date">
                    </div>
                    <div class="form-group">
                        <label>Zone</label>
                        <select class="form-input" name="zone_id">
                            <option value="">No zone</option>
                            ${zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Photo</label>
                    <div class="photo-upload-area" id="addPlantPhotoArea">
                        <i data-lucide="camera"></i>
                        <div>Tap to add a photo</div>
                    </div>
                    <input type="file" id="addPlantPhotoInput" accept="image/*" style="display:none">
                </div>
            `,
            submitLabel: 'Add Plant',
            async onSubmit(modal) {
                const name = modal.querySelector('[name="name"]').value.trim();
                if (!name) throw new Error('Plant name is required');
                const zoneVal = modal.querySelector('[name="zone_id"]')?.value;
                const body = {
                    name,
                    species: modal.querySelector('[name="species"]').value.trim() || undefined,
                    type: modal.querySelector('[name="type"]').value || undefined,
                    location: modal.querySelector('[name="location"]').value.trim() || undefined,
                    sunlight: modal.querySelector('[name="sunlight"]').value || undefined,
                    planted_date: modal.querySelector('[name="planted_date"]').value || undefined,
                    zone_id: zoneVal ? parseInt(zoneVal) : undefined,
                };
                const newPlant = await API.post('/garden/plants', body);
                // Upload photo if selected
                if (selectedFile && newPlant?.id) {
                    const fd = new FormData();
                    fd.append('photo', selectedFile);
                    await fetch(`/api/garden/plants/${newPlant.id}/photos`, {
                        method: 'POST',
                        credentials: 'same-origin',
                        body: fd,
                    });
                }
                showToast('Plant added! 🌱');
                await loadPlants();
            },
        });

        // Photo upload binding
        setTimeout(() => {
            const area = document.getElementById('addPlantPhotoArea');
            const input = document.getElementById('addPlantPhotoInput');
            if (area && input) {
                area.addEventListener('click', () => input.click());
                input.addEventListener('change', () => {
                    if (input.files[0]) {
                        selectedFile = input.files[0];
                        area.classList.add('has-file');
                        area.innerHTML = `<i data-lucide="check-circle"></i><div>${esc(selectedFile.name)}</div>`;
                        lucide.createIcons();
                    }
                });
            }
        }, 100);
    }

    // ─── Edit Plant Modal ───
    function openEditPlantModal() {
        const p = currentPlant;
        if (!p) return;
        createModal({
            title: '✏️ Edit Plant',
            bodyHTML: `
                <div class="form-group">
                    <label>Name *</label>
                    <input class="form-input" name="name" value="${esc(p.name || '')}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Species</label>
                        <input class="form-input" name="species" value="${esc(p.species || '')}">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select class="form-input" name="type">
                            <option value="">Select...</option>
                            ${['fruit_tree','vegetable','herb','flower','succulent','shrub','vine','houseplant','other'].map(t =>
                                `<option value="${t}" ${p.type === t ? 'selected' : ''}>${t === 'fruit_tree' ? 'Fruit Tree' : capitalize(t)}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Location</label>
                        <input class="form-input" name="location" value="${esc(p.location || '')}">
                    </div>
                    <div class="form-group">
                        <label>Sunlight</label>
                        <select class="form-input" name="sunlight">
                            <option value="">Select...</option>
                            ${['Full Sun','Partial Sun','Partial Shade','Full Shade'].map(s =>
                                `<option value="${s}" ${p.sunlight === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Zone</label>
                    <select class="form-input" name="zone_id">
                        <option value="">No zone</option>
                        ${zones.map(z => `<option value="${z.id}" ${p.zone_id === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
                    </select>
                </div>
            `,
            submitLabel: 'Save Changes',
            async onSubmit(modal) {
                const name = modal.querySelector('[name="name"]').value.trim();
                if (!name) throw new Error('Name is required');
                const zoneVal = modal.querySelector('[name="zone_id"]').value;
                await API.put(`/garden/plants/${p.id}`, {
                    name,
                    species: modal.querySelector('[name="species"]').value.trim() || null,
                    type: modal.querySelector('[name="type"]').value || null,
                    location: modal.querySelector('[name="location"]').value.trim() || null,
                    sunlight: modal.querySelector('[name="sunlight"]').value || null,
                    zone_id: zoneVal ? parseInt(zoneVal) : null,
                });
                showToast('Plant updated ✓');
                // Refresh
                plants = await API.get('/garden/plants') || [];
                currentPlant = plants.find(pp => pp.id === p.id) || currentPlant;
                Object.assign(currentPlant, plants.find(pp => pp.id === p.id) || {});
                renderPlantGrid();
                renderDetail();
            },
        });
    }

    // ─── Delete Plant ───
    function confirmDeletePlant() {
        if (!currentPlant) return;
        createModal({
            title: '🗑️ Delete Plant',
            bodyHTML: `
                <p style="font-size:14px;color:var(--text-secondary);line-height:1.6">
                    Are you sure you want to delete <strong>${esc(currentPlant.name)}</strong>? 
                    This will remove all photos, health data, and care logs. This cannot be undone.
                </p>
            `,
            submitLabel: 'Delete',
            async onSubmit() {
                await API.delete(`/garden/plants/${currentPlant.id}`);
                showToast('Plant deleted');
                closeDetail();
                await loadPlants();
            },
        });
        // Make submit button red
        setTimeout(() => {
            const btn = document.querySelector('.modal-submit-btn');
            if (btn) {
                btn.style.background = 'var(--red)';
                btn.style.borderColor = 'var(--red)';
            }
        }, 50);
    }

    // ─── Refresh Plant Detail ───
    async function refreshPlantDetail() {
        if (!currentPlant) return;
        plants = await API.get('/garden/plants').catch(() => plants);
        const updated = plants.find(p => p.id === currentPlant.id);
        if (updated) currentPlant = updated;
        currentTimeline = await API.get(`/garden/plants/${currentPlant.id}/timeline`).catch(() => []);
        currentLogs = await API.get(`/garden/plants/${currentPlant.id}/logs`).catch(() => []);
        activeTimelineIdx = 0;
        renderPlantGrid();
        renderDetail();
    }

    // ─── Sort Button ───
    document.getElementById('sortBtn')?.addEventListener('click', () => {
        const modes = ['attention', 'alpha', 'health'];
        const labels = ['Needs Attention', 'A–Z', 'Health Score'];
        const idx = modes.indexOf(sortMode);
        sortMode = modes[(idx + 1) % modes.length];
        showToast(`Sort: ${labels[(idx + 1) % modes.length]}`);
        renderPlantGrid();
    });

    // ─── Add Plant Button ───
    document.getElementById('addPlantBtnTop')?.addEventListener('click', openAddPlantModal);

    // ─── Keyboard shortcut: Escape to close detail ───
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('detailOverlay').classList.contains('open')) {
            // Don't close if a modal is open
            if (!document.querySelector('.modal-backdrop.visible')) {
                closeDetail();
            }
        }
    });

    // ─── Garden Photo Lightbox (Dual-Layer) ───
    let glbPhotos = [];
    let glbIndex = 0;
    let glbControlsVisible = true;
    let glbActiveLayerId = 'A';
    let glbZoomScale = 1, glbZoomX = 0, glbZoomY = 0;
    let glbIsAnimating = false;

    function glbGetActiveLayer() { return document.getElementById('glbLayer' + glbActiveLayerId); }
    function glbGetBackLayer() { return document.getElementById('glbLayer' + (glbActiveLayerId === 'A' ? 'B' : 'A')); }
    function glbGetActiveImg() { return document.getElementById('glbImg' + glbActiveLayerId); }
    function glbGetBackImg() { return document.getElementById('glbImg' + (glbActiveLayerId === 'A' ? 'B' : 'A')); }

    function glbPhotoSrc(idx) {
        if (idx < 0 || idx >= glbPhotos.length) return '';
        const p = glbPhotos[idx];
        return p.photo_url || p.thumbnail_url || '';
    }

    function glbResetLayers() {
        const active = glbGetActiveLayer();
        const back = glbGetBackLayer();
        active.style.transition = 'none';
        active.style.transform = '';
        active.style.visibility = 'visible';
        active.style.zIndex = '2';
        back.style.transition = 'none';
        back.style.transform = '';
        back.style.visibility = 'hidden';
        back.style.zIndex = '1';
    }

    function glbApplyZoom(animate) {
        const w = glbGetActiveLayer();
        if (!w) return;
        w.style.transition = animate ? 'transform 0.25s ease' : 'none';
        if (glbZoomScale <= 1) { glbZoomScale = 1; glbZoomX = 0; glbZoomY = 0; }
        w.style.transform = `translate(${glbZoomX}px, ${glbZoomY}px) scale(${glbZoomScale})`;
    }
    function glbResetZoom() { glbZoomScale = 1; glbZoomX = 0; glbZoomY = 0; glbApplyZoom(true); }
    function glbIsZoomed() { return glbZoomScale > 1.05; }

    function openGardenLightbox(photos, startIndex) {
        glbPhotos = photos;
        glbIndex = startIndex || 0;
        glbActiveLayerId = 'A';
        glbZoomScale = 1; glbZoomX = 0; glbZoomY = 0;
        glbIsAnimating = false;
        glbResetLayers();
        const lb = document.getElementById('gardenLightbox');
        lb.classList.add('active');
        lb.classList.remove('controls-hidden');
        lb.style.background = '';
        glbControlsVisible = true;
        document.body.style.overflow = 'hidden';
        glbGetActiveImg().src = glbPhotoSrc(glbIndex);
        updateGardenLightboxUI();
        // Preload neighbors
        if (glbIndex > 0) { const i = new Image(); i.src = glbPhotoSrc(glbIndex - 1); }
        if (glbIndex < glbPhotos.length - 1) { const i = new Image(); i.src = glbPhotoSrc(glbIndex + 1); }
        lucide.createIcons({ attrs: { class: 'lucide' } });
    }

    function closeGardenLightbox() {
        const lb = document.getElementById('gardenLightbox');
        lb.classList.remove('active');
        lb.style.background = '';
        document.body.style.overflow = '';
    }

    function updateGardenLightboxUI() {
        const photo = glbPhotos[glbIndex];
        if (!photo) return;
        document.getElementById('glbTitle').textContent = currentPlant?.name || '';
        document.getElementById('glbDate').textContent = photo.taken_at ? formatDate(photo.taken_at) : '';
        const counter = document.getElementById('glbCounter');
        if (glbPhotos.length <= 20) {
            counter.innerHTML = glbPhotos.map((_, i) =>
                `<div class="garden-lightbox-dot ${i === glbIndex ? 'active' : ''}"></div>`
            ).join('');
        } else {
            counter.innerHTML = `<span style="color:#fff;font-size:13px">${glbIndex + 1} / ${glbPhotos.length}</span>`;
        }
        document.getElementById('glbPrev').style.display = glbIndex > 0 ? '' : 'none';
        document.getElementById('glbNext').style.display = glbIndex < glbPhotos.length - 1 ? '' : 'none';
    }

    function glbNavigate(dir) {
        const next = glbIndex + dir;
        if (next < 0 || next >= glbPhotos.length || glbIsAnimating) return;
        glbIsAnimating = true;
        const vw = window.innerWidth;
        const active = glbGetActiveLayer();
        const back = glbGetBackLayer();
        // Prepare back layer with next photo
        glbGetBackImg().src = glbPhotoSrc(next);
        back.style.transition = 'none';
        back.style.transform = `translateX(${dir > 0 ? vw : -vw}px)`;
        back.style.visibility = 'visible';
        back.style.zIndex = '1';
        // Force reflow
        back.offsetWidth;
        // Animate
        active.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
        active.style.transform = `translateX(${dir > 0 ? -vw : vw}px)`;
        back.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
        back.style.transform = 'translateX(0px)';
        setTimeout(() => {
            glbActiveLayerId = glbActiveLayerId === 'A' ? 'B' : 'A';
            const newBack = glbGetBackLayer();
            newBack.style.transition = 'none';
            newBack.style.transform = '';
            newBack.style.visibility = 'hidden';
            newBack.style.zIndex = '1';
            const newActive = glbGetActiveLayer();
            newActive.style.zIndex = '2';
            glbIndex = next;
            glbZoomScale = 1; glbZoomX = 0; glbZoomY = 0;
            updateGardenLightboxUI();
            // Preload neighbors
            if (next > 0) { const i = new Image(); i.src = glbPhotoSrc(next - 1); }
            if (next < glbPhotos.length - 1) { const i = new Image(); i.src = glbPhotoSrc(next + 1); }
            glbIsAnimating = false;
        }, 310);
    }

    // Touch handling — dual-layer swipe, pinch-to-zoom, double-tap, swipe-to-dismiss
    (function initGlbTouch() {
        const body = document.getElementById('glbBody');
        let touchStartX = 0, touchStartY = 0, isDraggingDown = false, swipeDX = 0, swipeLocked = '';
        let pinchStartDist = 0, pinchStartScale = 1;
        let isPinching = false, lastTap = 0;

        function pinchDist(t) { return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY); }

        body.addEventListener('touchstart', e => {
            if (glbIsAnimating) return;
            if (e.touches.length === 2) {
                e.preventDefault();
                isPinching = true;
                pinchStartDist = pinchDist(e.touches);
                pinchStartScale = glbZoomScale;
            } else if (e.touches.length === 1) {
                isPinching = false;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isDraggingDown = false;
                swipeDX = 0;
                swipeLocked = '';
            }
        }, { passive: false });

        body.addEventListener('touchmove', e => {
            if (glbIsAnimating) return;
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = pinchDist(e.touches);
                glbZoomScale = Math.min(5, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
                glbApplyZoom(false);
                return;
            }
            if (isPinching || e.touches.length !== 1) return;

            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;

            if (glbIsZoomed()) {
                e.preventDefault();
                glbZoomX += dx; glbZoomY += dy;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                glbApplyZoom(false);
                return;
            }

            if (!swipeLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
                swipeLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            }

            if (swipeLocked === 'x') {
                e.preventDefault();
                swipeDX = dx;
                const active = glbGetActiveLayer();
                const back = glbGetBackLayer();
                const atStart = glbIndex === 0 && dx > 0;
                const atEnd = glbIndex === glbPhotos.length - 1 && dx < 0;
                const atEdge = atStart || atEnd;
                const moveDX = atEdge ? dx * 0.25 : dx;

                active.style.transition = 'none';
                active.style.transform = `translateX(${moveDX}px)`;

                if (!atEdge) {
                    const nextIdx = dx > 0 ? glbIndex - 1 : glbIndex + 1;
                    const backImg = glbGetBackImg();
                    const src = glbPhotoSrc(nextIdx);
                    if (src && !backImg.src.endsWith(src)) backImg.src = src;
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
                const active = glbGetActiveLayer();
                active.style.transition = 'none';
                active.style.transform = `translateY(${dy}px) scale(${1 - dy * 0.001})`;
                const opacity = Math.max(0, 1 - dy / 300);
                document.getElementById('gardenLightbox').style.background = `rgba(0,0,0,${0.95 * opacity})`;
            }
        }, { passive: false });

        body.addEventListener('touchend', e => {
            if (glbIsAnimating) return;
            if (isPinching) {
                if (e.touches.length < 2) { isPinching = false; if (glbZoomScale < 1.1) glbResetZoom(); }
                return;
            }

            const dy = e.changedTouches[0].clientY - touchStartY;
            if (glbIsZoomed()) return;

            const active = glbGetActiveLayer();
            const back = glbGetBackLayer();

            // Dismiss
            if (isDraggingDown && dy > 120) { closeGardenLightbox(); return; }
            if (isDraggingDown) {
                active.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
                active.style.transform = '';
                document.getElementById('gardenLightbox').style.background = '';
                return;
            }

            const THRESHOLD = 50;
            if (swipeLocked === 'x' && Math.abs(swipeDX) > THRESHOLD) {
                const nextIdx = swipeDX > 0 ? glbIndex - 1 : glbIndex + 1;
                if (nextIdx >= 0 && nextIdx < glbPhotos.length) {
                    glbIsAnimating = true;
                    const dir = swipeDX > 0 ? 1 : -1;
                    const vw = window.innerWidth;
                    active.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
                    active.style.transform = `translateX(${dir * vw}px)`;
                    back.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
                    back.style.transform = 'translateX(0px)';
                    setTimeout(() => {
                        glbActiveLayerId = glbActiveLayerId === 'A' ? 'B' : 'A';
                        const newBack = glbGetBackLayer();
                        newBack.style.transition = 'none';
                        newBack.style.transform = '';
                        newBack.style.visibility = 'hidden';
                        newBack.style.zIndex = '1';
                        const newActive = glbGetActiveLayer();
                        newActive.style.zIndex = '2';
                        glbIndex = nextIdx;
                        glbZoomScale = 1; glbZoomX = 0; glbZoomY = 0;
                        updateGardenLightboxUI();
                        if (nextIdx > 0) { const i = new Image(); i.src = glbPhotoSrc(nextIdx - 1); }
                        if (nextIdx < glbPhotos.length - 1) { const i = new Image(); i.src = glbPhotoSrc(nextIdx + 1); }
                        glbIsAnimating = false;
                    }, 310);
                    swipeDX = 0;
                    return;
                }
            }

            // Snap back
            active.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
            active.style.transform = '';
            back.style.transition = 'transform 0.3s cubic-bezier(.25,.46,.45,.94)';
            back.style.transform = `translateX(${swipeDX > 0 ? '-' : ''}100vw)`;
            setTimeout(() => { back.style.visibility = 'hidden'; }, 310);
            swipeDX = 0;
        }, { passive: true });

        // Double-tap to zoom
        body.addEventListener('touchend', e => {
            if (glbIsAnimating || isPinching || e.touches.length > 0) return;
            const now = Date.now();
            if (now - lastTap < 300) {
                if (glbIsZoomed()) { glbResetZoom(); }
                else {
                    glbZoomScale = 2.5;
                    const rect = body.getBoundingClientRect();
                    const tapX = e.changedTouches[0].clientX - rect.left - rect.width / 2;
                    const tapY = e.changedTouches[0].clientY - rect.top - rect.height / 2;
                    glbZoomX = -tapX * 0.6; glbZoomY = -tapY * 0.6;
                    glbApplyZoom(true);
                }
                lastTap = 0;
                return;
            }
            lastTap = now;
        }, { passive: true });

        // Click to toggle controls
        body.addEventListener('click', (e) => {
            if (e.target.closest('.garden-lightbox-nav')) return;
            glbControlsVisible = !glbControlsVisible;
            document.getElementById('gardenLightbox').classList.toggle('controls-hidden', !glbControlsVisible);
        });
    })();

    // Lightbox button events
    document.getElementById('glbClose').addEventListener('click', closeGardenLightbox);
    document.getElementById('glbPrev').addEventListener('click', () => glbNavigate(-1));
    document.getElementById('glbNext').addEventListener('click', () => glbNavigate(1));

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('gardenLightbox').classList.contains('active')) {
            closeGardenLightbox();
        } else if (e.key === 'ArrowLeft' && document.getElementById('gardenLightbox').classList.contains('active')) {
            glbNavigate(-1);
        } else if (e.key === 'ArrowRight' && document.getElementById('gardenLightbox').classList.contains('active')) {
            glbNavigate(1);
        }
    });

    // ─── Growth Animation ───
    let growthTimer = null;
    let growthIdx = 0;
    let growthPlaying = false;
    let growthPhotos = [];

    function openGrowthAnimation() {
        if (!currentPlant || currentTimeline.length < 2) {
            showToast('Need at least 2 photos for growth animation', 'error');
            return;
        }
        growthPhotos = currentTimeline.filter(e => e.photo_url || e.thumbnail_url).slice().reverse();
        if (growthPhotos.length < 2) {
            showToast('Need at least 2 photos for growth animation', 'error');
            return;
        }
        growthIdx = 0;
        growthPlaying = true;
        const overlay = document.getElementById('growthOverlay');
        overlay.classList.add('active');
        document.getElementById('growthPlantName').textContent = currentPlant.name;
        document.getElementById('growthSummary').classList.add('hidden');
        document.body.style.overflow = 'hidden';
        const canvas = document.getElementById('growthCanvas');
        canvas.innerHTML = '';
        lucide.createIcons({ attrs: { class: 'lucide' } });
        showGrowthFrame(0);
        scheduleGrowthNext();
    }

    function closeGrowthAnimation() {
        clearTimeout(growthTimer);
        growthPlaying = false;
        document.getElementById('growthOverlay').classList.remove('active');
        document.body.style.overflow = '';
    }

    function showGrowthFrame(idx) {
        growthIdx = idx;
        const photo = growthPhotos[idx];
        const canvas = document.getElementById('growthCanvas');
        const src = photo.photo_url || photo.thumbnail_url || '';

        // Growth-overlap effect: previous photo fades to ghost while new one emerges
        // This creates a visual "transformation" showing the plant changing
        const isFirst = idx === 0;
        const progress = growthPhotos.length > 1 ? idx / (growthPhotos.length - 1) : 1;

        // Mark all existing frames as "previous" — they'll fade to ghost opacity
        const oldFrames = canvas.querySelectorAll('.growth-frame');
        oldFrames.forEach(f => {
            f.classList.add('growth-frame-ghost');
            // Remove after transition
            setTimeout(() => f.remove(), 1200);
        });

        // Create new frame
        const div = document.createElement('div');
        div.className = 'growth-frame growth-frame-enter';
        // Start slightly zoomed out for growth feel, zoom in over time
        const startScale = 1.0 + (progress * 0.08); // slightly more zoomed as plant grows
        const endScale = startScale + 0.1;
        const panX = (idx % 2 === 0 ? -1 : 1) * (8 + Math.random() * 8);
        const panY = -5 + Math.random() * 10;
        div.innerHTML = `<img src="${src}" alt="" style="transform: scale(${startScale}) translate(${panX}px, ${panY}px)">`;
        canvas.appendChild(div);

        // Force reflow then animate in
        div.offsetWidth;
        div.classList.remove('growth-frame-enter');
        div.classList.add('growth-frame-active');

        const img = div.querySelector('img');
        requestAnimationFrame(() => {
            img.style.transition = 'transform 3s ease-out';
            img.style.transform = `scale(${endScale}) translate(${panX * 0.5}px, ${panY * 0.5}px)`;
        });
        // Update date
        document.getElementById('growthDate').textContent = photo.taken_at ? formatDate(photo.taken_at) : '';
        // Update progress
        const pct = growthPhotos.length > 1 ? (idx / (growthPhotos.length - 1)) * 100 : 100;
        document.getElementById('growthProgressFill').style.width = pct + '%';
        // Update play button icon
        const btn = document.getElementById('growthPlayBtn');
        btn.innerHTML = growthPlaying ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
        lucide.createIcons({ attrs: { class: 'lucide' } });
    }

    function scheduleGrowthNext() {
        clearTimeout(growthTimer);
        if (!growthPlaying) return;
        growthTimer = setTimeout(() => {
            if (growthIdx < growthPhotos.length - 1) {
                showGrowthFrame(growthIdx + 1);
                scheduleGrowthNext();
            } else {
                // Show summary
                growthPlaying = false;
                const first = growthPhotos[0];
                const last = growthPhotos[growthPhotos.length - 1];
                const firstDate = first.taken_at ? formatDate(first.taken_at) : '?';
                const lastDate = last.taken_at ? formatDate(last.taken_at) : '?';
                const summary = document.getElementById('growthSummary');
                summary.innerHTML = `🌱 ${esc(currentPlant?.name || '')} — ${firstDate} to ${lastDate} — ${growthPhotos.length} photos`;
                summary.classList.remove('hidden');
                const btn = document.getElementById('growthPlayBtn');
                btn.innerHTML = '<i data-lucide="rotate-ccw"></i>';
                lucide.createIcons({ attrs: { class: 'lucide' } });
            }
        }, 3000);
    }

    document.getElementById('growthClose').addEventListener('click', closeGrowthAnimation);
    document.getElementById('growthPlayBtn').addEventListener('click', () => {
        if (growthIdx >= growthPhotos.length - 1 && !growthPlaying) {
            // Replay
            growthPlaying = true;
            document.getElementById('growthSummary').classList.add('hidden');
            document.getElementById('growthCanvas').innerHTML = '';
            showGrowthFrame(0);
            scheduleGrowthNext();
        } else {
            growthPlaying = !growthPlaying;
            if (growthPlaying) {
                scheduleGrowthNext();
            } else {
                clearTimeout(growthTimer);
            }
            const btn = document.getElementById('growthPlayBtn');
            btn.innerHTML = growthPlaying ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
            lucide.createIcons({ attrs: { class: 'lucide' } });
        }
    });

    // ─── Zone Manager ───
    function openZoneManager() {
        let html = '<div class="zone-manager">';
        zones.forEach(z => {
            const plantCount = plants.filter(p => p.zone_id === z.id).length;
            html += `<div class="zone-manager-item" data-zone-id="${z.id}">
                <div class="zone-manager-info">
                    ${z.thumbnail_url ? `<img class="zone-manager-thumb" src="${esc(z.thumbnail_url)}" alt="">` : `<div class="zone-manager-thumb-empty"><i data-lucide="map"></i></div>`}
                    <div>
                        <div class="zone-manager-name">${esc(z.name)}</div>
                        <div class="zone-manager-count">${plantCount} plant${plantCount !== 1 ? 's' : ''}</div>
                    </div>
                </div>
                <div class="zone-manager-actions">
                    <button class="btn btn-ghost zone-photo-btn" data-zone-id="${z.id}" title="Photo"><i data-lucide="camera" style="width:14px;height:14px"></i></button>
                    <button class="btn btn-ghost zone-edit-btn" data-zone-id="${z.id}" title="Edit"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
                    <button class="btn btn-ghost zone-delete-btn" data-zone-id="${z.id}" data-plant-count="${plantCount}" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
                </div>
            </div>`;
        });
        html += '</div>';
        html += `<button class="btn btn-primary" id="addZoneBtn" style="width:100%;margin-top:12px"><i data-lucide="plus" style="width:14px;height:14px"></i> Add Zone</button>`;

        const modal = createModal({
            title: '🗺️ Manage Zones',
            bodyHTML: html,
            submitLabel: null,
        });

        setTimeout(() => {
            lucide.createIcons();

            document.getElementById('addZoneBtn')?.addEventListener('click', () => {
                document.querySelector('.modal-backdrop')?.click();
                openAddZoneModal();
            });

            document.querySelectorAll('.zone-edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const z = zones.find(zz => zz.id == btn.dataset.zoneId);
                    if (!z) return;
                    document.querySelector('.modal-backdrop')?.click();
                    openEditZoneModal(z);
                });
            });

            document.querySelectorAll('.zone-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const z = zones.find(zz => zz.id == btn.dataset.zoneId);
                    if (!z) return;
                    const cnt = parseInt(btn.dataset.plantCount) || 0;
                    document.querySelector('.modal-backdrop')?.click();
                    confirmDeleteZone(z, cnt);
                });
            });

            document.querySelectorAll('.zone-photo-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const zId = btn.dataset.zoneId;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                        const file = input.files[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('photo', file);
                        try {
                            await fetch(`/api/garden/zones/${zId}/photo`, { method: 'POST', credentials: 'same-origin', body: fd });
                            showToast('Zone photo updated ✓');
                            await loadZones();
                            document.querySelector('.modal-backdrop')?.click();
                            openZoneManager();
                        } catch (err) { showToast(err.message, 'error'); }
                    };
                    input.click();
                });
            });
        }, 100);
    }

    function openAddZoneModal() {
        createModal({
            title: '➕ Add Zone',
            bodyHTML: `
                <div class="form-group">
                    <label>Name *</label>
                    <input class="form-input" name="name" placeholder="e.g. Front Yard" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea class="form-input" name="description" rows="2" placeholder="Optional"></textarea>
                </div>
            `,
            submitLabel: 'Add Zone',
            async onSubmit(modal) {
                const name = modal.querySelector('[name="name"]').value.trim();
                if (!name) throw new Error('Name is required');
                await API.post('/garden/zones', { name, description: modal.querySelector('[name="description"]').value.trim() || undefined });
                showToast('Zone added ✓');
                await loadZones();
                renderPlantGrid();
            },
        });
    }

    function openEditZoneModal(zone) {
        createModal({
            title: '✏️ Edit Zone',
            bodyHTML: `
                <div class="form-group">
                    <label>Name *</label>
                    <input class="form-input" name="name" value="${esc(zone.name)}" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea class="form-input" name="description" rows="2">${esc(zone.description || '')}</textarea>
                </div>
            `,
            submitLabel: 'Save',
            async onSubmit(modal) {
                const name = modal.querySelector('[name="name"]').value.trim();
                if (!name) throw new Error('Name is required');
                await API.put(`/garden/zones/${zone.id}`, { name, description: modal.querySelector('[name="description"]').value.trim() || null });
                showToast('Zone updated ✓');
                await loadZones();
                plants = await API.get('/garden/plants') || [];
                renderPlantGrid();
            },
        });
    }

    function confirmDeleteZone(zone, plantCount) {
        const warning = plantCount > 0 ? `<p style="color:var(--red);font-weight:600;margin-bottom:8px">⚠️ ${plantCount} plant${plantCount !== 1 ? 's are' : ' is'} assigned to this zone. They will become unassigned.</p>` : '';
        createModal({
            title: '🗑️ Delete Zone',
            bodyHTML: `${warning}<p style="font-size:14px;color:var(--text-secondary)">Delete <strong>${esc(zone.name)}</strong>?</p>`,
            submitLabel: 'Delete',
            async onSubmit() {
                await API.delete(`/garden/zones/${zone.id}`);
                showToast('Zone deleted');
                await loadZones();
                if (activeZoneFilter === zone.id) activeZoneFilter = null;
                plants = await API.get('/garden/plants') || [];
                renderPlantGrid();
            },
        });
        setTimeout(() => {
            const btn = document.querySelector('.modal-submit-btn');
            if (btn) { btn.style.background = 'var(--red)'; btn.style.borderColor = 'var(--red)'; }
        }, 50);
    }

    // ─── Helpers ───
    function getScoreClass(score) {
        if (score == null) return 'new-plant';
        if (score >= 80) return 'excellent';
        if (score >= 60) return 'good';
        if (score >= 40) return 'fair';
        if (score >= 20) return 'poor';
        return 'critical';
    }

    function getScoreColor(score) {
        if (score == null) return 'var(--health-new)';
        if (score >= 80) return 'var(--health-excellent)';
        if (score >= 60) return 'var(--health-good)';
        if (score >= 40) return 'var(--health-fair)';
        if (score >= 20) return 'var(--health-poor)';
        return 'var(--health-critical)';
    }

    function getPlantIcon(type) {
        const map = {
            tree: 'tree-pine', herb: 'leaf', flower: 'flower-2',
            vegetable: 'carrot', fruit: 'apple', succulent: 'cactus',
        };
        return map[type] || 'sprout';
    }

    function getLogIconClass(type) {
        const map = { water: 'water', prune: 'prune', fertilize: 'fertilize', photo: 'photo' };
        return map[type] || 'other';
    }

    function getLogEmoji(type) {
        const map = { water: '💧', prune: '✂️', fertilize: '🌿', photo: '📸', harvest: '🍎', repot: '🪴', pest_treatment: '🐛' };
        return map[type] || '📋';
    }

    function capitalize(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';
    }

    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // Make closeDetail global for inline handlers
    window.closeDetail = closeDetail;

    // ═══════════════════════════════════════════════════════
    //  SUPPLIES & SHOPPING TAB
    // ═══════════════════════════════════════════════════════

    let suppliesLoaded = false;
    let plansLoaded = false;
    let shoppingDataCache = null;

    // ─── Supply categorization helpers ───
    const SUPPLY_KEYWORDS = ['iron','fertilizer','chelated','supplement','buy','purchase','mulch','soil acidifier','soil_acidifier'];
    function isSupplyRec(rec) {
        const txt = ((rec.category || '') + ' ' + (rec.text || '') + ' ' + (rec.description || '') + ' ' + (rec.action || '')).toLowerCase();
        return SUPPLY_KEYWORDS.some(kw => txt.includes(kw));
    }

    // ─── Tab Switching ───
    document.getElementById('tabPlants')?.addEventListener('click', () => switchTab('plants'));
    document.getElementById('tabPlans')?.addEventListener('click', () => switchTab('plans'));
    document.getElementById('tabSupplies')?.addEventListener('click', () => switchTab('supplies'));

    function switchTab(tab) {
        const tabs = ['plants','plans','supplies'];
        const els = { plants: 'tabPlants', plans: 'tabPlans', supplies: 'tabSupplies' };
        const areas = { plants: 'contentArea', plans: 'plansContent', supplies: 'suppliesContent' };
        tabs.forEach(t => {
            document.getElementById(els[t])?.classList.toggle('active', t === tab);
            document.getElementById(areas[t])?.classList.toggle('hidden', t !== tab);
        });
        if (tab === 'plans' && !plansLoaded) loadPlansTab();
        if (tab === 'supplies' && !suppliesLoaded) loadSuppliesTab();
    }

    // ═══════════════════════════════════════════════════════
    //  PLANS TAB
    // ═══════════════════════════════════════════════════════

    let plansData = [];

    async function loadPlansTab() {
        const inner = document.getElementById('plansInner');
        inner.innerHTML = '<div class="plans-empty"><i data-lucide="loader"></i><div>Loading plans...</div></div>';
        lucide.createIcons();
        try {
            plansData = await API.get('/garden/plans') || [];
            plansLoaded = true;
            renderPlansTab();
        } catch (err) {
            inner.innerHTML = `<div class="plans-empty">❌ Failed to load: ${esc(err.message)}</div>`;
        }
    }

    function getStepTypeIcon(type) {
        const map = { spray: 'spray-can', fertilize: 'flask-round', water: 'droplets', prune: 'scissors', cleanup: 'trash-2', inspect: 'search', note: 'info' };
        return map[type] || 'circle';
    }

    function renderPlansTab() {
        const inner = document.getElementById('plansInner');
        if (!plansData.length) {
            inner.innerHTML = '<div class="plans-empty"><i data-lucide="clipboard-list"></i><div>No garden plans yet. Bittu will create plans based on your plants and supplies.</div></div>';
            lucide.createIcons();
            return;
        }

        // Sort: active first (newest first), then completed (newest first)
        const active = plansData.filter(p => p.status !== 'completed').sort((a, b) => new Date(b.planned_date || 0) - new Date(a.planned_date || 0));
        const completed = plansData.filter(p => p.status === 'completed').sort((a, b) => new Date(b.planned_date || 0) - new Date(a.planned_date || 0));
        const sorted = [...active, ...completed];

        let html = '';
        sorted.forEach(plan => {
            const steps = plan.steps || [];
            const actionableSteps = steps.filter(s => !s.is_warning && s.step_type !== 'note');
            const doneCount = actionableSteps.filter(s => s.completed).length;
            const totalCount = actionableSteps.length;
            const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
            const isCompleted = plan.status === 'completed';
            const isExpanded = !isCompleted; // active plans start expanded

            // Group steps by section
            const sections = [];
            let currentSection = null;
            steps.sort((a, b) => (a.step_order || 0) - (b.step_order || 0)).forEach(step => {
                const sec = step.section || 'Steps';
                if (sec !== currentSection) {
                    currentSection = sec;
                    sections.push({ name: sec, steps: [] });
                }
                sections[sections.length - 1].steps.push(step);
            });

            html += `<div class="plan-card ${isCompleted ? 'completed' : ''}" data-plan-id="${plan.id}">
                <div class="plan-card-header" data-plan-id="${plan.id}">
                    <div class="plan-card-header-left">
                        <div class="plan-card-title">
                            ${esc(plan.title)}
                            ${isCompleted ? '<span class="plan-card-badge completed-badge">✓ Completed</span>' : ''}
                        </div>
                        <div class="plan-card-date">${plan.planned_date ? formatDate(plan.planned_date) : ''}</div>
                        <div class="plan-progress-wrap">
                            <div class="plan-progress"><div class="plan-progress-fill" style="width:${pct}%"></div></div>
                            <span class="plan-progress-text">${doneCount}/${totalCount} done</span>
                        </div>
                    </div>
                    <div class="plan-card-chevron ${isExpanded ? 'open' : ''}"><i data-lucide="chevron-down"></i></div>
                </div>
                <div class="plan-steps ${isExpanded ? 'open' : ''}" id="plan-steps-${plan.id}">`;

            sections.forEach(sec => {
                html += `<div class="plan-section-header">${esc(sec.name)}</div>`;
                sec.steps.forEach(step => {
                    const isDone = step.completed;
                    const isWarning = step.is_warning;
                    const isNote = step.step_type === 'note';
                    const stepIcon = getStepTypeIcon(step.step_type);
                    let cls = 'plan-step';
                    if (isDone) cls += ' completed';
                    if (isWarning) cls += ' warning';
                    if (isNote) cls += ' note-step';

                    html += `<div class="${cls}" data-step-id="${step.id}" data-plan-id="${plan.id}">`;

                    if (isWarning) {
                        html += `<div class="plan-step-icon"><i data-lucide="alert-triangle"></i></div>
                            <div class="plan-step-content">
                                <div class="plan-step-title">⚠️ ${esc(step.title)}</div>
                                ${step.description ? `<div class="plan-step-desc">${esc(step.description)}</div>` : ''}
                            </div>`;
                    } else if (isNote) {
                        html += `<div class="plan-step-icon"><i data-lucide="info"></i></div>
                            <div class="plan-step-content">
                                <div class="plan-step-title">${esc(step.title)}</div>
                                ${step.description ? `<div class="plan-step-desc">${esc(step.description)}</div>` : ''}
                            </div>`;
                    } else {
                        html += `<div class="plan-step-checkbox ${isDone ? 'checked' : ''}" data-step-id="${step.id}" data-plan-id="${plan.id}">
                                ${isDone ? '<i data-lucide="check"></i>' : ''}
                            </div>
                            <div class="plan-step-icon"><i data-lucide="${stepIcon}"></i></div>
                            <div class="plan-step-content">
                                <div class="plan-step-title">${esc(step.title)}</div>
                                ${step.description ? `<div class="plan-step-desc">${esc(step.description)}</div>` : ''}
                                ${step.plant_names && step.plant_names.length ? `<div class="plan-step-chips">${step.plant_names.map(n => `<span class="plant-chip">${esc(n)}</span>`).join('')}</div>` : ''}
                            </div>`;
                    }
                    html += '</div>';
                });
            });

            html += '</div></div>';
        });

        inner.innerHTML = html;
        lucide.createIcons();
        bindPlanEvents();
    }

    function bindPlanEvents() {
        // Toggle expand/collapse
        document.querySelectorAll('.plan-card-header').forEach(header => {
            header.addEventListener('click', () => {
                const planId = header.dataset.planId;
                const stepsEl = document.getElementById(`plan-steps-${planId}`);
                const chevron = header.querySelector('.plan-card-chevron');
                if (stepsEl) stepsEl.classList.toggle('open');
                if (chevron) chevron.classList.toggle('open');
            });
        });

        // Step checkboxes
        document.querySelectorAll('.plan-step-checkbox').forEach(cb => {
            cb.addEventListener('click', async (e) => {
                e.stopPropagation();
                const stepId = cb.dataset.stepId;
                const planId = cb.dataset.planId;
                const isChecked = cb.classList.contains('checked');

                try {
                    if (isChecked) {
                        await API.put(`/garden/plans/${planId}/steps/${stepId}/uncomplete`);
                    } else {
                        await API.put(`/garden/plans/${planId}/steps/${stepId}/complete`, { notes: '' });
                    }

                    // Update local data
                    const plan = plansData.find(p => p.id == planId);
                    if (plan) {
                        const step = (plan.steps || []).find(s => s.id == stepId);
                        if (step) {
                            step.completed = !isChecked;
                            step.completed_at = !isChecked ? new Date().toISOString() : null;
                        }

                        // Check if all actionable steps are done
                        const actionableSteps = (plan.steps || []).filter(s => !s.is_warning && s.step_type !== 'note');
                        const allDone = actionableSteps.length > 0 && actionableSteps.every(s => s.completed);
                        if (allDone && !isChecked) {
                            plan.status = 'completed';
                            // Show celebration
                            const toast = document.createElement('div');
                            toast.className = 'plan-complete-toast';
                            toast.textContent = '🎉 Plan Complete!';
                            document.body.appendChild(toast);
                            setTimeout(() => toast.remove(), 3000);
                        }
                    }

                    renderPlansTab();
                } catch (err) {
                    showToast('Failed to update step', 'error');
                }
            });
        });
    }

    // ─── Load Supplies Tab ───
    async function loadSuppliesTab() {
        const inner = document.getElementById('suppliesInner');
        inner.innerHTML = '<div class="shopping-empty"><i data-lucide="loader"></i><div>Loading supplies...</div></div>';
        lucide.createIcons();
        try {
            const [shoppingData, supplies] = await Promise.all([
                shoppingDataCache || API.get('/garden/shopping-list').catch(() => ({ needs: [], supplies: [], catalog: [] })),
                API.get('/garden/supplies').catch(() => []),
            ]);
            shoppingDataCache = shoppingData;
            suppliesLoaded = true;
            let html = '';
            html += renderShoppingList(shoppingData, supplies);
            html += renderSupplyInventory(supplies);
            inner.innerHTML = html;
            lucide.createIcons();
            bindSupplyEvents();
        } catch (err) {
            inner.innerHTML = `<div class="shopping-empty">❌ Failed to load: ${esc(err.message)}</div>`;
        }
    }

    // ─── Render Shopping List ───
    function renderShoppingList(data, userSupplies) {
        const { needs = [], catalog = [] } = data;
        let html = `<div class="supplies-section">
            <div class="supplies-section-header">
                <span class="supplies-section-title"><i data-lucide="list-checks"></i> Smart Shopping List</span>
            </div>`;

        // Filter to only supply-related needs
        const supplyNeeds = needs.filter(need => {
            const recs = need.recommendations || [];
            return recs.some(r => isSupplyRec(r));
        });

        if (!supplyNeeds.length) {
            html += '<div class="shopping-empty"><i data-lucide="check-circle"></i><div>All good! No supplies needed right now 🎉</div></div>';
            html += '</div>';
            return html;
        }

        html += '<div class="shopping-list">';
        supplyNeeds.forEach(need => {
            const urgency = (need.urgency || 'routine').toLowerCase();
            const urgencyDot = urgency === 'urgent' ? '🔴' : urgency === 'soon' ? '🟡' : '🟢';
            const urgencyClass = urgency === 'urgent' || urgency === 'high' ? 'urgent' : urgency === 'soon' || urgency === 'medium' ? 'soon' : 'routine';

            // Collect all plant names
            const plantNames = need.plants ? need.plants.map(p => p.name) : [];

            // Collect recommendation descriptions
            const recTexts = (need.recommendations || []).map(r => r.description || r.text || '').filter(Boolean);
            const desc = recTexts[0] || '';

            // Find matching catalog item
            const catMatch = findCatalogMatch(need, catalog);

            // Check if user already has a matching supply
            const ownedSupply = findOwnedSupply(need, userSupplies);

            html += `<div class="shopping-card ${urgencyClass}">
                <div class="shopping-card-body">
                    <div class="shopping-card-title">${urgencyDot} ${esc(need.category ? capitalize(need.category.replace(/_/g, ' ')) : 'Supply')}</div>
                    ${desc ? `<div class="shopping-card-desc">${esc(desc)}</div>` : ''}
                    ${plantNames.length ? `<div class="shopping-card-plants">${plantNames.map(n => `<span class="plant-chip">${esc(n)}</span>`).join('')}</div>` : ''}
                    ${catMatch ? `<div class="shopping-card-product">
                        <div class="shopping-card-product-header">
                            <i data-lucide="package" style="width:14px;height:14px;color:var(--accent)"></i>
                            <span class="shopping-card-product-label">Recommended Product</span>
                        </div>
                        <div class="shopping-card-product-name">${esc(catMatch.name)}</div>
                        ${catMatch.brand ? `<div class="shopping-card-product-brand">${esc(catMatch.brand)}${catMatch.price_range ? ` · ${esc(catMatch.price_range)}` : ''}</div>` : ''}
                        ${catMatch.description ? `<div class="shopping-card-product-desc">${esc(catMatch.description)}</div>` : ''}
                    </div>` : ''}
                    <div class="shopping-card-actions">
                        ${ownedSupply
                            ? `<span class="shopping-card-owned"><i data-lucide="check-circle" style="width:14px;height:14px"></i> You have: ${esc(ownedSupply.name)}</span>`
                            : `${catMatch && catMatch.home_depot_url ? `<a class="btn btn-secondary" href="${esc(catMatch.home_depot_url)}" target="_blank"><i data-lucide="external-link" style="width:12px;height:12px"></i> View on Home Depot</a>` : ''}
                               <button class="btn btn-primary supply-bought-btn" data-category="${esc(need.category || '')}" data-name="${esc(catMatch?.name || need.category || '')}">I bought this</button>`
                        }
                    </div>
                </div>
            </div>`;
        });
        html += '</div></div>';
        return html;
    }

    function findCatalogMatch(need, catalog) {
        const cat = (need.category || '').toLowerCase().replace(/[_\-]/g, ' ');
        const recTexts = (need.recommendations || []).map(r => ((r.description || r.text || '') + ' ' + (r.action || '') + ' ' + (r.category || '')).toLowerCase()).join(' ');
        const searchText = cat + ' ' + recTexts;

        // Score each catalog item and return best match
        let bestMatch = null;
        let bestScore = 0;
        for (const c of catalog) {
            let score = 0;
            const cCat = (c.category || '').toLowerCase();
            const cSub = (c.subcategory || '').toLowerCase().replace(/[_\-]/g, ' ');
            const cName = (c.name || '').toLowerCase();
            const uses = (c.use_cases || []).map(u => u.toLowerCase().replace(/[_\-]/g, ' '));

            // Direct category match
            if (cCat === cat || cSub === cat) score += 10;
            // Keyword matching
            const keywords = [...uses, cSub, cCat, ...cName.split(/\s+/)];
            for (const kw of keywords) {
                if (kw.length > 2 && searchText.includes(kw)) score += 3;
            }
            // Specific high-value keyword matching
            if (searchText.includes('iron') && (cSub.includes('iron') || cName.includes('iron'))) score += 15;
            if (searchText.includes('copper') && (cSub.includes('copper') || cName.includes('copper'))) score += 15;
            if (searchText.includes('fungicid') && cCat === 'fungicide') score += 15;
            if (searchText.includes('fertiliz') && cCat === 'fertilizer') score += 10;
            if (searchText.includes('fruit tree') && cSub.includes('fruit')) score += 10;
            if (searchText.includes('fish') && cName.includes('fish')) score += 15;
            if (searchText.includes('frost') && cSub.includes('frost')) score += 15;
            if (searchText.includes('horticultural') && cName.includes('horticultural')) score += 15;
            if (searchText.includes('acidif') && (cSub.includes('sulfur') || cName.includes('acidif'))) score += 15;
            if (searchText.includes('mulch') && cCat === 'soil_amendment') score += 5;
            if (searchText.includes('compost') && cName.includes('compost')) score += 15;
            if (searchText.includes('soil') && cSub.includes('compost')) score += 5;

            if (score > bestScore) { bestScore = score; bestMatch = c; }
        }
        return bestScore >= 5 ? bestMatch : null;
    }

    function findOwnedSupply(need, supplies) {
        const cat = (need.category || '').toLowerCase().replace(/[_\-]/g, ' ');
        const recTexts = (need.recommendations || []).map(r => ((r.description || r.text || '') + ' ' + (r.action || '')).toLowerCase()).join(' ');
        const searchText = cat + ' ' + recTexts;
        return supplies.find(s => {
            const sName = (s.name || '').toLowerCase();
            const sCat = (s.category || '').toLowerCase();
            // Match by category or keyword overlap
            if (sCat === cat) return true;
            if (searchText.includes('iron') && sName.includes('iron')) return true;
            if (searchText.includes('copper') && sName.includes('copper')) return true;
            if (searchText.includes('fertiliz') && sCat === 'fertilizer') return true;
            if (searchText.includes('frost') && (sCat === 'protection' || sName.includes('frost'))) return true;
            return false;
        }) || null;
    }

    // ─── Render Supply Inventory ───
    function renderSupplyInventory(supplies) {
        let html = `<div class="supplies-section">
            <div class="supplies-section-header">
                <span class="supplies-section-title"><i data-lucide="warehouse"></i> My Supplies</span>
                <button class="add-plant-btn" id="addSupplyBtn"><i data-lucide="plus"></i><span>Add Supply</span></button>
            </div>`;

        if (!supplies.length) {
            html += '<div class="supplies-empty"><i data-lucide="package"></i><div>No supplies yet. Add your first one!</div></div>';
            html += '</div>';
            return html;
        }

        html += '<div class="supplies-grid">';
        supplies.forEach(s => {
            const catClass = (s.category || 'other').toLowerCase().replace(/\s+/g, '_');
            html += `<div class="supply-card">
                <button class="supply-card-delete" data-supply-id="${s.id}" title="Delete"><i data-lucide="x"></i></button>
                <span class="supply-category ${catClass}">${esc((s.category || 'other').replace(/_/g, ' '))}</span>
                <div class="supply-card-name">${esc(s.name)}</div>
                ${s.brand ? `<div class="supply-card-brand">${esc(s.brand)}</div>` : ''}
                <div class="supply-card-meta">
                    ${s.quantity_remaining != null ? `Qty: ${s.quantity_remaining}${s.unit ? ' ' + esc(s.unit) : ''}<br>` : ''}
                    ${s.purchase_date ? `Bought: ${formatDate(s.purchase_date)}` : ''}
                </div>
            </div>`;
        });
        html += '</div></div>';
        return html;
    }

    // ─── Add Supply Modal ───
    function addSupply(prefilled = {}) {
        const categories = ['fertilizer','pesticide','fungicide','soil_amendment','tool','mulch','pot_container','irrigation','protection','other'];
        createModal({
            title: '📦 Add Supply',
            bodyHTML: `
                <div class="form-group">
                    <label>Name *</label>
                    <input class="form-input" name="name" value="${esc(prefilled.name || '')}" placeholder="e.g. Miracle-Gro All Purpose" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Category</label>
                        <select class="form-input" name="category">
                            ${categories.map(c => `<option value="${c}" ${prefilled.category === c ? 'selected' : ''}>${capitalize(c.replace(/_/g, ' '))}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Brand</label>
                        <input class="form-input" name="brand" value="${esc(prefilled.brand || '')}" placeholder="e.g. Miracle-Gro">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Quantity</label>
                        <input class="form-input" name="quantity" type="number" value="${prefilled.quantity || ''}" placeholder="e.g. 1">
                    </div>
                    <div class="form-group">
                        <label>Unit</label>
                        <input class="form-input" name="unit" value="${esc(prefilled.unit || '')}" placeholder="e.g. lb, oz, bag">
                    </div>
                </div>
                <div class="form-group">
                    <label>Purchase Date</label>
                    <input class="form-input" name="purchase_date" type="date" value="${new Date().toISOString().slice(0,10)}">
                </div>
                <div class="form-group">
                    <label>Home Depot URL</label>
                    <input class="form-input" name="home_depot_url" value="${esc(prefilled.home_depot_url || '')}" placeholder="https://...">
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea class="form-input" name="notes" rows="2" placeholder="Optional notes...">${esc(prefilled.notes || '')}</textarea>
                </div>
            `,
            submitLabel: 'Add Supply',
            async onSubmit(modal) {
                const name = modal.querySelector('[name="name"]').value.trim();
                if (!name) throw new Error('Supply name is required');
                const body = {
                    name,
                    category: modal.querySelector('[name="category"]').value,
                    brand: modal.querySelector('[name="brand"]').value.trim() || undefined,
                    quantity: parseFloat(modal.querySelector('[name="quantity"]').value) || undefined,
                    quantity_remaining: parseFloat(modal.querySelector('[name="quantity"]').value) || undefined,
                    unit: modal.querySelector('[name="unit"]').value.trim() || undefined,
                    purchase_date: modal.querySelector('[name="purchase_date"]').value || undefined,
                    home_depot_url: modal.querySelector('[name="home_depot_url"]').value.trim() || undefined,
                    notes: modal.querySelector('[name="notes"]').value.trim() || undefined,
                };
                await API.post('/garden/supplies', body);
                showToast('Supply added! 📦');
                suppliesLoaded = false;
                loadSuppliesTab();
            },
        });
    }

    // ─── Bind Supply Events ───
    function bindSupplyEvents() {
        document.getElementById('addSupplyBtn')?.addEventListener('click', () => addSupply());

        document.querySelectorAll('.supply-bought-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                addSupply({
                    name: btn.dataset.name || '',
                    category: btn.dataset.category || 'other',
                });
            });
        });

        document.querySelectorAll('.supply-card-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.supplyId;
                if (!id) return;
                createModal({
                    title: '🗑️ Delete Supply',
                    bodyHTML: '<p style="font-size:14px;color:var(--text-secondary)">Are you sure you want to delete this supply?</p>',
                    submitLabel: 'Delete',
                    async onSubmit() {
                        await API.delete(`/garden/supplies/${id}`);
                        showToast('Supply deleted');
                        suppliesLoaded = false;
                        loadSuppliesTab();
                    },
                });
                setTimeout(() => {
                    const dbtn = document.querySelector('.modal-submit-btn');
                    if (dbtn) { dbtn.style.background = 'var(--red)'; dbtn.style.borderColor = 'var(--red)'; }
                }, 50);
            });
        });
    }

    // ─── Init ───
    await loadPlants();
    loadWateringSchedule();

})();
