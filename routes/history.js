const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// GET /api/history - Paginated audit logs with rich filters & stats
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            module: moduleFilter = 'All',
            action: actionFilter = 'All',
            createdBy = '',
            startDate = '',
            endDate = ''
        } = req.query;

        const p = Math.max(1, parseInt(page) || 1);
        const l = Math.min(200, Math.max(5, parseInt(limit) || 20));
        const offset = (p - 1) * l;

        const userId = req.user.UserID;
        const whereClauses = ['1=1'];
        const params = {};

        if (req.user?.Role !== 'SuperAdmin') {
            whereClauses.push('a.UserID = @userId');
            params.userId = userId;
        }

        if (search && search.trim() !== '') {
            const rawSearch = search.trim();
            whereClauses.push(`(
                a.Description LIKE @search OR 
                a.EntityName LIKE @search OR 
                a.Details LIKE @search OR 
                a.TableName LIKE @search OR
                CAST(a.RecordID AS NVARCHAR(20)) = @exactRecordId
            )`);
            params.search = `%${rawSearch}%`;
            params.exactRecordId = rawSearch.replace(/^[#]/, '');
        }

        if (moduleFilter && moduleFilter !== 'All') {
            whereClauses.push('a.Module = @module');
            params.module = moduleFilter;
        }

        if (actionFilter && actionFilter !== 'All') {
            whereClauses.push('a.Action = @action');
            params.action = actionFilter;
        }

        if (createdBy && String(createdBy).trim() !== '' && createdBy !== 'All') {
            whereClauses.push('a.CreatedByName = @createdBy');
            params.createdBy = String(createdBy).trim();
        }

        if (startDate && startDate.trim() !== '') {
            whereClauses.push('CAST(a.CreatedAt AS DATE) >= @startDate');
            params.startDate = startDate.trim();
        }

        if (endDate && endDate.trim() !== '') {
            whereClauses.push('CAST(a.CreatedAt AS DATE) <= @endDate');
            params.endDate = endDate.trim();
        }

        const whereSql = whereClauses.join(' AND ');

        // 1. Total matching count
        const countRes = await query(`
            SELECT COUNT(*) AS TotalCount
            FROM AuditLogs a
            WHERE ${whereSql}
        `, params);
        const total = countRes.recordset[0]?.TotalCount || 0;

        // 2. Fetch paginated records
        const listRes = await query(`
            SELECT 
                a.LogID,
                a.Action,
                a.Module,
                a.TableName,
                a.RecordID,
                a.Description,
                a.EntityName,
                a.Amount,
                a.Details,
                a.CreatedAt,
                a.CreatedByUserID,
                a.CreatedByName,
                CASE WHEN a.OldData IS NOT NULL AND LEN(a.OldData) > 0 THEN 1 ELSE 0 END AS HasOldData,
                CASE WHEN a.NewData IS NOT NULL AND LEN(a.NewData) > 0 THEN 1 ELSE 0 END AS HasNewData
            FROM AuditLogs a
            WHERE ${whereSql}
            ORDER BY a.CreatedAt DESC, a.LogID DESC
            OFFSET ${offset} ROWS FETCH NEXT ${l} ROWS ONLY
        `, params);

        // Stats/modules/detail bhi strictly same user-scope par
        const userScopeSql = (req.user?.Role !== 'SuperAdmin') ? 'WHERE UserID = @userId' : '';

        // 3. Overall KPI Metrics
        const statsRes = await query(`
            SELECT 
                COUNT(*) AS TotalLogs,
                ISNULL(SUM(CASE WHEN Action IN ('CREATE', 'INSERT', 'ADD') THEN 1 ELSE 0 END), 0) AS TotalCreated,
                ISNULL(SUM(CASE WHEN Action = 'UPDATE' THEN 1 ELSE 0 END), 0) AS TotalUpdated,
                ISNULL(SUM(CASE WHEN Action = 'DELETE' THEN 1 ELSE 0 END), 0) AS TotalDeleted,
                ISNULL(SUM(CASE WHEN CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END), 0) AS TodayLogs,
                ISNULL(SUM(Amount), 0) AS TotalTrackedAmount
            FROM AuditLogs
            ${userScopeSql}
        `, userScopeSql ? { userId } : {});

        // 4. Distinct Modules for Filter Dropdown
        const modulesRes = await query(`
            SELECT DISTINCT Module 
            FROM AuditLogs 
            WHERE Module IS NOT NULL AND Module != ''
              ${userScopeSql ? 'AND UserID = @userId' : ''}
            ORDER BY Module ASC
        `, userScopeSql ? { userId } : {});

        res.json({
            success: true,
            data: listRes.recordset,
            pagination: {
                page: p,
                limit: l,
                total,
                totalPages: Math.ceil(total / l) || 1
            },
            summary: statsRes.recordset[0] || {
                TotalLogs: 0,
                TotalCreated: 0,
                TotalUpdated: 0,
                TotalDeleted: 0,
                TodayLogs: 0,
                TotalTrackedAmount: 0
            },
            availableModules: modulesRes.recordset.map(r => r.Module)
        });
    } catch (err) {
        console.error('Error fetching audit history:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/history/:id - Full details of a single audit log entry
router.get('/:id', async (req, res) => {
    try {
        const logId = parseInt(req.params.id);
        const userId = req.user.UserID;
        const isSuperAdmin = req.user?.Role === 'SuperAdmin';
        const result = await query(`
            SELECT * FROM AuditLogs
            WHERE LogID = @id
              ${isSuperAdmin ? '' : 'AND UserID = @userId'}
        `, isSuperAdmin ? { id: logId } : { id: logId, userId });

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Audit log entry nahi mili' });
        }

        const log = result.recordset[0];

        // Safely parse OldData and NewData if they are JSON
        let parsedOld = null;
        let parsedNew = null;
        if (log.OldData) {
            try { parsedOld = JSON.parse(log.OldData); } catch (e) { parsedOld = log.OldData; }
        }
        if (log.NewData) {
            try { parsedNew = JSON.parse(log.NewData); } catch (e) { parsedNew = log.NewData; }
        }

        res.json({
            success: true,
            data: {
                ...log,
                OldDataParsed: parsedOld,
                NewDataParsed: parsedNew
            }
        });
    } catch (err) {
        console.error('Error fetching audit log detail:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
