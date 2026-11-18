/**
 * ============================================================================
 * Searchable Select (Smart Combobox) Component - Ultra-High Performance v2
 * Zero latency, instant 0ms dropdown opening, cached DOM nodes, event delegation.
 * ============================================================================
 */

(function (window, document) {
    'use strict';

    // Global tracking for O(1) instant dropdown control
    let activeDropdownInstance = null;
    let globalListenerAttached = false;

    function ensureGlobalPointerListener() {
        if (globalListenerAttached) return;
        globalListenerAttached = true;
        // Fast pointerdown event to close open dropdown before click delay occurs
        document.addEventListener('pointerdown', (e) => {
            if (activeDropdownInstance) {
                if (!activeDropdownInstance.wrapper.contains(e.target)) {
                    activeDropdownInstance.close();
                }
            }
        }, { passive: true });
    }

    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function highlightMatches(text, query) {
        if (!text && text !== 0) return '';
        const raw = String(text);
        if (!query) return escapeHtml(raw);
        const tokens = query.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) return escapeHtml(raw);
        const pattern = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        if (!pattern) return escapeHtml(raw);
        let result = '';
        let lastIdx = 0;
        let match;
        const matcher = new RegExp(pattern, 'gi');
        while ((match = matcher.exec(raw)) !== null) {
            result += escapeHtml(raw.slice(lastIdx, match.index));
            result += `<mark class="ss-match">${escapeHtml(match[0])}</mark>`;
            lastIdx = matcher.lastIndex;
        }
        result += escapeHtml(raw.slice(lastIdx));
        return result || escapeHtml(raw);
    }

    class SearchableSelect {
        constructor(selectElement, options = {}) {
            if (!selectElement) return null;
            if (typeof selectElement === 'string') {
                selectElement = document.getElementById(selectElement);
            }
            if (!selectElement || selectElement.tagName !== 'SELECT') return null;

            if (selectElement._ssInstance) {
                selectElement._ssInstance.refresh();
                return selectElement._ssInstance;
            }

            this.select = selectElement;
            this.options = options;
            this.placeholder = options.placeholder || this.select.getAttribute('data-placeholder') || '-- Chunyein (Select) --';
            this.allowClear = options.allowClear !== undefined ? options.allowClear : !this.select.required;
            this.isOpen = false;
            this.items = [];
            this.optionElements = [];
            this.highlightIndex = -1;
            this.visibleCount = 0;
            this._lastOptionsSig = '';

            this.init();
            this.select._ssInstance = this;
            ensureGlobalPointerListener();
        }

        init() {
            // Hide native select from view but keep accessible in form
            this.select.style.setProperty('display', 'none', 'important');
            this.select.classList.add('ss-hidden');
            this.select.setAttribute('tabindex', '-1');
            this.select.setAttribute('aria-hidden', 'true');
            this.select.setAttribute('data-searchable-initialized', 'true');

            // Ensure parent container doesn't clip
            if (this.select.parentElement && this.select.parentElement.classList.contains('form-group')) {
                this.select.parentElement.style.overflow = 'visible';
            }

            // Create wrapper
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'ss-wrapper';
            if (this.select.id) {
                this.wrapper.id = `ss-wrapper-${this.select.id}`;
            }

            // Copy styling attributes if present
            if (this.select.style.flex) this.wrapper.style.flex = this.select.style.flex;
            if (this.select.style.minWidth) this.wrapper.style.minWidth = this.select.style.minWidth;
            if (this.select.style.width) this.wrapper.style.width = this.select.style.width;
            if (this.select.className && this.select.className.includes('filter-input')) {
                this.wrapper.classList.add('ss-filter-input');
            }

            // Create control box
            this.control = document.createElement('div');
            this.control.className = 'ss-control';
            this.control.tabIndex = 0;
            this.control.setAttribute('role', 'combobox');
            this.control.setAttribute('aria-expanded', 'false');

            this.labelEl = document.createElement('div');
            this.labelEl.className = 'ss-label';

            this.actionsEl = document.createElement('div');
            this.actionsEl.className = 'ss-actions';

            if (this.allowClear) {
                this.clearBtn = document.createElement('span');
                this.clearBtn.className = 'ss-clear';
                this.clearBtn.innerHTML = '&times;';
                this.clearBtn.title = 'Chuna hua hatayein (Clear)';
                this.clearBtn.style.display = 'none';
                this.actionsEl.appendChild(this.clearBtn);
            }

            this.caretEl = document.createElement('span');
            this.caretEl.className = 'ss-caret';
            this.caretEl.innerHTML = '&#9660;';
            this.actionsEl.appendChild(this.caretEl);

            this.control.appendChild(this.labelEl);
            this.control.appendChild(this.actionsEl);

            // Create dropdown panel
            this.dropdown = document.createElement('div');
            this.dropdown.className = 'ss-dropdown';

            // Search wrap
            this.searchWrap = document.createElement('div');
            this.searchWrap.className = 'ss-search-wrap';

            this.searchIcon = document.createElement('span');
            this.searchIcon.className = 'ss-search-icon';
            this.searchIcon.innerHTML = '&#128269;';

            this.searchInput = document.createElement('input');
            this.searchInput.type = 'text';
            this.searchInput.className = 'ss-search-input';
            this.searchInput.placeholder = this.options.searchPlaceholder || 'Type karke khojein...';
            this.searchInput.autocomplete = 'off';
            this.searchInput.spellcheck = false;

            this.searchCount = document.createElement('span');
            this.searchCount.className = 'ss-search-count';
            this.searchCount.style.display = 'none';

            this.searchWrap.appendChild(this.searchIcon);
            this.searchWrap.appendChild(this.searchInput);
            this.searchWrap.appendChild(this.searchCount);

            // Options list
            this.optionsList = document.createElement('div');
            this.optionsList.className = 'ss-options-list';
            this.optionsList.setAttribute('role', 'listbox');

            // Empty indicator
            this.emptyEl = document.createElement('div');
            this.emptyEl.className = 'ss-empty';
            this.emptyEl.innerHTML = '<span>&#128269;</span><span>Koi option nahi mila</span>';
            this.emptyEl.style.display = 'none';

            this.dropdown.appendChild(this.searchWrap);
            this.dropdown.appendChild(this.optionsList);
            this.dropdown.appendChild(this.emptyEl);

            this.wrapper.appendChild(this.control);
            this.wrapper.appendChild(this.dropdown);

            // Insert wrapper into DOM
            this.select.parentNode.insertBefore(this.wrapper, this.select.nextSibling);

            // Bind interactions with zero-latency delegation
            this.bindEvents();

            // Initial option population
            this.refresh();

            // Watch for changes on the native select
            this.watchNativeSelect();
        }

        bindEvents() {
            // Click control to toggle instantly
            this.control.addEventListener('click', (e) => {
                if (e.target === this.clearBtn || this.clearBtn?.contains(e.target)) {
                    e.stopPropagation();
                    this.clearSelection();
                    return;
                }
                this.toggle();
            });

            // Keyboard navigation on control
            this.control.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.open();
                } else if (e.key === 'Escape') {
                    this.close();
                }
            });

            // Fast event delegation on options list (ONE click listener for all options)
            this.optionsList.addEventListener('click', (e) => {
                e.stopPropagation();
                const optEl = e.target.closest('.ss-option');
                if (!optEl || optEl.classList.contains('ss-disabled')) return;
                const val = optEl.dataset.value;
                this.selectValue(val);
            });

            // Fast mouseover delegation for active highlight
            this.optionsList.addEventListener('mouseover', (e) => {
                const optEl = e.target.closest('.ss-option');
                if (!optEl) return;
                this.highlightOptionElement(optEl);
            });

            // Real-time search filter input (lightning fast array loop)
            this.searchInput.addEventListener('input', (e) => {
                this.filter(e.target.value.trim());
            });

            // Keyboard navigation inside search input
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateVisible(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateVisible(-1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.selectCurrentHighlighted();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                    this.control.focus();
                } else if (e.key === 'Tab') {
                    this.close();
                }
            });

            // Prevent closing when clicking inside search input or dropdown background
            this.dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        watchNativeSelect() {
            // Listen for native change
            this.select.addEventListener('change', () => {
                this.syncFromNative();
            });

            // Intercept property descriptor for select.value
            try {
                const proto = HTMLSelectElement.prototype;
                const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'value');
                if (originalDescriptor && !this.select._hasValueInterceptor) {
                    const self = this;
                    Object.defineProperty(this.select, 'value', {
                        get() {
                            return originalDescriptor.get.call(this);
                        },
                        set(val) {
                            originalDescriptor.set.call(this, val);
                            self.syncFromNative();
                        },
                        configurable: true
                    });
                    this.select._hasValueInterceptor = true;
                }
            } catch (err) { }

            // MutationObserver ONLY for childList changes (<option> added or removed)
            this.observer = new MutationObserver(() => {
                this.refresh();
            });
            this.observer.observe(this.select, { childList: true });
        }

        refresh() {
            const rawOpts = Array.from(this.select.options);
            const sig = rawOpts.map(o => o.value + ':' + o.text + ':' + (o.selected ? '1' : '0') + ':' + (o.disabled ? '1' : '0')).join('|');
            if (sig === this._lastOptionsSig && this.optionElements.length === rawOpts.length) {
                this.syncFromNative();
                return;
            }
            this._lastOptionsSig = sig;

            this.items = rawOpts.map((opt, idx) => {
                const optAadhaar = opt.dataset ? (opt.dataset.aadhaar || '') : (opt.getAttribute('data-aadhaar') || '');
                const optPhone = opt.dataset ? (opt.dataset.phone || '') : (opt.getAttribute('data-phone') || '');
                const optSearch = opt.dataset ? (opt.dataset.search || '') : (opt.getAttribute('data-search') || '');
                const text = opt.text || opt.innerText || '';
                const cleanAadhaar = String(optAadhaar || '').replace(/\D/g, '');
                const cleanPhone = String(optPhone || '').replace(/\D/g, '');
                const textDigits = text.replace(/\D/g, '');

                return {
                    index: idx,
                    value: String(opt.value),
                    text: text,
                    selected: opt.selected,
                    disabled: opt.disabled,
                    cleanAadhaar: cleanAadhaar,
                    cleanPhone: cleanPhone,
                    textDigits: textDigits,
                    searchKey: (text + ' ' + (opt.value || '') + ' ' + optSearch + ' ' + optAadhaar + ' ' + cleanAadhaar + ' ' + cleanPhone).toLowerCase()
                };
            });

            // Build option DOM nodes once in a fast DocumentFragment
            const curVal = String(this.select.value || '');
            const fragment = document.createDocumentFragment();
            this.optionElements = [];

            this.items.forEach((item, idx) => {
                const optEl = document.createElement('div');
                optEl.className = 'ss-option';
                optEl.dataset.value = item.value;
                optEl.dataset.idx = idx;
                if (item.value === curVal) optEl.classList.add('ss-selected');
                if (item.disabled) optEl.classList.add('ss-disabled');

                const textSpan = document.createElement('span');
                textSpan.className = 'ss-option-text';
                textSpan.textContent = item.text;
                optEl.appendChild(textSpan);

                item.element = optEl;
                item.textSpan = textSpan;
                this.optionElements.push(optEl);
                fragment.appendChild(optEl);
            });

            this.optionsList.innerHTML = '';
            this.optionsList.appendChild(fragment);

            this.syncFromNative();
        }

        syncFromNative() {
            let selectedOpt = this.select.options[this.select.selectedIndex];
            if (!selectedOpt || selectedOpt.value === '') {
                const curVal = String(this.select.value || '');
                if (curVal) {
                    selectedOpt = Array.from(this.select.options).find(o => String(o.value) === curVal);
                }
            }

            if (selectedOpt && selectedOpt.value !== '') {
                this.labelEl.textContent = selectedOpt.text;
                this.labelEl.classList.remove('ss-placeholder');
                if (this.clearBtn) this.clearBtn.style.display = 'flex';
            } else if (selectedOpt && selectedOpt.value === '' && selectedOpt.text.trim()) {
                this.labelEl.textContent = selectedOpt.text;
                this.labelEl.classList.add('ss-placeholder');
                if (this.clearBtn) this.clearBtn.style.display = 'none';
            } else {
                this.labelEl.textContent = this.placeholder;
                this.labelEl.classList.add('ss-placeholder');
                if (this.clearBtn) this.clearBtn.style.display = 'none';
            }

            // Sync selected class across option elements
            const curVal = String(this.select.value || '');
            for (let i = 0; i < this.optionElements.length; i++) {
                const el = this.optionElements[i];
                if (el.dataset.value === curVal) {
                    el.classList.add('ss-selected');
                } else {
                    el.classList.remove('ss-selected');
                }
            }
        }

        toggle() {
            if (this.isOpen) this.close();
            else this.open();
        }

        open() {
            if (this.isOpen) return;

            // O(1) instant close of any other open dropdown (zero DOM querying)
            if (activeDropdownInstance && activeDropdownInstance !== this) {
                activeDropdownInstance.close();
            }
            activeDropdownInstance = this;

            this.isOpen = true;
            this.wrapper.classList.add('ss-open');
            this.control.setAttribute('aria-expanded', 'true');

            // Modal ke andar khula hai to modal overflow temporarily visible karo taaki list na kate
            const hostModal = this.wrapper.closest ? this.wrapper.closest('.modal') : null;
            if (hostModal) {
                hostModal.classList.add('ss-dropdown-open');
                const overlay = hostModal.closest ? hostModal.closest('.modal-overlay') : null;
                if (overlay) overlay.classList.add('ss-dropdown-open');
                this._hostModal = hostModal;
                this._hostOverlay = overlay;
            }

            // Quick viewport flip check
            const rect = this.control.getBoundingClientRect();
            if (window.innerHeight - rect.bottom < 260 && rect.top > 260) {
                this.dropdown.classList.add('ss-dropup');
            } else {
                this.dropdown.classList.remove('ss-dropup');
            }

            // INSTANT: No DOM recreation! If search input has text from before, reset it
            if (this.searchInput.value) {
                this.searchInput.value = '';
                this.showAllOptions();
            } else {
                this.showAllOptions();
            }

            // Immediately focus and select input (0ms delay) with preventScroll
            try {
                this.searchInput.focus({ preventScroll: true });
            } catch (e) {
                this.searchInput.focus();
            }
            this.searchInput.select();
        }

        close() {
            if (!this.isOpen) return;
            this.isOpen = false;
            if (activeDropdownInstance === this) {
                activeDropdownInstance = null;
            }
            this.wrapper.classList.remove('ss-open');
            this.control.setAttribute('aria-expanded', 'false');
            // Modal overflow wapas normal karo
            if (this._hostModal) this._hostModal.classList.remove('ss-dropdown-open');
            if (this._hostOverlay) this._hostOverlay.classList.remove('ss-dropdown-open');
            this._hostModal = null;
            this._hostOverlay = null;
        }

        showAllOptions() {
            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                if (item.element) {
                    item.element.style.display = '';
                    item.textSpan.textContent = item.text;
                }
            }
            this.emptyEl.style.display = this.items.length === 0 ? 'flex' : 'none';
            this.searchCount.style.display = 'none';
            this.visibleCount = this.items.length;

            // Highlight selected option or first option
            const curVal = String(this.select.value || '');
            let matchEl = this.optionElements.find(el => el.dataset.value === curVal && el.style.display !== 'none');
            if (!matchEl && this.optionElements.length > 0) matchEl = this.optionElements[0];
            this.highlightOptionElement(matchEl);
        }

        filter(query = '') {
            const rawQ = (query || '').trim();
            const q = rawQ.toLowerCase();
            const words = q.split(/\s+/).filter(Boolean);
            const queryDigits = rawQ.replace(/\D/g, '');

            if (!words.length && !queryDigits) {
                this.showAllOptions();
                return;
            }

            let visible = 0;
            let firstMatch = null;

            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                if (!item.element) continue;

                // 1. Text words match
                const wordsMatch = words.length > 0 && words.every(w => item.searchKey.includes(w));

                // 2. Aadhaar & Phone digit match (handles full 12 digits, spaced 12 digits, last 4 digits, phone)
                let digitMatch = false;
                if (queryDigits.length >= 3) {
                    if (item.cleanAadhaar && item.cleanAadhaar.includes(queryDigits)) {
                        digitMatch = true;
                    } else if (item.cleanPhone && item.cleanPhone.includes(queryDigits)) {
                        digitMatch = true;
                    } else if (item.textDigits && item.textDigits.includes(queryDigits)) {
                        digitMatch = true;
                    }
                }

                if (wordsMatch || digitMatch) {
                    item.element.style.display = '';
                    item.textSpan.innerHTML = highlightMatches(item.text, rawQ);
                    visible++;
                    if (!firstMatch) firstMatch = item.element;
                } else {
                    item.element.style.display = 'none';
                }
            }

            this.visibleCount = visible;
            this.emptyEl.style.display = visible === 0 ? 'flex' : 'none';
            this.searchCount.textContent = `${visible} mile`;
            this.searchCount.style.display = 'inline-block';

            this.highlightOptionElement(firstMatch);
        }

        highlightOptionElement(targetEl) {
            for (let i = 0; i < this.optionElements.length; i++) {
                this.optionElements[i].classList.remove('ss-active');
            }
            if (targetEl) {
                targetEl.classList.add('ss-active');
                targetEl.scrollIntoView({ block: 'nearest' });
            }
        }

        navigateVisible(delta) {
            const visible = this.optionElements.filter(el => el.style.display !== 'none');
            if (!visible.length) return;

            let curIdx = visible.findIndex(el => el.classList.contains('ss-active'));
            let nextIdx = curIdx + delta;
            if (nextIdx < 0) nextIdx = visible.length - 1;
            if (nextIdx >= visible.length) nextIdx = 0;

            this.highlightOptionElement(visible[nextIdx]);
        }

        selectCurrentHighlighted() {
            const active = this.optionsList.querySelector('.ss-option.ss-active');
            if (active && active.style.display !== 'none' && !active.classList.contains('ss-disabled')) {
                this.selectValue(active.dataset.value);
            } else {
                const firstVisible = this.optionElements.find(el => el.style.display !== 'none' && !el.classList.contains('ss-disabled'));
                if (firstVisible) this.selectValue(firstVisible.dataset.value);
            }
        }

        selectValue(val) {
            val = String(val);
            const opts = Array.from(this.select.options);
            const matchOpt = opts.find(o => String(o.value) === val);
            if (matchOpt && matchOpt.disabled) return; // Block disabled selection
            if (matchOpt) {
                opts.forEach(o => o.selected = false);
                matchOpt.selected = true;
            }
            this.select.value = val;
            this.syncFromNative();
            this.close();

            // Trigger change and input events
            const changeEv = new Event('change', { bubbles: true });
            this.select.dispatchEvent(changeEv);
            const inputEv = new Event('input', { bubbles: true });
            this.select.dispatchEvent(inputEv);

            this.control.focus();
        }

        clearSelection() {
            const hasEmptyOpt = Array.from(this.select.options).some(o => o.value === '');
            this.select.value = hasEmptyOpt ? '' : (this.select.options[0]?.value || '');
            this.syncFromNative();

            const changeEv = new Event('change', { bubbles: true });
            this.select.dispatchEvent(changeEv);
        }

        static closeAll(exceptInstance = null) {
            if (activeDropdownInstance && activeDropdownInstance !== exceptInstance) {
                activeDropdownInstance.close();
            }
        }

        static get activeInstance() {
            return activeDropdownInstance;
        }
    }

    // Global Registry & Helpers
    window.SearchableSelect = SearchableSelect;

    window.makeSearchableSelect = function (selectOrId, options = {}) {
        const el = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
        if (!el) return null;
        return new SearchableSelect(el, options);
    };

    window.refreshSearchableSelect = function (selectOrId) {
        const el = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
        if (el && el._ssInstance) {
            el._ssInstance.refresh();
        }
    };

    window.refreshAllSearchableSelects = function () {
        document.querySelectorAll('select').forEach(sel => {
            if (sel._ssInstance) {
                sel._ssInstance.refresh();
            }
        });
    };

    // Auto-init designated high-value dropdowns across the application
    const TARGET_SELECT_IDS = [
        // Customers & Parties (search MUST — bahut saare customers me dhoondhna aasaan)
        'invCustomerSelect',
        'khataCustomerSelect',
        'bcCustomerSelect',
        'cscCustomerSelect',
        'bpCustomerSelect',
        'docCustomerSelect',
        'docCustomerFilter',
        'repCustomerFilter',
        'transParty',
        'billParty',
        'partyType',
        'partyTypeSelect',
        'custRelationshipSelect',
        'custBalTypeInput',
        // Accounts & Modes
        'transAccount',
        'transToAccount',
        'filterAccount',
        'invAccountSelect',
        'payAccountSelect',
        'khataAccountSelect',
        'settleFromAccount',
        'settleToAccount',
        'bcCashAccount',
        'bcPortalAccount',
        'accountType',
        'invModeSelect',
        'payModeSelect',
        'khataModeSelect',
        'settleMode',
        // Categories & Filters
        'transCategory',
        'filterCategory',
        'budgetCategory',
        'billCategory',
        'categoryType',
        'billType',
        'billTypeSelect',
        'budgetMonth',
        'budgetFilterStatus',
        'bcServiceFilter',
        'bcQRProvider',
        'bcQROperation',
        'reportYear'
    ];

    window.initAllSearchableSelects = function () {
        // Init by ID
        TARGET_SELECT_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el._ssInstance) {
                new SearchableSelect(el);
            }
        });

        // Init any select marked with class .searchable-select or data-searchable="true"
        document.querySelectorAll('select.searchable-select, select[data-searchable="true"]').forEach(el => {
            if (!el._ssInstance) {
                new SearchableSelect(el);
            }
        });
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initAllSearchableSelects);
    } else {
        setTimeout(window.initAllSearchableSelects, 50);
    }

})(window, document);
