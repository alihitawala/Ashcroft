/* ═══════════════════════════════════════════════════════════
   Captures Modal — FAB + Quick Capture Bottom Sheet
   ═══════════════════════════════════════════════════════════ */

const CapturesModal = {
    isOpen: false,
    selectedType: 'text',
    selectedTags: [],
    locationEnabled: false,
    shareEnabled: false,
    location: null,
    preservedText: '',
    selectedFile: null,

    init() {
        const fab = document.getElementById('capturesFab');
        if (fab) fab.addEventListener('click', () => this.toggle());

        const overlay = document.getElementById('captureModalOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });
        }

        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && this.isOpen) {
                e.preventDefault();
                this.submit();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    },

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    },

    open() {
        this.isOpen = true;
        const overlay = document.getElementById('captureModalOverlay');
        const fab = document.getElementById('capturesFab');
        if (overlay) overlay.classList.add('open');
        if (fab) fab.classList.add('open');
        this.render();
        setTimeout(() => {
            const input = document.getElementById('captureMainInput');
            if (input) input.focus();
        }, 100);
    },

    close() {
        this.isOpen = false;
        const overlay = document.getElementById('captureModalOverlay');
        const fab = document.getElementById('capturesFab');
        if (overlay) overlay.classList.remove('open');
        if (fab) fab.classList.remove('open');
    },

    render() {
        const modal = document.getElementById('captureModalContent');
        if (!modal) return;

        const isPhoto = this.selectedType === 'photo';

        modal.innerHTML = `
            <div class="capture-modal-handle"></div>
            <div class="capture-type-row">
                <button class="capture-type-btn${this.selectedType === 'text' ? ' active' : ''}" data-type="text">📝 Text</button>
                <button class="capture-type-btn${this.selectedType === 'photo' ? ' active' : ''}" data-type="photo">📸 Photo</button>
            </div>
            <div class="capture-auto-hint">Links & checklists are auto-detected ✨</div>
            ${isPhoto ? `
                <div class="capture-photo-zone" id="capturePhotoZone">
                    <div class="photo-zone-content" id="photoZoneContent">
                        <span class="photo-zone-icon">📷</span>
                        <span>Tap to choose photo or take one</span>
                    </div>
                    <input type="file" accept="image/*" id="captureFileInput" style="display:none">
                    <div class="photo-preview" id="photoPreview" style="display:none">
                        <img id="photoPreviewImg" alt="Preview">
                        <button class="photo-remove" id="photoRemoveBtn">✕</button>
                    </div>
                </div>
            ` : ''}
            <textarea class="capture-input" id="captureMainInput" rows="${isPhoto ? 2 : 4}" placeholder="${isPhoto ? 'Add a caption...' : 'What\'s on your mind?'}">${this._esc(this.preservedText)}</textarea>
            <div class="capture-tags-input" id="captureTagsContainer">
                ${this.selectedTags.map((t, i) =>
                    '<span class="capture-modal-tag" style="background:' + CapturesFeed._tagBg(t.color || '#635bff') + ';color:' + CapturesFeed._tagFg(t.color || '#635bff') + '">' +
                    this._esc(t.name) +
                    '<span class="remove-tag" data-idx="' + i + '">×</span></span>'
                ).join('')}
                <input type="text" placeholder="Add tags..." id="captureTagInput">
            </div>
            <div class="capture-toggles">
                <div class="capture-toggle${this.locationEnabled ? ' on' : ''}" id="captureLocToggle">📍 Add location</div>
                <div class="capture-toggle${this.shareEnabled ? ' on' : ''}" id="captureShareToggle">👥 Share with Saba</div>
            </div>
            <button class="capture-submit" id="captureSubmitBtn">Capture</button>
        `;

        // Type buttons — both enabled now
        modal.querySelectorAll('.capture-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedType = btn.dataset.type;
                this.selectedFile = null;
                this.render();
            });
        });

        // Photo file input
        if (isPhoto) {
            const zone = document.getElementById('capturePhotoZone');
            const fileInput = document.getElementById('captureFileInput');
            const zoneContent = document.getElementById('photoZoneContent');

            // Make the whole zone clickable, not just the content div
            if (zone && fileInput) {
                zone.addEventListener('click', (e) => {
                    // Don't trigger if clicking remove button or preview
                    if (e.target.closest('.photo-remove')) return;
                    if (this.selectedFile) return;
                    fileInput.click();
                });
            }

            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    this.selectedFile = file;

                    // Use FileReader as fallback — more reliable on mobile than createObjectURL
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const preview = document.getElementById('photoPreview');
                        const img = document.getElementById('photoPreviewImg');
                        const content = document.getElementById('photoZoneContent');
                        if (preview && img) {
                            img.src = ev.target.result;
                            img.onload = () => {
                                preview.style.display = 'block';
                                if (content) content.style.display = 'none';
                                // Scroll modal to show preview
                                preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            };
                        }
                    };
                    reader.readAsDataURL(file);
                });
            }

            const removeBtn = document.getElementById('photoRemoveBtn');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectedFile = null;
                    const preview = document.getElementById('photoPreview');
                    const content = document.getElementById('photoZoneContent');
                    if (preview) preview.style.display = 'none';
                    if (content) content.style.display = 'flex';
                    if (fileInput) fileInput.value = '';
                });
            }

            // Restore preview if file was already selected
            if (this.selectedFile) {
                const preview = document.getElementById('photoPreview');
                const img = document.getElementById('photoPreviewImg');
                const content = document.getElementById('photoZoneContent');
                if (preview && img) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        img.src = ev.target.result;
                        preview.style.display = 'block';
                        if (content) content.style.display = 'none';
                    };
                    reader.readAsDataURL(this.selectedFile);
                }
            }
        }

        // Tag removal
        modal.querySelectorAll('.remove-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedTags.splice(parseInt(btn.dataset.idx), 1);
                this.render();
            });
        });

        // Tag autocomplete
        const tagInput = document.getElementById('captureTagInput');
        const tagContainer = document.getElementById('captureTagsContainer');
        if (tagInput && tagContainer) {
            CapturesTags.renderAutocomplete(tagInput, tagContainer, this.selectedTags, () => this.render());
        }

        // Toggles
        document.getElementById('captureLocToggle')?.addEventListener('click', () => {
            this.locationEnabled = !this.locationEnabled;
            document.getElementById('captureLocToggle').classList.toggle('on');
            if (this.locationEnabled && !this.location) {
                navigator.geolocation?.getCurrentPosition(
                    (pos) => { this.location = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
                    () => { showToast('Location access denied', 'error'); this.locationEnabled = false; document.getElementById('captureLocToggle')?.classList.remove('on'); },
                    { timeout: 10000 }
                );
            }
        });

        document.getElementById('captureShareToggle')?.addEventListener('click', () => {
            this.shareEnabled = !this.shareEnabled;
            document.getElementById('captureShareToggle').classList.toggle('on');
        });

        document.getElementById('captureSubmitBtn')?.addEventListener('click', () => this.submit());
    },

    async submit() {
        const input = document.getElementById('captureMainInput');
        const rawInput = input?.value?.trim();

        // For photo: require file; text is optional caption
        if (this.selectedType === 'photo' && !this.selectedFile) {
            showToast('Select a photo first', 'error');
            return;
        }
        if (this.selectedType !== 'photo' && !rawInput) {
            showToast('Write something first', 'error');
            return;
        }

        const submitBtn = document.getElementById('captureSubmitBtn');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

        const tempId = '_temp_' + Date.now();
        const tempData = {
            _tempId: tempId,
            type: this.selectedType,
            raw_input: rawInput || '',
            title: null,
            body: rawInput || '',
            tags: this.selectedTags.slice(),
            shared: this.shareEnabled,
            captured_at: new Date().toISOString(),
        };

        this.preservedText = '';
        const savedFile = this.selectedFile;
        this.selectedFile = null;
        this.close();
        CapturesFeed.addOptimistic(tempData);
        showToast('Capturing...', 'success');

        try {
            const options = {
                tags: this.selectedTags.map(t => t.name),
                shared: this.shareEnabled,
            };
            if (this.locationEnabled && this.location) {
                options.latitude = this.location.lat;
                options.longitude = this.location.lng;
            }

            let result;
            if (this.selectedType === 'photo' && savedFile) {
                result = await CapturesService.createPhotoCapture(rawInput || '', savedFile, options);
            } else {
                result = await CapturesService.createCapture(rawInput, options);
            }

            CapturesFeed.replaceOptimistic(tempId, result);
            if (typeof CapturesMap !== 'undefined') CapturesMap.addCapture(result);
            showToast('Captured!', 'success');
            CapturesService.getTags().then(tags => CapturesTags.setTags(tags)).catch(() => {});
            this.selectedTags = [];
            this.selectedType = 'text';
            this.locationEnabled = false;
            this.shareEnabled = false;
            CapturesGrid.invalidate();
        } catch (err) {
            CapturesFeed.removeOptimistic(tempId);
            this.preservedText = rawInput || '';
            this.selectedFile = savedFile;
            showToast(err.message || 'Failed to save capture', 'error');
            this.open();
        }
    },

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }
};
