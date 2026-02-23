/* ═══════════════════════════════════════════════════════════
   ashcroft.cloud — UI Utilities
   Modals, toasts, dropdowns, loading states
   ═══════════════════════════════════════════════════════════ */

// ─── Toast Notifications ───
function ensureToastContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) {
        c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
    }
    return c;
}

function showToast(message, type = 'success') {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Modal ───
function createModal({ title, bodyHTML, onSubmit, submitLabel = 'Save' }) {
    document.querySelector('.modal-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop visible';

    backdrop.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">${bodyHTML}</div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
                <button class="btn btn-primary modal-submit-btn">${submitLabel}</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const close = () => { backdrop.remove(); document.removeEventListener('keydown', escHandler); };
    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    backdrop.querySelector('.modal-close').onclick = close;
    backdrop.querySelector('.modal-cancel-btn').onclick = close;
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });

    const submitBtn = backdrop.querySelector('.modal-submit-btn');
    submitBtn.onclick = async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>';
        try {
            await onSubmit(backdrop);
            close();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
        }
    };

    setTimeout(() => {
        backdrop.querySelector('input, textarea, select')?.focus();
    }, 50);

    return { close, backdrop };
}
