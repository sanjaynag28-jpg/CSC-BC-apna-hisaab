const jwt = require('jsonwebtoken');
const { query } = require('../database/db');
const { getActiveSession } = require('../utils/sessionStore');
const { resolveShopScope } = require('../utils/requestContext');

const JWT_SECRET = process.env.JWT_SECRET;
if (!process.env.JWT_SECRET) {
    console.warn('⚠️ [Auth] JWT_SECRET env var set nahi hai — token signing fail hoga. JWT_SECRET set karein.');
}

// Local (loopback) auto-login ko env se band kiya ja sakta hai:
//   ALLOW_LOCAL_AUTO_LOGIN=false
// Default true — taaki Sanjay ji ka existing local workflow na toote.
const ALLOW_LOCAL_AUTO_LOGIN = String(process.env.ALLOW_LOCAL_AUTO_LOGIN || '').toLowerCase() !== 'false';
let loopbackAutoLoginWarned = false;

// Cache API Tokens for extension lookups (60s TTL) & JWT active status (15s TTL)
const tokenCache = new Map();
const jwtStatusCache = new Map();

function isLoopback(req) {
    // If request came through Cloudflare Tunnel, reverse proxy, or remote IP, it is NEVER loopback!
    if (req.headers['cf-ray'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) {
        return false;
    }

    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    // Only direct localhost:3000 or 127.0.0.1:3000 on Sanjay's PC
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
        return false;
    }

    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// Public endpoints that never require auth
const PUBLIC_PATHS = [
    '/auth/login',
    '/api/auth/login',
    '/health',
    '/api/health',
    '/app-version',
    '/api/app-version',
    '/logs/client-error',
    '/api/logs/client-error',
    '/extension/version',
    '/api/extension/version',
    '/extension/download',
    '/api/extension/download',
    '/network-info',
    '/api/network-info'
];

function normalizePath(p) {
    if (!p) return '';
    return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

async function isActorActive(actorId) {
    if (!actorId) return false;
    const now = Date.now();
    const cached = jwtStatusCache.get(actorId);
    if (cached && cached.expiresAt > now) {
        return cached.isActive;
    }
    const res = await query('SELECT IsActive FROM Users WHERE UserID = @id', { id: actorId });
    if (!res.recordset || res.recordset.length === 0) {
        jwtStatusCache.set(actorId, { isActive: false, expiresAt: now + 15000 });
        return false;
    }
    const isActive = Number(res.recordset[0].IsActive) === 1;
    jwtStatusCache.set(actorId, { isActive, expiresAt: now + 15000 });
    return isActive;
}

async function authenticateUser(req, res, next) {
    // Extract token if present (Authorization header, Cookie, or Query)
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
    } else if (req.query && req.query.token) {
        token = req.query.token;
    } else if (req.headers.cookie) {
        const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
        if (match) token = decodeURIComponent(match[1]);
    }

    // 1. Check if public path (exact normalized path match; never prefix-match /api/logs/client-error -> /api/logs/client-errors)
    const relPath = normalizePath((req.path || '').split('?')[0]);
    const fullPath = normalizePath((req.originalUrl || req.url || '').split('?')[0]);
    const isPublic = PUBLIC_PATHS.some(p => relPath === p || fullPath === p);

    if (isPublic) {
        // If token was passed to public endpoint (e.g. client error logger), decode it silently
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                req.user = decoded;
            } catch (e) { }
        }
        return next();
    }

    // 2. Check Extension API Token (Header: X-Api-Token)
    const apiToken = req.headers['x-api-token'];
    if (apiToken && typeof apiToken === 'string') {
        const cached = tokenCache.get(apiToken);
        if (cached && cached.expiresAt > Date.now()) {
            req.user = cached.user;
            return next();
        }

        try {
            const userRes = await query(
                'SELECT UserID, Username, ShopName, OwnerName, MobileNumber, Role, ParentUserID, IsActive FROM Users WHERE ApiToken = @token AND IsActive = 1',
                { token: apiToken }
            );
            if (userRes.recordset.length > 0) {
                const u = userRes.recordset[0];
                const userObj = resolveShopScope(u);
                tokenCache.set(apiToken, { user: userObj, expiresAt: Date.now() + 60000 });
                req.user = userObj;
                return next();
            }
        } catch (e) {
            console.error('API token check error:', e.message);
        }
    }

    // 3. Check JWT token
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const actorId = Number(decoded.ActualUserID || decoded.UserID);

            // Verify user account is still active (disabled accounts must lose JWT access immediately)
            try {
                const active = await isActorActive(actorId);
                if (!active) {
                    res.clearCookie('token', { path: '/' });
                    return res.status(401).json({
                        success: false,
                        requireLogin: true,
                        accountDisabled: true,
                        error: 'Aapka account disable kar diya gaya hai. Kripya Admin se sampark karein.'
                    });
                }
            } catch (dbErr) {
                console.error('JWT active status check failed:', dbErr.message);
            }

            // Exclusive Session Check for remote non-SuperAdmin users:
            // If another browser or device has logged into this user's account, invalidate the previous session.
            // Loopback requests (Sanjay on localhost or local server hub) are exempt to prevent kicking out remote tenants!
            if (!isLoopback(req) && decoded.Role !== 'SuperAdmin' && actorId !== 1) {
                const activeSession = await getActiveSession(actorId);
                if (activeSession && decoded.sessionToken && decoded.sessionToken !== activeSession) {
                    res.clearCookie('token', { path: '/' });
                    return res.status(401).json({
                        success: false,
                        requireLogin: true,
                        sessionTerminated: true,
                        error: 'Aapka session kisi doosre browser ya device me login hone ke karan band ho gaya hai. Kripya usi browser me kaam karein ya yahan dobara login karein.'
                    });
                }
            }

            req.user = resolveShopScope(decoded);
            return next();
        } catch (err) {
            // Token is invalid / expired — on Main PC loopback, fall through cleanly to auto-login!
            if (!isLoopback(req)) {
                return res.status(401).json({
                    success: false,
                    requireLogin: true,
                    error: 'Session expired or invalid token. Please login again.'
                });
            }
        }
    }

    // 4. Fallback for Local Server (Sanjay's PC / localhost)
    // Ensures existing local workflows and tabs work smoothly without sudden interruption.
    // Env flag ALLOW_LOCAL_AUTO_LOGIN=false se ise band kiya ja sakta hai.
    if (isLoopback(req) && ALLOW_LOCAL_AUTO_LOGIN) {
        if (!loopbackAutoLoginWarned) {
            loopbackAutoLoginWarned = true;
            console.warn('⚠️ [Auth] Loopback auto-login active (UserID 1). Band karne ke liye ALLOW_LOCAL_AUTO_LOGIN=false set karein.');
        }
        req.user = resolveShopScope({
            UserID: 1,
            ActualUserID: 1,
            Username: 'admin',
            ShopName: 'CSC & BC Kendra',
            OwnerName: 'Admin',
            Role: 'SuperAdmin'
        });
        return next();
    }

    // 5. Remote user without valid token -> 401 Unauthorized
    return res.status(401).json({
        success: false,
        requireLogin: true,
        error: 'Authentication required. Please log in to access your shop data.'
    });
}

function requireSuperAdmin(req, res, next) {
    if (!req.user || req.user.Role !== 'SuperAdmin') {
        return res.status(403).json({
            success: false,
            error: 'Access denied: Super Admin privileges required.'
        });
    }
    next();
}

function clearAuthTokenCache() {
    tokenCache.clear();
    jwtStatusCache.clear();
}

module.exports = {
    authenticateUser,
    requireSuperAdmin,
    clearAuthTokenCache,
    isLoopback,
    JWT_SECRET
};

