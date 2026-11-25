const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, withTransaction } = require('../database/db');
const { requireSuperAdmin } = require('../middleware/auth');

// All endpoints in this file require Super Admin role
router.use(requireSuperAdmin);

// GET /api/admin/users - List all shops/users with statistics
router.get('/users', async (req, res) => {
    try {
        const sql = `
            SELECT 
                u.UserID, u.Username, u.ShopName, u.OwnerName, u.MobileNumber, 
                u.Role, u.IsActive, u.ApiToken, u.CreatedAt, u.UpdatedAt,
                (SELECT COUNT(*) FROM Customers WHERE UserID = u.UserID) AS CustomerCount,
                (SELECT COUNT(*) FROM BCTransactions WHERE UserID = u.UserID) AS BCTransactionCount,
                (SELECT COUNT(*) FROM CSCApplications WHERE UserID = u.UserID) AS CSCCount,
                (SELECT COUNT(*) FROM Invoices WHERE UserID = u.UserID) AS InvoiceCount,
                (SELECT COUNT(*) FROM Accounts WHERE UserID = u.UserID AND IsActive = 1) AS AccountCount
            FROM Users u
            ORDER BY u.UserID ASC
        `;
        const result = await query(sql);
        res.json({ success: true, users: result.recordset, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/users - Create new shop / user and seed defaults
router.post('/users', async (req, res) => {
    try {
        const { username, password, shopName, ownerName, mobileNumber, role } = req.body;

        if (!username || !password || !shopName || !ownerName) {
            return res.status(400).json({
                success: false,
                error: 'Username, password, shop name aur owner name sabhi zaroori hain.'
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
            ShopName: shopName.trim(),
            ShopSubtitle: 'Grahak Seva Kendra',
            ShopPhone: mobileNumber ? mobileNumber.trim() : '',
            ShopFooterMsg: 'Thank you for visiting! Phir Padhaarein.',
            ShopGSTIN: '',
            ReceiptQRUPI: ''
        });

        const newUserId = await withTransaction(async (transQuery) => {
            // 1. Insert User
            const insertUser = await transQuery(`
                INSERT INTO Users (Username, PasswordHash, ShopName, OwnerName, MobileNumber, Role, IsActive, ApiToken, SettingsJson)
                OUTPUT INSERTED.UserID
                VALUES (@username, @passwordHash, @shopName, @ownerName, @mobileNumber, @role, 1, @apiToken, @settings)
            `, {
                username: cleanUsername,
                passwordHash,
                shopName: shopName.trim(),
                ownerName: ownerName.trim(),
                mobileNumber: mobileNumber ? mobileNumber.trim() : null,
                role: role || 'ShopAdmin',
                apiToken,
                settings: defaultSettings
            });

            const uid = insertUser.recordset[0].UserID;

            // 2. Seed Default Accounts for new shop
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

            return uid;
        });

        res.json({
            success: true,
            message: `Shop "${shopName}" safalta se create ho gaya! Defaults automatically seed ho gaye.`,
            userId: newUserId,
            username: cleanUsername,
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

        await query('UPDATE Users SET IsActive = @isActive, UpdatedAt = GETDATE() WHERE UserID = @id', {
            isActive: isActive ? 1 : 0,
            id: targetId
        });

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
        const { shopName, ownerName, mobileNumber, role } = req.body;

        if (!shopName || !ownerName) {
            return res.status(400).json({ success: false, error: 'Dukaan ka naam aur malik ka naam zaroori hain.' });
        }

        await query(`
            UPDATE Users 
            SET ShopName = @shopName,
                OwnerName = @ownerName,
                MobileNumber = @mobileNumber,
                Role = ISNULL(@role, Role),
                UpdatedAt = GETDATE()
            WHERE UserID = @id
        `, {
            id: targetId,
            shopName: shopName.trim(),
            ownerName: ownerName.trim(),
            mobileNumber: mobileNumber ? mobileNumber.trim() : null,
            role: role || null
        });

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

module.exports = router;

