const { query } = require('../database/db');

// In-memory cache for fast session verification: Map<UserID, { token: string, checkedAt: number }>
const sessionMap = new Map();
const CACHE_TTL_MS = 15000; // 15 seconds TTL

function setSession(userId, token) {
    if (!userId) return;
    const uid = Number(userId);
    sessionMap.set(uid, {
        token: token,
        checkedAt: Date.now()
    });
}

async function getActiveSession(userId) {
    if (!userId) return null;
    const uid = Number(userId);
    const cached = sessionMap.get(uid);
    const now = Date.now();

    if (cached && (now - cached.checkedAt < CACHE_TTL_MS)) {
        return cached.token;
    }

    try {
        const res = await query('SELECT ActiveSessionToken FROM Users WHERE UserID = @id', { id: uid });
        if (res.recordset.length > 0) {
            const activeToken = res.recordset[0].ActiveSessionToken || null;
            sessionMap.set(uid, {
                token: activeToken,
                checkedAt: now
            });
            return activeToken;
        }
    } catch (err) {
        console.error('Session cache DB fallback error:', err.message);
        if (cached) return cached.token;
    }

    return null;
}

function clearSession(userId) {
    if (!userId) return;
    sessionMap.delete(Number(userId));
}

module.exports = {
    setSession,
    getActiveSession,
    clearSession
};

