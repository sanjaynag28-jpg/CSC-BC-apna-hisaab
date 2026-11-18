// ============================================================================
// GLOBAL DATE OF BIRTH (DOB) COMPONENT & ENGINE
// Provides ultra-fast, smooth, segmented date entry:
// 1. User types Day (e.g. 01) -> Focus shifts to Month (MM)
// 2. User types Month (e.g. 01) -> Focus shifts to Year (YYYY)
// 3. User types Year (e.g. 2005) -> Full ISO date (2005-01-01) is synced
// 4. Full support for:
//    - Continuous 8-digit typing (01012005)
//    - Slashes / Dashes (/ or - or .)
//    - Arrow keys navigation (Left/Right)
//    - Backspace back-navigation across segments
//    - Pasting any date format (DD/MM/YYYY, YYYY-MM-DD, DDMMYYYY, etc.)
//    - Calendar picker button
//    - 100% seamless compatibility with existing code reading/writing .value
// ============================================================================

(function(window) {
    'use strict';

    function isValidDate(d, m, y) {
        if (!y || !m || !d) return false;
        if (y < 1900 || y > 2100) return false;
        if (m < 1 || m > 12) return false;
        if (d < 1 || d > 31) return false;
        const daysInMonth = new Date(y, m, 0).getDate();
        return d <= daysInMonth;
    }

    function parseFlexibleDate(raw) {
        if (!raw) return null;
        const str = String(raw).trim();

        // 1. ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
        const isoMatch = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if (isoMatch) {
            const y = parseInt(isoMatch[1], 10);
            const m = parseInt(isoMatch[2], 10);
            const d = parseInt(isoMatch[3], 10);
            if (isValidDate(d, m, y)) return { day: d, month: m, year: y };
        }

        // 2. Delimited DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (dmyMatch) {
            const d = parseInt(dmyMatch[1], 10);
            const m = parseInt(dmyMatch[2], 10);
            const y = parseInt(dmyMatch[3], 10);
            if (isValidDate(d, m, y)) return { day: d, month: m, year: y };
        }

        // 3. 8-digit continuous DDMMYYYY
        const digitsOnly = str.replace(/\D/g, '');
        if (digitsOnly.length === 8) {
            // Try DDMMYYYY first (Indian standard)
            const d1 = parseInt(digitsOnly.slice(0, 2), 10);
            const m1 = parseInt(digitsOnly.slice(2, 4), 10);
            const y1 = parseInt(digitsOnly.slice(4, 8), 10);
            if (isValidDate(d1, m1, y1)) return { day: d1, month: m1, year: y1 };

            // Try YYYYMMDD
            const y2 = parseInt(digitsOnly.slice(0, 4), 10);
            const m2 = parseInt(digitsOnly.slice(4, 6), 10);
            const d2 = parseInt(digitsOnly.slice(6, 8), 10);
            if (isValidDate(d2, m2, y2)) return { day: d2, month: m2, year: y2 };
        }

        return null;
    }

    function setupGlobalDob(inputOrId) {
        const input = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
        if (!input) return null;
        if (input._globalDobInit) return input._globalDobControl;

        input._globalDobInit = true;

        // Save original property descriptor
        const proto = HTMLInputElement.prototype;
        const originalValDescriptor = Object.getOwnPropertyDescriptor(proto, 'value');

        // Initial values
        const initialVal = input.value || input.getAttribute('value') || '';
        const initialParsed = parseFlexibleDate(initialVal);

        // Hide native input from layout but keep in DOM for form submission & queries
        input.style.display = 'none';
        input.setAttribute('tabindex', '-1');
        input.setAttribute('aria-hidden', 'true');

        // Create segmented DOB control wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'global-dob-control';
        wrapper.id = 'gdob-wrap-' + (input.id || Math.random().toString(36).slice(2));
        wrapper.setAttribute('role', 'group');
        wrapper.setAttribute('aria-label', 'Date of Birth (DD / MM / YYYY)');

        const fieldsDiv = document.createElement('div');
        fieldsDiv.className = 'global-dob-fields';

        // Day segment
        const dayInp = document.createElement('input');
        dayInp.type = 'text';
        dayInp.className = 'dob-seg dob-day';
        dayInp.placeholder = 'DD';
        dayInp.maxLength = 2;
        dayInp.inputMode = 'numeric';
        dayInp.autocomplete = 'off';
        dayInp.setAttribute('aria-label', 'Day (Din)');
        if (initialParsed) dayInp.value = String(initialParsed.day).padStart(2, '0');

        // Separator 1
        const slash1 = document.createElement('span');
        slash1.className = 'dob-slash';
        slash1.textContent = '/';

        // Month segment
        const monthInp = document.createElement('input');
        monthInp.type = 'text';
        monthInp.className = 'dob-seg dob-month';
        monthInp.placeholder = 'MM';
        monthInp.maxLength = 2;
        monthInp.inputMode = 'numeric';
        monthInp.autocomplete = 'off';
        monthInp.setAttribute('aria-label', 'Month (Mahina)');
        if (initialParsed) monthInp.value = String(initialParsed.month).padStart(2, '0');

        // Separator 2
        const slash2 = document.createElement('span');
        slash2.className = 'dob-slash';
        slash2.textContent = '/';

        // Year segment
        const yearInp = document.createElement('input');
        yearInp.type = 'text';
        yearInp.className = 'dob-seg dob-year';
        yearInp.placeholder = 'YYYY';
        yearInp.maxLength = 4;
        yearInp.inputMode = 'numeric';
        yearInp.autocomplete = 'off';
        yearInp.setAttribute('aria-label', 'Year (Saal)');
        if (initialParsed) yearInp.value = String(initialParsed.year).padStart(4, '0');

        fieldsDiv.appendChild(dayInp);
        fieldsDiv.appendChild(slash1);
        fieldsDiv.appendChild(monthInp);
        fieldsDiv.appendChild(slash2);
        fieldsDiv.appendChild(yearInp);

        // Calendar Button
        const calBtn = document.createElement('button');
        calBtn.type = 'button';
        calBtn.className = 'global-dob-cal-btn dob-cal-btn';
        calBtn.tabIndex = -1;
        calBtn.title = 'Calendar se chunein';
        calBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';

        // Hidden native date picker for picking
        const picker = document.createElement('input');
        picker.type = 'date';
        picker.className = 'dob-picker-hidden';
        picker.tabIndex = -1;
        picker.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;left:0;bottom:0;';
        if (initialParsed) {
            picker.value = `${String(initialParsed.year).padStart(4, '0')}-${String(initialParsed.month).padStart(2, '0')}-${String(initialParsed.day).padStart(2, '0')}`;
        }

        wrapper.appendChild(fieldsDiv);
        wrapper.appendChild(calBtn);
        wrapper.appendChild(picker);

        // Insert wrapper right after native input
        input.parentNode.insertBefore(wrapper, input.nextSibling);

        let isInternalSync = false;

        // Function: sync segments -> master input
        function syncToMaster() {
            if (isInternalSync) return;
            const dStr = dayInp.value.trim();
            const mStr = monthInp.value.trim();
            const yStr = yearInp.value.trim();

            if (!dStr && !mStr && !yStr) {
                wrapper.classList.remove('is-invalid');
                picker.value = '';
                originalValDescriptor.set.call(input, '');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }

            if (dStr.length === 2 && mStr.length === 2 && yStr.length === 4) {
                const d = parseInt(dStr, 10);
                const m = parseInt(mStr, 10);
                const y = parseInt(yStr, 10);

                if (isValidDate(d, m, y)) {
                    wrapper.classList.remove('is-invalid');
                    const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    picker.value = iso;
                    originalValDescriptor.set.call(input, iso);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                } else {
                    wrapper.classList.add('is-invalid');
                    originalValDescriptor.set.call(input, '');
                    return;
                }
            }

            // Incomplete
            wrapper.classList.remove('is-invalid');
            originalValDescriptor.set.call(input, '');
        }

        // Function: sync master input -> segments
        function syncFromMaster(val) {
            isInternalSync = true;
            try {
                if (!val) {
                    dayInp.value = '';
                    monthInp.value = '';
                    yearInp.value = '';
                    picker.value = '';
                    wrapper.classList.remove('is-invalid');
                    return;
                }
                const parsed = parseFlexibleDate(val);
                if (parsed) {
                    dayInp.value = String(parsed.day).padStart(2, '0');
                    monthInp.value = String(parsed.month).padStart(2, '0');
                    yearInp.value = String(parsed.year).padStart(4, '0');
                    const iso = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
                    picker.value = iso;
                    originalValDescriptor.set.call(input, iso);
                    wrapper.classList.remove('is-invalid');
                } else {
                    dayInp.value = '';
                    monthInp.value = '';
                    yearInp.value = '';
                    picker.value = '';
                    wrapper.classList.remove('is-invalid');
                }
            } finally {
                isInternalSync = false;
            }
        }

        // Intercept input.value property
        Object.defineProperty(input, 'value', {
            get() {
                return originalValDescriptor.get.call(this);
            },
            set(newVal) {
                originalValDescriptor.set.call(this, newVal || '');
                syncFromMaster(newVal);
            },
            configurable: true
        });

        // Intercept focus()
        input.focus = function() {
            dayInp.focus();
            dayInp.select();
        };

        // Enclosing Form Reset Listener
        if (input.form) {
            input.form.addEventListener('reset', () => {
                setTimeout(() => {
                    syncFromMaster(input.value);
                }, 10);
            });
        }

        // --------------------------------------------------------------------
        // Segment 1: DAY (DD)
        // --------------------------------------------------------------------
        dayInp.addEventListener('input', () => {
            let val = dayInp.value.replace(/\D/g, '');
            if (val.length === 1 && parseInt(val, 10) >= 4) {
                // If typed 4..9 (cannot be a 2-digit day starting with 4-9) -> auto pad to 0X and shift to month
                dayInp.value = '0' + val;
                monthInp.focus();
                monthInp.select();
            } else if (val.length >= 2) {
                val = val.slice(0, 2);
                let num = parseInt(val, 10);
                if (num > 31) num = 31;
                if (num === 0) num = 1;
                dayInp.value = String(num).padStart(2, '0');
                // Auto-advance to Month (MM)!
                monthInp.focus();
                monthInp.select();
            } else {
                dayInp.value = val;
            }
            syncToMaster();
        });

        dayInp.addEventListener('keydown', (e) => {
            if (['/', '-', '.', 'Enter'].includes(e.key)) {
                e.preventDefault();
                if (dayInp.value.length === 1) {
                    dayInp.value = '0' + dayInp.value;
                    syncToMaster();
                }
                monthInp.focus();
                monthInp.select();
            } else if (e.key === 'ArrowRight' && dayInp.selectionStart === dayInp.value.length) {
                monthInp.focus();
                monthInp.select();
            }
        });

        // --------------------------------------------------------------------
        // Segment 2: MONTH (MM)
        // --------------------------------------------------------------------
        monthInp.addEventListener('input', () => {
            let val = monthInp.value.replace(/\D/g, '');
            if (val.length === 1 && parseInt(val, 10) >= 2) {
                // If typed 2..9 (cannot be a month starting with 2-9) -> auto pad to 0X and shift to YYYY!
                monthInp.value = '0' + val;
                yearInp.focus();
                yearInp.select();
            } else if (val.length >= 2) {
                val = val.slice(0, 2);
                let num = parseInt(val, 10);
                if (num > 12) num = 12;
                if (num === 0) num = 1;
                monthInp.value = String(num).padStart(2, '0');
                // 👉 0101 IS TYPED: SHIFT FOCUS TO YYYY!
                yearInp.focus();
                yearInp.select();
            } else {
                monthInp.value = val;
            }
            syncToMaster();
        });

        monthInp.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && monthInp.value === '') {
                e.preventDefault();
                dayInp.focus();
            } else if (['/', '-', '.', 'Enter'].includes(e.key)) {
                e.preventDefault();
                if (monthInp.value.length === 1) {
                    monthInp.value = '0' + monthInp.value;
                    syncToMaster();
                }
                yearInp.focus();
                yearInp.select();
            } else if (e.key === 'ArrowLeft' && monthInp.selectionStart === 0) {
                dayInp.focus();
            } else if (e.key === 'ArrowRight' && monthInp.selectionStart === monthInp.value.length) {
                yearInp.focus();
                yearInp.select();
            }
        });

        // --------------------------------------------------------------------
        // Segment 3: YEAR (YYYY)
        // --------------------------------------------------------------------
        yearInp.addEventListener('input', () => {
            let val = yearInp.value.replace(/\D/g, '');
            if (val.length > 4) val = val.slice(0, 4);
            yearInp.value = val;
            syncToMaster();
        });

        yearInp.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && yearInp.value === '') {
                e.preventDefault();
                monthInp.focus();
            } else if (e.key === 'ArrowLeft' && yearInp.selectionStart === 0) {
                monthInp.focus();
            }
        });

        yearInp.addEventListener('blur', () => {
            // Auto expand 2-digit year (e.g. 05 -> 2005, 95 -> 1995)
            if (yearInp.value.length === 2) {
                const y = parseInt(yearInp.value, 10);
                yearInp.value = String(y <= 30 ? 2000 + y : 1900 + y);
                syncToMaster();
            }
        });

        // --------------------------------------------------------------------
        // Paste Handling (Distributed across DD, MM, YYYY)
        // --------------------------------------------------------------------
        function handlePaste(e) {
            const pasted = e.clipboardData ? e.clipboardData.getData('text') : '';
            if (!pasted) return;
            const parsed = parseFlexibleDate(pasted);
            if (parsed) {
                e.preventDefault();
                dayInp.value = String(parsed.day).padStart(2, '0');
                monthInp.value = String(parsed.month).padStart(2, '0');
                yearInp.value = String(parsed.year).padStart(4, '0');
                syncToMaster();
                yearInp.focus();
            }
        }

        dayInp.addEventListener('paste', handlePaste);
        monthInp.addEventListener('paste', handlePaste);
        yearInp.addEventListener('paste', handlePaste);

        // --------------------------------------------------------------------
        // Calendar Button & Hidden Picker
        // --------------------------------------------------------------------
        calBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (typeof picker.showPicker === 'function') {
                    picker.showPicker();
                } else {
                    picker.focus();
                    picker.click();
                }
            } catch (err) {
                picker.focus();
                picker.click();
            }
        });

        picker.addEventListener('change', () => {
            syncFromMaster(picker.value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Clicking wrapper focuses first unfilled field
        wrapper.addEventListener('click', (e) => {
            if (e.target === wrapper || e.target === fieldsDiv || e.target.classList.contains('dob-slash')) {
                if (!dayInp.value) {
                    dayInp.focus();
                } else if (!monthInp.value) {
                    monthInp.focus();
                } else if (!yearInp.value) {
                    yearInp.focus();
                } else {
                    dayInp.focus();
                    dayInp.select();
                }
            }
        });

        input._globalDobControl = wrapper;
        return wrapper;
    }

    // Universal Initializer for all DOB inputs in the app
    function initGlobalDobInputs() {
        const targetIds = [
            'custDobInput',      // Add / Edit Customer Modal
            'bcCustomerDob',     // BC Banking Counter Modal
            'cscCustDob',        // CSC Work Tracker Modal
            'invCustomerDob'     // Invoice Customer DOB
        ];

        targetIds.forEach(id => {
            setupGlobalDob(id);
        });

        // Also query any elements marked with [data-dob-input] or .dob-input
        document.querySelectorAll('[data-dob-input], .dob-input').forEach(el => {
            setupGlobalDob(el);
        });
    }

    // Observe DOM for dynamically opened modals or injected forms
    let dobMutationTimer = null;
    const observer = new MutationObserver(() => {
        if (dobMutationTimer) return;
        dobMutationTimer = setTimeout(() => {
            dobMutationTimer = null;
            initGlobalDobInputs();
        }, 50);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initGlobalDobInputs();
            observer.observe(document.body, { childList: true, subtree: true });
        });
    } else {
        initGlobalDobInputs();
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Export globally
    window.setupGlobalDob = setupGlobalDob;
    window.initGlobalDobInputs = initGlobalDobInputs;

})(window);
