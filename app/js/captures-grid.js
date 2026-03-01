/* ═══════════════════════════════════════════════════════════
   Captures Grid — Pinterest-style masonry layout
   ═══════════════════════════════════════════════════════════ */

const CapturesGrid = {
    rendered: false,

    render(captures) {
        const el = document.getElementById('capturesGridView');
        if (!el) return;

        if (!captures || !captures.length) {
            el.innerHTML = '<div class="captures-empty"><div class="empty-icon">📐</div><h3>No captures to show</h3><p>Captures will appear here in a grid layout.</p></div>';
            return;
        }

        const frag = document.createDocumentFragment();
        const grid = document.createElement('div');
        grid.className = 'captures-grid';

        captures.forEach(cap => {
            const card = document.createElement('div');
            card.className = 'grid-card';
            const theme = CapturesFeed.getTheme(cap.id);
            card.style.background = theme.bg;
            card.style.borderLeft = '3px solid ' + theme.border;

            let html = '';

            // Image
            if (cap.type === 'photo' && cap.image_path) {
                html += '<img class="grid-card-img" src="' + CapturesFeed._esc(cap.image_thumb_path || cap.image_path) + '" alt="" loading="lazy">';
            } else if (cap.type === 'link' && cap.og_image) {
                html += '<img class="grid-card-img grid-card-img-link" src="' + CapturesFeed._esc(cap.og_image) + '" alt="" loading="lazy">';
            }

            html += '<div class="grid-card-body">';
            if (cap.title) {
                html += '<div class="grid-card-title">' + CapturesFeed._esc(cap.title) + '</div>';
            }
            if (cap.body) {
                html += '<div class="grid-card-text">' + CapturesFeed._esc(cap.body) + '</div>';
            }
            if (cap.tags && cap.tags.length) {
                html += '<div class="grid-card-tags">';
                cap.tags.forEach(tag => {
                    const color = tag.color || '#635bff';
                    html += '<span class="capture-tag" style="background:' + color + '1a;color:' + color + '">' + CapturesFeed._esc(tag.name) + '</span>';
                });
                html += '</div>';
            }
            html += '</div>';

            card.innerHTML = html;
            card.addEventListener('click', () => {
                // Switch to timeline and scroll to this card
                const tab = document.querySelector('.view-tab[data-view="timeline"]');
                if (tab) tab.click();
                setTimeout(() => {
                    const feedCard = document.querySelector('.capture-card[data-id="' + cap.id + '"]');
                    if (feedCard) feedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            });

            grid.appendChild(card);
        });

        frag.appendChild(grid);
        el.innerHTML = '';
        el.appendChild(frag);
        this.rendered = true;
    },

    invalidate() {
        this.rendered = false;
    }
};
