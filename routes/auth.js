const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../database/db');
const { JWT_SECRET, isLoopback } = require('../middleware/auth');
const { setSession, clearSession } = require('../utils/sessionStore');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username aur password dono zaroori hain.' });
        }

        const cleanInput = String(username || '').trim();
        const userRes = await query(
            `SELECT * FROM Users 
             WHERE LOWER(Username) = LOWER(@input) 
                OR MobileNumber = @input 
                OR REPLACE(REPLACE(MobileNumber, '+91', ''), ' ', '') = REPLACE(REPLACE(@input, '+91', ''), ' ', '')`,
            { input: cleanInput }
        );

        if (userRes.recordset.length === 0) {
            return res.status(401).json({ success: false, error: 'Galat username ya mobile number. Kripya check karein.' });
        }

        const user = userRes.recordset[0];

        if (!user.IsActive) {
            return res.status(403).json({ success: false, error: 'Aapka shop account disabled/inactive hai. Super Admin (Sanjay Nag) se contact karein.' });
        }

        const cleanPass = String(password || '').trim();
        let match = bcrypt.compareSync(password, user.PasswordHash) ||
                    bcrypt.compareSync(cleanPass, user.PasswordHash);

        if (!match) {
            return res.status(401).json({ success: false, error: 'Galat password. Kripya sahi password dalein.' });
        }

        // Single Active Browser Session Policy:
        // Remote shopkeepers/friends (Role !== 'SuperAdmin') get a single exclusive session token.
        // Super Admin (Sanjay Nag, UserID: 1) retains unrestricted multi-browser/multi-tab access.
        // Loopback requests (Sanjay on localhost / server hub) do not overwrite the active session of remote tenants!
        let sessionToken = null;
        if (user.Role !== 'SuperAdmin' && user.UserID !== 1) {
            if (!isLoopback(req)) {
                sessionToken = crypto.randomUUID();
                const device = (req.headers['user-agent'] || 'Unknown Device').substring(0, 250);
                try {
                    await query(
                        'UPDATE Users SET ActiveSessionToken = @sessionToken, LastLoginAt = GETDATE(), LastLoginDevice = @device WHERE UserID = @id',
                        { sessionToken, device, id: user.UserID }
                    );
                    setSession(user.UserID, sessionToken);
                } catch (sessErr) {
                    console.error('Failed to update ActiveSessionToken in Users:', sessErr.message);
                }
            } else {
                // If local test or Sanjay on localhost, keep current sessionToken so we don't kick out the remote friend!
                try {
                    const curRes = await query('SELECT ActiveSessionToken FROM Users WHERE UserID = @id', { id: user.UserID });
                    sessionToken = curRes.recordset[0]?.ActiveSessionToken || crypto.randomUUID();
                } catch(e) {
                    sessionToken = crypto.randomUUID();
                }
            }
        }

        // Generate JWT token (30 days validity for shopkeeper convenience)
        const tokenPayload = {
            UserID: user.UserID,
            Username: user.Username,
            ShopName: user.ShopName,
            OwnerName: user.OwnerName,
            Role: user.Role,
            sessionToken: sessionToken
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '30d' });

        // Parse SettingsJson if present
        let settings = {};
        try {
            settings = user.SettingsJson ? JSON.parse(user.SettingsJson) : {};
        } catch (e) {}

        // Set auth cookie
        res.cookie('token', token, {
            httpOnly: false, // Accessible to client scripts if needed
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            path: '/'
        });

        res.json({
            success: true,
            token,
            user: {
                UserID: user.UserID,
                Username: user.Username,
                ShopName: user.ShopName,
                OwnerName: user.OwnerName,
                MobileNumber: user.MobileNumber,
                Role: user.Role,
                ApiToken: user.ApiToken,
                Settings: settings
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Login me takneeki samasya aayi: ' + err.message });
    }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    try {
        if (!req.user || !req.user.UserID) {
            return res.status(401).json({ success: false, requireLogin: true });
        }

        const userRes = await query(
            'SELECT UserID, Username, ShopName, OwnerName, MobileNumber, Role, IsActive, ApiToken, SettingsJson FROM Users WHERE UserID = @id',
            { id: req.user.UserID }
        );

        if (userRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'User nahi mila' });
        }

        const user = userRes.recordset[0];
        let settings = {};
        try {
            settings = user.SettingsJson ? JSON.parse(user.SettingsJson) : {};
        } catch (e) {}

        res.json({
            success: true,
            user: {
                UserID: user.UserID,
                Username: user.Username,
                ShopName: user.ShopName,
                OwnerName: user.OwnerName,
                MobileNumber: user.MobileNumber,
                Role: user.Role,
                ApiToken: user.ApiToken,
                Settings: settings
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
    try {
        if (!req.user || !req.user.UserID) {
            return res.status(401).json({ success: false, error: 'Login required' });
        }

        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Current aur new password dono zaroori hain.' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ success: false, error: 'Naya password kam se kam 4 aksharo ka hona chahiye.' });
        }

        const userRes = await query('SELECT PasswordHash FROM Users WHERE UserID = @id', { id: req.user.UserID });
        if (userRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'User nahi mila' });
        }

        const match = bcrypt.compareSync(currentPassword, userRes.recordset[0].PasswordHash);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Purana password galat hai.' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        await query('UPDATE Users SET PasswordHash = @hash, ActiveSessionToken = NULL, UpdatedAt = GETDATE() WHERE UserID = @id', {
            hash: newHash,
            id: req.user.UserID
        });
        clearSession(req.user.UserID);

        res.json({ success: true, message: 'Password safalta se badal gaya.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/auth/regenerate-token (For extension grabber auth)
router.post('/regenerate-token', async (req, res) => {
    try {
        if (!req.user || !req.user.UserID) {
            return res.status(401).json({ success: false, error: 'Login required' });
        }

        const newToken = crypto.randomBytes(32).toString('hex');
        await query('UPDATE Users SET ApiToken = @token, UpdatedAt = GETDATE() WHERE UserID = @id', {
            token: newToken,
            id: req.user.UserID
        });

        res.json({ success: true, apiToken: newToken });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
    try {
        if (req.user && req.user.UserID) {
            clearSession(req.user.UserID);
            await query('UPDATE Users SET ActiveSessionToken = NULL WHERE UserID = @id', { id: req.user.UserID });
        }
        res.clearCookie('token', { path: '/' });
        res.json({ success: true, message: 'Safalta se logout ho gaya.' });
    } catch (e) {
        res.clearCookie('token', { path: '/' });
        res.json({ success: true });
    }
});

module.exports = router;

