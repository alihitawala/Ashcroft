/* ═══════════════════════════════════════════════════════════
   Captures Calendar View
   ═══════════════════════════════════════════════════════════ */

const CapturesCalendar = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    selectedDay: null,
    monthCache: {},
    touchStartX: 0,

    init() {
        const container = document.getElementById('capturesCalendarView');
        if (!container) return;
        container.innerHTML = '<div id="calendarWidget"></div><div id="calendarDayDetail" class="calendar-day-detail"></div>';
        this.render();
        // Swipe support
        container.addEventListener('touchstart', e => { this.touchStartX = e.touches[0].clientX; }, { passive: true });
        container.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - this.touchStartX;
            if (Math.abs(dx) > 60) {
                dx > 0 ? this.prevMonth() : this.nextMonth();
            }
        }, { passive: true });
    },

    render() {
        const widget = document.getElementById('calendarWidget');
        if (!widget) return;
        const year = this.currentYear;
        const month = this.currentMonth;
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

        let html = '<div class="cal-header">' +
            '<button class="cal-nav" onclick="CapturesCalendar.prevMonth()">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>' +
            '</button>' +
            '<span class="cal-title">' + monthNames[month] + ' ' + year + '</span>' +
            '<button class="cal-nav" onclick="CapturesCalendar.nextMonth()">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
            '</button>' +
            '</div>';

        html += '<div class="cal-grid">';
        dayNames.forEach(d => { html += '<div class="cal-day-header">' + d + '</div>'; });

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = isCurrentMonth && d === today.getDate();
            const isSelected = this.selectedDay === d;
            let cls = 'cal-cell';
            if (isToday) cls += ' today';
            if (isSelected) cls += ' selected';
            html += '<div class="' + cls + '" data-day="' + d + '" onclick="CapturesCalendar.selectDay(' + d + ')">' +
                '<span class="cal-day-num">' + d + '</span>' +
                '<div class="cal-dots" id="calDots' + d + '"></div>' +
                '</div>';
        }
        html += '</div>';

        widget.innerHTML = html;
        this.loadMonth(year, month);
    },

    async loadMonth(year, month) {
        const key = year + '-' + (month + 1);
        if (this.monthCache[key]) {
            this.applyDots(this.monthCache[key]);
            if (this.selectedDay) this.showDayDetail(this.selectedDay);
            return;
        }
        try {
            const mm = String(month + 1).padStart(2, '0');
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const data = await CapturesService.getCaptures({
                from: year + '-' + mm + '-01',
                to: year + '-' + mm + '-' + String(daysInMonth).padStart(2, '0') + 'T23:59:59',
                limit: 1000
            });
            const captures = data.captures || [];
            this.monthCache[key] = captures;
            this.applyDots(captures);
            if (this.selectedDay) this.showDayDetail(this.selectedDay);
        } catch(e) {
            console.error('Calendar load failed', e);
        }
    },

    applyDots(captures) {
        // Group by day
        const byDay = {};
        captures.forEach(c => {
            const d = new Date(c.captured_at || c.created_at || c.date);
            const day = d.getDate();
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(c);
        });

        const typeColors = {
            note: '#6366f1', link: '#3b82f6', task: '#22c55e',
            photo: '#f59e0b', checklist: '#8b5cf6', quote: '#ec4899'
        };

        for (let day = 1; day <= 31; day++) {
            const el = document.getElementById('calDots' + day);
            if (!el) continue;
            const cell = el.closest('.cal-cell');
            const items = byDay[day];
            if (!items || !items.length) {
                el.innerHTML = '';
                if (cell) cell.classList.remove('has-captures');
                continue;
            }
            if (cell) cell.classList.add('has-captures');
            // Get up to 3 unique colors
            const colors = [];
            items.forEach(c => {
                let color;
                if (c.tags && c.tags.length && c.tags[0].color) {
                    color = c.tags[0].color;
                } else {
                    color = typeColors[c.type] || '#6366f1';
                }
                if (colors.indexOf(color) === -1 && colors.length < 3) colors.push(color);
            });
            el.innerHTML = colors.map(c => '<span class="cal-dot" style="background:' + c + '"></span>').join('');
        }
    },

    selectDay(day) {
        if (this.selectedDay === day) {
            this.selectedDay = null;
            document.querySelectorAll('.cal-cell.selected').forEach(el => el.classList.remove('selected'));
            const detail = document.getElementById('calendarDayDetail');
            if (detail) { detail.classList.remove('open'); detail.innerHTML = ''; }
            return;
        }
        this.selectedDay = day;
        document.querySelectorAll('.cal-cell.selected').forEach(el => el.classList.remove('selected'));
        const cell = document.querySelector('.cal-cell[data-day="' + day + '"]');
        if (cell) cell.classList.add('selected');
        this.showDayDetail(day);
    },

    showDayDetail(day) {
        const detail = document.getElementById('calendarDayDetail');
        if (!detail) return;
        const key = this.currentYear + '-' + (this.currentMonth + 1);
        const captures = this.monthCache[key] || [];
        const dayCaps = captures.filter(c => {
            const d = new Date(c.captured_at || c.created_at || c.date);
            return d.getDate() === day;
        });

        if (!dayCaps.length) {
            detail.classList.remove('open');
            detail.innerHTML = '';
            return;
        }

        const typeIcons = {
            note: 'file-text', link: 'link', task: 'check-square',
            photo: 'image', checklist: 'list-checks', quote: 'quote'
        };
        const typeColors = {
            note: '#6366f1', link: '#3b82f6', task: '#22c55e',
            photo: '#f59e0b', checklist: '#8b5cf6', quote: '#ec4899'
        };

        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const dateStr = monthNames[this.currentMonth] + ' ' + day + ', ' + this.currentYear;

        let html = '<div class="cal-detail-header">' + dateStr + ' · ' + dayCaps.length + ' capture' + (dayCaps.length !== 1 ? 's' : '') + '</div>';
        html += '<div class="cal-detail-list">';
        dayCaps.forEach(c => {
            const icon = typeIcons[c.type] || 'file-text';
            const color = typeColors[c.type] || '#6366f1';
            const time = new Date(c.captured_at || c.created_at || c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            html += '<div class="cal-detail-item" onclick="CapturesCalendar.goToCapture(\'' + c.id + '\')">' +
                '<i data-lucide="' + icon + '" style="width:15px;height:15px;color:' + color + '" class="cal-detail-icon"></i>' +
                '<div class="cal-detail-info">' +
                    '<span class="cal-detail-title">' + (c.title || c.text || 'Untitled').substring(0, 60) + '</span>' +
                    '<span class="cal-detail-time">' + time + '</span>' +
                '</div>' +
                '</div>';
        });
        html += '</div>';
        detail.innerHTML = html;
        detail.classList.add('open');

        // Render lucide icons in detail
        if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { class: 'cal-detail-icon' } });
    },

    goToCapture(id) {
        CapturesPage.switchView('timeline');
        setTimeout(() => {
            const card = document.querySelector('[data-capture-id="' + id + '"]');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
    },

    prevMonth() {
        this.selectedDay = null;
        const detail = document.getElementById('calendarDayDetail');
        if (detail) { detail.classList.remove('open'); detail.innerHTML = ''; }
        if (this.currentMonth === 0) { this.currentMonth = 11; this.currentYear--; }
        else this.currentMonth--;
        this.render();
    },

    nextMonth() {
        this.selectedDay = null;
        const detail = document.getElementById('calendarDayDetail');
        if (detail) { detail.classList.remove('open'); detail.innerHTML = ''; }
        if (this.currentMonth === 11) { this.currentMonth = 0; this.currentYear++; }
        else this.currentMonth++;
        this.render();
    }
};
