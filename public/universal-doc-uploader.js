// ============================================================================
// CASH MANAGEMENT BC — UNIVERSAL DOCUMENT UPLOADER & CUSTOMER DOCS VIEWER
// Complete multi-document drag-and-drop, clipboard paste, rename on upload,
// entity-linked previews, and universal customer document viewer modal.
// ============================================================================

(function () {
    function escUduHtml(val) {
        if (val === null || val === undefined) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ------------------------------------------------------------------------
    // 1. INJECT STYLES (Supports Light and Dark Theme seamlessly)
    // ------------------------------------------------------------------------
    if (!document.getElementById('udu-injected-styles')) {
        const style = document.createElement('style');
        style.id = 'udu-injected-styles';
        style.textContent = `
            .udu-wrapper {
                background: var(--bg-card, #ffffff);
                border: 1.5px solid var(--border-color, #e2e8f0);
                border-radius: 10px;
                padding: 12px 14px;
                margin-top: 6px;
                margin-bottom: 8px;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            [data-theme="dark"] .udu-wrapper,
            body:not(.light-theme):not([data-theme="light"]) .udu-wrapper {
                background: rgba(30, 41, 59, 0.45);
                border-color: rgba(148, 163, 184, 0.2);
            }
            .udu-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
                flex-wrap: wrap;
                gap: 6px;
            }
            .udu-title-wrap {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                font-weight: 700;
                color: var(--text-primary, #1e293b);
            }
            .udu-title-icon { font-size: 15px; }
            .udu-badge {
                font-size: 11px;
                padding: 2px 7px;
                border-radius: 12px;
                background: rgba(2, 132, 199, 0.12);
                color: #0284c7;
                font-weight: 700;
            }
            .udu-header-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .udu-header-paste-btn {
                background: rgba(16, 185, 129, 0.12);
                color: #10b981;
                border: 1px solid rgba(16, 185, 129, 0.35);
                padding: 3px 9px;
                border-radius: 5px;
                font-size: 11.5px;
                font-weight: 700;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }
            .udu-header-paste-btn:hover {
                background: #10b981;
                color: #ffffff;
            }
            .udu-hint {
                font-size: 11px;
                color: var(--text-muted, #64748b);
            }
            .udu-dropzone {
                border: 2px dashed rgba(2, 132, 199, 0.4);
                border-radius: 8px;
                padding: 14px 12px;
                text-align: center;
                background: rgba(2, 132, 199, 0.03);
                cursor: pointer;
                transition: all 0.2s ease;
                outline: none;
            }
            .udu-dropzone:hover, .udu-dropzone.drag-over {
                border-color: #0284c7;
                background: rgba(2, 132, 199, 0.09);
                transform: translateY(-1px);
            }
            .udu-dropzone-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
            }
            .udu-dropzone-icon {
                font-size: 24px;
                color: #0284c7;
            }
            .udu-dropzone-text {
                font-size: 12.5px;
                font-weight: 600;
                color: var(--text-primary, #1e293b);
            }
            .udu-dropzone-sub {
                font-size: 11px;
                color: var(--text-muted, #64748b);
            }
            .udu-staged-list, .udu-existing-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-top: 8px;
            }
            .udu-file-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                border-radius: 6px;
                background: rgba(2, 132, 199, 0.06);
                border: 1px solid rgba(2, 132, 199, 0.2);
            }
            .udu-file-thumb {
                width: 36px;
                height: 36px;
                border-radius: 4px;
                object-fit: cover;
                background: #0f172a;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }
            .udu-file-info {
                flex: 1;
                min-width: 0;
            }
            .udu-file-name-input {
                width: 100%;
                background: var(--bg-card, #ffffff);
                border: 1px solid var(--border-color, #cbd5e1);
                border-radius: 4px;
                padding: 3px 6px;
                font-size: 12px;
                font-weight: 600;
                color: var(--text-primary, #0f172a);
                outline: none;
            }
            .udu-file-meta {
                font-size: 10.5px;
                color: var(--text-muted, #64748b);
                margin-top: 2px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .udu-file-remove-btn {
                background: transparent;
                border: none;
                color: #ef4444;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s;
            }
            .udu-file-remove-btn:hover {
                background: rgba(239, 68, 68, 0.15);
            }
            .udu-existing-section {
                margin-bottom: 8px;
            }
            .udu-sub-heading {
                font-size: 11px;
                font-weight: 700;
                color: var(--text-muted, #64748b);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }
            /* Universal Customer Docs Modal Styles */
            .udoc-doc-card {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                border-radius: 8px;
                background: var(--bg-card, #ffffff);
                border: 1.5px solid var(--border-color, #e2e8f0);
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .udoc-doc-card:hover {
                border-color: #0284c7;
                transform: translateX(2px);
            }
            .udoc-doc-card.active {
                border-color: #0284c7;
                background: rgba(2, 132, 199, 0.1);
                box-shadow: 0 0 0 1px #0284c7;
            }
            .udoc-doc-thumb {
                width: 44px;
                height: 44px;
                border-radius: 6px;
                object-fit: cover;
                background: #1e293b;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                flex-shrink: 0;
            }
            .udoc-doc-info {
                flex: 1;
                min-width: 0;
            }
            .udoc-doc-title {
                font-size: 12.5px;
                font-weight: 700;
                color: var(--text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .udoc-doc-sub {
                font-size: 11px;
                color: var(--text-muted);
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    // ------------------------------------------------------------------------
    // 2. UNIVERSAL DOC UPLOADER ENGINE
    // ------------------------------------------------------------------------
    const uploaderInstances = {};

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getFileCategoryIcon(fileName) {
        const ext = (fileName || '').split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return '🖼️';
        if (ext === 'pdf') return '📕';
        if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return '📄';
        if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
        return '📎';
    }

    window.UniversalDocUploader = {
        init: function (containerId, options = {}) {
            const container = document.getElementById(containerId);
            if (!container) return;

            const opts = Object.assign({
                entityType: 'transaction',
                entityId: null,
                customerId: null,
                title: '📎 Documents (Upload & Rename)',
                allowMultiple: true
            }, options);

            uploaderInstances[containerId] = {
                opts,
                stagedFiles: [],
                existingDocs: []
            };

            const cleanTitle = opts.title || '📎 Documents';

            container.innerHTML = `
                <div class="udu-wrapper">
                    <div class="udu-header">
                        <div class="udu-title-wrap">
                            <span class="udu-title-icon">📎</span>
                            <span class="udu-title">${escUduHtml(cleanTitle)}</span>
                            <span class="udu-badge" id="${containerId}_countBadge">0 Documents</span>
                        </div>
                        <div class="udu-header-actions">
                            <button type="button" class="udu-header-paste-btn" onclick="UniversalDocUploader.pasteFromClipboard('${containerId}')" title="Clipboard se copy kiya hua document direct paste karein">
                                <span>📋 Paste</span>
                            </button>
                            <span class="udu-hint">Multiple files + Rename support</span>
                        </div>
                    </div>
                    <div class="udu-existing-section" id="${containerId}_existingSection" style="display: none;">
                        <div class="udu-sub-heading">Uploaded Documents:</div>
                        <div class="udu-existing-list" id="${containerId}_existingList"></div>
                    </div>
                    <input type="file" id="${containerId}_fileInput" style="display: none !important;" ${opts.allowMultiple ? 'multiple' : ''} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv">
                    <div class="udu-dropzone" id="${containerId}_dropzone" role="button" tabindex="0">
                        <div class="udu-dropzone-content">
                            <div class="udu-dropzone-icon">📁</div>
                            <div class="udu-dropzone-text">File drag karein ya click karke select karein</div>
                            <div class="udu-dropzone-sub">Image (JPG/PNG), PDF, Word, Excel — Ctrl+V se paste bhi kar sakte hain</div>
                        </div>
                    </div>
                    <div class="udu-staged-list" id="${containerId}_stagedList" style="display: none;"></div>
                </div>
            `;

            const dropzone = document.getElementById(`${containerId}_dropzone`);
            const fileInput = document.getElementById(`${containerId}_fileInput`);

            if (dropzone && fileInput) {
                dropzone.addEventListener('click', () => fileInput.click());
                dropzone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add('drag-over');
                });
                dropzone.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('drag-over');
                });
                dropzone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('drag-over');
                    if (e.dataTransfer && e.dataTransfer.files) {
                        UniversalDocUploader.stageFiles(containerId, e.dataTransfer.files);
                    }
                });
                fileInput.addEventListener('change', () => {
                    if (fileInput.files) {
                        UniversalDocUploader.stageFiles(containerId, fileInput.files);
                        fileInput.value = '';
                    }
                });
            }
        },

        reset: function (containerId) {
            const inst = uploaderInstances[containerId];
            if (!inst) return;
            inst.stagedFiles = [];
            inst.existingDocs = [];
            const stagedList = document.getElementById(`${containerId}_stagedList`);
            if (stagedList) {
                stagedList.innerHTML = '';
                stagedList.style.display = 'none';
            }
            const existingSection = document.getElementById(`${containerId}_existingSection`);
            if (existingSection) existingSection.style.display = 'none';
            const badge = document.getElementById(`${containerId}_countBadge`);
            if (badge) badge.textContent = '0 Documents';
        },

        hasPendingFiles: function (containerId) {
            const inst = uploaderInstances[containerId];
            return Boolean(inst && inst.stagedFiles && inst.stagedFiles.length > 0);
        },

        getPendingFiles: function (containerId) {
            const inst = uploaderInstances[containerId];
            return inst ? inst.stagedFiles : [];
        },

        stageFiles: function (containerId, fileList) {
            const inst = uploaderInstances[containerId];
            if (!inst) return;

            Array.from(fileList).forEach(file => {
                const isImage = file.type.startsWith('image/');
                const previewUrl = isImage ? URL.createObjectURL(file) : null;
                const fileObj = {
                    file,
                    id: 'f_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                    name: file.name,
                    customName: file.name,
                    size: file.size,
                    formattedSize: formatBytes(file.size),
                    previewUrl,
                    isImage
                };
                if (!inst.opts.allowMultiple) {
                    inst.stagedFiles = [fileObj];
                } else {
                    inst.stagedFiles.push(fileObj);
                }
            });

            UniversalDocUploader.renderStaged(containerId);
        },

        removeStagedFile: function (containerId, fileId) {
            const inst = uploaderInstances[containerId];
            if (!inst) return;
            const idx = inst.stagedFiles.findIndex(f => f.id === fileId);
            if (idx !== -1) {
                if (inst.stagedFiles[idx].previewUrl) {
                    try { URL.revokeObjectURL(inst.stagedFiles[idx].previewUrl); } catch (e) { }
                }
                inst.stagedFiles.splice(idx, 1);
            }
            UniversalDocUploader.renderStaged(containerId);
        },

        updateCustomName: function (containerId, fileId, newName) {
            const inst = uploaderInstances[containerId];
            if (!inst) return;
            const fileObj = inst.stagedFiles.find(f => f.id === fileId);
            if (fileObj) {
                fileObj.customName = (newName || '').trim() || fileObj.name;
            }
        },

        renderStaged: function (containerId) {
            const inst = uploaderInstances[containerId];
            const listEl = document.getElementById(`${containerId}_stagedList`);
            const badge = document.getElementById(`${containerId}_countBadge`);
            if (!inst || !listEl) return;

            const totalDocs = inst.stagedFiles.length + inst.existingDocs.length;
            if (badge) {
                badge.textContent = `${totalDocs} Documents`;
                badge.style.background = totalDocs > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(2, 132, 199, 0.12)';
                badge.style.color = totalDocs > 0 ? '#10b981' : '#0284c7';
            }

            if (inst.stagedFiles.length === 0) {
                listEl.innerHTML = '';
                listEl.style.display = 'none';
                return;
            }

            listEl.style.display = 'flex';
            listEl.innerHTML = inst.stagedFiles.map((f, i) => `
                <div class="udu-file-item">
                    ${f.isImage ? `<img src="${f.previewUrl}" class="udu-file-thumb" alt="Preview">` : `<div class="udu-file-thumb">${getFileCategoryIcon(f.name)}</div>`}
                    <div class="udu-file-info">
                        <input type="text" class="udu-file-name-input" value="${escUduHtml(f.customName || f.name)}" onchange="UniversalDocUploader.updateCustomName('${escUduHtml(containerId)}', '${escUduHtml(f.id)}', this.value)" placeholder="File Name (Rename karein)">
                        <div class="udu-file-meta">
                            <span>Original: ${escUduHtml(f.name)}</span> • <span>${escUduHtml(f.formattedSize)}</span>
                        </div>
                    </div>
                    <button type="button" class="udu-file-remove-btn" onclick="UniversalDocUploader.removeStagedFile('${escUduHtml(containerId)}', '${escUduHtml(f.id)}')" title="Hataayein">✖</button>
                </div>
            `).join('');
        },

        loadExisting: async function (containerId, entityType, entityId, customerId = null) {
            const inst = uploaderInstances[containerId];
            if (!inst) return;

            try {
                let url = `/api/documents/by-entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
                if (entityType === 'customer' || (!entityId && customerId)) {
                    url = `/api/documents/customer/${encodeURIComponent(customerId || entityId)}`;
                }

                const res = await fetch(url);
                const json = await res.json();
                const docs = Array.isArray(json.data) ? json.data : (json.data?.documents || []);
                inst.existingDocs = docs;

                const section = document.getElementById(`${containerId}_existingSection`);
                const list = document.getElementById(`${containerId}_existingList`);
                const badge = document.getElementById(`${containerId}_countBadge`);

                const totalDocs = inst.stagedFiles.length + inst.existingDocs.length;
                if (badge) {
                    badge.textContent = `${totalDocs} Documents`;
                    badge.style.background = totalDocs > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(2, 132, 199, 0.12)';
                    badge.style.color = totalDocs > 0 ? '#10b981' : '#0284c7';
                }

                if (!section || !list) return;

                if (docs.length === 0) {
                    section.style.display = 'none';
                    list.innerHTML = '';
                    return;
                }

                section.style.display = 'block';
                list.innerHTML = docs.map(d => {
                    const isImg = (d.FileType || '').match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i);
                    const viewUrl = `/api/documents/${d.DocumentID}/view`;
                    return `
                        <div class="udu-file-item" style="background: rgba(15, 23, 42, 0.04); border-color: rgba(148, 163, 184, 0.3);">
                            ${isImg ? `<img src="${viewUrl}" class="udu-file-thumb" alt="" onerror="this.style.opacity='0.4';" onclick="openCustomerDocsModal(${d.CustomerID || 0}, '', ${d.DocumentID})" style="cursor: pointer;">` : `<div class="udu-file-thumb" onclick="openCustomerDocsModal(${d.CustomerID || 0}, '', ${d.DocumentID})" style="cursor: pointer;">${getFileCategoryIcon(d.FileName)}</div>`}
                            <div class="udu-file-info" style="cursor: pointer;" onclick="openCustomerDocsModal(${d.CustomerID || 0}, '', ${d.DocumentID})">
                                <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${escUduHtml(d.OriginalName || d.FileName)}</div>
                                <div class="udu-file-meta">
                                    <span>${formatBytes(d.FileSize)}</span> • <span>${new Date(d.CreatedAt).toLocaleDateString('hi-IN')}</span>
                                </div>
                            </div>
                            <a href="/api/documents/${d.DocumentID}/download" class="btn-ghost btn-sm" download title="Download Karein" style="padding: 2px 6px; font-size: 11px;">⬇️</a>
                            <button type="button" class="udu-file-remove-btn" onclick="UniversalDocUploader.deleteExistingDoc('${containerId}', ${d.DocumentID})" title="Document Delete Karein">🗑️</button>
                        </div>
                    `;
                }).join('');
            } catch (err) {
                console.error('loadExisting error:', err);
            }
        },

        deleteExistingDoc: async function (containerId, docId) {
            if (!confirm('Kya aap is document ko delete karna chahte hain?')) return;
            try {
                const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) {
                    if (typeof showToast === 'function') showToast('Document delete kar diya gaya', 'success');
                    const inst = uploaderInstances[containerId];
                    if (inst) {
                        UniversalDocUploader.loadExisting(containerId, inst.opts.entityType, inst.opts.entityId, inst.opts.customerId);
                    }
                } else {
                    if (typeof showToast === 'function') showToast(json.error || 'Delete failed', 'error');
                }
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        },

        uploadPending: async function (containerId, overrideOptions = {}) {
            const inst = uploaderInstances[containerId];
            if (!inst || !inst.stagedFiles || inst.stagedFiles.length === 0) return { success: true, count: 0 };

            const entityType = overrideOptions.entityType || inst.opts.entityType || 'transaction';
            const entityId = overrideOptions.entityId || inst.opts.entityId || null;
            const customerId = overrideOptions.customerId || inst.opts.customerId || null;

            const formData = new FormData();
            formData.append('EntityType', entityType);
            if (entityId) formData.append('EntityID', entityId);
            if (customerId) formData.append('CustomerID', customerId);

            const customNames = [];
            inst.stagedFiles.forEach(f => {
                formData.append('files', f.file);
                customNames.push(f.customName || f.name);
            });
            formData.append('customNames', JSON.stringify(customNames));

            const res = await fetch('/api/documents/upload', {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (json.success) {
                inst.stagedFiles = [];
                UniversalDocUploader.renderStaged(containerId);
                UniversalDocUploader.loadExisting(containerId, entityType, entityId, customerId);
                return json;
            } else {
                throw new Error(json.error || 'Upload fail ho gaya');
            }
        },

        pasteFromClipboard: async function (containerId) {
            try {
                if (!navigator.clipboard || !navigator.clipboard.read) {
                    if (typeof showToast === 'function') showToast('Clipboard access browser me allowed nahi hai. Drag & Drop karein.', 'warning');
                    return;
                }
                const clipboardItems = await navigator.clipboard.read();
                let filesFound = [];

                for (const item of clipboardItems) {
                    for (const type of item.types) {
                        if (type.startsWith('image/')) {
                            const blob = await item.getType(type);
                            const ext = type.split('/')[1] || 'png';
                            const file = new File([blob], `Pasted_Doc_${Date.now()}.${ext}`, { type });
                            filesFound.push(file);
                        }
                    }
                }

                if (filesFound.length > 0) {
                    UniversalDocUploader.stageFiles(containerId, filesFound);
                    if (typeof showToast === 'function') showToast(`📋 ${filesFound.length} document clipboard se paste ho gaya!`, 'success');
                } else {
                    if (typeof showToast === 'function') showToast('Clipboard me koi image/document nahi mila. Pehle print-screen ya copy karein.', 'info');
                }
            } catch (err) {
                console.warn('Paste failed:', err);
                if (typeof showToast === 'function') showToast('Clipboard paste error: ' + err.message, 'warning');
            }
        }
    };

    // ------------------------------------------------------------------------
    // 3. UNIVERSAL CUSTOMER DOCUMENTS MODAL ENGINE
    // ------------------------------------------------------------------------
    let currentCustDocsId = null;
    let currentCustomerData = null;
    let currentCustDocsList = [];
    let currentSelectedDoc = null;
    let currentUdocZoom = 1.0;

    window.openCustomerDocsModal = async function (customerId, customerName = '', targetDocId = null) {
        if (!customerId || isNaN(parseInt(customerId))) {
            if (typeof showToast === 'function') showToast('Kripya pehle customer select karein', 'info');
            return;
        }

        const custId = parseInt(customerId, 10);
        currentCustDocsId = custId;
        currentSelectedDoc = null;
        currentUdocZoom = 1.0;

        const modal = document.getElementById('universalCustomerDocsModal');
        if (!modal) {
            console.error('universalCustomerDocsModal not found in DOM');
            return;
        }

        if (typeof openModal === 'function') {
            openModal('universalCustomerDocsModal');
        } else {
            modal.style.display = 'flex';
        }
        modal.style.setProperty('z-index', '100050', 'important');

        const nameEl = document.getElementById('udocCustomerName');
        const idBadge = document.getElementById('udocCustomerIdBadge');
        const countBadge = document.getElementById('udocCountBadge');
        const phoneEl = document.getElementById('udocCustomerPhone');
        const aadhaarEl = document.getElementById('udocCustomerAadhaar');
        const dobEl = document.getElementById('udocCustomerDob');

        if (nameEl) nameEl.textContent = customerName || 'Customer Documents';
        if (idBadge) idBadge.textContent = `ID: #${custId}`;
        if (countBadge) countBadge.textContent = 'Loading...';
        if (phoneEl) phoneEl.textContent = '📱 —';
        if (aadhaarEl) aadhaarEl.textContent = '🪪 —';
        if (dobEl) dobEl.textContent = '🎂 —';

        // Init inline uploader
        if (window.UniversalDocUploader) {
            UniversalDocUploader.init('udocQuickUploaderBox', {
                entityType: 'customer',
                entityId: custId,
                customerId: custId,
                title: '📎 Naya Dastavej Upload Karein'
            });
            UniversalDocUploader.reset('udocQuickUploaderBox');
        }

        await reloadCurrentCustomerDocs(targetDocId);
    };

    window.closeCustomerDocsModal = function () {
        if (typeof closeModal === 'function') {
            closeModal('universalCustomerDocsModal');
        } else {
            const modal = document.getElementById('universalCustomerDocsModal');
            if (modal) modal.style.display = 'none';
        }
    };

    window.reloadCurrentCustomerDocs = async function (targetDocId = null) {
        if (!currentCustDocsId) return;
        const listContainer = document.getElementById('udocDocsListContainer');
        if (listContainer) {
            listContainer.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 20px;">Dastavej load ho rahe hain...</div>';
        }

        try {
            const res = await fetch(`/api/documents/customer/${currentCustDocsId}`);
            const json = await res.json();
            if (!json.success) {
                if (listContainer) listContainer.innerHTML = `<div style="color: #ef4444; padding: 14px;">Error: ${escUduHtml(json.error || 'Load failed')}</div>`;
                return;
            }

            const cust = json.data?.customer || {};
            const docs = Array.isArray(json.data?.documents) ? json.data.documents : (Array.isArray(json.data) ? json.data : []);

            currentCustomerData = cust;
            currentCustDocsList = docs;

            const nameEl = document.getElementById('udocCustomerName');
            const idBadge = document.getElementById('udocCustomerIdBadge');
            const countBadge = document.getElementById('udocCountBadge');
            const phoneEl = document.getElementById('udocCustomerPhone');
            const aadhaarEl = document.getElementById('udocCustomerAadhaar');
            const dobEl = document.getElementById('udocCustomerDob');

            if (nameEl && cust.CustomerName) nameEl.textContent = cust.CustomerName;
            if (idBadge) idBadge.textContent = `ID: #${currentCustDocsId}`;
            if (countBadge) countBadge.textContent = `${docs.length} Dastavej`;
            if (phoneEl) phoneEl.textContent = cust.Phone ? `📱 ${cust.Phone}` : '📱 —';
            if (aadhaarEl) aadhaarEl.textContent = cust.AadhaarNumber ? `🪪 ${cust.AadhaarNumber}` : '🪪 —';
            if (dobEl) {
                const dob = cust.DateOfBirth ? new Date(cust.DateOfBirth).toLocaleDateString('hi-IN') : '—';
                dobEl.textContent = `🎂 ${dob}`;
            }

            renderCustomerDocsList(docs);

            if (docs.length > 0) {
                const selected = targetDocId ? docs.find(d => d.DocumentID == targetDocId) : docs[0];
                udocSelectDoc((selected || docs[0]).DocumentID);
            } else {
                udocClearViewer();
            }
        } catch (err) {
            console.error('reloadCurrentCustomerDocs error:', err);
            if (listContainer) listContainer.innerHTML = `<div style="color: #ef4444; padding: 14px;">Error: ${escUduHtml(err.message)}</div>`;
        }
    };

    function renderCustomerDocsList(docs) {
        const listContainer = document.getElementById('udocDocsListContainer');
        if (!listContainer) return;

        if (docs.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: #94a3b8; padding: 30px 10px;">
                    <div style="font-size: 36px; margin-bottom: 8px;">📂</div>
                    <div style="font-weight: 700; color: var(--text-primary); font-size: 14px;">Koi Document Nahi Hai</div>
                    <div style="font-size: 11.5px; margin-top: 4px;">Upar "+ Naya Upload" ya "Direct Paste" button se pehla document add karein.</div>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = docs.map(d => {
            const isImg = (d.FileType || '').match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i);
            const viewUrl = `/api/documents/${d.DocumentID}/view`;
            const isActive = currentSelectedDoc && currentSelectedDoc.DocumentID === d.DocumentID;
            return `
                <div class="udoc-doc-card ${isActive ? 'active' : ''}" id="udocCard_${Number(d.DocumentID)}" onclick="udocSelectDoc(${Number(d.DocumentID)})">
                    ${isImg ? `<img src="${viewUrl}" class="udoc-doc-thumb" alt="" onerror="this.style.opacity='0.4';">` : `<div class="udoc-doc-thumb">${getFileCategoryIcon(d.FileName)}</div>`}
                    <div class="udoc-doc-info">
                        <div class="udoc-doc-title" title="${escUduHtml(d.OriginalName || d.FileName)}">${escUduHtml(d.OriginalName || d.FileName)}</div>
                        <div class="udoc-doc-sub">
                            <span>${escUduHtml(d.Category || d.FileType || 'Doc')}</span> • <span>${formatBytes(d.FileSize)}</span> • <span>${new Date(d.CreatedAt).toLocaleDateString('hi-IN')}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.udocSelectDoc = function (docId) {
        const doc = currentCustDocsList.find(d => d.DocumentID === docId);
        if (!doc) return;
        currentSelectedDoc = doc;
        currentUdocZoom = 1.0;

        document.querySelectorAll('.udoc-doc-card').forEach(c => c.classList.remove('active'));
        const activeCard = document.getElementById(`udocCard_${docId}`);
        if (activeCard) activeCard.classList.add('active');

        const toolbar = document.getElementById('udocViewerToolbar');
        const titleEl = document.getElementById('udocPreviewTitle');
        const badgeEl = document.getElementById('udocPreviewBadge');
        const contentEl = document.getElementById('udocViewerContent');

        if (toolbar) toolbar.style.display = 'flex';
        if (titleEl) titleEl.textContent = doc.OriginalName || doc.FileName;
        if (badgeEl) badgeEl.textContent = doc.FileType || doc.Category || 'Document';

        if (!contentEl) return;
        const viewUrl = `/api/documents/${doc.DocumentID}/view`;
        const isImg = (doc.FileType || '').match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i);
        const isPdf = (doc.FileType || '').toLowerCase() === '.pdf';

        if (isImg) {
            contentEl.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 20px;">
                    <img id="udocPreviewImg" src="${viewUrl}" alt="${escUduHtml(doc.OriginalName || '')}" style="max-width: 100%; max-height: 100%; object-fit: contain; transition: transform 0.2s ease; transform: scale(1.0); box-shadow: 0 4px 20px rgba(0,0,0,0.5); border-radius: 6px;">
                </div>
            `;
        } else if (isPdf) {
            contentEl.innerHTML = `
                <iframe src="${viewUrl}" style="width: 100%; height: 100%; border: none;" title="PDF Preview"></iframe>
            `;
        } else {
            contentEl.innerHTML = `
                <div style="text-align: center; color: #94a3b8; padding: 40px;">
                    <div style="font-size: 56px; margin-bottom: 12px;">${getFileCategoryIcon(doc.FileName)}</div>
                    <h3 style="color: #f8fafc; font-size: 16px; margin: 0 0 8px 0;">${escUduHtml(doc.OriginalName || doc.FileName)}</h3>
                    <p style="font-size: 13px; color: #94a3b8;">Is format ka live preview browser me uplabdh nahi hai.</p>
                    <a href="/api/documents/${doc.DocumentID}/download" class="btn-primary" style="margin-top: 14px; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; padding: 8px 18px; border-radius: 6px;" download>
                        <span>⬇️ Document Download Karein</span>
                    </a>
                </div>
            `;
        }
    };

    function udocClearViewer() {
        const toolbar = document.getElementById('udocViewerToolbar');
        const contentEl = document.getElementById('udocViewerContent');
        if (toolbar) toolbar.style.display = 'none';
        if (contentEl) {
            contentEl.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 30px;" id="udocViewerPlaceholder">
                    <div style="font-size: 48px; margin-bottom: 10px;">📄</div>
                    <h4 style="color: #94a3b8; font-size: 15px; margin: 0 0 6px 0;">Koi Document Select Karein</h4>
                    <p style="font-size: 12.5px; margin: 0;">Baayein (Left) taraf se kisi bhi dastavej par click karke yahin preview dekhein.</p>
                </div>
            `;
        }
    }

    window.toggleUdocUploadPanel = function () {
        const panel = document.getElementById('udocQuickUploadPanel');
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    window.pasteAndDirectUploadCurrentCustomer = async function () {
        if (!currentCustDocsId) {
            if (typeof showToast === 'function') showToast('Customer selected nahi hai', 'error');
            return;
        }

        try {
            if (!navigator.clipboard || !navigator.clipboard.read) {
                if (typeof showToast === 'function') showToast('Clipboard access browser me allowed nahi hai', 'warning');
                return;
            }

            const items = await navigator.clipboard.read();
            let pastedFile = null;

            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const ext = type.split('/')[1] || 'png';
                        pastedFile = new File([blob], `Direct_Paste_${Date.now()}.${ext}`, { type });
                        break;
                    }
                }
                if (pastedFile) break;
            }

            if (!pastedFile) {
                if (typeof showToast === 'function') showToast('Clipboard me koi image nahi mili. Pehle Ctrl+C ya Screenshot copy karein.', 'info');
                return;
            }

            const customName = prompt('Dastavej ka naam darj karein (e.g. Aadhaar Card, Photo, Bank Passbook):', 'Aadhaar Card') || pastedFile.name;

            const formData = new FormData();
            formData.append('EntityType', 'customer');
            formData.append('EntityID', currentCustDocsId);
            formData.append('CustomerID', currentCustDocsId);
            formData.append('files', pastedFile);
            formData.append('customNames', JSON.stringify([customName]));

            if (typeof showToast === 'function') showToast('Document upload ho raha hai...', 'info');

            const res = await fetch('/api/documents/upload', {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (json.success) {
                if (typeof showToast === 'function') showToast('🎉 Document direct upload ho gaya!', 'success');
                await reloadCurrentCustomerDocs();
            } else {
                if (typeof showToast === 'function') showToast(json.error || 'Upload fail ho gaya', 'error');
            }
        } catch (err) {
            console.error('Direct paste upload error:', err);
            if (typeof showToast === 'function') showToast('Upload error: ' + err.message, 'error');
        }
    };

    window.saveUdocQuickUpload = async function () {
        if (!currentCustDocsId) return;
        try {
            const btn = document.getElementById('udocSaveUploadBtn');
            if (btn) btn.disabled = true;

            const res = await UniversalDocUploader.uploadPending('udocQuickUploaderBox', {
                entityType: 'customer',
                entityId: currentCustDocsId,
                customerId: currentCustDocsId
            });

            if (res && res.success) {
                if (typeof showToast === 'function') showToast('Documents safaltapoorvak upload ho gaye!', 'success');
                toggleUdocUploadPanel();
                await reloadCurrentCustomerDocs();
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast(e.message, 'error');
        } finally {
            const btn = document.getElementById('udocSaveUploadBtn');
            if (btn) btn.disabled = false;
        }
    };

    window.udocZoom = function (delta) {
        currentUdocZoom = Math.min(4.0, Math.max(0.2, currentUdocZoom + delta));
        const img = document.getElementById('udocPreviewImg');
        if (img) img.style.transform = `scale(${currentUdocZoom})`;
        const resetBtn = document.getElementById('udocZoomResetBtn');
        if (resetBtn) resetBtn.textContent = `${Math.round(currentUdocZoom * 100)}%`;
    };

    window.udocZoomReset = function () {
        currentUdocZoom = 1.0;
        const img = document.getElementById('udocPreviewImg');
        if (img) img.style.transform = 'scale(1.0)';
        const resetBtn = document.getElementById('udocZoomResetBtn');
        if (resetBtn) resetBtn.textContent = '100%';
    };

    window.udocOpenNewTab = function () {
        if (!currentSelectedDoc) return;
        window.open(`/api/documents/${currentSelectedDoc.DocumentID}/view`, '_blank');
    };

    window.udocPrintCurrent = function () {
        if (!currentSelectedDoc) return;
        const viewUrl = `/api/documents/${currentSelectedDoc.DocumentID}/view`;
        const printWindow = window.open(viewUrl, '_blank');
        if (printWindow) {
            printWindow.onload = function () {
                try { printWindow.print(); } catch (e) { }
            };
        }
    };

    window.udocDownloadCurrent = function () {
        if (!currentSelectedDoc) return;
        const link = document.createElement('a');
        link.href = `/api/documents/${currentSelectedDoc.DocumentID}/download`;
        link.download = currentSelectedDoc.OriginalName || currentSelectedDoc.FileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    window.udocDeleteCurrent = async function () {
        if (!currentSelectedDoc) return;
        if (!confirm(`Kya aap "${currentSelectedDoc.OriginalName || currentSelectedDoc.FileName}" ko delete karna chahte hain?`)) return;

        try {
            const res = await fetch(`/api/documents/${currentSelectedDoc.DocumentID}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                if (typeof showToast === 'function') showToast('Document delete kar diya gaya', 'success');
                await reloadCurrentCustomerDocs();
            } else {
                if (typeof showToast === 'function') showToast(json.error || 'Delete failed', 'error');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast(e.message, 'error');
        }
    };
})();
