/* ═══════════════════════════════════════════════════════════
   Events Page — ashcroft.cloud
   Calendar + Hosted Events
   ═══════════════════════════════════════════════════════════ */

// ─── State ───
var events = [];
var viewMode = 'list';
var calYear, calMonth;
var selectedDay = null;
var hostedEvents = [];
var expandedHostedId = null;
var activeTab = 'calendar';

var CATEGORIES = {
    general:       { label: 'General',       color: '#635BFF', cls: 'cat-general' },
    family:        { label: 'Family',        color: '#8B5CF6', cls: 'cat-family' },
    work:          { label: 'Work',          color: '#6366F1', cls: 'cat-work' },
    social:        { label: 'Social',        color: '#EC4899', cls: 'cat-social' },
    birthday:      { label: 'Birthday',      color: '#F472B6', cls: 'cat-birthday' },
    holiday:       { label: 'Holiday',        color: '#10B981', cls: 'cat-holiday' },
    appointment:   { label: 'Appointment',    color: '#3B82F6', cls: 'cat-appointment' },
    travel:        { label: 'Travel',         color: '#06B6D4', cls: 'cat-travel' },
    health:        { label: 'Health',         color: '#EF4444', cls: 'cat-health' },
    school:        { label: 'School',         color: '#F59E0B', cls: 'cat-school' },
    sports:        { label: 'Sports',         color: '#22C55E', cls: 'cat-sports' },
    religious:     { label: 'Religious',      color: '#A78BFA', cls: 'cat-religious' },
    city_schedule: { label: 'City Schedule',  color: '#F59E0B', cls: 'cat-city_schedule' },
    other:         { label: 'Other',          color: '#94A3B8', cls: 'cat-other' },
};

function catCls(c) { return CATEGORIES[c]?.cls || 'cat-custom'; }
function catColor(c) { return CATEGORIES[c]?.color || '#635BFF'; }

var now = new Date();
calYear = now.getFullYear();
calMonth = now.getMonth();

// ─── Boot ───
(async function() {
    try { await requireAuth(); } catch(e) { return; }

    if (window.location.hash === '#hosted') activeTab = 'hosted';
    else activeTab = 'calendar';

    var shell = renderAppShell('Events', 'events');
    document.getElementById('appLayout').innerHTML =
        shell.sidebar +
        shell.bottomNav +
        '<div class="main-content">' +
            shell.topbar +
            '<div class="main-body" id="eventsBody">' +
                '<div class="skeleton skeleton-card" style="height:40px;margin-bottom:12px"></div>' +
                '<div class="skeleton skeleton-card" style="height:300px"></div>' +
            '</div>' +
        '</div>';
    initAppShell('events');
    await Promise.all([loadEvents(), loadHostedEvents()]);
    render();
})();

// ─── Data ───
async function loadEvents() {
    try {
        var data = await API.get('/events');
        events = Array.isArray(data) ? data : (data?.items || []);
    } catch(e) {
        events = [];
    }
}

async function loadHostedEvents() {
    try {
        hostedEvents = await API.get('/iftar/events') || [];
    } catch(e) {
        hostedEvents = [];
    }
}

// ─── Tab Switching ───
function switchTab(tab) {
    activeTab = tab;
    window.location.hash = tab;
    render();
}

// ─── Main Render ───
function render() {
    var body = document.getElementById('eventsBody');
    body.innerHTML =
        '<div class="events-tabs">' +
            '<button class="events-tab ' + (activeTab==='calendar'?'active':'') + '" onclick="switchTab(\'calendar\')">' +
                '<i data-lucide="calendar"></i> Calendar' +
            '</button>' +
            '<button class="events-tab ' + (activeTab==='hosted'?'active':'') + '" onclick="switchTab(\'hosted\')">' +
                '<i data-lucide="users"></i> Hosted' +
            '</button>' +
        '</div>' +
        '<div class="tab-content ' + (activeTab==='calendar'?'active':'') + '" id="calendarTab">' +
            renderCalendarTab() +
        '</div>' +
        '<div class="tab-content ' + (activeTab==='hosted'?'active':'') + '" id="hostedTab">' +
            renderHostedTab() +
        '</div>';
    if (window.lucide) lucide.createIcons();
}

// ═══════════════════════════════════════
// CALENDAR TAB
// ═══════════════════════════════════════
function renderCalendarTab() {
    return '<div class="events-toolbar">' +
            '<div class="view-toggle">' +
                '<button class="' + (viewMode==='list'?'active':'') + '" onclick="viewMode=\'list\';render()"><i data-lucide="list" style="width:14px;height:14px;vertical-align:-2px"></i> List</button>' +
                '<button class="' + (viewMode==='month'?'active':'') + '" onclick="viewMode=\'month\';render()"><i data-lucide="calendar" style="width:14px;height:14px;vertical-align:-2px"></i> Month</button>' +
            '</div>' +
            '<button class="btn btn-primary" onclick="openAddEventModal()">+ Add Event</button>' +
        '</div>' +
        renderUpcoming() +
        (viewMode === 'list' ? renderListView() : renderCalendarView());
}

function renderUpcoming() {
    var today = new Date(); today.setHours(0,0,0,0);
    var weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    var upcoming = events
        .filter(function(e) { var d = new Date(e.date || e.start_date); d.setHours(0,0,0,0); return d >= today && d < weekEnd; })
        .sort(function(a, b) { return new Date(a.date || a.start_date) - new Date(b.date || b.start_date); });
    if (!upcoming.length) return '';
    return '<div class="upcoming-section">' +
        '<div class="upcoming-title"><i data-lucide="pin" style="width:12px;height:12px;vertical-align:-2px"></i> Next 7 Days</div>' +
        '<div class="upcoming-strip">' +
            upcoming.map(function(e) {
                var d = new Date(e.date || e.start_date);
                var dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                return '<div class="upcoming-card" onclick="openEventDetail(' + e.id + ')" style="border-left:3px solid ' + catColor(e.category) + '">' +
                    '<div class="uc-date">' + dayName + '</div>' +
                    '<div class="uc-title">' + esc(e.title) + '</div>' +
                    '<div class="uc-time">' + (e.time || 'All day') + '</div>' +
                '</div>';
            }).join('') +
        '</div>' +
    '</div>';
}

function renderListView() {
    if (!events.length) {
        return '<div class="events-card"><div class="empty-state" style="padding:48px 16px;">' +
            '<div class="emoji"><i data-lucide="calendar"></i></div>' +
            '<p>No events scheduled — add one!</p>' +
            '<button class="btn btn-primary" onclick="openAddEventModal()" style="margin-top:8px;">+ Add Event</button>' +
        '</div></div>';
    }
    var sorted = events.slice().sort(function(a, b) { return new Date(a.date || a.start_date || '9999-12-31') - new Date(b.date || b.start_date || '9999-12-31'); });
    var groups = {};
    sorted.forEach(function(e) { var key = (e.date || e.start_date || 'unknown').substring(0, 10); (groups[key] = groups[key] || []).push(e); });
    var todayStr = getTodayStr();
    var html = '<div class="events-card">';
    for (var date in groups) {
        var evts = groups[date];
        var isToday = date === todayStr;
        html += '<div class="date-group-header' + (isToday?' today':'') + '">' + (isToday ? 'Today' : formatGroupDate(date)) + '</div>';
        html += evts.map(function(e) { return eventRowHTML(e); }).join('');
    }
    html += '</div>';
    return html;
}

function eventRowHTML(e) {
    var cat = e.category || 'custom';
    var timeStr = e.time ? (e.end_time ? fmtTime(e.time) + ' – ' + fmtTime(e.end_time) : fmtTime(e.time)) : 'All day';
    return '<div class="event-row" onclick="openEventDetail(' + e.id + ')">' +
        '<span class="cat-dot ' + catCls(cat) + '"></span>' +
        '<div class="event-row-info">' +
            '<div class="event-row-title">' + esc(e.title) + '</div>' +
            '<div class="event-row-meta">' +
                '<span>' + timeStr + '</span>' +
                (e.access === 'household' ? '<span class="shared-badge"><i data-lucide="home" style="width:10px;height:10px;vertical-align:-1px"></i> Family</span>' : e.access === 'admin' ? '<span class="shared-badge"><i data-lucide="shield" style="width:10px;height:10px;vertical-align:-1px"></i> Admin</span>' : '') +
                (e.recurrence_rule ? '<span class="recur-badge">' + e.recurrence_rule + '</span>' : '') +
            '</div>' +
        '</div>' +
    '</div>';
}

function renderCalendarView() {
    var monthName = new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    var dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var daysInPrev = new Date(calYear, calMonth, 0).getDate();
    var todayStr = getTodayStr();
    var eventsByDate = {};
    events.forEach(function(e) { var key = (e.date || e.start_date || '').substring(0, 10); (eventsByDate[key] = eventsByDate[key] || []).push(e); });

    var cells = '';
    for (var i = firstDay - 1; i >= 0; i--) cells += '<div class="cal-day other-month">' + (daysInPrev - i) + '</div>';
    for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var isToday = dateStr === todayStr;
        var isSelected = dateStr === selectedDay;
        var dayEvents = eventsByDate[dateStr] || [];
        var dots = dayEvents.slice(0, 3).map(function(e) { return '<span class="dot" style="background:' + catColor(e.category) + '"></span>'; }).join('');
        cells += '<div class="cal-day' + (isToday?' today':'') + (isSelected?' selected':'') + '" onclick="selectCalDay(\'' + dateStr + '\')">' + d + '<div class="cal-dots">' + dots + '</div></div>';
    }
    var totalCells = firstDay + daysInMonth;
    var remaining = (7 - totalCells % 7) % 7;
    for (var r = 1; r <= remaining; r++) cells += '<div class="cal-day other-month">' + r + '</div>';

    var html = '<div class="events-card" style="padding:16px;">' +
        '<div class="cal-header">' +
            '<div class="cal-nav">' +
                '<button onclick="navMonth(-1)">‹</button>' +
                '<button onclick="calYear=new Date().getFullYear();calMonth=new Date().getMonth();selectedDay=null;render()">⦿</button>' +
                '<button onclick="navMonth(1)">›</button>' +
            '</div>' +
            '<h3>' + monthName + '</h3>' +
        '</div>' +
        '<div class="cal-grid">' + dows.map(function(d) { return '<div class="cal-dow">' + d + '</div>'; }).join('') + cells + '</div>' +
    '</div>';

    if (selectedDay) {
        var dayEvts = eventsByDate[selectedDay] || [];
        html += '<div class="day-detail"><div class="day-detail-title">' + formatGroupDate(selectedDay) + '</div>' +
            '<div class="events-card">' + (dayEvts.length ? dayEvts.map(function(e) { return eventRowHTML(e); }).join('') :
            '<div class="empty-state" style="padding:24px"><p>No events this day</p></div>') + '</div></div>';
    }
    return html;
}

function navMonth(dir) {
    calMonth += dir;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0; calYear++; }
    selectedDay = null;
    render();
}

function selectCalDay(dateStr) {
    selectedDay = selectedDay === dateStr ? null : dateStr;
    render();
}

// ═══════════════════════════════════════
// HOSTED EVENTS TAB
// ═══════════════════════════════════════

function getEventEmoji(title) {
    var t = (title || '').toLowerCase();
    if (t.includes('iftar') || t.includes('ramadan') || t.includes('eid')) return '🌙';
    if (t.includes('birthday')) return '🎂';
    if (t.includes('party')) return '🎉';
    if (t.includes('dinner')) return '🍽️';
    if (t.includes('bbq') || t.includes('barbecue')) return '🔥';
    if (t.includes('brunch')) return '🥞';
    return '🎉';
}

function fmtEventDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtEventTime(t) {
    if (!t) return '';
    var parts = t.split(':').map(Number);
    var h = parts[0], m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return m ? h12 + ':' + String(m).padStart(2,'0') + ' ' + ampm : h12 + ' ' + ampm;
}

function getFullAddress(evt) {
    return [evt.address_line1, evt.address_line2, [evt.city, evt.state, evt.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
}

function getMapsUrl(evt) {
    return 'https://maps.google.com/?q=' + encodeURIComponent(getFullAddress(evt));
}

function getInviteUrl(token) {
    return window.location.origin + '/eid-party/?t=' + token;
}

function renderHostedTab() {
    var html = '<div class="hosted-toolbar">' +
        '<div class="hosted-toolbar-left">' + hostedEvents.length + ' hosted event' + (hostedEvents.length !== 1 ? 's' : '') + '</div>' +
        '<button class="btn btn-primary" onclick="openCreateHostedModal()"><i data-lucide="plus" style="width:14px;height:14px"></i> New Event</button>' +
    '</div>';

    if (!hostedEvents.length) {
        return html + '<div class="events-card"><div class="empty-state" style="padding:48px 16px;">' +
            '<div class="emoji">🌙</div>' +
            '<p>No hosted events yet — create your first one!</p>' +
            '<button class="btn btn-primary" onclick="openCreateHostedModal()" style="margin-top:8px;"><i data-lucide="plus" style="width:14px;height:14px"></i> Create Event</button>' +
        '</div></div>';
    }

    hostedEvents.forEach(function(evt) {
        var s = evt.stats || {};
        var total = s.total_invited || 0;
        var isExpanded = expandedHostedId === evt.id;
        var emoji = getEventEmoji(evt.title);
        var addr = getFullAddress(evt);

        var pAttend = total ? (countByStatus(evt, 'attending') / total * 100) : 0;
        var pMaybe = total ? (countByStatus(evt, 'maybe') / total * 100) : 0;
        var pDeclined = total ? (countByStatus(evt, 'declined') / total * 100) : 0;
        var pPending = total ? (s.pending / total * 100) : 0;

        html += '<div class="hosted-card' + (evt.active === false ? ' inactive' : '') + '" id="hosted-' + evt.id + '">' +
            '<div class="hosted-card-header" onclick="toggleHostedDetail(' + evt.id + ')">' +
                '<div class="hosted-card-top">' +
                    '<div class="hosted-card-title-row">' +
                        '<span class="hosted-card-emoji">' + emoji + '</span>' +
                        '<div>' +
                            '<div class="hosted-card-title">' + esc(evt.title) + (evt.active === false ? ' <span class="hosted-card-inactive-badge">Inactive</span>' : '') + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="hosted-card-headcount-wrap" style="text-align:right;flex-shrink:0;">' +
                        '<div class="hosted-card-headcount">' + (s.total_expected || 0) + '</div>' +
                        '<div class="hosted-card-headcount-label">Expected</div>' +
                    '</div>' +
                '</div>' +
                '<div class="hosted-card-meta">' +
                    '<span><i data-lucide="calendar"></i> ' + fmtEventDate(evt.event_date) + '</span>' +
                    (evt.event_time ? '<span><i data-lucide="clock"></i> ' + fmtEventTime(evt.event_time) + '</span>' : '') +
                    (evt.sunset_time ? '<span><i data-lucide="sunset"></i> Sunset ' + fmtEventTime(evt.sunset_time) + '</span>' : '') +
                    (addr ? '<span><i data-lucide="map-pin"></i> <a href="' + getMapsUrl(evt) + '" target="_blank" onclick="event.stopPropagation()">' + esc(evt.city || addr.substring(0,30)) + '</a></span>' : '') +
                '</div>' +
                (total ? '<div class="rsvp-bar-wrap">' +
                    '<div class="rsvp-bar">' +
                        '<div class="rsvp-bar-seg attending" style="width:' + pAttend + '%"></div>' +
                        '<div class="rsvp-bar-seg maybe" style="width:' + pMaybe + '%"></div>' +
                        '<div class="rsvp-bar-seg declined" style="width:' + pDeclined + '%"></div>' +
                        '<div class="rsvp-bar-seg pending" style="width:' + pPending + '%"></div>' +
                    '</div>' +
                    '<div class="rsvp-stats">' +
                        '<span class="rsvp-stat"><span class="rsvp-dot" style="background:#22C55E"></span> ' + (s.attending || 0) + ' attending</span>' +
                        '<span class="rsvp-stat"><span class="rsvp-dot" style="background:#F59E0B"></span> ' + (s.maybe || 0) + ' maybe</span>' +
                        '<span class="rsvp-stat"><span class="rsvp-dot" style="background:#EF4444"></span> ' + (s.declined || 0) + ' declined</span>' +
                        '<span class="rsvp-stat"><span class="rsvp-dot" style="background:#94A3B8"></span> ' + (s.pending || 0) + ' pending</span>' +
                        '<span style="color:var(--text-tertiary)">· ' + total + ' invited</span>' +
                    '</div>' +
                '</div>' : '') +
            '</div>' +
            '<div class="hosted-detail' + (isExpanded ? ' open' : '') + '" id="hosted-detail-' + evt.id + '">' +
                (isExpanded ? renderHostedDetail(evt) : '') +
            '</div>' +
        '</div>';
    });

    return html;
}

function countByStatus(evt, status) {
    return (evt.invites || []).filter(function(i) { return i.rsvp_status === status; }).length;
}

function toggleHostedDetail(eventId) {
    if (expandedHostedId === eventId) {
        expandedHostedId = null;
    } else {
        expandedHostedId = eventId;
    }
    render();
}

function renderHostedDetail(evt) {
    var invites = evt.invites || [];
    var html = '';

    html += '<div class="guest-section-title"><i data-lucide="users"></i> Guest List (' + invites.length + ')</div>';

    if (invites.length) {
        html += '<table class="guest-table"><thead><tr>' +
            '<th>Guest</th><th>Status</th><th>Guests</th><th>Dietary</th><th>Message</th><th>Email</th><th>Sent</th><th>Actions</th>' +
        '</tr></thead><tbody>';
        invites.forEach(function(inv) {
            html += '<tr>' +
                '<td><span class="guest-name">' + esc(inv.guest_name) + '</span></td>' +
                '<td><span class="status-chip ' + inv.rsvp_status + '">' + statusLabel(inv.rsvp_status) + '</span></td>' +
                '<td>' + (inv.guest_count || 1) + '</td>' +
                '<td><span class="guest-dietary">' + esc(inv.dietary_notes || '—') + '</span></td>' +
                '<td><span class="guest-dietary">' + esc(inv.message_to_host || '—') + '</span></td>' +
                '<td><span class="guest-email">' + esc(inv.guest_email || '—') + '</span></td>' +
                '<td>' + (inv.link_sent ? '<span class="link-sent-icon">✓</span>' : '<span class="link-not-sent">—</span>') + '</td>' +
                '<td><div class="guest-actions">' +
                    '<button title="Copy invite link" onclick="event.stopPropagation();copyInviteLink(\'' + inv.token + '\')"><i data-lucide="link"></i></button>' +
                    '<button class="danger" title="Delete guest" onclick="event.stopPropagation();deleteGuest(' + inv.id + ',' + evt.id + ')"><i data-lucide="trash-2"></i></button>' +
                '</div></td>' +
            '</tr>';
        });
        html += '</tbody></table>';

        html += '<div class="guest-cards">';
        invites.forEach(function(inv) {
            html += '<div class="guest-card-item">' +
                '<div class="guest-card-top">' +
                    '<span class="guest-card-name">' + esc(inv.guest_name) + '</span>' +
                    '<span class="status-chip ' + inv.rsvp_status + '">' + statusLabel(inv.rsvp_status) + '</span>' +
                '</div>' +
                '<div class="guest-card-row">' +
                    '<span>👥 ' + (inv.guest_count || 1) + '</span>' +
                    (inv.dietary_notes ? '<span>🍽️ ' + esc(inv.dietary_notes) + '</span>' : '') +
                    (inv.message_to_host ? '<span>💬 ' + esc(inv.message_to_host) + '</span>' : '') +
                    (inv.guest_email ? '<span>✉️ ' + esc(inv.guest_email) + '</span>' : '') +
                    (inv.link_sent ? '<span style="color:var(--green)">✓ Sent</span>' : '') +
                '</div>' +
                '<div class="guest-card-actions">' +
                    '<button onclick="event.stopPropagation();copyInviteLink(\'' + inv.token + '\')"><i data-lucide="link"></i> Copy Link</button>' +
                    '<button class="danger" onclick="event.stopPropagation();deleteGuest(' + inv.id + ',' + evt.id + ')"><i data-lucide="trash-2"></i> Delete</button>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
    } else {
        html += '<div class="empty-state" style="padding:20px"><p>No guests yet — add some below!</p></div>';
    }

    html += '<div class="add-guest-row">' +
        '<input type="text" id="addGuestInput-' + evt.id + '" placeholder="Guest names (comma-separated)" onkeydown="if(event.key===\'Enter\'){addGuests(' + evt.id + ')}">' +
        '<button class="btn btn-primary" onclick="addGuests(' + evt.id + ')"><i data-lucide="user-plus" style="width:14px;height:14px"></i> Add</button>' +
    '</div>';

    html += '<div class="bulk-actions">' +
        '<button class="btn btn-secondary" onclick="copyAllLinks(' + evt.id + ')"><i data-lucide="copy" style="width:13px;height:13px"></i> Copy All Links</button>' +
        '<button class="btn btn-secondary" onclick="sendReminders(' + evt.id + ')"><i data-lucide="mail" style="width:13px;height:13px"></i> Send Reminders</button>' +
    '</div>';

    html += '<div class="hosted-event-actions">' +
        '<button class="btn btn-secondary" onclick="openEditHostedModal(' + evt.id + ')"><i data-lucide="edit" style="width:13px;height:13px"></i> Edit Event</button>' +
        '<button class="btn btn-secondary" onclick="toggleHostedActive(' + evt.id + ', ' + (evt.active !== false) + ')">' +
            '<i data-lucide="' + (evt.active !== false ? 'eye-off' : 'eye') + '" style="width:13px;height:13px"></i> ' +
            (evt.active !== false ? 'Deactivate' : 'Activate') +
        '</button>' +
    '</div>';

    return html;
}

function statusLabel(s) {
    var map = { attending: '✅ Attending', maybe: '🤔 Maybe', declined: '❌ Declined', pending: '⏳ Pending' };
    return map[s] || s;
}

// ─── Guest Actions ───
async function copyInviteLink(token) {
    try {
        await navigator.clipboard.writeText(getInviteUrl(token));
        showToast('Link copied! 📋');
    } catch(e) {
        var ta = document.createElement('textarea');
        ta.value = getInviteUrl(token);
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
        showToast('Link copied! 📋');
    }
}

async function deleteGuest(inviteId, eventId) {
    if (!confirm('Remove this guest?')) return;
    try {
        await API.delete('/iftar/invites/' + inviteId);
        showToast('Guest removed');
        await reloadHostedEvent(eventId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function addGuests(eventId) {
    var input = document.getElementById('addGuestInput-' + eventId);
    var val = input.value.trim();
    if (!val) return;
    var names = val.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
    if (!names.length) return;
    try {
        await API.post('/iftar/events/' + eventId + '/invites', { guests: names.map(function(name) { return { name: name }; }) });
        input.value = '';
        showToast(names.length + ' guest' + (names.length > 1 ? 's' : '') + ' added ✓');
        await reloadHostedEvent(eventId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function copyAllLinks(eventId) {
    var evt = hostedEvents.find(function(e) { return e.id === eventId; });
    if (!evt || !evt.invites?.length) { showToast('No guests to copy', 'error'); return; }
    var text = evt.invites.map(function(inv) { return inv.guest_name + ': ' + getInviteUrl(inv.token); }).join('\n');
    try {
        await navigator.clipboard.writeText(text);
        showToast(evt.invites.length + ' links copied! 📋');
    } catch(e) {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
        showToast(evt.invites.length + ' links copied! 📋');
    }
}

async function sendReminders(eventId) {
    if (!confirm('Send reminder emails to all attending/maybe guests with emails?')) return;
    try {
        var result = await API.post('/iftar/events/' + eventId + '/send-reminders');
        showToast((result.sent || 0) + ' reminder' + (result.sent !== 1 ? 's' : '') + ' sent ✓');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleHostedActive(eventId, currentlyActive) {
    try {
        await API.put('/iftar/events/' + eventId, { active: !currentlyActive });
        showToast(currentlyActive ? 'Event deactivated' : 'Event activated ✓');
        await reloadHostedEvent(eventId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function reloadHostedEvent(eventId) {
    await loadHostedEvents();
    expandedHostedId = eventId;
    render();
}

// ─── Create Hosted Event Modal ───
function openCreateHostedModal() {
    createModal({
        title: '🌙 New Hosted Event',
        bodyHTML: hostedEventFormHTML(),
        submitLabel: 'Create Event',
        async onSubmit(modal) {
            var body = readHostedForm(modal);
            await API.post('/iftar/events', body);
            showToast('Event created ✓');
            await loadHostedEvents();
            render();
        }
    });
}

function openEditHostedModal(eventId) {
    var evt = hostedEvents.find(function(e) { return e.id === eventId; });
    if (!evt) return;
    createModal({
        title: '✏️ Edit Event',
        bodyHTML: hostedEventFormHTML(evt),
        submitLabel: 'Save Changes',
        async onSubmit(modal) {
            var body = readHostedForm(modal);
            await API.put('/iftar/events/' + eventId, body);
            showToast('Event updated ✓');
            await reloadHostedEvent(eventId);
        }
    });
}

function hostedEventFormHTML(evt) {
    evt = evt || {};
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div class="form-group"><label>Title</label>' +
                '<input class="form-input" name="title" value="' + esc(evt.title || '') + '" placeholder="e.g. Ramadan Iftar Dinner" required>' +
            '</div>' +
            '<div class="form-group"><label>Host Name</label>' +
                '<input class="form-input" name="host_name" value="' + esc(evt.host_name || '') + '" placeholder="Your name">' +
            '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
            '<div class="form-group"><label>Date</label>' +
                '<input class="form-input" name="event_date" type="date" value="' + (evt.event_date || '').substring(0, 10) + '" required>' +
            '</div>' +
            '<div class="form-group"><label>Event Time</label>' +
                '<input class="form-input" name="event_time" type="time" value="' + (evt.event_time || '') + '">' +
            '</div>' +
            '<div class="form-group"><label>Sunset Time</label>' +
                '<input class="form-input" name="sunset_time" type="time" value="' + (evt.sunset_time || '') + '">' +
            '</div>' +
        '</div>' +
        '<div class="form-group"><label>Address Line 1</label>' +
            '<input class="form-input" name="address_line1" value="' + esc(evt.address_line1 || '') + '" placeholder="Street address">' +
        '</div>' +
        '<div class="form-group"><label>Address Line 2</label>' +
            '<input class="form-input" name="address_line2" value="' + esc(evt.address_line2 || '') + '" placeholder="Apt, suite, etc.">' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
            '<div class="form-group"><label>City</label>' +
                '<input class="form-input" name="city" value="' + esc(evt.city || '') + '">' +
            '</div>' +
            '<div class="form-group"><label>State</label>' +
                '<input class="form-input" name="state" value="' + esc(evt.state || '') + '">' +
            '</div>' +
            '<div class="form-group"><label>ZIP</label>' +
                '<input class="form-input" name="zip" value="' + esc(evt.zip || '') + '">' +
            '</div>' +
        '</div>' +
        '<div class="form-group"><label>Message to Guests</label>' +
            '<textarea class="form-input" name="message" rows="2" placeholder="Optional personal message...">' + esc(evt.message || '') + '</textarea>' +
        '</div>';
}

function readHostedForm(modal) {
    return {
        title: modal.querySelector('[name="title"]').value.trim() || 'Event',
        host_name: modal.querySelector('[name="host_name"]').value.trim() || null,
        event_date: modal.querySelector('[name="event_date"]').value,
        event_time: modal.querySelector('[name="event_time"]').value || null,
        sunset_time: modal.querySelector('[name="sunset_time"]').value || null,
        address_line1: modal.querySelector('[name="address_line1"]').value.trim() || null,
        address_line2: modal.querySelector('[name="address_line2"]').value.trim() || null,
        city: modal.querySelector('[name="city"]').value.trim() || null,
        state: modal.querySelector('[name="state"]').value.trim() || null,
        zip: modal.querySelector('[name="zip"]').value.trim() || null,
        message: modal.querySelector('[name="message"]').value.trim() || null,
    };
}

// ═══════════════════════════════════════
// CALENDAR EVENT MODALS
// ═══════════════════════════════════════
function openAddEventModal() {
    var catOptions = Object.entries(CATEGORIES).map(function(entry) { return '<option value="' + entry[0] + '">' + entry[1].label + '</option>'; }).join('');
    createModal({
        title: 'New Event',
        bodyHTML:
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Title</label><input class="form-input" name="title" placeholder="Event name" required></div>' +
                '<div class="form-group"><label>Date</label><input class="form-input" name="date" type="date" value="' + (selectedDay || getTodayStr()) + '" required></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Description</label><input class="form-input" name="description" placeholder="Details (optional)"></div>' +
                '<div class="form-group"><label>Location</label><input class="form-input" name="location" placeholder="Where?"></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Start Time</label><input class="form-input" name="time" type="text" placeholder="e.g. 2:30 PM" onfocus="this.type=\'time\'" onblur="if(!this.value)this.type=\'text\'"></div>' +
                '<div class="form-group"><label>End Time</label><input class="form-input" name="end_time" type="text" placeholder="e.g. 4:00 PM" onfocus="this.type=\'time\'" onblur="if(!this.value)this.type=\'text\'"></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Category</label>' +
                    '<select class="form-input" name="category">' + catOptions + '</select>' +
                '</div>' +
                '<div class="form-group"><label>Visibility</label>' +
                    '<select class="form-input" name="access">' +
                        '<option value="household" selected>🏠 Family</option>' +
                        '<option value="private">🔒 Private</option>' +
                        (currentUser?.role === 'admin' ? '<option value="admin">👑 Admin</option>' : '') +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Recurring</label>' +
                    '<select class="form-input" name="recurrence_rule">' +
                        '<option value="">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group"><label>Reminder</label>' +
                    '<select class="form-input" name="reminder_before">' +
                        '<option value="">None</option><option value="15">15 min before</option><option value="60">1 hr before</option><option value="1440">1 day before</option>' +
                    '</select>' +
                '</div>' +
            '</div>',
        submitLabel: 'Add Event',
        async onSubmit(modal) {
            var title = modal.querySelector('[name="title"]').value.trim();
            var date = modal.querySelector('[name="date"]').value;
            if (!title) throw new Error('Title is required');
            if (!date) throw new Error('Date is required');
            var body = {
                title: title, date: date,
                description: modal.querySelector('[name="description"]').value.trim() || null,
                location: modal.querySelector('[name="location"]').value.trim() || null,
                time: modal.querySelector('[name="time"]').value || null,
                end_time: modal.querySelector('[name="end_time"]').value || null,
                category: modal.querySelector('[name="category"]').value,
                recurrence_rule: modal.querySelector('[name="recurrence_rule"]').value || null,
                reminder_before: modal.querySelector('[name="reminder_before"]').value ? Number(modal.querySelector('[name="reminder_before"]').value) : null,
                access: modal.querySelector('[name="access"]').value,
            };
            var newEvt = await API.post('/events', body);
            if (newEvt) events.push(newEvt);
            else await loadEvents();
            render();
            showToast('Event added ✓');
        },
    });
}

function openEventDetail(id) {
    var e = events.find(function(x) { return x.id === id; });
    if (!e) return;
    var catOptions = Object.entries(CATEGORIES).map(function(entry) { return '<option value="' + entry[0] + '"' + (e.category===entry[0]?' selected':'') + '>' + entry[1].label + '</option>'; }).join('');
    createModal({
        title: 'Edit Event',
        bodyHTML:
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Title</label><input class="form-input" name="title" value="' + esc(e.title) + '" required></div>' +
                '<div class="form-group"><label>Date</label><input class="form-input" name="date" type="date" value="' + (e.date||e.start_date||'').substring(0,10) + '" required></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Description</label><input class="form-input" name="description" value="' + esc(e.description || '') + '" placeholder="Details"></div>' +
                '<div class="form-group"><label>Location</label><input class="form-input" name="location" value="' + esc(e.location || '') + '" placeholder="Where?"></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Start Time</label><input class="form-input" name="time" type="' + (e.time ? 'time' : 'text') + '" value="' + (e.time || '') + '" placeholder="e.g. 2:30 PM" onfocus="this.type=\'time\'" onblur="if(!this.value)this.type=\'text\'"></div>' +
                '<div class="form-group"><label>End Time</label><input class="form-input" name="end_time" type="' + (e.end_time ? 'time' : 'text') + '" value="' + (e.end_time || '') + '" placeholder="e.g. 4:00 PM" onfocus="this.type=\'time\'" onblur="if(!this.value)this.type=\'text\'"></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Category</label>' +
                    '<select class="form-input" name="category">' + catOptions + '</select>' +
                '</div>' +
                '<div class="form-group"><label>Visibility</label>' +
                    '<select class="form-input" name="access">' +
                        '<option value="household"' + (e.access==='household'?' selected':'') + '>🏠 Family</option>' +
                        '<option value="private"' + (e.access==='private'||!e.access?' selected':'') + '>🔒 Private</option>' +
                        (currentUser?.role === 'admin' ? '<option value="admin"' + (e.access==='admin'?' selected':'') + '>👑 Admin</option>' : '') +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div class="form-group"><label>Recurring</label>' +
                    '<select class="form-input" name="recurrence_rule">' +
                        '<option value="">None</option>' +
                        '<option value="daily"' + (e.recurrence_rule==='daily'?' selected':'') + '>Daily</option>' +
                        '<option value="weekly"' + (e.recurrence_rule==='weekly'?' selected':'') + '>Weekly</option>' +
                        '<option value="monthly"' + (e.recurrence_rule==='monthly'?' selected':'') + '>Monthly</option>' +
                        '<option value="yearly"' + (e.recurrence_rule==='yearly'?' selected':'') + '>Yearly</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group"><label>Reminder</label>' +
                    '<select class="form-input" name="reminder_before">' +
                        '<option value="">None</option>' +
                        '<option value="15"' + (e.reminder_before==15?' selected':'') + '>15 min</option>' +
                        '<option value="60"' + (e.reminder_before==60?' selected':'') + '>1 hour</option>' +
                        '<option value="1440"' + (e.reminder_before==1440?' selected':'') + '>1 day</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">' +
                '<button class="btn btn-ghost" onclick="document.querySelector(\'.modal-backdrop\').remove();deleteEvent(' + e.id + ')" style="color:var(--red);font-size:12px;"><i data-lucide="trash-2" style="width:12px;height:12px;vertical-align:-2px"></i> Delete</button>' +
            '</div>',
        submitLabel: 'Save Changes',
        async onSubmit(modal) {
            var title = modal.querySelector('[name="title"]').value.trim();
            var date = modal.querySelector('[name="date"]').value;
            if (!title) throw new Error('Title is required');
            if (!date) throw new Error('Date is required');
            var body = {
                title: title, date: date,
                description: modal.querySelector('[name="description"]').value.trim() || null,
                location: modal.querySelector('[name="location"]').value.trim() || null,
                time: modal.querySelector('[name="time"]').value || null,
                end_time: modal.querySelector('[name="end_time"]').value || null,
                category: modal.querySelector('[name="category"]').value,
                recurrence_rule: modal.querySelector('[name="recurrence_rule"]').value || null,
                reminder_before: modal.querySelector('[name="reminder_before"]').value ? Number(modal.querySelector('[name="reminder_before"]').value) : null,
                access: modal.querySelector('[name="access"]').value,
            };
            var updated = await API.put('/events/' + e.id, body);
            Object.assign(e, updated || body);
            render();
            showToast('Event updated ✓');
        },
    });
}

async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    events = events.filter(function(e) { return e.id !== id; });
    render();
    try {
        await API.delete('/events/' + id);
        showToast('Event deleted');
    } catch (err) {
        showToast(err.message, 'error');
        await loadEvents();
    }
}

// ─── Helpers ───
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function fmtTime(t) {
    if (!t) return '';
    var parts = t.split(':');
    var hr = parseInt(parts[0]);
    return (hr % 12 || 12) + ':' + parts[1] + ' ' + (hr >= 12 ? 'PM' : 'AM');
}

function formatGroupDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var today = new Date(); today.setHours(0,0,0,0);
    var diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
