/* ═══════════════════════════════════════════════════════════
   Captures Page — Main Controller
   ═══════════════════════════════════════════════════════════ */

const CapturesPage = {
    currentView: 'timeline',

    updateSubtitle(total) {
        const el = document.getElementById('capturesSubtitle');
        if (el) {
            const tagCount = CapturesTags.allTags.length;
            el.textContent = total + ' capture' + (total !== 1 ? 's' : '') +
                (tagCount ? ' · ' + tagCount + ' tag' + (tagCount !== 1 ? 's' : '') : '');
        }
    },

    switchView(view) {
        this.currentView = view;
        // Update tabs
        document.querySelectorAll('.view-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.view === view);
        });
        // Show/hide views
        ['capturesFeedView', 'capturesMapView', 'capturesCalendarView'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        if (view === 'timeline') {
            const el = document.getElementById('capturesFeedView');
            if (el) el.style.display = 'block';
        } else if (view === 'map') {
            const el = document.getElementById('capturesMapView');
            if (el) el.style.display = 'block';
            CapturesMap.render(CapturesFeed.captures);
            CapturesMap.invalidate();
        } else if (view === 'calendar') {
            const el = document.getElementById('capturesCalendarView');
            if (el) el.style.display = 'block';
            CapturesCalendar.init();
        }
    }
};

// ─── Boot ───
(async function() {
    try { await requireAuth(); } catch(e) { return; }

    var shell = renderAppShell('Captures', 'captures');
    document.getElementById('appLayout').innerHTML =
        shell.sidebar +
        shell.bottomNav +
        '<div class="main-content">' +
            shell.topbar +
            '<div class="main-body">' +
                '<div id="capturesSubtitle" class="captures-subtitle" style="margin-bottom:14px"></div>' +
                '<div id="capturesSearch" class="captures-search"></div>' +
                '<div id="capturesTagFilters" class="tag-filters"></div>' +
                '<div class="view-tabs" id="viewTabs">' +
                    '<button class="view-tab active" data-view="timeline">Timeline</button>' +
                    '<button class="view-tab" data-view="map">Map</button>' +
                    '<button class="view-tab" data-view="calendar">Calendar</button>' +
                '</div>' +
                '<div id="capturesFeedView">' +
                    '<div id="capturesFeed"></div>' +
                    '<div id="scrollSentinel" class="scroll-sentinel"></div>' +
                    '<div id="feedLoading" class="feed-loading" style="display:none">Loading...</div>' +
                '</div>' +
                '<div id="capturesCalendarView" style="display:none"></div>' +
                '<div id="capturesMapView" style="display:none">' +
                    '<div id="capturesMapContainer" class="captures-map-container"></div>' +
                    '<div id="capturesMapEmpty" class="captures-map-empty" style="display:none">' +
                        '<div class="empty-icon">🗺️</div>' +
                        '<h3>No captures with location yet</h3>' +
                        '<p>Enable 📍 when creating a capture to see it on the map.</p>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<button class="captures-fab" id="capturesFab">+</button>' +
        '<div class="capture-modal-overlay" id="captureModalOverlay">' +
            '<div class="capture-modal" id="captureModalContent" onclick="event.stopPropagation()"></div>' +
        '</div>';

    initAppShell('captures');

    // Move FAB + modal to body so they escape any stacking context
    var fab = document.getElementById('capturesFab');
    var overlay = document.getElementById('captureModalOverlay');
    if (fab) document.body.appendChild(fab);
    if (overlay) document.body.appendChild(overlay);

    // View tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => CapturesPage.switchView(tab.dataset.view));
    });

    // Init modules
    CapturesTags.init();
    CapturesFeed.init();
    CapturesModal.init();

    // Parallel prefetch
    try {
        const [capturesData, tagsData] = await Promise.all([
            CapturesService.getCaptures({ page: 1, limit: 20 }),
            CapturesService.getTags().catch(() => []),
        ]);

        CapturesTags.setTags(tagsData);

        const items = capturesData.captures || [];
        CapturesFeed.total = capturesData.total || 0;
        CapturesFeed.captures = items;
        CapturesFeed.page = 2;
        if (!items.length || items.length < CapturesFeed.limit) CapturesFeed.done = true;
        CapturesFeed.renderAppend(items);
        CapturesPage.updateSubtitle(CapturesFeed.total);
        CapturesFeed.startInfiniteScroll();
    } catch (err) {
        showToast('Failed to load captures', 'error');
    }
})();
