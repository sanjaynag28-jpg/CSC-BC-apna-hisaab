const express = require('express');
const router = express.Router();
const { query, withTransaction, sql } = require('../database/db');

// Default Shop & Print Settings
const DEFAULT_SETTINGS = {
    ShopName: '💰 AAPKI DUKAAN / HISAB BC',
    ShopSubtitle: 'Main Market, Cash Management Counter',
    ShopPhone: '+91 98765 43210',
    ShopAddress: 'Main Market, Cash Management Counter',
    ShopEmail: '',
    ShopGSTIN: '',
    ShopCSPCode: 'BC-001 / CSP-KENDRA',
    ShopFooterMsg: 'Thank you for visiting! Phir Padhaarein.'
};

// GET /api/settings - Sabhi settings fetch karein (Tenant aware)
router.get('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const result = await query(
            'SELECT SettingKey, SettingValue, SettingGroup, Description, UpdatedAt FROM SystemSettings WHERE IFNULL(UserID, 1) = @userId',
            { userId }
        );
        const map = { ...DEFAULT_SETTINGS };

        if (result && result.recordset) {
            result.recordset.forEach(row => {
                if (row.SettingKey) {
                    map[row.SettingKey] = row.SettingValue ?? '';
                }
            });
        }

        // Overlay tenant-specific shop profile if available in Users table
        const userRes = await query('SELECT ShopName, MobileNumber, SettingsJson FROM Users WHERE UserID = @userId', { userId });
        if (userRes.recordset.length) {
            const u = userRes.recordset[0];
            if (u.ShopName) map.ShopName = u.ShopName;
            if (u.MobileNumber) map.ShopPhone = u.MobileNumber;
            if (u.SettingsJson) {
                try {
                    const custom = JSON.parse(u.SettingsJson);
                    Object.assign(map, custom);
                } catch (e) { }
            }
        }

        res.json({
            success: true,
            settings: map,
            raw: result.recordset || []
        });
    } catch (err) {
        console.error('Error fetching settings:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/settings - Dukaan profile aur system settings save / update karein (Tenant aware, SQLite safe)
router.post('/', async (req, res) => {
    try {
        const userId = req.user.UserID;
        const payload = req.body || {};
        const entries = Object.entries(payload);

        if (entries.length === 0) {
            return res.status(400).json({ success: false, error: 'Koi settings data provide nahi kiya gaya' });
        }

        const isSuperAdmin = req.user?.Role === 'SuperAdmin';

        const mergedSettings = await withTransaction(async (tQuery) => {
            // Preserve existing SettingsJson keys if partial payload sent
            let existingJson = {};
            const curRes = await tQuery('SELECT SettingsJson FROM Users WHERE UserID = @userId', { userId });
            if (curRes.recordset.length && curRes.recordset[0].SettingsJson) {
                try {
                    existingJson = JSON.parse(curRes.recordset[0].SettingsJson) || {};
                } catch (_) { existingJson = {}; }
            }
            const nextSettings = { ...existingJson, ...payload };

            // 1. Update user profile and SettingsJson for the active tenant
            const shopName = payload.ShopName ? String(payload.ShopName).trim() : null;
            const shopPhone = payload.ShopPhone !== undefined ? String(payload.ShopPhone).trim() : null;
            await tQuery(`
                UPDATE Users 
                SET SettingsJson = @json,
                    ShopName = COALESCE(@shopName, ShopName),
                    MobileNumber = COALESCE(@shopPhone, MobileNumber),
                    UpdatedAt = GETDATE()
                WHERE UserID = @userId
            `, { userId, json: JSON.stringify(nextSettings), shopName, shopPhone });

            // 2. If SuperAdmin, also upsert SystemSettings table (SQLite-compatible UPDATE/INSERT)
            if (isSuperAdmin) {
                for (const [key, rawVal] of entries) {
                    const val = String(rawVal ?? '');
                    const group = key.startsWith('Shop') ? 'ShopProfile' : 'General';
                    const desc = key.startsWith('Shop') ? `Dukaan / Counter branding: ${key}` : `System setting: ${key}`;

                    const existingRow = await tQuery(
                        'SELECT SettingKey FROM SystemSettings WHERE SettingKey = @key',
                        { key }
                    );

                    if (existingRow.recordset && existingRow.recordset.length > 0) {
                        await tQuery(`
                            UPDATE SystemSettings
                            SET SettingValue = @val,
                                SettingGroup = @grp,
                                Description = @dsc,
                                UpdatedAt = GETDATE(),
                                UserID = COALESCE(UserID, @userId)
                            WHERE SettingKey = @key
                        `, { key, val, grp: group, dsc: desc, userId });
                    } else {
                        await tQuery(`
                            INSERT INTO SystemSettings (SettingKey, SettingValue, SettingGroup, Description, UpdatedAt, UserID)
                            VALUES (@key, @val, @grp, @dsc, GETDATE(), @userId)
                        `, { key, val, grp: group, dsc: desc, userId });
                    }
                }
            }

            return nextSettings;
        });

        res.json({
            success: true,
            message: 'Dukaan profile aur print settings kamyabi se save ho gayi!',
            settings: mergedSettings
        });
    } catch (err) {
        console.error('Error saving settings:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// EXCEL IMPORT & EXPORT FOR CUSTOMERS & CSC
// ==========================================================================
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});
const {
    exportCustomersToExcel, getCustomersTemplateExcel, importCustomersFromExcel,
    exportCSCToExcel, getCSCTemplateExcel, importCSCFromExcel
} = require('./excel_manager');

// Customers Excel
router.get('/customers/export/excel', async (req, res) => {
        const userId = req.user.UserID;
        await exportCustomersToExcel(res, userId);
});

router.get('/customers/template/excel', async (req, res) => {
    await getCustomersTemplateExcel(res);
});

router.post('/customers/import/excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Kripya Excel file upload karein' });
        }
        const userId = req.user.UserID;
        const result = await importCustomersFromExcel(req.file.buffer, req.file.originalname, userId);
        res.json(result);
    } catch (err) {
        console.error('Settings Customer Excel import error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// CSC Work Tracker Excel
router.get('/csc/export/excel', async (req, res) => {
    const userId = req.user.UserID;
    await exportCSCToExcel(req.query, res, userId);
});

router.get('/csc/template/excel', async (req, res) => {
    await getCSCTemplateExcel(res);
});

router.post('/csc/import/excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Kripya Excel file upload karein' });
        }
        const userId = req.user.UserID;
        const result = await importCSCFromExcel(req.file.buffer, req.file.originalname, userId);
        res.json(result);
    } catch (err) {
        console.error('Settings CSC Excel import error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// FACTORY RESET / WIPE TEST DATA (SUPERADMIN ONLY - PROTECTED)
// ==========================================================================
router.post('/reset-test-data', async (req, res) => {
    try {
        // Strict guard: Only SuperAdmin on local loopback can perform database wipe
        if (!req.user || req.user.Role !== 'SuperAdmin' || req.user.UserID !== 1) {
            return res.status(403).json({ success: false, error: 'Suraksha: Kewal SuperAdmin hi data reset kar sakta hai.' });
        }

        const { confirmation } = req.body || {};

        const origin = req.headers.origin;
        if (origin && !/^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|chrome-extension:\/\/|moz-extension:\/\/)/i.test(origin)) {
            return res.status(403).json({ success: false, error: 'Ye request local origin se nahi aayi - block ho gayi' });
        }

        if (!confirmation || String(confirmation).trim().toUpperCase() !== 'RESET') {
            return res.status(400).json({
                success: false,
                error: 'Suraksha hetu kripya confirm karein aur text me "RESET" type karein.'
            });
        }

        const stats = await withTransaction(async (tQuery) => {
            const custCnt = (await tQuery('SELECT COUNT(*) as c FROM Customers')).recordset[0].c;
            const khataCnt = (await tQuery('SELECT COUNT(*) as c FROM KhataEntries')).recordset[0].c;
            const cscCnt = (await tQuery('SELECT COUNT(*) as c FROM CSCApplications')).recordset[0].c;
            const invCnt = (await tQuery('SELECT COUNT(*) as c FROM Invoices')).recordset[0].c;
            const bcCnt = (await tQuery('SELECT COUNT(*) as c FROM BCTransactions')).recordset[0].c;
            const docCnt = (await tQuery('SELECT COUNT(*) as c FROM Documents')).recordset[0].c;

            // 1. Delete invoice items
            await tQuery('DELETE FROM InvoiceItems');

            // 2. Delete Khata entries
            await tQuery('DELETE FROM KhataEntries');

            // 3. Delete Invoices
            await tQuery('DELETE FROM Invoices');

            // 4. Delete BC transactions & sessions
            await tQuery('DELETE FROM BCTransactions');
            await tQuery('DELETE FROM BCCounterSessions');

            // 5. Delete transactions, bills, recurring, budgets, parties
            await tQuery('DELETE FROM Transactions');
            await tQuery('DELETE FROM Bills');
            await tQuery('DELETE FROM RecurringTransactions');
            await tQuery('DELETE FROM Budgets');
            await tQuery('DELETE FROM Parties');

            // 6. Delete documents & dynamic service records
            await tQuery('DELETE FROM Documents');
            await tQuery('DELETE FROM ServiceRecords');

            // 7. Delete CSC, BillPay, UCL & PAC entries (before Customers due to CustomerID FK)
            await tQuery('DELETE FROM CSCApplications');
            await tQuery('DELETE FROM BillPayments');
            await tQuery('DELETE FROM UCLUpdates');
            await tQuery('DELETE FROM PACEntries');

            // 7b. Delete Universal Transaction Registry
            await tQuery('DELETE FROM UniversalTxnRegistry');

            // 8. Delete Audit logs
            await tQuery('DELETE FROM AuditLogs');

            // 9. Delete Customers
            await tQuery('UPDATE Customers SET ParentCustomerID = NULL');
            await tQuery('DELETE FROM Customers');

            // 10. Reset Accounts balance to 0
            await tQuery('UPDATE Accounts SET CurrentBalance = 0, OpeningBalance = 0');

            // 11. Reset SQLite autoincrement sequences cleanly
            const identityTables = [
                'Customers', 'KhataEntries', 'Invoices', 'InvoiceItems',
                'BCTransactions', 'BCCounterSessions', 'Transactions',
                'Documents', 'CSCApplications', 'BillPayments', 'UCLUpdates', 'PACEntries',
                'ServiceRecords', 'UniversalTxnRegistry', 'AuditLogs'
            ];
            for (const tbl of identityTables) {
                try {
                    await tQuery('DELETE FROM sqlite_sequence WHERE name = @tbl', { tbl });
                } catch (e) {
                    // sqlite_sequence may not exist yet on empty DBs
                }
            }

            return {
                deletedCustomers: custCnt,
                deletedKhataEntries: khataCnt,
                deletedCSC: cscCnt,
                deletedInvoices: invCnt,
                deletedBCTransactions: bcCnt,
                deletedDocuments: docCnt
            };
        });

        res.json({
            success: true,
            message: 'Poora test data kamyabi se delete ho gaya hai! Ab aap apna asli data shuru se darz kar sakte hain. Agla grahak ID #1 se shuru hoga.',
            stats
        });
    } catch (err) {
        console.error('Error in reset-test-data:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
