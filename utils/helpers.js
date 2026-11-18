// Shared helpers (validation, date, pagination)

const VALID_TRANS_TYPES = ['Income', 'Expense', 'Transfer', 'Loan Given', 'Loan Received', 'Loan Repay', 'Loan Recovery'];

function parseId(value) {
    const id = parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function parseOptionalId(value) {
    if (value === undefined || value === null || value === '') return null;
    const id = parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Local timezone date (YYYY-MM-DD) in Asia/Kolkata (IST)
function todayLocal() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

// Date ko local midnight se parse karo (strict calendar check - no rollover)
function parseDateOnly(value) {
    if (!value) return null;
    const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
    const d = new Date(y, mo - 1, day);
    // Rollover check (e.g. 2026-02-31 rolls to March 3)
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
        return null;
    }
    return d;
}

function isValidDateOnly(value) {
    return parseDateOnly(value) !== null;
}

// LIKE me %, _, aur [ wildcard escape karo (user search se pattern injection na ho)
function escapeLike(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[\\%_\[]/g, (ch) => '\\' + ch);
}

function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (!Number.isInteger(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

// Month/year se date range (sargable - index use hota hai)
function monthRange(month, year) {
    const m = clampInt(month, 1, 12, new Date().getMonth() + 1);
    const y = clampInt(year, 1970, 2999, new Date().getFullYear());
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end, m, y };
}

// Saal ka date range (sargable) - YEAR(TransDate) = @year se index nahi chalta
function yearRange(year) {
    const y = clampInt(year, 1970, 2999, new Date().getFullYear());
    return { start: `${y}-01-01`, end: `${y}-12-31`, y };
}

function parseMoney(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

// Clean trimmed string or null
function cleanString(value) {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
}

// Normalize phone to 10 digits
function normalizePhone(value) {
    if (!value) return null;
    const digits = String(value).replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
    return digits || null;
}

// Universal API JSON Response Helpers
function sendSuccess(res, data = null, extra = {}) {
    return res.json({ success: true, ...(data !== null ? { data } : {}), ...extra });
}

function sendError(res, message = 'Something went wrong', status = 400, extra = {}) {
    return res.status(status).json({ success: false, error: message, ...extra });
}

module.exports = {
    VALID_TRANS_TYPES,
    parseId,
    parseOptionalId,
    todayLocal,
    parseDateOnly,
    isValidDateOnly,
    escapeLike,
    clampInt,
    monthRange,
    yearRange,
    parseMoney,
    cleanString,
    normalizePhone,
    sendSuccess,
    sendError
};
