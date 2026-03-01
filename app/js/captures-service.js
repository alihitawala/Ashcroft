/* ═══════════════════════════════════════════════════════════
   Captures Service — API Layer
   ═══════════════════════════════════════════════════════════ */

const CapturesService = {
    async getCaptures(filters = {}) {
        const params = new URLSearchParams();
        if (filters.page) params.set('page', filters.page);
        if (filters.limit) params.set('limit', filters.limit);
        if (filters.type) params.set('type', filters.type);
        if (filters.q) params.set('q', filters.q);
        if (filters.from) params.set('from', filters.from);
        if (filters.to) params.set('to', filters.to);
        if (filters.sort) params.set('sort', filters.sort);
        if (filters.tags && filters.tags.length) {
            filters.tags.forEach(t => params.append('tag', t));
        }
        if (filters.shared_only) params.set('shared_only', 'true');
        const qs = params.toString();
        return API.get('/captures' + (qs ? '?' + qs : ''));
    },

    async createCapture(rawInput, options = {}) {
        const body = { raw_input: rawInput };
        if (options.tags) body.tags = options.tags;
        if (options.latitude != null) body.latitude = options.latitude;
        if (options.longitude != null) body.longitude = options.longitude;
        if (options.shared != null) body.shared = options.shared;
        return API.post('/captures', body);
    },

    async updateCapture(id, data) {
        return API.put('/captures/' + id, data);
    },

    async deleteCapture(id) {
        return API.delete('/captures/' + id);
    },

    async getTags() {
        return API.get('/captures/tags/all');
    },

    async createPhotoCapture(rawInput, imageFile, options = {}) {
        const formData = new FormData();
        formData.append('image', imageFile);
        if (rawInput) formData.append('raw_input', rawInput);
        if (options.tags) formData.append('tags', JSON.stringify(options.tags));
        if (options.latitude != null) formData.append('latitude', options.latitude);
        if (options.longitude != null) formData.append('longitude', options.longitude);
        if (options.shared != null) formData.append('shared', options.shared);

        const token = localStorage.getItem('token');
        const res = await fetch('/api/captures', {
            method: 'POST',
            headers: token ? { 'Authorization': 'Bearer ' + token } : {},
            body: formData
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Upload failed');
        }
        return res.json();
    },

    async createTag(name, color) {
        return API.post('/captures/tags', { name, color });
    },
};
