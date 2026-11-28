/**
 * Staff / Agent Permission Guard (Model A: Shared Shop Data, Locked Admin Actions)
 * - Allows Staff to view shop data and create/update daily customer, CSC, BC,
 *   billing, khatabook, bill-payment, UCL, PAC, document, and cashbook entries.
 * - Blocks Staff from deleting records, changing master accounts/services/settings,
 *   bulk Excel imports/exports, recycle bin, audit history, database explorer,
 *   or admin/system operations.
 */

const ALWAYS_DENIED_PREFIXES = [
    '/admin',
    '/database',
    '/recyclebin',
    '/history'
];

const WRITE_DENIED_PREFIXES = [
    '/accounts',
    '/categories',
    '/budgets',
    '/csc/services',
    '/settings',
    '/service/modules',
    '/service/services'
];

const EXACT_OR_PREFIX_DENIED = [
    '/system/apply-update',
    '/system/version-reports',
    '/license/activate',
    '/license/admin',
    '/csc/import',
    '/csc/export',
    '/customers/import',
    '/customers/export',
    '/reports/export',
    '/settings/customers/export',
    '/settings/csc/export'
];

function normalizeApiPath(rawPath) {
    let clean = String(rawPath || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (clean === '/api') clean = '/';
    else if (clean.startsWith('/api/')) clean = clean.slice(4);
    return clean || '/';
}

function matchesPrefix(p, prefix) {
    return p === prefix || p.startsWith(prefix + '/');
}

function isStaffBlockedRequest(method, rawPath) {
    const m = String(method || 'GET').toUpperCase();
    const p = normalizeApiPath(rawPath);

    if (m === 'DELETE') {
        return {
            blocked: true,
            reason: 'Suraksha Lock: Staff account se koi record DELETE nahi kiya ja sakta. Kripya Admin (Owner) se kahein.'
        };
    }

    if (ALWAYS_DENIED_PREFIXES.some(pref => matchesPrefix(p, pref))) {
        return {
            blocked: true,
            reason: 'Suraksha Lock: Yeh Admin section hai — Staff account par band hai.'
        };
    }

    // Staff can submit browser crash reports (POST /logs/client-error), but cannot view/modify log endpoints.
    if (matchesPrefix(p, '/logs') && !(m === 'POST' && p === '/logs/client-error')) {
        return {
            blocked: true,
            reason: 'Suraksha Lock: System Error Logs sirf Admin ke liye hain.'
        };
    }

    if (EXACT_OR_PREFIX_DENIED.some(pref => matchesPrefix(p, pref))) {
        return {
            blocked: true,
            reason: 'Suraksha Lock: Bulk import/export aur system controls sirf Admin ke liye hain.'
        };
    }

    if (['POST', 'PUT', 'PATCH'].includes(m) && WRITE_DENIED_PREFIXES.some(pref => matchesPrefix(p, pref))) {
        return {
            blocked: true,
            reason: 'Suraksha Lock: Accounts, Service Rates, Categories aur Settings me badlaav sirf Admin kar sakta hai.'
        };
    }

    return { blocked: false };
}

function enforceStaffPermissions(req, res, next) {
    if (!req.user || req.user.Role !== 'Staff') {
        return next();
    }

    const check = isStaffBlockedRequest(req.method, req.path || req.originalUrl);
    if (check.blocked) {
        return res.status(403).json({
            success: false,
            code: 'STAFF_PERMISSION_DENIED',
            error: check.reason
        });
    }

    return next();
}

module.exports = {
    enforceStaffPermissions,
    isStaffBlockedRequest
};
