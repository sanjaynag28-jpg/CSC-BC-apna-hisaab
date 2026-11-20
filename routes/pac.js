/**
 * routes/pac.js
 * ---------------------------------------------------------------------------
 * CSC Aadhaar PAC (Packet Authentication Code) Management Router
 * 
 * Features:
 * - PAC Code Stock Management (Available, Used, Expired)
 * - Wallet Deduction Tracking (₹50 per PAC)
 * - Linkage with UCL Updates and Resident/EID Packets
 * ---------------------------------------------------------------------------
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');
const { escapeLike } = require('../utils/helpers');

// ============================================================================
// 1. GET /api/pac - List PAC Codes & KPI Stats
// ============================================================================
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { search, status } = req.query;

        let whereClause = 'WHERE IsDeleted = 0 AND UserID = @userId';
        const params = { userId };

        if (status && status !== 'all') {
            whereClause += ' AND Status = @status';
            params.status = status;
        }

        if (search && search.trim()) {
            params.search = `%${escapeLike(search.trim())}%`;
            whereClause += ` AND (
                PACCode LIKE @search OR
                OperatorID LIKE @search OR
                UsedForCustomerName LIKE @search OR
                UsedForSID LIKE @search
            )`;
        }

        // KPI Counts
        const kpiRes = await query(`
            SELECT
                SUM(CASE WHEN Status = 'Available' THEN 1 ELSE 0 END) AS AvailableCount,
                COUNT(*) AS TotalCount,
                SUM(CASE WHEN Status = 'Used' THEN 1 ELSE 0 END) AS UsedCount,
                ISNULL(SUM(CASE WHEN Status = 'Used' THEN WalletDeduction ELSE 0 END), 0) AS WalletSpent
            FROM PACEntries
            WHERE IsDeleted = 0 AND UserID = @userId
        `, { userId });
        const kpi = kpiRes.recordset[0] || {};

        const listRes = await query(`
            SELECT *
            FROM PACEntries
            ${whereClause}
            ORDER BY Status ASC, GenerationDate DESC, PACID DESC
        `, params);

        res.json({
            success: true,
            data: listRes.recordset,
            stats: {
                available: kpi.AvailableCount || 0,
                total: kpi.TotalCount || 0,
                used: kpi.UsedCount || 0,
                walletSpent: parseFloat(kpi.WalletSpent || 0)
            }
        });
    } catch (err) {
        console.error('[PAC List Error]:', err);
        res.status(500).json({ success: false, error: 'PAC codes load nahi ho sake: ' + err.message });
    }
});

// ============================================================================
// 2. POST /api/pac - Add New PAC Code(s)
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const body = req.body;

        const pacCode = (body.pacCode || body.PACCode || '').trim();
        if (!pacCode) {
            return res.status(400).json({ success: false, error: 'PAC Code enter karein' });
        }

        const operatorId = (body.operatorId || body.OperatorID || '').trim();
        const walletDeduction = parseFloat(body.walletDeduction ?? body.WalletDeduction ?? 50.00);
        const expiryDate = body.expiryDate || body.ExpiryDate || null;
        const notes = body.notes || body.Notes || null;

        // Check duplicate
        const dupRes = await query(`
            SELECT PACID FROM PACEntries 
            WHERE PACCode = @pacCode AND UserID = @userId AND IsDeleted = 0
        `, { pacCode, userId });

        if (dupRes.recordset?.length) {
            return res.status(400).json({ success: false, error: `PAC Code '${pacCode}' pehle se darz hai` });
        }

        const insertRes = await query(`
            INSERT INTO PACEntries (
                UserID, PACCode, OperatorID, WalletDeduction, GenerationDate,
                ExpiryDate, Status, Notes, IsActive, IsDeleted, CreatedAt, UpdatedAt
            ) VALUES (
                @userId, @pacCode, @operatorId, @walletDeduction, GETDATE(),
                @expiryDate, 'Available', @notes, 1, 0, GETDATE(), GETDATE()
            );
            SELECT SCOPE_IDENTITY() AS PACID;
        `, {
            userId,
            pacCode,
            operatorId: operatorId || null,
            walletDeduction,
            expiryDate: expiryDate || null,
            notes: notes || null
        });

        const pacId = insertRes.recordset[0].PACID;

        await logAudit(userId, 'CREATE', 'PACEntries', pacId, null, { pacCode, walletDeduction });

        res.json({
            success: true,
            data: { pacId, pacCode },
            message: `PAC Code ${pacCode} darz ho gaya!`
        });
    } catch (err) {
        console.error('[PAC Add Error]:', err);
        res.status(500).json({ success: false, error: 'PAC code save nahi ho saka: ' + err.message });
    }
});

// ============================================================================
// 3. PUT /api/pac/:id - Update PAC Status / Details
// ============================================================================
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id);
        const { status, notes, usedForCustomerName, usedForSID } = req.body;

        await query(`
            UPDATE PACEntries
            SET Status = ISNULL(@status, Status),
                Notes = ISNULL(@notes, Notes),
                UsedForCustomerName = ISNULL(@usedForCustomerName, UsedForCustomerName),
                UsedForSID = ISNULL(@usedForSID, UsedForSID),
                UpdatedAt = GETDATE()
            WHERE PACID = @id AND UserID = @userId AND IsDeleted = 0
        `, {
            id,
            userId,
            status: status || null,
            notes: notes || null,
            usedForCustomerName: usedForCustomerName || null,
            usedForSID: usedForSID || null
        });

        res.json({ success: true, message: 'PAC code update ho gaya' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// 4. DELETE /api/pac/:id - Soft Delete PAC Code
// ============================================================================
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id);

        await query(`
            UPDATE PACEntries
            SET IsDeleted = 1, UpdatedAt = GETDATE()
            WHERE PACID = @id AND UserID = @userId
        `, { id, userId });

        res.json({ success: true, message: 'PAC code hata diya gaya' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
