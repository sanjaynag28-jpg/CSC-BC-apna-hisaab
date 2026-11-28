// ============================================================================
// 💰 CASH MANAGEMENT BC - EXTENSION CONTENT SCRIPT
// Universal AEPS & CSC Receipt Auto-Grabber, DOM Extractor & In-Page Overlay
// ============================================================================

(function () {
    'use strict';

    // Prevent double execution in the same context
    if (window.__CM_CONTENT_SCRIPT_LOADED__) return;
    window.__CM_CONTENT_SCRIPT_LOADED__ = true;

    // Detect if this tab is the Cash Management Project dashboard
    const isProjectTab = Boolean(
        (document.body && document.body.hasAttribute('data-cm-app')) ||
        document.title.includes('Cash Management') ||
        ((location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.includes('laptop-sanjay')) &&
         (location.port === '4000' || location.port === '3000'))
    );

    // ========================================================================
    // 1. CASH MANAGEMENT PROJECT TAB BRIDGE
    // ========================================================================
    if (isProjectTab) {
        window.__CM_EXTENSION_INSTALLED__ = true;
        document.documentElement.setAttribute('data-cm-extension-installed', 'true');

        // Relay custom event from web app back to extension background
        window.addEventListener('cm-switch-back-to-portal', (e) => {
            if (e && e.detail && e.detail.tabId) {
                chrome.runtime.sendMessage({
                    action: 'SWITCH_BACK_TO_PORTAL',
                    tabId: e.detail.tabId
                });
            }
        });

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!request) return;

            if (request.action === 'FILL_GRABBER_ENTRY') {
                const payload = request.payload;
                if (!payload) return;

                // Deliver to app handler across worlds via postMessage
                try {
                    window.postMessage({ type: 'cm-grabber-fill-project', payload }, '*');
                } catch (_) {}

                // Also save to localStorage
                try {
                    localStorage.setItem('cm_pending_grabber', JSON.stringify(payload));
                } catch (_) {}

                // Custom event fallback
                try {
                    window.dispatchEvent(new CustomEvent('cm-grabber-fill-project', { detail: payload }));
                } catch (_) {}

                sendResponse({ success: true, delivered: true });
                return true;
            }

            if (request.action === 'PING') {
                sendResponse({ success: true, isProject: true });
                return true;
            }
        });

        return; // No need for portal floating widget or DOM scraping on dashboard
    }

    // ========================================================================
    // 2. PARSING UTILITIES & SANITIZERS
    // ========================================================================
    function cleanAmount(val) {
        if (val === undefined || val === null || val === '') return null;
        const s = String(val).replace(/,/g, '');
        const m = s.match(/\d+(?:\.\d+)?/);
        if (!m) return null;
        const n = parseFloat(m[0]);
        return isNaN(n) ? null : n;
    }

    function cleanPhone(val) {
        if (!val) return '';
        const digits = String(val).replace(/\D/g, '');
        if (digits.length >= 10) return digits.slice(-10);
        return digits;
    }

    function cleanAadhaar(val) {
        if (!val) return '';
        const s = String(val).replace(/^[\s:\-–—#=]+/, '').trim();
        // Masked patterns: XXXX XXXX 1234, XXXXXXXX1234, **** **** 1234, XXXX-XXXX-1234
        if (/^[xX*]{4}[\s\-]?[xX*]{4}[\s\-]?\d{4}$/.test(s) || /^[xX*]{4,8}[\s\-]?\d{4}$/.test(s)) {
            return s;
        }
        const digits = s.replace(/\D/g, '');
        if (digits.length === 12) {
            return digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
        }
        return s;
    }

    function extractAadhaarLast4(val) {
        if (!val) return '';
        const s = String(val).replace(/^[\s:\-–—#=]+/, '').trim();
        const m = s.match(/\d{4}$/);
        return m ? m[0] : '';
    }

    // ========================================================================
    // LIVE AADHAAR INPUT WATCHER (Captures full 12 digits while typing on portal)
    // Supports plaintext inputs (Digipay Lite) AND live-masked inputs (Digipay Web XXXX-XXXX-1234)
    // ========================================================================
    function watchAadhaarInputs() {
        const isValidAadhaar = (digits) => {
            if (typeof digits !== 'string' || !/^[0-9]{12}$/.test(digits) ||
                /^0{12}$/.test(digits) || /^(\d)\1{11}$/.test(digits)) return false;

            const d = [
                [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
                [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
                [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
                [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
                [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
                [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
                [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
                [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
                [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
            ];
            const p = [
                [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
                [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
                [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
                [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
                [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
                [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
                [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
            ];
            let checksum = 0;
            for (let i = 0; i < digits.length; i++) {
                checksum = d[checksum][p[i % 8][Number(digits[digits.length - 1 - i])]];
            }
            return checksum === 0;
        };

        function notifyBackgroundTypedAadhaar(digits) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
                    chrome.runtime.sendMessage({
                        action: 'RECORD_TYPED_AADHAAR',
                        fullAadhaar: digits,
                        origin: location.origin || location.href
                    }, () => { void chrome.runtime.lastError; });
                }
            } catch (_) {}
        }

        const recordPotentialAadhaar = (val, sourceEl = null) => {
            if (!val) return false;
            const rawValue = String(val).trim();
            if (!/^[0-9\s-]+$/.test(rawValue)) return false;
            const digits = rawValue.replace(/[\s-]/g, '');
            if (isValidAadhaar(digits)) {
                try {
                    const now = Date.now();
                    if (window.__cm_last_aadhaar === digits &&
                        now - (window.__cm_last_aadhaar_at || 0) < 2000) return true;
                    if (sourceEl && sourceEl._cm_last_recorded_aadhaar === digits &&
                        now - sourceEl._cm_last_recorded_aadhaar_at < 2000) return true;
                    window.__cm_last_aadhaar = digits;
                    window.__cm_last_aadhaar_at = now;
                    if (sourceEl) {
                        sourceEl._cm_last_recorded_aadhaar = digits;
                        sourceEl._cm_last_recorded_aadhaar_at = now;
                    }
                    const last4 = digits.slice(-4);
                    const record = JSON.stringify({
                        fullAadhaar: digits,
                        last4: last4,
                        time: now
                    });
                    // Store in both sessionStorage and localStorage for cross-tab/popup safety
                    sessionStorage.setItem('cm_aadhaar_' + last4, record);
                    sessionStorage.setItem('cm_last_typed_aadhaar', record);
                    try {
                        localStorage.setItem('cm_aadhaar_' + last4, record);
                        localStorage.setItem('cm_last_typed_aadhaar', record);
                    } catch (_) {}

                    if (sourceEl) {
                        try {
                            sourceEl.dataset.cmFullAadhaar = digits;
                            sourceEl._cm_full_aadhaar = digits;
                        } catch (_) {}
                    }
                    notifyBackgroundTypedAadhaar(digits);
                    return true;
                } catch (_) {}
            }
            return false;
        };

        // Identifies whether an input is likely an Aadhaar or VID field
        function isAadhaarLikeInput(el) {
            if (!el || el.tagName !== 'INPUT') return false;
            const type = (el.type || 'text').toLowerCase();
            if (type === 'password' || type === 'hidden' || type === 'button' || type === 'submit' || type === 'checkbox' || type === 'radio' || type === 'file') return false;

            const name = (el.name || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const ph = (el.placeholder || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const allAttr = `${name} ${id} ${ph} ${aria}`;
            if (/aadhaar|aadhar|uid|vid\b/i.test(allAttr)) return true;

            // Check if current value already looks masked like XXXX-XXXX- or has X / *
            const val = el.value || '';
            if (/[xX*]{4}/.test(val)) return true;

            // Check surrounding label or parent text (e.g. DigiPay: "Aadhaar / VID* (Aadhaar)")
            try {
                let p = el.parentElement;
                for (let i = 0; i < 3 && p; i++) {
                    const txt = (p.innerText || p.textContent || '').slice(0, 150).toLowerCase();
                    if (/aadhaar|aadhar|uid|vid\b/i.test(txt)) return true;
                    p = p.parentElement;
                }
            } catch (_) {}

            return false;
        }

        function appendActualDigit(el, digit) {
            if (!el || !/^[0-9]$/.test(digit)) return;
            const valueLength = String(el.value || '').length;
            if (el.selectionStart !== el.selectionEnd ||
                (valueLength > 0 && el.selectionStart < valueLength)) {
                el._cm_aadhaar_buf = '';
            }

            const cur = ((el._cm_aadhaar_buf || '') + digit).slice(0, 12);
            el._cm_aadhaar_buf = cur;
        }

        // Use beforeinput as the sole digit source in modern browsers. It fires
        // before portal masking changes the field value.
        const supportsBeforeInput = 'onbeforeinput' in document;
        document.addEventListener('beforeinput', (e) => {
            const el = e.target;
            if (!el || el.tagName !== 'INPUT') return;
            if (!isAadhaarLikeInput(el)) return;

            if (!e.isTrusted) return;
            if (e.inputType && e.inputType.startsWith('delete')) {
                el._cm_aadhaar_buf = '';
            } else if (e.inputType === 'insertText' && /^[0-9]$/.test(e.data || '')) {
                appendActualDigit(el, e.data);
            } else if (e.inputType === 'insertText') {
                el._cm_aadhaar_buf = '';
            }
        }, true);

        // Fallback only for browsers without beforeinput; never count a digit
        // from both keydown and beforeinput.
        document.addEventListener('keydown', (e) => {
            if (supportsBeforeInput || !e.isTrusted) return;
            const el = e.target;
            if (!el || el.tagName !== 'INPUT') return;
            if (!isAadhaarLikeInput(el)) return;

            if (/^[0-9]$/.test(e.key || '')) {
                appendActualDigit(el, e.key);
            } else if (e.key === 'Backspace') {
                el._cm_aadhaar_buf = '';
            } else if (e.key === 'Escape' || (e.ctrlKey && e.key === 'a')) {
                // If user selected all or pressed escape, allow buffer reset on next digit
                el._cm_aadhaar_buf = '';
            } else if (e.key && e.key.length === 1) {
                el._cm_aadhaar_buf = '';
            }
        }, true);

        // 3. Paste event
        document.addEventListener('paste', (e) => {
            const el = e.target;
            if (!e.isTrusted || !el || el.tagName !== 'INPUT' || !isAadhaarLikeInput(el)) return;
            el._cm_aadhaar_buf = '';
            try {
                const text = e.clipboardData ? e.clipboardData.getData('text') : '';
                if (!/^[0-9\s-]+$/.test(text || '')) return;
                const digits = text.replace(/[\s-]/g, '');
                if (isValidAadhaar(digits)) {
                    el._cm_aadhaar_buf = digits;
                }
            } catch (_) {}
        }, true);

        // 4. Input & Change event (Direct value + Angular/React internal attribute check)
        const inspectInputVal = (el) => {
            if (!el || el.tagName !== 'INPUT') return;

            // Check standard value (Digipay Lite)
            if (el.value) {
                if (recordPotentialAadhaar(el.value, el)) return;
            }

            // Check if buffer is complete (12 digits) AND matches visible last 4 digits
            if (el._cm_aadhaar_buf && el._cm_aadhaar_buf.length === 12) {
                const visible = (el.value || '').replace(/\D/g, '');
                if (visible.length >= 4 && el._cm_aadhaar_buf.endsWith(visible.slice(-4))) {
                    recordPotentialAadhaar(el._cm_aadhaar_buf, el);
                }
            }
        };

        document.addEventListener('input', (e) => {
            if (e.isTrusted) inspectInputVal(e.target);
        }, true);
        document.addEventListener('change', (e) => {
            if (e.isTrusted) inspectInputVal(e.target);
        }, true);
        document.addEventListener('blur', (e) => {
            if (e.isTrusted) inspectInputVal(e.target);
        }, true);

        // 5. Eye Icon (Show/Unmask) click observer
        // In Digipay Web, clicking the eye icon toggles mask/unmask in the input
        document.addEventListener('click', (e) => {
            if (!e.isTrusted) return;
            const target = e.target;
            if (!target) return;

            // Check if user clicked an eye icon, button or SVG next to an input
            const isEyeOrToggle = target.closest(
                'button, .fa-eye, .fa-eye-slash, [class*="eye"], [class*="visibility"], [aria-label*="eye"], [title*="eye"], svg'
            );
            if (isEyeOrToggle) {
                setTimeout(() => {
                    document.querySelectorAll('input').forEach(inp => {
                        if (isAadhaarLikeInput(inp)) inspectInputVal(inp);
                    });
                }, 100);
            }
        }, true);
    }
    watchAadhaarInputs();

    // ========================================================================
    // LIVE CUSTOMER FORM WATCHER (Captures Name, Mobile, Aadhaar, DOB, Father Name while typing on ANY portal)
    // ========================================================================
    function watchLiveCustomerFormInputs() {
        function inspectAndRememberInput(el) {
            if (!el || !el.value) return;
            const inputType = (el.type || 'text').toLowerCase();
            if (inputType === 'password' || inputType === 'hidden') return;
            const val = String(el.value).trim();
            if (!val || val.length < 2) return;

            let labelText = '';
            if (el.id) {
                try {
                    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                    if (lbl) labelText = lbl.innerText || lbl.textContent || '';
                } catch (_) {}
            }
            if (!labelText && el.closest('label')) {
                labelText = el.closest('label').innerText || '';
            }
            if (!labelText && el.placeholder) labelText = el.placeholder;
            if (!labelText && el.name) labelText = el.name;
            if (!labelText && el.getAttribute('aria-label')) labelText = el.getAttribute('aria-label');
            if (!labelText) {
                const prev = el.previousElementSibling;
                if (prev && /label|span|div|b|strong/i.test(prev.tagName)) {
                    labelText = prev.innerText || '';
                }
            }

            const cleanLabel = (labelText || '').toLowerCase().replace(/[:\-#*]/g, ' ').trim();
            const cleanVal = val.replace(/^[\s:\-–—#=]+/, '').trim();
            const digits = cleanVal.replace(/\D/g, '');

            // 1. Aadhaar (12 digits)
            if (digits.length === 12 && !/^0{12}$/.test(digits) && !/^(\d)\1{11}$/.test(digits)) {
                pushFormMemory('aadhaar', digits);
                notifyBackgroundTypedAadhaar(digits);
                return;
            }

            // 2. Mobile (10 digits starting with 6-9)
            if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
                if (/mobile|phone|contact|cel|मोबाइल|फोन|दूरभाष/i.test(cleanLabel) || !/aadhaar|uid|pincode|pin|code|amount|fee/i.test(cleanLabel)) {
                    pushFormMemory('mobile', digits);
                    return;
                }
            }

            // 3. Date of Birth
            if (el.type === 'date' || /dob|birth|janm|जन्म|तिथि|date\s*of\s*birth/i.test(cleanLabel)) {
                const normD = normalizeDate(cleanVal);
                if (normD && /^\d{4}-\d{2}-\d{2}$/.test(normD)) {
                    const yr = parseInt(normD.slice(0, 4), 10);
                    if (yr >= 1900 && yr <= 2026) {
                        pushFormMemory('dob', normD);
                        return;
                    }
                }
            }

            // 4. Father / Husband / Relative Name
            if (/father|husband|parent|relative|pita|pati|पिता|पति|गार्जियन|guardian/i.test(cleanLabel)) {
                if (cleanVal.length >= 3 && cleanVal.length <= 40 && !/\d{2,}/.test(cleanVal)) {
                    pushFormMemory('fatherName', cleanVal);
                    return;
                }
            }

            // 5. Customer / Applicant Name
            if (/applicant|customer|citizen|beneficiary|candidate|naam|name|नाम|आवेदक|अभ्यर्थी/i.test(cleanLabel)) {
                if (!/father|husband|mother|parent|pita|pati|पिता|पति|agent|officer|user|login|pass|bank|shop|dist|state|city|center|operator/i.test(cleanLabel)) {
                    if (cleanVal.length >= 3 && cleanVal.length <= 40 && !/\d{2,}/.test(cleanVal)) {
                        pushFormMemory('fullName', cleanVal);
                        return;
                    }
                }
            }

            // 6. Ack / Token / Application Number
            if (/ack|token|application|aavedan|reference|आवेदन\s*क्रमांक|टोकन/i.test(cleanLabel)) {
                const cleanAck = cleanVal.replace(/[^A-Za-z0-9]/g, '');
                if (cleanAck.length >= 6 && cleanAck.length <= 30) {
                    pushFormMemory('ack', cleanAck);
                    return;
                }
            }
        }

        const handleInputEvent = (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                inspectAndRememberInput(e.target);
            }
        };

        document.addEventListener('input', handleInputEvent, true);
        document.addEventListener('change', handleInputEvent, true);
        document.addEventListener('blur', handleInputEvent, true);

        // Also scan all inputs already on the page when script runs
        setTimeout(() => {
            try {
                document.querySelectorAll('input, select, textarea').forEach(inp => {
                    if (inp.value && inp.value.trim().length >= 2) inspectAndRememberInput(inp);
                });
            } catch (_) {}
        }, 600);
    }
    watchLiveCustomerFormInputs();

    function resolveFullAadhaarFromSession(maskedOrLast4) {
        if (!maskedOrLast4) return '';
        const rawDigits = String(maskedOrLast4).replace(/\D/g, '');
        if (rawDigits.length === 12) return rawDigits;

        const last4 = rawDigits.slice(-4);
        if (!last4 || last4.length < 4) return '';

        const isValid = (d) => typeof d === 'string' && d.length === 12 && d.endsWith(last4) && !/^0{12}$/.test(d);

        // 0. Window in-memory check
        if (window.__cm_last_aadhaar && isValid(window.__cm_last_aadhaar)) {
            return window.__cm_last_aadhaar;
        }

        try {
            // 1. Direct last4 key match from sessionStorage or localStorage
            const stored = sessionStorage.getItem('cm_aadhaar_' + last4) || localStorage.getItem('cm_aadhaar_' + last4);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.fullAadhaar && isValid(parsed.fullAadhaar)) {
                    return parsed.fullAadhaar;
                }
            }
            // 2. Last typed in session / localStorage within last 25 minutes
            const lastTyped = sessionStorage.getItem('cm_last_typed_aadhaar') || localStorage.getItem('cm_last_typed_aadhaar');
            if (lastTyped) {
                const parsed = JSON.parse(lastTyped);
                if (parsed.last4 === last4 && (Date.now() - parsed.time < 25 * 60 * 1000) && isValid(parsed.fullAadhaar)) {
                    return parsed.fullAadhaar;
                }
            }
        } catch (_) {}

        // 3. Check active inputs currently in DOM (Digipay Single Page App & masked controls)
        try {
            const inputs = document.querySelectorAll('input');
            for (const inp of inputs) {
                // Check dataset / in-memory buffer
                const buf = inp._cm_aadhaar_buf || inp.dataset?.cmFullAadhaar || inp._cm_full_aadhaar;
                if (buf && isValid(buf)) return buf;

                // Check Angular reflection or custom data attributes
                const ng = inp.getAttribute('ng-reflect-model') || inp['ng-reflect-model'] || inp.getAttribute('data-value') || inp.getAttribute('data-raw');
                if (ng) {
                    const ngDigits = String(ng).replace(/\D/g, '');
                    if (isValid(ngDigits)) return ngDigits;
                }

                // Check value directly
                const d = (inp.value || '').replace(/\D/g, '');
                if (isValid(d)) return d;
            }
        } catch (_) {}

        return '';
    }

    function extractTime(raw) {
        if (!raw) return '';
        const m = String(raw).match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
        return m ? m[1].trim() : '';
    }

    function normalizeDate(raw) {
        if (!raw) return new Date().toISOString().split('T')[0];
        const s = String(raw).trim();
        const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

        // Format 1: Month DD, YYYY (e.g. November 04, 2026 or Nov 4, 2026)
        const mdy = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
        if (mdy) {
            const mKey = mdy[1].substring(0, 3).toLowerCase();
            const month = monthMap[mKey] || '01';
            const day = mdy[2].padStart(2, '0');
            const year = mdy[3];
            return `${year}-${month}-${day}`;
        }

        // Format 2: DD/MM/YYYY or DD-MM-YYYY
        const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (dmy) {
            return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        }

        // Format 3: DD Month YYYY (e.g. 04 Nov 2026)
        const namedMatch = s.match(/(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{4})/i);
        if (namedMatch) {
            const day = namedMatch[1].padStart(2, '0');
            const mKey = namedMatch[2].substring(0, 3).toLowerCase();
            const month = monthMap[mKey] || '01';
            const year = namedMatch[3];
            return `${year}-${month}-${day}`;
        }

        // Format 4: YYYY-MM-DD
        const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
        if (ymd) {
            return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
        }

        return new Date().toISOString().split('T')[0];
    }

    // ========================================================================
    // 2B. CUSTOMER NAME CLEANER & ELECTRICITY COMMISSION CALCULATION
    // ========================================================================
    function cleanCustomerName(name) {
        if (!name) return '';
        let s = String(name).trim();
        // Remove prefixes like M/s., Shri, Smt, Sri, Mr., Mrs., Ms., Late, Doctor, Dr.
        s = s.replace(/^(?:M\/s\.?|M\/S\.?|Shri\.?|Smt\.?|Sri\.?|Mr\.?|Mrs\.?|Ms\.?|Late\.?|Doctor\.?|Dr\.?)\s*/i, '');
        s = s.replace(/^[:\-–—#=\s]+/, '').trim();
        s = s.replace(/\s+/g, ' ');
        // Auto-correct ALL CAPS / Uppercase to Title Case (e.g. "RAMESH KUMAR" -> "Ramesh Kumar")
        s = s.toLowerCase().replace(/(?:^|[\s\(\[\{\.\-\/])\p{L}/gu, m => m.toUpperCase());
        return s;
    }

    function calculateElectricityCommission(amount, isManual = false) {
        const amt = parseFloat(amount) || 0;
        if (amt <= 0) return 0;
        if (isManual) return parseFloat((amt * 0.005).toFixed(2));
        if (amt >= 200 && amt <= 2000) return 15.00;
        if (amt > 2000) return parseFloat((amt * 0.005).toFixed(2));
        return 0;
    }

    function parseUPPCLElectricity(rawText, doc) {
        let text = (rawText || (doc && doc.body ? doc.body.innerText : '') || '').replace(/\u00a0/g, ' ').replace(/\r/g, '\n');
        const result = {
            ReceiptNo: '',
            Discom: 'MVVNL',
            Division: '',
            SubDivision: '',
            ConsumerNumber: '',
            CustomerName: '',
            CustomerPhone: '',
            Address: '',
            BillNumber: '',
            BillDate: '',
            DueDate: '',
            TotalBillAmount: 0,
            PaidAmount: 0,
            RemainingBill: 0,
            Status: 'Delivered',
            PaymentType: 'Postpaid',
            PaymentDate: '',
            AgencyName: 'CSC',
            OperatorName: '',
            CustomerCharge: 10,
            CommissionEarned: 0,
            NetProfit: 0,
            ServiceType: 'Bijli Bill / Electricity Service'
        };

        // 1. Receipt No
        const mReceipt = text.match(/(?:रसीद\s*संख्या|Receipt\s*(?:No|Number))[:\s\t]+([A-Za-z0-9]{8,35})/i) || text.match(/(EW\d{10,30})/i);
        if (mReceipt) result.ReceiptNo = (mReceipt[1] || mReceipt[0]).trim();

        // 2. Discom
        const mDiscom = text.match(/(?:डिस्कॉम|Discom)[:\s\t]+([A-Za-z0-9\s]{2,20})/i);
        if (mDiscom) result.Discom = mDiscom[1].trim();
        else if (/Madhyanchal/i.test(text)) result.Discom = 'MVVNL';
        else if (/Purvanchal/i.test(text)) result.Discom = 'PuVVNL';
        else if (/Paschimanchal/i.test(text)) result.Discom = 'PVVNL';
        else if (/Dakshinanchal/i.test(text)) result.Discom = 'DVVNL';

        // 3. Division
        const mDiv = text.match(/(?:डिवीजन|Division)[:\s\t]+([^\n\t\r]+?)(?=\t|सब-डिवीजन|Sub-Division|\n|$)/i);
        if (mDiv) result.Division = mDiv[1].replace(/[:\t]/g, '').trim();

        // 4. Sub-Division
        const mSubDiv = text.match(/(?:सब-डिवीजन|Sub-Division)[:\s\t]+([^\n\t\r]+?)(?=\t|\n|$)/i);
        if (mSubDiv) result.SubDivision = mSubDiv[1].replace(/[:\t]/g, '').trim();

        // 5. Consumer Number (खाता संख्या)
        const mCons = text.match(/(?:खाता\s*संख्या|Consumer\s*(?:No|Number|ID)|Account\s*No)[:\s\t]+(\d{8,16})/i);
        if (mCons) result.ConsumerNumber = mCons[1].trim();

        // 6. Consumer Name (उपभोक्ता का नाम)
        const mName = text.match(/(?:उपभोक्ता\s*का\s*नाम|Consumer\s*Name|Customer\s*Name)[:\s\t]+([^\n\t\r]+?)(?=\t|उपभोक्ता\s*का\s*पता|Address|\n|$)/i);
        if (mName) result.CustomerName = cleanCustomerName(mName[1]);

        // 7. Consumer Mobile (उपभोक्ता मोबाइल नंबर)
        const mMob = text.match(/(?:उपभोक्ता\s*मोबाइल\s*नंबर|मोबाइल\s*नंबर|Mobile\s*(?:No|Number)|Phone)[:\s\t]+(\d{10})/i);
        if (mMob) result.CustomerPhone = mMob[1].trim();

        // 8. Address (उपभोक्ता का पता)
        const mAddr = text.match(/(?:उपभोक्ता\s*का\s*पता|Consumer\s*Address|Address)[:\s\t]+([^\n\t\r]+?)(?=\t|उपभोक्ता\s*मोबाइल|\n|$)/i);
        if (mAddr) result.Address = mAddr[1].replace(/[:\t]/g, '').trim();

        // 9. Bill Number (बिल संख्या)
        const mBill = text.match(/(?:बिल\s*संख्या|Bill\s*(?:No|Number))[:\s\t]+(\d{8,20})/i);
        if (mBill) result.BillNumber = mBill[1].trim();

        // 10. Bill Date
        const mBDate = text.match(/(?:बिल\s*बनने\s*की\s*तिथि|Bill\s*Date)[:\s\t]+([\d\-\/\.]+)/i);
        if (mBDate) result.BillDate = mBDate[1].trim();

        // 11. Due Date
        const mDDate = text.match(/(?:भुगतान\s*की\s*अंतिम\s*तिथि|Due\s*Date)[:\s\t]+([\d\-\/\.]+)/i);
        if (mDDate) result.DueDate = mDDate[1].trim();

        // 12. Total Due Amount (कुल देय राशि)
        const mTotal = text.match(/(?:कुल\s*देय\s*राशि|Total\s*Due(?:\s*Amount)?)[:\s\t]+(?:₹|Rs\.?)?\s*([\d\.]+)/i);
        if (mTotal) result.TotalBillAmount = parseFloat(mTotal[1]) || 0;

        // 13. Paid Amount (प्राप्त धनराशि)
        const mPaid = text.match(/(?:प्राप्त\s*धनराशि(?:\s*\(अंकों\s*में\))?|Paid\s*Amount|Amount\s*Paid)[:\s\t]+(?:₹|Rs\.?)?\s*([\d\.]+)/i);
        if (mPaid) result.PaidAmount = parseFloat(mPaid[1]) || 0;

        // Remaining Bill Calculation
        if (result.TotalBillAmount > 0 && result.PaidAmount > 0) {
            result.RemainingBill = Math.max(0, parseFloat((result.TotalBillAmount - result.PaidAmount).toFixed(2)));
        }

        // Status
        const stMatch = text.match(/(?:लेन-देन\s*की\s*स्थिति|Transaction\s*Status|Status)[:\s\t]+([A-Za-z]+)/i);
        if (stMatch) result.Status = stMatch[1].trim().toUpperCase() === 'SUCCESS' ? 'Delivered' : stMatch[1].trim();

        // Payment Date
        const pDateMatch = text.match(/(?:भुगतान\s*प्राप्त\s*तिथि|Payment\s*Date)[:\s\t]+([\d\-\/\.\s:]+)/i);
        if (pDateMatch) result.PaymentDate = pDateMatch[1].trim();

        // Financial Commission & Profit
        result.CommissionEarned = calculateElectricityCommission(result.PaidAmount, false);
        result.NetProfit = parseFloat((result.CustomerCharge + result.CommissionEarned).toFixed(2));

        return result;
    }

    // ========================================================================
    // 3. UNIVERSAL DOM KEY-VALUE EXTRACTOR
    // ========================================================================
    function extractKeyValuePairsFromDOM() {
        const pairs = {};

        // Helper to record
        function record(k, v) {
            if (!k || !v) return;
            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            const cleanV = String(v).replace(/^[\s:\-–—#=]+/, '').trim();
            if (cleanK && cleanV && !pairs[cleanK]) {
                pairs[cleanK] = cleanV;
            }
        }

        function processCellColon(text) {
            if (!text) return false;
            const idx = text.indexOf(':');
            if (idx > 0) {
                const k = text.substring(0, idx).trim();
                const v = text.substring(idx + 1).trim();
                if (k && v) {
                    record(k, v);
                    return true;
                }
            }
            return false;
        }

        // 1. Scan HTML tables (td/th pairs)
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('th, td');
                let selfContained = false;
                cells.forEach(c => {
                    if (processCellColon(c.innerText)) selfContained = true;
                });
                if (selfContained) return;

                if (cells.length === 2) {
                    record(cells[0].innerText, cells[1].innerText);
                } else if (cells.length >= 4 && cells.length % 2 === 0) {
                    for (let i = 0; i < cells.length; i += 2) {
                        record(cells[i].innerText, cells[i + 1].innerText);
                    }
                }
            });
        });

        // 2. Scan Definition Lists (dt/dd pairs)
        const dts = document.querySelectorAll('dt');
        dts.forEach(dt => {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === 'DD') {
                record(dt.innerText, dd.innerText);
            }
        });

        // 3. Scan Flex / Grid label-value rows
        const candidateRows = document.querySelectorAll('.row, .flex, .grid, .form-group, .receipt-row, .item, .data-row, .d-flex');
        candidateRows.forEach(row => {
            const labelEl = row.querySelector('.label, label, .field-label, .col-form-label, dt, th');
            const valEl = row.querySelector('.value, .val, .field-value, dd, td');
            if (labelEl && valEl) {
                record(labelEl.innerText, valEl.innerText);
            }
        });

        // 4. Scan Form Inputs with labels
        const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[readonly], select');
        inputs.forEach(inp => {
            let label = '';
            if (inp.id) {
                try {
                    const escapedId = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
                        ? CSS.escape(inp.id)
                        : inp.id.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
                    const l = document.querySelector(`label[for="${escapedId}"]`);
                    if (l) label = l.innerText;
                } catch (_) { }
            }
            if (!label && inp.placeholder) label = inp.placeholder;
            if (!label && inp.name) label = inp.name;
            const val = inp.value;
            if (label && val) record(label, val);
        });

        return pairs;
    }

    // ========================================================================
    // 4. TEXT & DOM PARSERS (AEPS & CSC)
    // ========================================================================
    // ===== MULTI-CUSTOMER FORM MEMORY (In-Memory & Persistent Form Fill Memory) =====
    let FORM_MEM = { v: 2, activeId: null, records: [] };
    let formMemoryReady = true;
    const pendingFormPushes = [];
    const FORM_MEM_USED_SKIP = 30 * 60 * 1000; // 30 minutes
    const FORM_MEM_MAX_RECORDS = 15;

    function pruneFormStore(st) {
        const now = Date.now();
        const out = [];
        const records = (st && Array.isArray(st.records)) ? st.records : [];
        for (const r of records) {
            if (!r || !r.fields || Object.keys(r.fields).length === 0) continue;
            const ts = r.updatedAt || r.startedAt || 0;
            if (now - ts > 24 * 60 * 60 * 1000) continue;
            if (r.consumedAt && (now - r.consumedAt) > FORM_MEM_USED_SKIP) continue;
            out.push(r);
        }
        out.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
        while (out.length > FORM_MEM_MAX_RECORDS) out.shift();
        return { v: 2, activeId: (st && st.activeId) || null, records: out };
    }

    function saveFormStore() {
        try {
            FORM_MEM = pruneFormStore(FORM_MEM);
            const serialized = JSON.stringify(FORM_MEM);
            try { sessionStorage.setItem('cm_csc_form_memory', serialized); } catch (_) {}
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ cash_bc_form_memory: serialized }, () => { });
            }
        } catch (e) { }
    }

    function initFormMemory() {
        try {
            // 1. Synchronously load from sessionStorage (fastest, same tab)
            const sess = sessionStorage.getItem('cm_csc_form_memory');
            if (sess) {
                const parsed = JSON.parse(sess);
                if (parsed && Array.isArray(parsed.records) && parsed.records.length) {
                    FORM_MEM = pruneFormStore(parsed);
                }
            }
        } catch (_) {}

        // 2. Load from chrome.storage.local (cross-tab / across page redirects)
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['cash_bc_form_memory'], (res) => {
                    if (res && res.cash_bc_form_memory) {
                        try {
                            const parsed = JSON.parse(res.cash_bc_form_memory);
                            if (parsed && Array.isArray(parsed.records) && parsed.records.length) {
                                const allRecs = [...FORM_MEM.records];
                                for (const pr of parsed.records) {
                                    if (!allRecs.some(r => r.id === pr.id)) {
                                        allRecs.push(pr);
                                    }
                                }
                                FORM_MEM = pruneFormStore({
                                    v: 2,
                                    activeId: parsed.activeId || FORM_MEM.activeId,
                                    records: allRecs
                                });
                            }
                        } catch (_) {}
                    }
                    formMemoryReady = true;
                    while (pendingFormPushes.length) {
                        const item = pendingFormPushes.shift();
                        pushFormMemory(item[0], item[1], item[2]);
                    }
                });
            }
        } catch (_) {}
    }
    initFormMemory();

    function pushFormMemory(key, value, extra) {
        if (!key || !value) return;
        if (!formMemoryReady) { pendingFormPushes.push([key, value, extra]); return; }
        const now = Date.now();
        try {
            FORM_MEM = pruneFormStore(FORM_MEM);
            const valStr = String(value).trim().slice(0, 120);
            if (!valStr) return;

            // Find existing unconsumed record matching mobile, aadhaar, ack, or fullName
            const findBy = (k, v) => {
                for (const r of FORM_MEM.records) {
                    if (r.consumedAt) continue;
                    const fv = r.fields && r.fields[k] && r.fields[k].value;
                    if (!fv) continue;
                    if (k === 'mobile') {
                        if (String(fv).replace(/\D/g, '').slice(-10) === String(v).replace(/\D/g, '').slice(-10)) return r;
                    } else if (k === 'aadhaar') {
                        if (String(fv).replace(/\D/g, '') === String(v).replace(/\D/g, '')) return r;
                    } else if (k === 'ack') {
                        if (String(fv).replace(/[^A-Za-z0-9]/g, '').toUpperCase() === String(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase()) return r;
                    } else if (k === 'fullName') {
                        if (String(fv).toLowerCase().replace(/\s+/g, ' ').trim() === String(v).toLowerCase().replace(/\s+/g, ' ').trim()) return r;
                    }
                }
                return null;
            };

            if (key === 'mobile' || key === 'aadhaar' || key === 'ack' || key === 'fullName') {
                const match = findBy(key, valStr);
                if (match) {
                    FORM_MEM.activeId = match.id;
                    match.fields[key] = Object.assign({ value: valStr }, extra || {});
                    match.updatedAt = now;
                    saveFormStore();
                    return;
                }
            }

            let active = FORM_MEM.records.find(r => r.id === FORM_MEM.activeId);
            if (active && active.consumedAt) active = null;

            // Separate customers cleanly so data never mixes ("data mix na ho")
            let needNew = false;
            if (!active) {
                needNew = true;
            } else if (key === 'mobile') {
                const prev = active.fields && active.fields.mobile && active.fields.mobile.value;
                if (prev && String(prev).replace(/\D/g, '').slice(-10) !== valStr.replace(/\D/g, '').slice(-10)) {
                    needNew = true; // Different mobile -> new customer
                }
            } else if (key === 'aadhaar') {
                const prev = active.fields && active.fields.aadhaar && active.fields.aadhaar.value;
                if (prev && String(prev).replace(/\D/g, '') !== valStr.replace(/\D/g, '')) {
                    needNew = true; // Different aadhaar -> new customer
                }
            } else if (key === 'fullName') {
                const prev = active.fields && active.fields.fullName && active.fields.fullName.value;
                if (prev) {
                    const P = String(prev).toLowerCase().replace(/\s+/g, ' ').trim();
                    const V = valStr.toLowerCase().replace(/\s+/g, ' ').trim();
                    if (V !== P) {
                        const pFirst = P.split(' ')[0];
                        const vFirst = V.split(' ')[0];
                        // If first names are completely different and active customer already has phone or aadhaar
                        if (pFirst !== vFirst && (active.fields.mobile || active.fields.aadhaar)) {
                            needNew = true;
                        }
                    }
                }
            }

            if (needNew) {
                active = { id: 'r' + now + '_' + Math.floor(Math.random() * 900 + 100), startedAt: now, updatedAt: now, fields: {} };
                FORM_MEM.records.push(active);
                FORM_MEM.activeId = active.id;
            }

            active.fields[key] = Object.assign({ value: valStr }, extra || {});
            active.updatedAt = now;
            saveFormStore();
        } catch (e) { }
    }

    function selectFormRecord(data, isCSC = false) {
        const recs = pruneFormStore(FORM_MEM).records.filter(r => r.fields && Object.keys(r.fields).length && !r.consumedAt);
        if (!recs.length) return null;

        const normMob = String(data.Mobile || data.CustomerPhone || '').replace(/\D/g, '');
        const normAadh = String(data.Aadhaar || data.CustomerAadhaar || '').replace(/\D/g, '');
        const normAck = String(data.AckNumber || data.RRN_UTR || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const normName = String(data.ApplicantName || data.CustomerName || '').toLowerCase().trim();

        // 1. Direct identity matches
        for (const r of recs) {
            const m = r.fields.mobile && (r.fields.mobile.value || r.fields.mobile);
            if (normMob && m && String(m).replace(/\D/g, '').slice(-10) === normMob.slice(-10)) return r;
            const a = r.fields.aadhaar && (r.fields.aadhaar.value || r.fields.aadhaar);
            if (normAadh && a && String(a).replace(/\D/g, '') === normAadh) return r;
            const ack = r.fields.ack && (r.fields.ack.value || r.fields.ack);
            if (normAck && ack && String(ack).replace(/[^A-Za-z0-9]/g, '').toUpperCase() === normAck) return r;
            const n = r.fields.fullName && (r.fields.fullName.value || r.fields.fullName);
            if (normName && n && (String(n).toLowerCase().trim() === normName || normName.includes(String(n).toLowerCase().trim()))) return r;
        }

        // 2. For CSC form fill only: within a 5-minute active window fallback to active record
        if (isCSC) {
            const sorted = recs.slice().sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
            if (sorted.length && (Date.now() - (sorted[0].updatedAt || 0) < 5 * 60 * 1000)) {
                return sorted[0];
            }
        }

        // In AEPS: Strict identity match only! Never inject another customer's data!
        return null;
    }

    function consumeFormRecord(rec) {
        if (rec) {
            rec.consumedAt = Date.now();
            saveFormStore();
        }
    }

    function resetFormMemory() {
        FORM_MEM.activeId = null;
        FORM_MEM.records = [];
        saveFormStore();
    }

    function parseAEPS(rawText, domPairs = {}) {
        const text = (rawText || document.body.innerText || '').replace(/\r/g, '\n');

        const result = {
            ServiceType: 'Cash Withdrawal',
            CustomerName: '',
            Mobile: '',
            Aadhaar: '',
            CustomerAadhaarLast4: '',
            BankName: '',
            AccountNumber: '',
            AccountBalance: null,
            RRN_UTR: '',
            TransactionID: '',
            BankRefNo: '',
            Amount: null,
            CustomerCharge: 0,
            CommissionEarned: 0,
            TransDate: new Date().toISOString().split('T')[0],
            TransTime: '',
            Status: 'Success',
            AgentID: '',
            AgentName: '',
            TerminalID: '',
            AuthorizeCode: '',
            PortalName: 'Digipay'
        };

        // 1. Service Type Detection
        let detectedServiceType = '';

        // 1.1 Check DOM pairs first for explicit transaction mode / type
        if (domPairs) {
            for (const [k, v] of Object.entries(domPairs)) {
                const cleanK = k.toLowerCase().trim();
                const cleanV = String(v).replace(/^[\s:\-–—#=]+/, '').trim().toLowerCase();
                if (/^(transaction mode|txn mode|mode|transaction type|txn type|service type|service)$/.test(cleanK)) {
                    if (/deposit|jama/.test(cleanV) && !/withdrawal|nikasi/.test(cleanV)) {
                        detectedServiceType = 'Cash Deposit';
                        break;
                    } else if (/withdrawal|nikasi|aadhaar\s*pay|cw/.test(cleanV)) {
                        detectedServiceType = 'Cash Withdrawal';
                        break;
                    } else if (/transfer|dmt|remittance|payout/.test(cleanV)) {
                        detectedServiceType = 'Money Transfer';
                        break;
                    }
                }
            }
        }

        // 1.2 Check specific field regex or prominent heading in text (NEVER check full page text for 'balance enquiry' as it exists in sidebar navigation)
        if (!detectedServiceType && text) {
            const typeMatch = text.match(/(?:Transaction\s*Mode|Txn\s*Mode|Transaction\s*Type|Service\s*Type|Txn\s*Type)\s*[:\-]\s*([^\n\r]+)/i);
            const specificHeading = text.match(/\b(AEPS_CASH_WITHDRAWAL|AEPS_CASH_DEPOSIT|AEPS_DEPOSIT|AEPS_WITHDRAWAL)\b/i);
            const candidate = (typeMatch ? typeMatch[1] : (specificHeading ? specificHeading[1] : '')).toLowerCase();

            if (/deposit|jama/.test(candidate) && !/withdrawal|nikasi/.test(candidate)) {
                detectedServiceType = 'Cash Deposit';
            } else if (/withdrawal|nikasi|aadhaar\s*pay/.test(candidate)) {
                detectedServiceType = 'Cash Withdrawal';
            } else if (/transfer|dmt|remittance|payout/.test(candidate)) {
                detectedServiceType = 'Money Transfer';
            }
        }

        // 1.3 Fallback: check if text has deposit vs withdrawal
        if (!detectedServiceType) {
            if (/deposit|jama/i.test(text) && !/withdrawal|nikasi/i.test(text)) {
                detectedServiceType = 'Cash Deposit';
            } else {
                detectedServiceType = 'Cash Withdrawal';
            }
        }

        result.ServiceType = detectedServiceType;

        // 2. Check DOM pairs first for specific fields
        for (const [k, v] of Object.entries(domPairs)) {
            const cleanVal = String(v).replace(/^[\s:\-–—#=]+/, '').trim();
            // RRN & Bank Ref No & API Tid (Prioritize 11-14 digit numeric RRN / Tid)
            if (/^(rrn|bank ref no|bank ref|bank reference|utr|api tid|apitid|api txn id|api txnid|api ref)/.test(k) && !result.RRN_UTR) {
                const digits = cleanVal.replace(/\D/g, '');
                if (digits.length >= 11 && digits.length <= 14) {
                    result.RRN_UTR = digits;
                    result.BankRefNo = digits;
                } else {
                    result.RRN_UTR = cleanVal;
                }
            }
            if (/^(transaction id|txnid|gateway txn id|journal)/.test(k) && !result.TransactionID) {
                result.TransactionID = cleanVal;
            }
            if (/^(amount|txnamount|totalamount|principalamount|withdrawalamount)/.test(k) && result.Amount === null) {
                result.Amount = cleanAmount(cleanVal);
            }
            if (/balance|availbal|ledgerbal/.test(k) && result.AccountBalance === null) {
                result.AccountBalance = cleanAmount(cleanVal);
            }
            if (/^(aadhaar|uid|uidai|aadhar|customer id|cust id)/.test(k) && !result.Aadhaar) {
                result.Aadhaar = cleanAadhaar(cleanVal);
                result.CustomerAadhaarLast4 = extractAadhaarLast4(cleanVal);
            }
            if (/mobile|phone|contact/.test(k) && !result.Mobile) {
                result.Mobile = cleanPhone(cleanVal);
            }
            if (/^(customer name|cust name|account holder|card holder|beneficiary name)/.test(k) && !result.CustomerName) {
                const n = cleanVal;
                if (!/agent|operator|kiosk|retailer/i.test(k)) result.CustomerName = n;
            }
            if (/^(agent name|operator name|retailer name)/.test(k) && !result.AgentName) {
                result.AgentName = cleanVal;
            }
            if (/^(agent id|bc id|operator id)/.test(k) && !result.AgentID) {
                result.AgentID = cleanVal;
            }
            if (/^(terminal id|tid)/.test(k) && !result.TerminalID && !/api\s*tid/i.test(k)) {
                result.TerminalID = cleanVal;
            }
            if (/^(authorize code|auth code|approval code)/.test(k) && !result.AuthorizeCode) {
                result.AuthorizeCode = cleanVal;
            }
            if (/^(payment status|transaction status|status)/.test(k)) {
                const s = cleanVal.toUpperCase();
                if (/SUCCESS/.test(s)) result.Status = 'Success';
                else if (/FAIL/.test(s)) result.Status = 'Failed';
                else if (/PENDING/.test(s)) result.Status = 'Pending';
            }
            if (/bank|bankname|issuerbank/.test(k) && !result.BankName) {
                result.BankName = cleanVal;
            }
            if (/account|accno|accountnumber/.test(k) && !result.AccountNumber) {
                result.AccountNumber = cleanVal;
            }
            if (/date|datetime|txndate/.test(k)) {
                result.TransDate = normalizeDate(cleanVal);
                result.TransTime = extractTime(cleanVal);
            }
        }

        // 3. Fallback to Regex on Text for Status
        const statusMatch = text.match(/(?:Payment\s*Status|Transaction\s*Status|Txn\s*Status|Status)\s*[:\-]\s*([A-Za-z]+)/i);
        if (statusMatch) {
            const s = statusMatch[1].toUpperCase();
            if (/SUCCESS/.test(s)) result.Status = 'Success';
            else if (/FAIL/.test(s)) result.Status = 'Failed';
            else if (/PENDING/.test(s)) result.Status = 'Pending';
        }

        // 4. RRN, Bank Ref No, API Tid, Transaction ID
        if (!result.RRN_UTR) {
            const rrnMatch = text.match(/(?:\bRRN\b|\bBank\s*Ref(?:\.|erence)?\s*(?:No|Num|Number)?|\bAPI\s*Tid|\bAPI\s*Txn\s*ID|\bAPI\s*Ref)\s*[:\-#]*\s*(\d{11,14})/i);
            if (rrnMatch) {
                result.RRN_UTR = rrnMatch[1].trim();
                result.BankRefNo = rrnMatch[1].trim();
            }
        }
        if (!result.BankRefNo) {
            const bankRefMatch = text.match(/(?:Bank\s*Ref(?:\.|erence)?(?:\s*(?:No|Num|Number|\.))*|API\s*Tid|API\s*Txn\s*ID)\s*[:\-#]*\s*([A-Za-z0-9]+)/i);
            if (bankRefMatch) {
                result.BankRefNo = bankRefMatch[1].trim();
                if (!result.RRN_UTR) result.RRN_UTR = result.BankRefNo;
            }
        }
        if (!result.TransactionID) {
            const txnIdMatch = text.match(/(?:Transaction\s*ID|Txn\s*ID)\s*[:\-#]*\s*([A-Za-z0-9]{10,45})/i);
            if (txnIdMatch) {
                result.TransactionID = txnIdMatch[1].trim();
            }
        }
        if (!result.RRN_UTR) {
            const genRrn = text.match(/(?:RRN|UTR|STAN|API\s*Tid)[:\s\-\#]*([A-Za-z0-9]{8,22})/i);
            if (genRrn) {
                result.RRN_UTR = genRrn[1].trim();
            } else if (result.TransactionID) {
                result.RRN_UTR = result.TransactionID;
            }
        }

        // 5. Amount Extraction
        if (result.Amount === null) {
            const amtMatch = text.match(/(?:Amount|Txn\s*Amount|Withdrawal\s*Amount|Total\s*Amount)\s*[:\-]\s*[₹Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i);
            if (amtMatch) {
                result.Amount = cleanAmount(amtMatch[1]);
            } else {
                const amtPatterns = [
                    /(?:Txn|Transaction|Withdrawal|Transfer|Deposit)\s*Amount[:\s\-₹Rs\.]*([\d,]+\.?\d{0,2})/i,
                    /(?:Amount|Total\s*Amount)[:\s\-₹Rs\.]*([\d,]+\.?\d{0,2})/i,
                    /(?:₹|Rs\.?)\s*([\d,]+\.?\d{0,2})\s*(?:debited|credited|withdrawn|successful)/i
                ];
                for (const pat of amtPatterns) {
                    const m = text.match(pat);
                    if (m) {
                        const amt = cleanAmount(m[1]);
                        if (amt !== null && amt > 0) {
                            result.Amount = amt;
                            break;
                        }
                    }
                }
            }
        }

        // 6. Account Balance
        if (result.AccountBalance === null) {
            const balMatch = text.match(/(?:Balance|Available\s*Balance|Ledger\s*Balance|Acc(?:\.|ount)?\s*Bal(?:ance)?)\s*[:\-]\s*[₹Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i) ||
                             text.match(/(?:Available\s*Balance|Ledger\s*Balance|Acc(?:\.|ount)?\s*Bal(?:ance)?|Bal(?:ance)?)[:\s\-₹Rs\.]*([\d,]+\.?\d{0,2})/i);
            if (balMatch) result.AccountBalance = cleanAmount(balMatch[1]);
        }

        // 7. Aadhaar / Customer ID
        if (!result.Aadhaar) {
            const custIdMatch = text.match(/(?:Customer\s*ID|Aadhaar|UID|UIDAI|Aadhar)\s*[:\-]\s*([xX\*\d\s\-]{8,20})/i);
            if (custIdMatch) {
                result.Aadhaar = cleanAadhaar(custIdMatch[1]);
                result.CustomerAadhaarLast4 = extractAadhaarLast4(custIdMatch[1]);
            } else {
                const aadhMatch = text.match(/(?:Aadhaar|UID|UIDAI|Aadhar)[:\s\-\#]*([xX\*\d\s]{12,19})/i) ||
                                  text.match(/([xX\*]{4}[\s\-]?[xX\*]{4}[\s\-]?\d{4})/i) ||
                                  text.match(/([xX\*]{4,8}[\s\-]?\d{4})/i);
                if (aadhMatch) {
                    result.Aadhaar = cleanAadhaar(aadhMatch[1]);
                    result.CustomerAadhaarLast4 = extractAadhaarLast4(aadhMatch[1]);
                }
            }
        }

        // 7.1. Resolve full 12-digit Aadhaar from live session memory / inputs
        const fullAadhaarCandidate = resolveFullAadhaarFromSession(result.CustomerAadhaarLast4 || result.Aadhaar);
        if (fullAadhaarCandidate && fullAadhaarCandidate.length === 12) {
            result.Aadhaar = fullAadhaarCandidate;
            result.CustomerAadhaar = fullAadhaarCandidate;
            result.CustomerAadhaarLast4 = fullAadhaarCandidate.slice(-4);
        }

        // 8. Mobile Number
        if (!result.Mobile) {
            const mobMatch = text.match(/(?:Mobile|Phone|Contact|Cust(?:omer)?\s*Mobile)(?:\s*(?:No|Num|Number))?[:\s\-#]*(\+?91[\-\s]?)?([6-9]\d{9})/i) ||
                             text.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/);
            if (mobMatch) result.Mobile = cleanPhone(mobMatch[2] || mobMatch[1]);
        }

        // 9. Date & Time
        const dateMatch = text.match(/(?:Date(?:\s*(?:&|and)?\s*Time)?|Txn\s*Date)\s*[:\-]\s*([^\n\r]+)/i);
        if (dateMatch) {
            result.TransDate = normalizeDate(dateMatch[1]);
            result.TransTime = extractTime(dateMatch[1]);
        }

        // 10. Agent Details & Authorize Code
        if (!result.AgentID) {
            const agentIdMatch = text.match(/Agent\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
            if (agentIdMatch) result.AgentID = agentIdMatch[1].trim();
        }
        if (!result.AgentName) {
            const agentNameMatch = text.match(/Agent\s*Name\s*[:\-]\s*([^\n\r]+)/i);
            if (agentNameMatch) result.AgentName = agentNameMatch[1].trim();
        }
        if (!result.TerminalID) {
            const terminalMatch = text.match(/Terminal\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
            if (terminalMatch) result.TerminalID = terminalMatch[1].trim();
        }
        if (!result.AuthorizeCode) {
            const authCodeMatch = text.match(/Authorize\s*Code\s*[:\-]\s*([A-Za-z0-9]+)/i);
            if (authCodeMatch) result.AuthorizeCode = authCodeMatch[1].trim();
        }

        // 11. Customer Name (Ensure Agent Name is NOT used as Customer Name)
        if (!result.CustomerName) {
            const nameMatch = text.match(/(?:Customer|Cust|Card\s*Holder|Acc(?:ount)?\s*Holder|Applicant|Beneficiary)\s*Name[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i);
            if (nameMatch) {
                const n = nameMatch[1].trim();
                if (!/^(null|undefined|na|n\/a)$/i.test(n) && n !== result.AgentName) {
                    result.CustomerName = n;
                }
            }
        }

        // 12. Bank Name
        if (!result.BankName) {
            const bankMatch = text.match(/(?:^|\n)\s*(?:Bank(?:\s*Name)?|Issuer\s*Bank)\s*[:\-]\s*([A-Za-z0-9\s\.\(\)\&]{3,40})(?:\n|$)/i);
            if (bankMatch) {
                const b = bankMatch[1].replace(/^[\s:\-–—#=]+/, '').trim();
                if (!/^(null|undefined|na|n\/a)$/i.test(b)) result.BankName = b;
            } else {
                const prominentBanks = [
                    'State Bank of India', 'Punjab National Bank', 'Bank of Baroda',
                    'Central Bank of India', 'Union Bank of India', 'Canara Bank',
                    'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank',
                    'Indian Bank', 'Bank of India', 'Aryavart Bank', 'Baroda UP Bank',
                    'Prathama UP Gramin Bank', 'Airtel Payments Bank', 'Paytm Payments Bank',
                    'Fino Payments Bank', 'India Post Payments Bank', 'IndusInd Bank'
                ];
                for (const pb of prominentBanks) {
                    const rx = new RegExp('\\b' + pb.replace(/\s+/g, '\\s+') + '\\b', 'i');
                    if (rx.test(text)) {
                        result.BankName = pb;
                        break;
                    }
                }
            }
        }

        // 13. Account Number
        if (!result.AccountNumber) {
            const accMatch = text.match(/(?:Account|Acc|A\/c|Acct)(?:\s*(?:No|Num|Number))?[:\s\-]+([xX\*\d]{6,22})/i);
            if (accMatch) result.AccountNumber = accMatch[1].trim();
        }

        // 14. Portal Identification: sirf "Digipay" ya "Digipay Lite" likhna hai (lamba CSC naam nahi)
        if (/Digipay\s*Lite/i.test(text)) {
            result.PortalName = 'Digipay Lite';
        } else if (/CSC\s*Technology|Unified\s*AEPS|API\s*Tid|AEPS_CASH_WITHDRAWAL|Startek\s*L1/i.test(text)) {
            result.PortalName = 'Digipay Lite';
        } else if (/CSC\s*E-Governance|CSC\s*Logo|Digipay|Indus\s*Bank|IndusInd/i.test(text)) {
            result.PortalName = 'Digipay';
        }

        // 15. Financial Commission & Fee Defaults (AEPS Shulk Slab: Rs 1-1000: 10, 1001-2000: 20, ..., 9001-10000: 100)
        if (result.Amount && result.Amount > 0) {
            result.CustomerCharge = Math.ceil(result.Amount / 1000) * 10;
            const hundreds = Math.floor(result.Amount / 100);
            if (hundreds >= 1 && hundreds <= 100) {
                result.CommissionEarned = Number((0.32 + (hundreds - 1) * 0.40).toFixed(2));
            } else if (hundreds > 100) {
                result.CommissionEarned = Number((0.32 + 99 * 0.40).toFixed(2));
            } else {
                result.CommissionEarned = 0;
            }
        }

        return result;
    }

    function parseCSC(rawText, domPairs = {}) {
        const text = (rawText || document.body.innerText || '').replace(/\r/g, '\n');

        const result = {
            ApplicantName: '',
            CustomerName: '',
            Mobile: '',
            CustomerPhone: '',
            Aadhaar: '',
            CustomerAadhaar: '',
            DateOfBirth: '',
            DOB: '',
            FatherName: '',
            AckNumber: '',
            RRN_UTR: '',
            PortalName: 'CSC Digital Seva',
            ServiceType: 'PAN Card (NSDL / UTI)',
            ApplyDate: new Date().toISOString().split('T')[0],
            ExpectedDate: '',
            GovtFee: 0,
            OperatorFee: 0,
            TotalFee: 0,
            PaidAmount: 0,
            Status: 'Pending'
        };

        // Service Type
        // Check UPPCL Electricity Bill Payment first
        const isUPPCL = Boolean(
            (typeof location !== 'undefined' && location.href && location.href.includes('ewallet.uppcl.org')) ||
            /uppcl|madhyanchal|purvanchal|paschimanchal|dakshinanchal|विद्युत\s*वितरण|भुगतान\s*पावती/i.test(text) ||
            (/रसीद\s*संख्या/i.test(text) && /डिस्कॉम|खाता\s*संख्या/i.test(text))
        );

        if (isUPPCL) {
            const uppcl = parseUPPCLElectricity(text, typeof document !== 'undefined' ? document : null);
            if (uppcl.ReceiptNo || uppcl.ConsumerNumber || uppcl.PaidAmount > 0) {
                result.ServiceType = 'Bijli Bill / Electricity Service';
                result.CustomerName = cleanCustomerName(uppcl.CustomerName);
                result.ApplicantName = cleanCustomerName(uppcl.CustomerName);
                result.Mobile = uppcl.CustomerPhone;
                result.CustomerPhone = uppcl.CustomerPhone;
                result.Address = uppcl.Address;
                result.AckNumber = uppcl.ReceiptNo;
                result.RRN_UTR = uppcl.ReceiptNo;
                result.PortalName = 'UPPCL eWallet (CSC)';
                result.GovtFee = uppcl.PaidAmount;
                result.OperatorFee = uppcl.CustomerCharge || 10;
                result.TotalFee = uppcl.PaidAmount + (uppcl.CustomerCharge || 10);
                result.PaidAmount = uppcl.PaidAmount + (uppcl.CustomerCharge || 10);
                result.Amount = result.TotalFee;
                result.Status = uppcl.Status || 'Delivered';
                result.ExpectedDate = new Date().toISOString().split('T')[0];
                result.ApplyDate = new Date().toISOString().split('T')[0];
                result.Aadhaar = '';
                result.CustomerAadhaar = '';
                result.ConsumerNumber = uppcl.ConsumerNumber;
                result.BillNumber = uppcl.BillNumber;
                result.Discom = uppcl.Discom;
                result.Division = uppcl.Division;
                result.SubDivision = uppcl.SubDivision;
                result.TotalBillAmount = uppcl.TotalBillAmount;
                result.RemainingBill = uppcl.RemainingBill;
                result.CustomerCharge = uppcl.CustomerCharge || 10;
                result.CommissionEarned = uppcl.CommissionEarned || 0;
                result.NetProfit = uppcl.NetProfit || 0;
                result.ElectricityData = uppcl;
                result.StatusRemarks = JSON.stringify(uppcl);
                return result;
            }
        }

        if (/pan\s*card|nsdl|utiitsl/i.test(text)) {
            result.ServiceType = 'PAN Card (NSDL / UTI)';
            result.GovtFee = 107;
            result.OperatorFee = 50;
        } else if (/income\s*cert|aay\s*praman/i.test(text)) {
            result.ServiceType = 'Income Certificate (आय प्रमाण पत्र)';
            result.GovtFee = 15;
            result.OperatorFee = 35;
        } else if (/caste\s*cert|jati\s*praman/i.test(text)) {
            result.ServiceType = 'Caste Certificate (जाति प्रमाण पत्र)';
            result.GovtFee = 15;
            result.OperatorFee = 35;
        } else if (/domicile|nivas\s*praman/i.test(text)) {
            result.ServiceType = 'Domicile Certificate (निवास प्रमाण पत्र)';
            result.GovtFee = 15;
            result.OperatorFee = 35;
        } else if (/ration\s*card/i.test(text)) {
            result.ServiceType = 'Ration Card Online Apply';
            result.GovtFee = 50;
            result.OperatorFee = 50;
        } else if (/electricity|bijli\s*bill/i.test(text)) {
            result.ServiceType = 'Bijli Bill / Electricity Service';
        } else if (/pm\s*kisan/i.test(text)) {
            result.ServiceType = 'PM Kisan eKYC / Registration';
        }
        result.TotalFee = (result.GovtFee || 0) + (result.OperatorFee || 0);
        result.PaidAmount = result.TotalFee;
        result.Amount = result.TotalFee;

        // DOM pairs check
        for (const [k, v] of Object.entries(domPairs)) {
            const cleanVal = String(v).replace(/^[\s:\-–—#=]+/, '').trim();
            if (/ack|token|application|reference/.test(k) && !result.AckNumber) {
                result.AckNumber = cleanVal.replace(/[^A-Za-z0-9]/g, '');
                result.RRN_UTR = result.AckNumber;
            }
            if (/applicant|citizen|customername/.test(k) && !result.ApplicantName) {
                result.ApplicantName = cleanVal;
                result.CustomerName = result.ApplicantName;
            }
            if (/mobile|phone|contact/.test(k) && !result.Mobile) {
                result.Mobile = cleanPhone(cleanVal);
                result.CustomerPhone = result.Mobile;
            }
            if (/aadhaar|uid/.test(k) && !result.Aadhaar) {
                result.Aadhaar = cleanAadhaar(cleanVal);
                result.CustomerAadhaar = result.Aadhaar;
            }
            if (/totalfee|amountpaid|fee/.test(k)) {
                const amt = cleanAmount(cleanVal);
                if (amt) {
                    result.TotalFee = amt;
                    result.PaidAmount = amt;
                }
            }
            if (/dob|birth|janm|जन्म|तिथि/.test(k) && !result.DateOfBirth) {
                const d = normalizeDate(cleanVal);
                if (d) {
                    result.DateOfBirth = d;
                    result.DOB = d;
                }
            }
            if (/father|husband|pita|pati|पिता|पति/.test(k) && !result.FatherName) {
                result.FatherName = cleanVal;
            }
        }

        // Regex Fallback
        if (!result.AckNumber) {
            const ackMatch = text.match(/(?:^|\n)\s*(?:Ack(?:nowledg[e]?ment)?|Token|Application|Reference|Ref)\s*(?:No|Num|Number|ID)?\s*[:\-#]\s*([A-Za-z0-9]{6,30})/i);
            if (ackMatch) {
                result.AckNumber = ackMatch[1].trim();
                result.RRN_UTR = result.AckNumber;
            }
        }

        if (!result.ApplicantName) {
            const nameMatch = text.match(/(?:Applicant|Customer|Citizen|Beneficiary|Candidate)\s*Name[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i) ||
                              text.match(/(?:Name\s*of\s*Applicant)[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i);
            if (nameMatch) {
                result.ApplicantName = nameMatch[1].trim();
                result.CustomerName = result.ApplicantName;
            }
        }

        if (!result.Mobile) {
            const mobMatch = text.match(/(?:Mobile|Phone|Contact)(?:\s*(?:No|Num|Number))?[:\s\-#]*(\+?91[\-\s]?)?([6-9]\d{9})/i) ||
                             text.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/);
            if (mobMatch) {
                result.Mobile = cleanPhone(mobMatch[2] || mobMatch[1]);
                result.CustomerPhone = result.Mobile;
            }
        }

        if (!result.Aadhaar) {
            const aadhMatch = text.match(/(?:Aadhaar|UID|UIDAI)[:\s\-\#]*([xX\*\d\s]{12,19})/i) ||
                              text.match(/([xX\*]{4,8}[\s\-]?\d{4})/i);
            if (aadhMatch) {
                result.Aadhaar = cleanAadhaar(aadhMatch[1]);
                result.CustomerAadhaar = result.Aadhaar;
            }
        }

        if (!result.DateOfBirth) {
            const dobMatch = text.match(/(?:Date\s*of\s*Birth|DOB|Birth\s*Date|Janm\s*Tithi|जन्म\s*तिथि)\s*[:\-#]\s*([^\n\r]+)/i);
            if (dobMatch) {
                const d = normalizeDate(dobMatch[1]);
                if (d) {
                    result.DateOfBirth = d;
                    result.DOB = d;
                }
            }
        }

        if (!result.FatherName) {
            const fMatch = text.match(/(?:Father(?:\'s)?|Husband(?:\'s)?)\s*Name[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i);
            if (fMatch) {
                result.FatherName = fMatch[1].trim();
            }
        }

        // Resolve full 12-digit Aadhaar from live session memory / inputs
        const cscFullAadhaar = resolveFullAadhaarFromSession(result.Aadhaar);
        if (cscFullAadhaar && cscFullAadhaar.length === 12) {
            result.Aadhaar = cscFullAadhaar;
            result.CustomerAadhaar = cscFullAadhaar;
        }

        return result;
    }

    // ========================================================================
    // 5. AUTO-DETECT CURRENT PAGE TYPE & GRAB DATA
    // ========================================================================
    function detectPageType() {
        const url = location.href.toLowerCase();
        const text = (document.body.innerText || '').toLowerCase();

        // 1. AEPS Detection (ALWAYS takes precedence)
        // Receipts from Digipay, Digipay Lite, SBI Kiosk, Spice Money, PayNearby, IndusInd, etc.
        const isAEPS = (
            text.includes('aeps') ||
            text.includes('cash withdrawal') ||
            text.includes('cash nikasi') ||
            text.includes('balance enquiry') ||
            text.includes('mini statement') ||
            text.includes('aadhaar pay') ||
            text.includes('api tid') ||
            text.includes('bank ref no') ||
            text.includes('bank reference') ||
            text.includes('rrn') ||
            text.includes('digipay') ||
            url.includes('digipay') ||
            url.includes('technology.csccloud.in') ||
            text.includes('terminal id') ||
            text.includes('sbi kiosk') ||
            text.includes('spice money') ||
            text.includes('paynearby') ||
            text.includes('available balance')
        );

        if (isAEPS) return 'AEPS';

        // 2. Bill & EMI Payments (Electricity, Loan EMIs, Phone Kist, Fastag)
        const isBillPay = (
            url.includes('ewallet.uppcl.org') ||
            url.includes('uppcl.org') ||
            text.includes('madhyanchal vidyut') ||
            text.includes('purvanchal vidyut') ||
            text.includes('paschimanchal vidyut') ||
            text.includes('dakshinanchal vidyut') ||
            (text.includes('रसीद संख्या') && (text.includes('डिस्कॉम') || text.includes('खाता संख्या'))) ||
            text.includes('उपभोक्ता का नाम') ||
            text.includes('bajaj finance') ||
            text.includes('loan emi') ||
            text.includes('mobile kist') ||
            text.includes('phone kist')
        );

        if (isBillPay) return 'BILL_PAYMENT';

        // 3. CSC Citizen Service Portals (PAN, Aay, Niwas, Jati, Ration)
        const isCSC = (
            url.includes('edistrict') ||
            url.includes('utiitsl') ||
            url.includes('nsdl') ||
            url.includes('digitalseva') ||
            url.includes('csc.gov.in') ||
            text.includes('acknowledgement slip') ||
            text.includes('praman patra') ||
            text.includes('applicant name') ||
            text.includes('application form') ||
            text.includes('pan card') ||
            text.includes('income certificate') ||
            text.includes('caste certificate') ||
            text.includes('domicile certificate') ||
            text.includes('ration card')
        );

        return isCSC ? 'CSC' : 'AEPS';
    }

    function buildBillDataFromUppcl(uppcl) {
        return {
            BillCategory: 'Electricity',
            ProviderName: uppcl.Discom ? `UPPCL (${uppcl.Discom})` : 'UPPCL (MVVNL)',
            ConsumerNumber: uppcl.ConsumerNumber,
            BillNumber: uppcl.BillNumber,
            BillDate: uppcl.BillDate,
            DueDate: uppcl.DueDate,
            CustomerName: cleanCustomerName(uppcl.CustomerName),
            CustomerPhone: (uppcl.CustomerPhone || '').replace(/\D/g, '').slice(-10),
            CustomerAadhaar: '',
            TotalBillAmount: uppcl.TotalBillAmount || uppcl.PaidAmount || 0,
            BillAmount: uppcl.PaidAmount || uppcl.TotalBillAmount || 0,
            CustomerCharge: uppcl.CustomerCharge || 10,
            TotalCollected: (uppcl.PaidAmount || uppcl.TotalBillAmount || 0) + (uppcl.CustomerCharge || 10),
            CommissionEarned: uppcl.CommissionEarned || 0,
            NetProfit: uppcl.NetProfit || 10,
            RemainingArrear: uppcl.RemainingBill || 0,
            PaymentMode: 'Cash',
            Status: 'Success',
            TxnReference: uppcl.ReceiptNo,
            ReceiptNo: uppcl.ReceiptNo,
            Discom: uppcl.Discom,
            Division: uppcl.Division,
            Notes: `Discom: ${uppcl.Discom || 'MVVNL'} | Div: ${uppcl.Division || ''}`
        };
    }

    function detectAndGrabData() {
        const pageType = detectPageType();
        const domPairs = extractKeyValuePairsFromDOM();
        const rawText = document.body.innerText || '';

        if (pageType === 'BILL_PAYMENT') {
            const uppcl = parseUPPCLElectricity(rawText, typeof document !== 'undefined' ? document : null);
            const billData = buildBillDataFromUppcl(uppcl);
            return {
                success: !!(uppcl.ReceiptNo || uppcl.ConsumerNumber || uppcl.PaidAmount),
                type: 'BILL_PAYMENT',
                data: billData,
                pageUrl: location.href
            };
        } else if (pageType === 'CSC') {
            const data = parseCSC(rawText, domPairs);
            const isElectricity = Boolean(data.ConsumerNumber || data.ElectricityData || (data.ServiceType && /Electricity|Bijli/i.test(data.ServiceType)));

            if (isElectricity) {
                const uppcl = data.ElectricityData || parseUPPCLElectricity(rawText, typeof document !== 'undefined' ? document : null);
                return {
                    success: !!(uppcl.ReceiptNo || uppcl.ConsumerNumber || uppcl.PaidAmount),
                    type: 'BILL_PAYMENT',
                    data: buildBillDataFromUppcl(uppcl),
                    pageUrl: location.href
                };
            }

            // Merge with in-memory & session customer data (ONLY for non-electricity services like PAN/Certificates)
            if (!isElectricity) {
                const memRec = selectFormRecord(data, true);
                if (memRec) {
                    const f = memRec.fields || {};
                    const name = f.fullName && (f.fullName.value || f.fullName);
                    const mobile = f.mobile && (f.mobile.value || f.mobile);
                    const aadh = f.aadhaar && (f.aadhaar.value || f.aadhaar);
                    const dob = f.dob && (f.dob.value || f.dob);
                    const father = f.fatherName && (f.fatherName.value || f.fatherName);
                    const ack = f.ack && (f.ack.value || f.ack);

                    if (name && (!data.ApplicantName || data.ApplicantName.length < 3)) {
                        data.ApplicantName = name;
                        data.CustomerName = name;
                    }
                    if (mobile && !data.Mobile) {
                        data.Mobile = mobile;
                        data.CustomerPhone = mobile;
                    }
                    if (aadh && !data.Aadhaar) {
                        data.Aadhaar = aadh;
                        data.CustomerAadhaar = aadh;
                    }
                    if (dob && (!data.DateOfBirth || !data.DOB)) {
                        data.DateOfBirth = dob;
                        data.DOB = dob;
                    }
                    if (father && !data.FatherName) {
                        data.FatherName = father;
                    }
                    if (ack && !data.AckNumber) {
                        data.AckNumber = ack;
                        data.RRN_UTR = ack;
                    }
                    consumeFormRecord(memRec);
                }

                // Also check full 12-digit Aadhaar from live session memory
                const cscFullAadhaar = resolveFullAadhaarFromSession(data.Aadhaar);
                if (cscFullAadhaar && cscFullAadhaar.length === 12) {
                    data.Aadhaar = cscFullAadhaar;
                    data.CustomerAadhaar = cscFullAadhaar;
                }
            } else {
                // Electricity receipt has NO Aadhaar - keep it empty
                data.Aadhaar = '';
                data.CustomerAadhaar = '';
            }

            return {
                success: !!(data.AckNumber || data.ApplicantName || data.Mobile || data.TotalFee),
                type: 'CSC',
                data: data,
                pageUrl: location.href
            };
        } else {
            const data = parseAEPS(rawText, domPairs);

            // AEPS: Strict identity match only! Never inject another customer's data!
            const memRec = selectFormRecord(data, false);
            if (memRec) {
                const f = memRec.fields || {};
                const memName = f.fullName && (f.fullName.value || f.fullName);
                const memMob = f.mobile && (f.mobile.value || f.mobile);
                if (memName && !data.CustomerName) data.CustomerName = memName;
                if (memMob && !data.Mobile) data.Mobile = memMob;
                consumeFormRecord(memRec);
            }

            return {
                success: !!(data.RRN_UTR || data.Amount || data.CustomerName || data.Mobile || data.BankName || data.ServiceType),
                type: 'AEPS',
                data: data,
                pageUrl: location.href
            };
        }
    }

    try { window.__CM_DETECT_AND_GRAB__ = detectAndGrabData; } catch (_) {}

    // ========================================================================
    // 6. IN-PAGE OVERLAY UI (Alt+Shift+C / Manual Mode)
    // ========================================================================
    let overlayEl = null;

    function createOrGetOverlay() {
        if (overlayEl) return overlayEl;

        overlayEl = document.createElement('div');
        overlayEl.id = 'cm-grabber-overlay';
        overlayEl.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            width: 480px;
            max-width: calc(100vw - 48px);
            max-height: calc(100vh - 48px);
            background: #ffffff;
            color: #0f172a;
            border-radius: 18px;
            box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08);
            z-index: 2147483645;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 13.5px;
            overflow-y: auto;
            display: none;
            flex-direction: column;
            animation: cmSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        // Inject Stylesheet animation
        if (!document.getElementById('cm-grabber-style')) {
            const style = document.createElement('style');
            style.id = 'cm-grabber-style';
            style.textContent = `
                @keyframes cmSlideIn {
                    from { opacity: 0; transform: translateY(-16px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                #cm-grabber-overlay input, #cm-grabber-overlay select, #cm-grabber-overlay textarea {
                    box-sizing: border-box;
                    width: 100%;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border: 1.5px solid #cbd5e1;
                    border-radius: 8px;
                    font-size: 13px;
                    color: #0f172a;
                    font-weight: 600;
                    outline: none;
                    transition: border-color 0.15s;
                }
                #cm-grabber-overlay input:focus, #cm-grabber-overlay select:focus, #cm-grabber-overlay textarea:focus {
                    border-color: #059669;
                    background: #fff;
                    box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
                }
                #cm-grabber-overlay label {
                    display: block;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    color: #475569;
                    margin-bottom: 4px;
                }
                .cm-pill-btn {
                    padding: 9px 16px;
                    border-radius: 9px;
                    font-size: 13px;
                    font-weight: 700;
                    border: none;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition: transform 0.1s, box-shadow 0.15s, opacity 0.15s;
                }
                .cm-pill-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                }
                .cm-pill-btn:active {
                    transform: translateY(0);
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlayEl);
        return overlayEl;
    }

    function escapeOverlayHtml(val) {
        if (val === null || val === undefined) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderOverlayContent(grabResult) {
        const overlay = createOrGetOverlay();
        const type = grabResult.type || 'AEPS';
        const d = grabResult.data || {};
        const e = escapeOverlayHtml;

        overlay.innerHTML = `
            <div style="background: linear-gradient(135deg, #065f46, #047857); color: #fff; padding: 14px 18px; border-radius: 18px 18px 0 0; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 9px;">
                    <span style="font-size: 20px;">⚡</span>
                    <div>
                        <div style="font-size: 14.5px; font-weight: 800; letter-spacing: -0.01em;">Cash Management BC Grabber</div>
                        <div style="font-size: 11.5px; opacity: 0.85; font-weight: 500;">Mode: ${type === 'BILL_PAYMENT' ? '⚡ Bill & EMI Pay Counter' : (type === 'CSC' ? 'CSC Seva Tracker' : 'AEPS Grahak Seva Counter')}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: rgba(255,255,255,0.22); color: #fff; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 20px;">
                        ${type === 'BILL_PAYMENT' ? '⚡ BILL PAY' : e(type)}
                    </span>
                    <button id="cm-overlay-close-btn" style="background: transparent; border: none; color: #fff; font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 6px; line-height: 1;">✕</button>
                </div>
            </div>

            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="background: ${grabResult.success ? '#ecfdf5' : '#fef3c7'}; border: 1px solid ${grabResult.success ? '#a7f3d0' : '#fde68a'}; color: ${grabResult.success ? '#065f46' : '#92400e'}; padding: 9px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 15px;">${grabResult.success ? '✅' : '⚠️'}</span>
                    <span>${grabResult.success ? 'Page se receipt data safalta-purvak capture ho gaya!' : 'Page me receipt clear nahi mila. Aap text paste karke Re-Parse kar sakte hain.'}</span>
                </div>

                <!-- Form Fields -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label>${type === 'BILL_PAYMENT' ? 'Bill Category' : 'Service Type'}</label>
                        <select id="cm_f_service">
                            ${type === 'BILL_PAYMENT' ? `
                                <option value="Electricity" ${(d.BillCategory || 'Electricity') === 'Electricity' ? 'selected' : ''}>⚡ Electricity (Bijli Bill)</option>
                                <option value="Mobile Recharge" ${d.BillCategory === 'Mobile Recharge' ? 'selected' : ''}>Mobile Recharge</option>
                                <option value="DTH Recharge" ${d.BillCategory === 'DTH Recharge' ? 'selected' : ''}>DTH Recharge</option>
                                <option value="Gas" ${d.BillCategory === 'Gas' ? 'selected' : ''}>Gas Bill / Cylinder</option>
                                <option value="Water" ${d.BillCategory === 'Water' ? 'selected' : ''}>Water Bill</option>
                                <option value="EMI / Loan" ${d.BillCategory === 'EMI / Loan' ? 'selected' : ''}>EMI / Loan</option>
                                <option value="Fastag" ${d.BillCategory === 'Fastag' ? 'selected' : ''}>Fastag</option>
                                <option value="Broadband" ${d.BillCategory === 'Broadband' ? 'selected' : ''}>Broadband / Fiber</option>
                                <option value="Insurance" ${d.BillCategory === 'Insurance' ? 'selected' : ''}>Insurance</option>
                                <option value="Other" ${d.BillCategory === 'Other' ? 'selected' : ''}>Other</option>
                            ` : (type === 'CSC' ? `
                                <option value="PAN Card (NSDL / UTI)" ${d.ServiceType?.includes('PAN') ? 'selected' : ''}>PAN Card</option>
                                <option value="Income Certificate (आय प्रमाण पत्र)" ${d.ServiceType?.includes('Income') ? 'selected' : ''}>आय प्रमाण पत्र</option>
                                <option value="Caste Certificate (जाति प्रमाण पत्र)" ${d.ServiceType?.includes('Caste') ? 'selected' : ''}>जाति प्रमाण पत्र</option>
                                <option value="Domicile Certificate (निवास प्रमाण पत्र)" ${d.ServiceType?.includes('Domicile') ? 'selected' : ''}>निवास प्रमाण पत्र</option>
                                <option value="Ration Card Online Apply" ${d.ServiceType?.includes('Ration') ? 'selected' : ''}>राशन कार्ड</option>
                                <option value="Bijli Bill / Electricity Service" ${d.ServiceType?.includes('Electricity') || d.ServiceType?.includes('Bijli') ? 'selected' : ''}>⚡ बिजली बिल (Electricity)</option>
                            ` : `
                                <option value="Cash Withdrawal" ${d.ServiceType === 'Cash Withdrawal' ? 'selected' : ''}>Cash Withdrawal</option>
                                <option value="Cash Deposit" ${d.ServiceType === 'Cash Deposit' ? 'selected' : ''}>Cash Deposit</option>
                                <option value="Balance Enquiry" ${d.ServiceType === 'Balance Enquiry' ? 'selected' : ''}>Balance Enquiry</option>
                                <option value="Mini Statement" ${d.ServiceType === 'Mini Statement' ? 'selected' : ''}>Mini Statement</option>
                                <option value="Money Transfer" ${d.ServiceType === 'Money Transfer' ? 'selected' : ''}>Money Transfer</option>
                            `)}
                        </select>
                    </div>
                    <div>
                        <label>${type === 'BILL_PAYMENT' ? 'Bill Amount (₹)' : (type === 'CSC' ? 'Total Fee (₹)' : 'Amount (₹)')}</label>
                        <input type="number" id="cm_f_amount" value="${e(d.Amount || d.BillAmount || d.PaidAmount || d.TotalFee || d.TotalBillAmount || '')}" placeholder="₹ 0.00" />
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label>Customer / Applicant Name</label>
                        <input type="text" id="cm_f_name" value="${e(d.CustomerName || d.ApplicantName || '')}" placeholder="Grahak ka naam" />
                    </div>
                    <div>
                        <label>Mobile Number (10 Digits)</label>
                        <input type="text" id="cm_f_mobile" value="${e(d.Mobile || d.CustomerPhone || '')}" placeholder="9876543210" maxlength="10" />
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label>Aadhaar Number</label>
                        <input type="text" id="cm_f_aadhaar" value="${e(d.Aadhaar || d.CustomerAadhaar || '')}" placeholder="XXXX XXXX 1234" />
                    </div>
                    <div>
                        <label>${type === 'BILL_PAYMENT' ? 'Txn Ref / Receipt No' : (type === 'CSC' ? 'Ack / Token Number' : 'RRN / UTR Number')}</label>
                        <input type="text" id="cm_f_rrn" value="${e(d.RRN_UTR || d.AckNumber || d.TxnReference || d.ReceiptNo || '')}" placeholder="${type === 'BILL_PAYMENT' ? 'Receipt / Ref No' : '12 Digit RRN'}" />
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label>${type === 'BILL_PAYMENT' ? 'Provider / Vibhag' : (type === 'CSC' ? 'Portal Name' : 'Bank Name')}</label>
                        <input type="text" id="cm_f_bank" value="${e(d.BankName || d.PortalName || d.ProviderName || '')}" placeholder="${type === 'BILL_PAYMENT' ? 'UPPCL (MVVNL)' : 'Bank ka naam'}" />
                    </div>
                    <div>
                        <label>${type === 'BILL_PAYMENT' ? 'Consumer / Khata No' : (type === 'CSC' ? 'Apply Date' : 'Account Balance (₹)')}</label>
                        <input type="${type === 'CSC' ? 'date' : (type === 'BILL_PAYMENT' ? 'text' : 'number')}" id="cm_f_extra" value="${type === 'BILL_PAYMENT' ? e(d.ConsumerNumber || '') : (type === 'CSC' ? e(d.ApplyDate || '') : e(d.AccountBalance || ''))}" placeholder="${type === 'BILL_PAYMENT' ? 'Consumer / Account No' : (type === 'CSC' ? '' : '₹ Balance')}" />
                    </div>
                </div>

                ${(d.ConsumerNumber || d.BillNumber || d.ServiceType?.includes('Electricity') || d.ServiceType?.includes('Bijli')) ? `
                    <div style="background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: 10px; padding: 10px 12px; font-size: 12px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 700; color: #047857;">
                            <span>⚡ UPPCL Bijli Bill Details (${e(d.Discom || 'MVVNL')})</span>
                            <span style="background: #10b981; color: #fff; font-size: 10px; padding: 2px 7px; border-radius: 12px;">Verified</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11.5px; color: #334155;">
                            <div><b>Khata No:</b> ${e(d.ConsumerNumber || '-')}</div>
                            <div><b>Bill No:</b> ${e(d.BillNumber || '-')}</div>
                            <div><b>Kul Bill:</b> ₹${e(d.TotalBillAmount || d.TotalFee || 0)}</div>
                            <div><b>Jama Kiya:</b> ₹${e(d.PaidAmount || d.BillAmount || d.Amount || 0)}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px dashed #f59e0b; border-radius: 6px; padding: 6px 8px; margin-top: 4px;">
                            <span style="color: #b45309; font-weight: 700;">बकाया शेष (Remaining Bill):</span>
                            <span style="color: #b45309; font-weight: 800; font-size: 13px;">₹${e(d.RemainingArrear !== undefined ? d.RemainingArrear : (d.RemainingBill !== undefined ? d.RemainingBill : Math.max(0, (d.TotalBillAmount || 0) - (d.PaidAmount || d.BillAmount || 0))))}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 6px 8px;">
                            <span style="color: #065f46; font-size: 11px;">Shulk: <b>₹${e(d.CustomerCharge || 10)}</b> | Comm: <b>₹${e(d.CommissionEarned || 0)}</b></span>
                            <span style="color: #047857; font-weight: 800; font-size: 12px;">Munafa: ₹${e(d.NetProfit || 0)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #059669; color: #fff; border-radius: 6px; padding: 6px 8px; font-weight: 700;">
                            <span>Grahak Se Prapt Cash:</span>
                            <span style="font-size: 14px;">₹${(parseFloat(d.TotalCollected) || (parseFloat(d.PaidAmount || d.BillAmount || d.Amount || 0) + (parseFloat(d.CustomerCharge) || 10))).toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                ` : ''}

                <!-- Raw Text Area for manual paste & re-parsing -->
                <div>
                    <label style="display: flex; justify-content: space-between;">
                        <span>Manual Paste Receipt Slip</span>
                        <a id="cm-reparse-link" href="#" style="color: #059669; font-size: 11px; text-decoration: none;">⚡ Re-Parse Text</a>
                    </label>
                    <textarea id="cm_raw_paste" rows="2" placeholder="Agar koi field miss ho gayi ho to yahan receipt copy-paste karein..." style="resize: vertical; font-size: 12px;"></textarea>
                </div>

                <!-- Actions -->
                <div style="display: flex; gap: 8px; margin-top: 6px;">
                    <button id="cm-btn-send-project" class="cm-pill-btn" style="flex: 2; background: linear-gradient(135deg, #059669, #047857); color: #fff; box-shadow: 0 4px 14px rgba(5,150,105,0.35);">
                        <span>🚀 Open in Project (Alt+C)</span>
                    </button>
                    <button id="cm-btn-direct-save" class="cm-pill-btn" style="flex: 1.3; background: #0284c7; color: #fff;">
                        <span>💾 Direct Save</span>
                    </button>
                    <button id="cm-btn-cancel" class="cm-pill-btn" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">
                        <span>Band</span>
                    </button>
                </div>
            </div>
        `;

        // Wire Event Listeners
        const closeBtn = overlay.querySelector('#cm-overlay-close-btn');
        const cancelBtn = overlay.querySelector('#cm-btn-cancel');
        if (closeBtn) closeBtn.onclick = hideOverlay;
        if (cancelBtn) cancelBtn.onclick = hideOverlay;

        // Re-Parse Link
        const reparseLink = overlay.querySelector('#cm-reparse-link');
        const pasteBox = overlay.querySelector('#cm_raw_paste');
        if (reparseLink && pasteBox) {
            reparseLink.onclick = (e) => {
                e.preventDefault();
                const raw = pasteBox.value;
                if (!raw) return;
                const newD = (type === 'BILL_PAYMENT')
                    ? buildBillDataFromUppcl(parseUPPCLElectricity(raw, null))
                    : ((type === 'CSC') ? parseCSC(raw, {}) : parseAEPS(raw, {}));
                renderOverlayContent({ success: true, type, data: newD });
            };
        }

        // Send to Project Tab
        const sendBtn = overlay.querySelector('#cm-btn-send-project');
        if (sendBtn) {
            sendBtn.onclick = () => {
                const currentData = collectDataFromOverlay(type, d);
                chrome.runtime.sendMessage({
                    action: 'OPEN_IN_PROJECT',
                    payload: {
                        type: type,
                        data: currentData,
                        pageUrl: location.href
                    }
                }, () => {
                    hideOverlay();
                });
            };
        }

        // Direct Save via PROXY_API
        const saveBtn = overlay.querySelector('#cm-btn-direct-save');
        if (saveBtn) {
            saveBtn.onclick = async () => {
                const currentData = collectDataFromOverlay(type, d);
                saveBtn.disabled = true;
                saveBtn.innerText = 'Saving...';

                try {
                    let endpoint = '/api/bc/transactions';
                    let body = {};

                    if (type === 'AEPS') {
                        endpoint = '/api/bc/transactions';
                        body = {
                            ServiceType: currentData.ServiceType,
                            CustomerName: currentData.CustomerName || 'Walk-in Customer',
                            CustomerPhone: currentData.Mobile,
                            CustomerAadhaarLast4: currentData.CustomerAadhaarLast4 || (currentData.Aadhaar ? currentData.Aadhaar.slice(-4) : ''),
                            AadhaarNumber: currentData.Aadhaar,
                            BankName: currentData.BankName || 'Indian Bank',
                            AccountNumber: currentData.AccountNumber,
                            AccountBalance: currentData.AccountBalance,
                            RRN_UTR: currentData.RRN_UTR,
                            Amount: currentData.Amount || 0,
                            CustomerCharge: currentData.CustomerCharge || 0,
                            CommissionEarned: currentData.CommissionEarned || 0,
                            Status: currentData.Status || 'Success',
                            Notes: `Portal: ${currentData.PortalName || 'Digipay'}${currentData.TransactionID ? ' | TxnID: ' + currentData.TransactionID : ''}${currentData.TerminalID ? ' | TID: ' + currentData.TerminalID : ''}${currentData.AuthorizeCode ? ' | Auth: ' + currentData.AuthorizeCode : ''}`.trim()
                        };
                    } else if (type === 'BILL_PAYMENT') {
                        endpoint = '/api/bill-payments';
                        body = {
                            BillCategory: currentData.BillCategory || 'Electricity',
                            ProviderName: currentData.ProviderName || 'UPPCL (MVVNL)',
                            ConsumerNumber: currentData.ConsumerNumber || currentData.AckNumber,
                            BillNumber: currentData.BillNumber || '',
                            CustomerName: cleanCustomerName(currentData.CustomerName || currentData.ApplicantName || 'Walk-in Customer'),
                            CustomerPhone: (currentData.CustomerPhone || currentData.Mobile || '').replace(/\D/g, '').slice(-10),
                            BillAmount: parseFloat(currentData.BillAmount || currentData.PaidAmount || currentData.TotalBillAmount || currentData.Amount || 0),
                            CustomerCharge: parseFloat(currentData.CustomerCharge || 10),
                            TotalCollected: parseFloat(currentData.TotalCollected || ((parseFloat(currentData.BillAmount || currentData.PaidAmount || currentData.Amount || 0)) + parseFloat(currentData.CustomerCharge || 10))),
                            CommissionEarned: parseFloat(currentData.CommissionEarned || 0),
                            RemainingArrear: parseFloat(currentData.RemainingArrear || currentData.RemainingBill || 0),
                            PaymentMode: 'Cash',
                            Status: 'Success',
                            TxnReference: currentData.TxnReference || currentData.ReceiptNo || currentData.AckNumber || currentData.RRN_UTR || '',
                            Notes: currentData.Notes || `Discom: ${currentData.Discom || 'MVVNL'}`
                        };
                    } else {
                        endpoint = '/api/csc/applications';
                        body = {
                            ApplicantName: cleanCustomerName(currentData.ApplicantName || currentData.CustomerName),
                            CustomerName: cleanCustomerName(currentData.CustomerName || currentData.ApplicantName),
                            CustomerPhone: currentData.Mobile,
                            CustomerAadhaar: currentData.Aadhaar,
                            AckNumber: currentData.AckNumber || currentData.RRN_UTR,
                            PortalName: currentData.PortalName || 'CSC Digital Seva',
                            ServiceType: currentData.ServiceType,
                            GovtFee: currentData.GovtFee || 0,
                            OperatorFee: currentData.OperatorFee || 0,
                            TotalFee: currentData.TotalFee || currentData.Amount || 0,
                            PaidAmount: currentData.PaidAmount || currentData.Amount || 0,
                            Status: currentData.Status || 'Pending',
                            ConsumerNumber: currentData.ConsumerNumber,
                            BillNumber: currentData.BillNumber,
                            Discom: currentData.Discom,
                            Division: currentData.Division,
                            SubDivision: currentData.SubDivision,
                            TotalBillAmount: currentData.TotalBillAmount,
                            RemainingBill: currentData.RemainingBill,
                            CustomerCharge: currentData.CustomerCharge,
                            CommissionEarned: currentData.CommissionEarned,
                            NetProfit: currentData.NetProfit,
                            StatusRemarks: currentData.StatusRemarks || (currentData.ElectricityData ? JSON.stringify(currentData.ElectricityData) : null)
                        };
                    }

                    chrome.runtime.sendMessage({
                        action: 'PROXY_API',
                        path: endpoint,
                        method: 'POST',
                        body: body
                    }, (res) => {
                        saveBtn.disabled = false;
                        if (res && res.success) {
                            let sealedAfterSubmit = true;
                            saveBtn.dataset.sealed = String(sealedAfterSubmit);
                            showOverlayToast('✅ Database me entry safalta-purvak save ho gayi!');
                            setTimeout(hideOverlay, 1400);
                        } else {
                            showOverlayToast('❌ Error: ' + ((res && res.error) || 'Save failed'));
                            saveBtn.innerText = '💾 Direct Save';
                        }
                    });
                } catch (e) {
                    saveBtn.disabled = false;
                    saveBtn.innerText = '💾 Direct Save';
                    showOverlayToast('❌ Error: ' + e.message);
                }
            };
        }
    }

    function collectDataFromOverlay(type, originalData) {
        const service = document.getElementById('cm_f_service')?.value || originalData.ServiceType;
        const amount = cleanAmount(document.getElementById('cm_f_amount')?.value) || originalData.Amount || originalData.TotalFee;
        const name = document.getElementById('cm_f_name')?.value || originalData.CustomerName || originalData.ApplicantName;
        const mobile = cleanPhone(document.getElementById('cm_f_mobile')?.value) || originalData.Mobile;
        const aadhaar = cleanAadhaar(document.getElementById('cm_f_aadhaar')?.value) || originalData.Aadhaar;
        const rrn = String(document.getElementById('cm_f_rrn')?.value || originalData.RRN_UTR || originalData.AckNumber || '').replace(/^[\s:\-–—#=]+/, '').trim();
        const bank = String(document.getElementById('cm_f_bank')?.value || originalData.BankName || originalData.PortalName || '').replace(/^[\s:\-–—#=]+/, '').trim();
        const extraVal = document.getElementById('cm_f_extra')?.value;

        // Multi-Customer Form Memory: overlay me user ne fill kiya data memory me store karo (next customer ke liye)
        try {
            pushFormMemory('fullName', String(name || ''));
            pushFormMemory('mobile', String(mobile || ''));
            pushFormMemory('ack', String(rrn || ''));
        } catch (e) { }

        if (type === 'BILL_PAYMENT') {
            const billAmt = cleanAmount(amount) || originalData.BillAmount || 0;
            const chargeAmt = parseFloat(originalData.CustomerCharge || 10) || 0;
            return {
                ...originalData,
                BillCategory: service || originalData.BillCategory || 'Electricity',
                ProviderName: bank || originalData.ProviderName || 'UPPCL (MVVNL)',
                ConsumerNumber: String(extraVal || originalData.ConsumerNumber || rrn || '').trim(),
                BillNumber: originalData.BillNumber || '',
                CustomerName: cleanCustomerName(name),
                CustomerPhone: cleanPhone(mobile) || cleanPhone(originalData.CustomerPhone),
                BillAmount: billAmt,
                CustomerCharge: chargeAmt,
                TotalCollected: billAmt + chargeAmt,
                CommissionEarned: originalData.CommissionEarned || 0,
                NetProfit: originalData.NetProfit || chargeAmt,
                RemainingArrear: originalData.RemainingArrear || 0,
                PaymentMode: 'Cash',
                Status: 'Success',
                TxnReference: rrn || originalData.TxnReference || originalData.ReceiptNo || '',
                Notes: originalData.Notes || `Discom: ${originalData.Discom || 'MVVNL'}`
            };
        } else if (type === 'CSC') {
            return {
                ...originalData,
                ServiceType: service,
                TotalFee: amount,
                PaidAmount: amount,
                ApplicantName: name,
                CustomerName: name,
                Mobile: mobile,
                CustomerPhone: mobile,
                Aadhaar: aadhaar,
                CustomerAadhaar: aadhaar,
                AckNumber: rrn,
                RRN_UTR: rrn,
                PortalName: bank,
                ApplyDate: extraVal || originalData.ApplyDate
            };
        } else {
            return {
                ...originalData,
                ServiceType: service,
                Amount: amount,
                CustomerName: name,
                Mobile: mobile,
                Aadhaar: aadhaar,
                CustomerAadhaarLast4: extractAadhaarLast4(aadhaar) || originalData.CustomerAadhaarLast4,
                RRN_UTR: rrn,
                BankName: bank,
                AccountBalance: cleanAmount(extraVal) || originalData.AccountBalance
            };
        }
    }

    function showOverlayToast(msg) {
        const overlay = createOrGetOverlay();
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: absolute;
            bottom: 16px;
            left: 16px;
            right: 16px;
            background: #0f172a;
            color: #fff;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            z-index: 99;
            animation: cmSlideIn 0.2s ease;
        `;
        toast.textContent = msg;
        overlay.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    function showOverlay() {
        const grabResult = detectAndGrabData();
        renderOverlayContent(grabResult);
        const el = createOrGetOverlay();
        el.style.display = 'flex';
    }

    function hideOverlay() {
        if (overlayEl) {
            overlayEl.style.display = 'none';
        }
    }

    function toggleOverlay() {
        if (overlayEl && overlayEl.style.display === 'flex') {
            hideOverlay();
        } else {
            showOverlay();
        }
    }

    // Keyboard ESC listener to close overlay
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlayEl && overlayEl.style.display === 'flex') {
            hideOverlay();
        }
    });

    // ========================================================================
    // 7. FLOATING QUICK-TRIGGER BADGE PERMANENTLY DISABLED (Extension Only Mode)
    // ========================================================================
    // Per user requirement, the floating badge is completely disabled on all pages.
    // The grabber works strictly via the Chrome extension trigger (Alt+C shortcut or toolbar icon).
    try {
        const existingBadge = document.getElementById('cm-grabber-float-badge');
        if (existingBadge) existingBadge.remove();
    } catch (_) {}

    // ========================================================================
    // 8. EXTENSION MESSAGE HANDLER
    // ========================================================================
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request) return;

        if (request.action === 'GRAB_FOR_PROJECT') {
            const result = detectAndGrabData();
            sendResponse(result);
            return true;
        }

        if (request.action === 'TOGGLE_GRABBER') {
            toggleOverlay();
            sendResponse({ success: true, open: overlayEl && overlayEl.style.display === 'flex' });
            return true;
        }

        if (request.action === 'PING') {
            sendResponse({ success: true, loaded: true, url: location.href });
            return true;
        }

        return false;
    });

})();
