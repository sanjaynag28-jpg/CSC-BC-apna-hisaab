const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, withTransaction } = require('../database/db');
const { requireSuperAdmin, clearAuthTokenCache } = require('../middleware/auth');
const { clearSession } = require('../utils/sessionStore');

// All endpoints in this file require Super Admin role
router.use(requireSuperAdmin);

// GET /api/admin/users - List all shops & staff accounts with statistics
router.get('/users', async (req, res) => {
    try {
        const sql = `
            SELECT 
                u.UserID, u.Username, u.ShopName, u.OwnerName, u.MobileNumber, 
                u.Role, u.ParentUserID, u.IsActive, u.ApiToken, u.CreatedAt, u.UpdatedAt,
                (SELECT COUNT(*) FROM Customers WHERE UserID = u.UserID) AS CustomerCount,
                (SELECT COUNT(*) FROM BCTransactions WHERE UserID = u.UserID) AS BCTransactionCount,
                (SELECT COUNT(*) FROM CSCApplications WHERE UserID = u.UserID) AS CSCCount,
                (SELECT COUNT(*) FROM Invoices WHERE UserID = u.UserID) AS InvoiceCount,
                (SELECT COUNT(*) FROM Accounts WHERE UserID = u.UserID AND IsActive = 1) AS AccountCount,
                (SELECT COUNT(*) FROM UniversalTxnRegistry WHERE UserID = COALESCE(u.ParentUserID, u.UserID) AND CreatedByUserID = u.UserID) AS StaffEntryCount
            FROM Users u
            ORDER BY u.UserID ASC
        `;
        const result = await query(sql);
        res.json({ success: true, users: result.recordset, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/users - Create new shop OR shared-shop Staff/Agent account
router.post('/users', async (req, res) => {
    try {
        const { username, password, shopName, ownerName, mobileNumber, role, parentUserId } = req.body;
        const targetRole = String(role || 'ShopAdmin').trim() || 'ShopAdmin';
        const isStaffAccount = targetRole === 'Staff';
        const resolvedParentId = isStaffAccount ? (parseInt(parentUserId, 10) || Number(req.user?.UserID) || 1) : null;

        let cleanShopName = shopName ? String(shopName).trim() : '';
        if (isStaffAccount && !cleanShopName) {
            const parentRes = await query('SELECT ShopName FROM Users WHERE UserID = @pid', { pid: resolvedParentId });
            cleanShopName = parentRes.recordset[0]?.ShopName || 'My CSC & BC Center';
        }

        if (!username || !password || !ownerName || (!isStaffAccount && !cleanShopName)) {
            return res.status(400).json({
                success: false,
                error: isStaffAccount
                    ? 'Staff Name, Username aur Password sabhi zaroori hain.'
                    : 'Username, password, shop name aur owner name sabhi zaroori hain.'
            });
        }

        const cleanUsername = username.trim().toLowerCase();
        const existing = await query('SELECT UserID FROM Users WHERE LOWER(Username) = @u', { u: cleanUsername });
        if (existing.recordset.length > 0) {
            return res.status(400).json({ success: false, error: `Username "${cleanUsername}" pehle se maujood hai. Dusra chunein.` });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const apiToken = crypto.randomBytes(32).toString('hex');
        const defaultSettings = JSON.stringify({
            ShopName: cleanShopName,
            ShopSubtitle: 'Grahak Seva Kendra',
            ShopPhone: mobileNumber ? mobileNumber.trim() : '',
            ShopFooterMsg: 'Thank you for visiting! Phir Padhaarein.',
            ShopGSTIN: '',
            ReceiptQRUPI: ''
        });

        const newUserId = await withTransaction(async (transQuery) => {
            // 1. Insert User (Staff links to ParentUserID; ShopOwner gets isolated Shop UserID)
            const insertUser = await transQuery(`
                INSERT INTO Users (Username, PasswordHash, ShopName, OwnerName, MobileNumber, Role, ParentUserID, IsActive, ApiToken, SettingsJson)
                OUTPUT INSERTED.UserID
                VALUES (@username, @passwordHash, @shopName, @ownerName, @mobileNumber, @role, @parentUserId, 1, @apiToken, @settings)
            `, {
                username: cleanUsername,
                passwordHash,
                shopName: cleanShopName,
                ownerName: ownerName.trim(),
                mobileNumber: mobileNumber ? mobileNumber.trim() : null,
                role: targetRole,
                parentUserId: resolvedParentId,
                apiToken,
                settings: defaultSettings
            });

            const uid = insertUser.recordset[0].UserID;

            if (!isStaffAccount) {
                // 2. Seed Default Accounts for new isolated shop
                await transQuery(`
                    INSERT INTO Accounts (AccountName, AccountType, OpeningBalance, CurrentBalance, Currency, IsActive, Color, Icon, UserID)
                    VALUES 
                    ('Cash Galla', 'Cash', 0, 0, 'INR', 1, '#10b981', 'wallet', @uid),
                    ('Main Bank Account', 'Bank', 0, 0, 'INR', 1, '#2563eb', 'landmark', @uid),
                    ('BC Portal / Digipay', 'Portal', 0, 0, 'INR', 1, '#0ea5e9', 'zap', @uid)
                `, { uid });

                // 3. Seed Standard CSC Services cloned from template/User 1
                await transQuery(`
                    INSERT INTO CSCServices (ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder, UserID)
                    SELECT ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder, @uid
                    FROM CSCServices
                    WHERE UserID = 1 AND IsActive = 1
                `, { uid });

                // 4. Seed Standard Categories cloned from User 1
                await transQuery(`
                    INSERT INTO Categories (CategoryName, CategoryType, Icon, Color, IsActive, UserID)
                    SELECT CategoryName, CategoryType, Icon, Color, IsActive, @uid
                    FROM Categories
                    WHERE UserID = 1 AND IsActive = 1 AND ParentID IS NULL
                `, { uid });
            }

            return uid;
        });

        res.json({
            success: true,
            message: isStaffAccount
                ? `Staff Agent "${ownerName.trim()}" safalta se create ho gaya! Ab yeh aapki dukaan ke shared data par kaam kar sakta hai.`
                : `Shop "${cleanShopName}" safalta se create ho gaya! Defaults automatically seed ho gaye.`,
            userId: newUserId,
            username: cleanUsername,
            role: targetRole,
            parentUserId: resolvedParentId,
            apiToken
        });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ success: false, error: 'User create karne me truti: ' + err.message });
    }
});

// PUT /api/admin/users/:id/status - Toggle Active / Disabled
router.put('/users/:id/status', async (req, res) => {
    try {
        const targetId = parseInt(req.params.id, 10);
        const { isActive } = req.body;

        if (targetId === 1 && !isActive) {
            return res.status(400).json({ success: false, error: 'Super Admin account (UserID 1) ko deactivate nahi kiya ja sakta.' });
        }

        await query(
            `UPDATE Users
             SET IsActive = @isActive,
                 ActiveSessionToken = CASE WHEN @isActive = 0 THEN NULL ELSE ActiveSessionToken END,
                 UpdatedAt = GETDATE()
             WHERE UserID = @id`,
            {
                isActive: isActive ? 1 : 0,
                id: targetId
            }
        );
        clearAuthTokenCache();
        if (!isActive) {
            clearSession(targetId);
        }

        res.json({ success: true, message: `Account status updated to ${isActive ? 'Active' : 'Disabled'}.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/admin/users/:id/reset-password - Admin resets password for a friend
router.put('/users/:id/reset-password', async (req, res) => {
    try {
        const targetId = parseInt(req.params.id, 10);
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ success: false, error: 'Naya password kam se kam 4 aksharo ka hona chahiye.' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        await query('UPDATE Users SET PasswordHash = @hash, UpdatedAt = GETDATE() WHERE UserID = @id', {
            hash: newHash,
            id: targetId
        });

        res.json({ success: true, message: 'Password reset safal raha.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/admin/users/:id - Update shop profile details (ShopName, OwnerName, MobileNumber, Role)
router.put('/users/:id', async (req, res) => {
    try {
        const targetId = parseInt(req.params.id, 10);
        const { shopName, ownerName, mobileNumber, role, parentUserId } = req.body;

        if (!shopName || !ownerName) {
            return res.status(400).json({ success: false, error: 'Dukaan ka naam aur malik/staff ka naam zaroori hain.' });
        }

        const cleanShop = shopName.trim();
        const cleanOwner = ownerName.trim();
        const cleanMobile = mobileNumber ? mobileNumber.trim() : null;
        const resolvedParentId = (role === 'Staff')
            ? (parseInt(parentUserId, 10) || Number(req.user?.UserID) || 1)
            : (role ? null : undefined);

        // Keep SettingsJson in sync with updated ShopName / ShopPhone
        let nextSettingsJson = null;
        try {
            const curRes = await query('SELECT SettingsJson FROM Users WHERE UserID = @id', { id: targetId });
            const curJson = (curRes.recordset.length && curRes.recordset[0].SettingsJson)
                ? (JSON.parse(curRes.recordset[0].SettingsJson) || {})
                : {};
            curJson.ShopName = cleanShop;
            if (cleanMobile !== null) curJson.ShopPhone = cleanMobile;
            nextSettingsJson = JSON.stringify(curJson);
        } catch (_) { nextSettingsJson = null; }

        await query(`
            UPDATE Users 
            SET ShopName = @shopName,
                OwnerName = @ownerName,
                MobileNumber = @mobileNumber,
                Role = ISNULL(@role, Role),
                ParentUserID = CASE WHEN @role = 'Staff' THEN @parentUserId WHEN @role IS NOT NULL THEN NULL ELSE ParentUserID END,
                SettingsJson = COALESCE(@settingsJson, SettingsJson),
                UpdatedAt = GETDATE()
            WHERE UserID = @id
        `, {
            id: targetId,
            shopName: cleanShop,
            ownerName: cleanOwner,
            mobileNumber: cleanMobile,
            role: role || null,
            parentUserId: resolvedParentId || 1,
            settingsJson: nextSettingsJson
        });
        clearAuthTokenCache();

        // If SuperAdmin (UserID 1), keep SystemSettings in sync as well
        if (targetId === 1) {
            const syncPairs = [['ShopName', cleanShop]];
            if (cleanMobile !== null) syncPairs.push(['ShopPhone', cleanMobile]);
            for (const [k, v] of syncPairs) {
                const ex = await query('SELECT SettingKey FROM SystemSettings WHERE SettingKey = @k', { k });
                if (ex.recordset.length > 0) {
                    await query('UPDATE SystemSettings SET SettingValue = @v, UpdatedAt = GETDATE() WHERE SettingKey = @k', { k, v });
                } else {
                    await query(`INSERT INTO SystemSettings (SettingKey, SettingValue, SettingGroup, Description, UpdatedAt, UserID) VALUES (@k, @v, 'ShopProfile', 'Dukaan branding', GETDATE(), 1)`, { k, v });
                }
            }
        }

        res.json({ success: true, message: 'Dukaan ki details safalta se update ho gayi!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/client-errors - List remote client error logs with shop & user details
router.get('/client-errors', async (req, res) => {
    try {
        const sql = `
            SELECT TOP 100
                e.ErrorID, e.UserID, e.ErrorType, e.ErrorMessage, e.ErrorStack, e.Url, 
                e.UserAgent, e.DeviceInfo, e.Resolved, e.CreatedAt,
                COALESCE(u.ShopName, 'System/Public') AS ShopName,
                COALESCE(u.OwnerName, 'N/A') AS OwnerName,
                COALESCE(u.Username, 'N/A') AS Username
            FROM ClientErrorLogs e
            LEFT JOIN Users u ON e.UserID = u.UserID
            ORDER BY e.CreatedAt DESC
        `;
        const result = await query(sql);
        res.json({ success: true, total: result.recordset.length, errors: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/admin/client-errors - Clear client error logs
router.delete('/client-errors', async (req, res) => {
    try {
        await query('DELETE FROM ClientErrorLogs');
        res.json({ success: true, message: 'Sabhi client error logs saaf ho gaye.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// FLEET TELEMETRY & CLOUDFLARE WORKER + D1 MONITOR (SuperAdmin Only)
// ============================================================================
router.get('/fleet/config', (req, res) => {
    try {
        const telemetry = require('../utils/telemetryAgent');
        const cfg = telemetry.getTelemetryConfig();
        res.json({
            success: true,
            hwid: telemetry.getSafeHardwareId(),
            configured: cfg.configured,
            disabled: cfg.disabled,
            endpoint: cfg.endpoint || '',
            hasIngestKey: Boolean(cfg.ingestKey),
            hasAdminKey: Boolean(cfg.adminKey)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/fleet/config', async (req, res) => {
    try {
        const telemetry = require('../utils/telemetryAgent');
        const { endpoint, ingestKey, adminKey, testConnection } = req.body || {};
        const nextCfg = telemetry.saveClientConfig({ endpoint, ingestKey, adminKey });

        let pingResult = null;
        if (testConnection && nextCfg.endpoint) {
            try {
                const health = await telemetry.postToWorker('/api/health', null, { endpoint: nextCfg.endpoint, method: 'GET' });
                const hb = nextCfg.ingestKey ? await telemetry.sendHeartbeat() : null;
                pingResult = { healthOk: Boolean(health && health.success), heartbeat: hb };
            } catch (err) {
                pingResult = { healthOk: false, error: err.message };
            }
        }

        res.json({
            success: true,
            configured: nextCfg.configured,
            endpoint: nextCfg.endpoint,
            hasIngestKey: Boolean(nextCfg.ingestKey),
            hasAdminKey: Boolean(nextCfg.adminKey),
            pingResult
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/fleet/ping', async (req, res) => {
    try {
        const telemetry = require('../utils/telemetryAgent');
        const snap = await telemetry.collectDeviceSnapshot();
        const result = await telemetry.sendHeartbeat();
        res.json({ success: Boolean(result && result.success), snapshot: snap, result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/fleet/overview', async (req, res) => {
    try {
        const telemetry = require('../utils/telemetryAgent');
        const cfg = telemetry.getTelemetryConfig();
        const adminKey = String(req.headers['x-fleet-admin-key'] || req.query.adminKey || cfg.adminKey || '').trim();
        if (!cfg.endpoint) {
            const snap = await telemetry.collectDeviceSnapshot();
            return res.json({
                success: true,
                unconfigured: true,
                localSnapshot: snap,
                message: 'Cloudflare Worker URL abhi set nahi hua — Setup guide ke zariye connect karein.'
            });
        }
        if (!adminKey) {
            return res.status(400).json({
                success: false,
                needsAdminKey: true,
                error: 'Apna Cloudflare Worker Admin Key dalein.'
            });
        }
        const q = encodeURIComponent(String(req.query.q || ''));
        const ver = encodeURIComponent(String(req.query.version || ''));
        const data = await telemetry.postToWorker(`/api/admin/fleet?q=${q}&version=${ver}`, null, {
            endpoint: cfg.endpoint,
            adminKey,
            method: 'GET'
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/fleet/device/:hwid', async (req, res) => {
    try {
        const telemetry = require('../utils/telemetryAgent');
        const cfg = telemetry.getTelemetryConfig();
        const adminKey = String(req.headers['x-fleet-admin-key'] || req.query.adminKey || cfg.adminKey || '').trim();
        const data = await telemetry.postToWorker(`/api/admin/device/${encodeURIComponent(req.params.hwid)}`, null, {
            endpoint: cfg.endpoint,
            adminKey,
            method: 'GET'
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/fleet/errors/:id/resolve', async (req, res) => {
    try {
        const telemetry = require('../utils/telemetryAgent');
        const cfg = telemetry.getTelemetryConfig();
        const adminKey = String(req.headers['x-fleet-admin-key'] || cfg.adminKey || '').trim();
        const data = await telemetry.postToWorker(`/api/admin/errors/${encodeURIComponent(req.params.id)}/resolve`, req.body || {}, {
            endpoint: cfg.endpoint,
            adminKey,
            method: 'POST'
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

