const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});
const { query, withTransaction } = require('../database/db');
const { syncCSCToKhata, processKhataAfterChange } = require('../database/khataEngine');
const { exportCSCToExcel, getCSCTemplateExcel, importCSCFromExcel } = require('./excel_manager');
const { logAudit } = require('../utils/auditLogger');
const { escapeLike } = require('../utils/helpers');
const { resolveOrCreateCustomer } = require('../database/customerAutoRegister');
const { registerGlobalTransaction, updateGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');

// Standard expected service delivery days catalog
function toDateOnly(val) {
    if (!val) return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(val);
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : toDateOnly(d);
}
const SERVICE_DEFAULT_DAYS = {
    'PAN Card': 12,
    'Aay Praman Patra': 10,
    'Niwas Praman Patra': 10,
    'Jati Praman Patra': 12,
    'Ration Card': 20,
    'Voter Card': 15,
    'Ayushman Card': 5,
    'PM Kisan': 15,
    'E-Shram / Shramik': 3,
    'Driving License': 25,
    'Passport': 30,
    'Other': 10
};

// ==========================================================================
// 1. GET /api/csc & /api/csc/applications - List Applications with Rich Filters
// ==========================================================================
router.get(['/', '/applications'], async (req, res) => {
    try {
        const { q, status, serviceType, paymentStatus, customerId, startDate, endDate, page, limit } = req.query;

        const userId = req.user?.UserID || 1;
        let whereClauses = ['a.IsActive = 1', 'a.UserID = @userId'];
        const params = { userId };

        if (q && q.trim()) {
            const rawQ = q.trim();
            const searchPattern = `%${escapeLike(rawQ)}%`;
            const cleanDigits = rawQ.replace(/\D/g, '');
            params.q = searchPattern;
            params.cleanDigits = cleanDigits;
            params.digitLike = cleanDigits ? `%${cleanDigits}%` : '';

            let digitClause = '';
            if (cleanDigits.length >= 3) {
                digitClause = ` OR REPLACE(REPLACE(ISNULL(a.CustomerAadhaar, ''), ' ', ''), '-', '') LIKE @digitLike OR REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitLike`;
            }

            whereClauses.push(`(
                a.CustomerName LIKE @q ESCAPE '\\' OR
                a.CustomerPhone LIKE @q ESCAPE '\\' OR
                a.CustomerAadhaar LIKE @q ESCAPE '\\' OR
                a.AckNumber LIKE @q ESCAPE '\\' OR
                a.CertificateDocNo LIKE @q ESCAPE '\\' OR
                a.PortalName LIKE @q ESCAPE '\\' OR
                a.SNCode LIKE @q ESCAPE '\\' OR
                a.ModuleCode LIKE @q ESCAPE '\\'${digitClause}
            )`);
        }

        if (status && status !== 'All') {
            if (status === 'ActivePending') {
                whereClauses.push(`a.Status IN ('Pending', 'Applied', 'Under Process')`);
            } else {
                whereClauses.push(`a.Status = @status`);
                params.status = status;
            }
        }

        if (serviceType && serviceType !== 'All') {
            whereClauses.push(`a.ServiceType = @serviceType`);
            params.serviceType = serviceType;
        }

        if (paymentStatus && paymentStatus !== 'All') {
            whereClauses.push(`a.PaymentStatus = @paymentStatus`);
            params.paymentStatus = paymentStatus;
        }

        if (customerId && parseInt(customerId) > 0) {
            whereClauses.push(`a.CustomerID = @customerId`);
            params.customerId = parseInt(customerId);
        }

        if (startDate) {
            whereClauses.push(`a.ApplyDate >= @startDate`);
            params.startDate = startDate;
        }

        if (endDate) {
            whereClauses.push(`a.ApplyDate < DATEADD(day, 1, CAST(@endDate AS DATE))`);
            params.endDate = endDate;
        }

        let paginationSql = '';
        if (limit && parseInt(limit) > 0) {
            const p = Math.max(1, parseInt(page) || 1);
            const lim = parseInt(limit);
            const offset = (p - 1) * lim;
            paginationSql = `OFFSET ${offset} ROWS FETCH NEXT ${lim} ROWS ONLY`;
        }

        const sql = `
            SELECT 
                a.*,
                COALESCE(a.DateOfBirth, c.DateOfBirth) as CustomerDOB,
                c.DateOfBirth as LinkedCustomerDOB,
                c.CustomerName as LinkedCustomerName,
                c.Phone as LinkedCustomerPhone,
                c.AadhaarNumber as LinkedCustomerAadhaar,
                c.CurrentBalance as LinkedCustomerBalance,
                DATEDIFF(day, a.ApplyDate, GETDATE()) as DaysPassed,
                CASE 
                    WHEN a.ExpectedDate IS NOT NULL AND a.Status NOT IN ('Delivered', 'Rejected') AND CAST(GETDATE() AS DATE) > a.ExpectedDate THEN 1 
                    ELSE 0 
                END as IsOverdue
            FROM CSCApplications a
            LEFT JOIN Customers c ON a.CustomerID = c.CustomerID
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY a.ApplyDate DESC, a.AppID DESC
            ${paginationSql}
        `;

        const result = await query(sql, params);
        res.json({
            success: true,
            count: result.recordset.length,
            data: result.recordset
        });
    } catch (err) {
        console.error('Error fetching CSC applications:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 2. GET /api/csc/stats - Summary KPI Metrics & Counts
// ==========================================================================
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const statsSql = `
            SELECT 
                COUNT(*) as TotalCount,
                SUM(CASE WHEN Status IN ('Pending', 'Applied', 'Under Process') THEN 1 ELSE 0 END) as PendingCount,
                SUM(CASE WHEN Status = 'Approved' THEN 1 ELSE 0 END) as ApprovedCount,
                SUM(CASE WHEN Status = 'Delivered' THEN 1 ELSE 0 END) as DeliveredCount,
                SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) as RejectedCount,
                ISNULL(SUM(TotalFee), 0) as TotalBilled,
                ISNULL(SUM(PaidAmount), 0) as TotalCollected,
                ISNULL(SUM(DueAmount), 0) as TotalDue,
                SUM(CASE WHEN ExpectedDate IS NOT NULL AND Status NOT IN ('Delivered', 'Rejected') AND CAST(GETDATE() AS DATE) > ExpectedDate THEN 1 ELSE 0 END) as OverdueCount
            FROM CSCApplications
            WHERE IsActive = 1 AND UserID = @userId;

            SELECT ServiceType, COUNT(*) as Count, ISNULL(SUM(TotalFee), 0) as Revenue
            FROM CSCApplications
            WHERE IsActive = 1 AND UserID = @userId
            GROUP BY ServiceType
            ORDER BY Count DESC;
        `;

        const result = await query(statsSql, { userId });
        const kpi = result.recordsets[0][0] || {};
        const serviceBreakdown = result.recordsets[1] || [];

        res.json({
            success: true,
            data: {
                totalCount: kpi.TotalCount || 0,
                pendingCount: kpi.PendingCount || 0,
                approvedCount: kpi.ApprovedCount || 0,
                deliveredCount: kpi.DeliveredCount || 0,
                rejectedCount: kpi.RejectedCount || 0,
                overdueCount: kpi.OverdueCount || 0,
                totalBilled: parseFloat(kpi.TotalBilled || 0),
                totalCollected: parseFloat(kpi.TotalCollected || 0),
                totalDue: parseFloat(kpi.TotalDue || 0),
                serviceBreakdown
            }
        });
    } catch (err) {
        console.error('Error fetching CSC stats:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 2.1 CSC SERVICES & DEFAULT FEES CONFIGURATION
// ==========================================================================

const DEFAULT_SERVER_CSC_SERVICES = [
    { ServiceID: 1, ServiceName: 'PAN Card (NSDL / UTI)', GovtFee: 107, OperatorFee: 50, TotalFee: 157, DefaultDays: 12, Icon: 'credit-card', IsActive: 1, SortOrder: 1 },
    { ServiceID: 2, ServiceName: 'Aay Praman Patra (Income Certificate)', GovtFee: 15, OperatorFee: 35, TotalFee: 50, DefaultDays: 10, Icon: 'file-text', IsActive: 1, SortOrder: 2 },
    { ServiceID: 3, ServiceName: 'Niwas Praman Patra (Domicile / Residence)', GovtFee: 15, OperatorFee: 35, TotalFee: 50, DefaultDays: 10, Icon: 'home', IsActive: 1, SortOrder: 3 },
    { ServiceID: 4, ServiceName: 'Jati Praman Patra (Caste Certificate)', GovtFee: 15, OperatorFee: 35, TotalFee: 50, DefaultDays: 12, Icon: 'landmark', IsActive: 1, SortOrder: 4 },
    { ServiceID: 5, ServiceName: 'Ration Card (नया / संशोधन / यूनिट)', GovtFee: 0, OperatorFee: 50, TotalFee: 50, DefaultDays: 20, Icon: 'wheat', IsActive: 1, SortOrder: 5 },
    { ServiceID: 6, ServiceName: 'Voter ID (Pehchan Patra / Form 6, 8)', GovtFee: 0, OperatorFee: 50, TotalFee: 50, DefaultDays: 15, Icon: 'vote', IsActive: 1, SortOrder: 6 },
    { ServiceID: 7, ServiceName: 'Ayushman Card (PMJAY Golden Card)', GovtFee: 0, OperatorFee: 30, TotalFee: 30, DefaultDays: 5, Icon: 'shield-check', IsActive: 1, SortOrder: 7 },
    { ServiceID: 8, ServiceName: 'PM Kisan (Registration / eKYC / Land)', GovtFee: 0, OperatorFee: 50, TotalFee: 50, DefaultDays: 15, Icon: 'tractor', IsActive: 1, SortOrder: 8 },
    { ServiceID: 9, ServiceName: 'E-Shram / Labour (Shramik Card)', GovtFee: 0, OperatorFee: 30, TotalFee: 30, DefaultDays: 3, Icon: 'hard-hat', IsActive: 1, SortOrder: 9 },
    { ServiceID: 10, ServiceName: 'Janma / Mrityu Praman Patra (Birth / Death)', GovtFee: 10, OperatorFee: 50, TotalFee: 60, DefaultDays: 15, Icon: 'baby', IsActive: 1, SortOrder: 10 },
    { ServiceID: 11, ServiceName: 'Driving License (Learner / Permanent)', GovtFee: 350, OperatorFee: 100, TotalFee: 450, DefaultDays: 25, Icon: 'car', IsActive: 1, SortOrder: 11 },
    { ServiceID: 12, ServiceName: 'Passport Seva', GovtFee: 1500, OperatorFee: 200, TotalFee: 1700, DefaultDays: 30, Icon: 'plane', SortOrder: 12 },
    { ServiceID: 13, ServiceName: 'Bijli Bill / Electricity Service', GovtFee: 0, OperatorFee: 20, TotalFee: 20, DefaultDays: 1, Icon: 'zap', SortOrder: 13 },
    { ServiceID: 14, ServiceName: 'Aadhaar Seva (Update / Correction / eKYC)', GovtFee: 50, OperatorFee: 30, TotalFee: 80, DefaultDays: 7, Icon: 'id-card', IsActive: 1, SortOrder: 14 },
    { ServiceID: 15, ServiceName: 'Anya Government / CSC Seva', GovtFee: 0, OperatorFee: 50, TotalFee: 50, DefaultDays: 10, Icon: 'package', IsActive: 1, SortOrder: 15 }
];

async function ensureCSCServicesTable() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS CSCServices (
                ServiceID INTEGER PRIMARY KEY AUTOINCREMENT,
                ServiceName TEXT NOT NULL,
                GovtFee NUMERIC DEFAULT 0.00,
                OperatorFee NUMERIC DEFAULT 50.00,
                DefaultDays INTEGER DEFAULT 10,
                Icon TEXT DEFAULT 'file-text',
                IsActive INTEGER DEFAULT 1,
                SortOrder INTEGER DEFAULT 0,
                CreatedAt TEXT DEFAULT (datetime('now', 'localtime')),
                UpdatedAt TEXT DEFAULT (datetime('now', 'localtime')),
                UserID INTEGER DEFAULT 1,
                Category TEXT DEFAULT 'General',
                ModuleCode TEXT DEFAULT 'CSC',
                CustomFieldsSchema TEXT
            )
        `);
    } catch (_) { }

    const cols = [
        { name: 'GovtFee', def: 'NUMERIC DEFAULT 0.00' },
        { name: 'OperatorFee', def: 'NUMERIC DEFAULT 50.00' },
        { name: 'DefaultDays', def: 'INTEGER DEFAULT 10' },
        { name: 'Icon', def: 'TEXT DEFAULT "file-text"' },
        { name: 'IsActive', def: 'INTEGER DEFAULT 1' },
        { name: 'SortOrder', def: 'INTEGER DEFAULT 0' },
        { name: 'UserID', def: 'INTEGER DEFAULT 1' },
        { name: 'CreatedAt', def: 'TEXT DEFAULT (datetime("now", "localtime"))' },
        { name: 'UpdatedAt', def: 'TEXT DEFAULT (datetime("now", "localtime"))' },
        { name: 'Category', def: 'TEXT DEFAULT "General"' },
        { name: 'ModuleCode', def: 'TEXT DEFAULT "CSC"' }
    ];
    for (const c of cols) {
        try {
            await query(`ALTER TABLE CSCServices ADD COLUMN ${c.name} ${c.def}`);
        } catch (_) { }
    }
}

async function seedDefaultCSCServices(userId = 1) {
    try {
        for (const s of DEFAULT_SERVER_CSC_SERVICES) {
            try {
                await query(`
                    INSERT INTO CSCServices (ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder, UserID)
                    VALUES (@ServiceName, @GovtFee, @OperatorFee, @DefaultDays, @Icon, 1, @SortOrder, @userId)
                `, { ...s, userId });
            } catch (_) { }
        }
    } catch (_) { }
}

// GET /api/csc/services - Sabhi services aur unki fees ki list fetch karein
router.get('/services', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const includeInactive = req.query.all === '1' || req.query.all === 'true';
        let result;
        try {
            const sql = `
                SELECT 
                    ServiceID, ServiceName, 
                    COALESCE(GovtFee, 0) AS GovtFee, 
                    COALESCE(OperatorFee, 0) AS OperatorFee, 
                    (COALESCE(GovtFee, 0) + COALESCE(OperatorFee, 0)) AS TotalFee,
                    COALESCE(DefaultDays, 10) AS DefaultDays, 
                    COALESCE(Icon, 'file-text') AS Icon, 
                    COALESCE(IsActive, 1) AS IsActive, 
                    COALESCE(SortOrder, 0) AS SortOrder, 
                    CreatedAt, UpdatedAt
                FROM CSCServices
                WHERE (UserID = @userId OR UserID IS NULL OR UserID = 1) ${includeInactive ? '' : 'AND (IsActive = 1 OR IsActive IS NULL)'}
                ORDER BY SortOrder ASC, ServiceName ASC
            `;
            result = await query(sql, { userId });
        } catch (dbErr) {
            console.warn('⚠️ [CSCServices] Auto-healing CSCServices table...', dbErr.message);
            await ensureCSCServicesTable();
            try {
                result = await query(`
                    SELECT 
                        ServiceID, ServiceName, 
                        COALESCE(GovtFee, 0) AS GovtFee, 
                        COALESCE(OperatorFee, 0) AS OperatorFee, 
                        (COALESCE(GovtFee, 0) + COALESCE(OperatorFee, 0)) AS TotalFee,
                        COALESCE(DefaultDays, 10) AS DefaultDays, 
                        COALESCE(Icon, 'file-text') AS Icon, 
                        COALESCE(IsActive, 1) AS IsActive, 
                        COALESCE(SortOrder, 0) AS SortOrder, 
                        CreatedAt, UpdatedAt
                    FROM CSCServices
                    ORDER BY SortOrder ASC, ServiceName ASC
                `);
            } catch (_) {
                result = { recordset: [] };
            }
        }

        // Agar database me koi service nahi mili to default starter services seed karein
        if (!result || !result.recordset || result.recordset.length === 0) {
            await seedDefaultCSCServices(userId);
            try {
                result = await query(`
                    SELECT 
                        ServiceID, ServiceName, 
                        COALESCE(GovtFee, 0) AS GovtFee, 
                        COALESCE(OperatorFee, 0) AS OperatorFee, 
                        (COALESCE(GovtFee, 0) + COALESCE(OperatorFee, 0)) AS TotalFee,
                        COALESCE(DefaultDays, 10) AS DefaultDays, 
                        COALESCE(Icon, 'file-text') AS Icon, 
                        COALESCE(IsActive, 1) AS IsActive, 
                        COALESCE(SortOrder, 0) AS SortOrder, 
                        CreatedAt, UpdatedAt
                    FROM CSCServices
                    ORDER BY SortOrder ASC, ServiceName ASC
                `);
            } catch (_) { }
        }

        res.json({
            success: true,
            data: result?.recordset && result.recordset.length > 0 ? result.recordset : DEFAULT_SERVER_CSC_SERVICES
        });
    } catch (err) {
        console.error('Error fetching CSC services (fail-safe fallback applied):', err.message);
        res.json({
            success: true,
            data: DEFAULT_SERVER_CSC_SERVICES
        });
    }
});

// POST /api/csc/services - Nayi service add karein
router.post('/services', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { ServiceName, GovtFee, OperatorFee, DefaultDays, Icon } = req.body || {};
        if (!ServiceName || !ServiceName.trim()) {
            return res.status(400).json({ success: false, error: 'Sewa ka naam (Service Name) zaroori hai.' });
        }
        const name = ServiceName.trim();
        const gFee = Math.max(0, parseFloat(GovtFee) || 0);
        const opFee = Math.max(0, parseFloat(OperatorFee) || 0);
        const days = Math.max(1, parseInt(DefaultDays) || 10);
        const iconName = (Icon || 'file-text').trim();

        // Duplicate name check
        const dupCheck = await query('SELECT ServiceID FROM CSCServices WHERE ServiceName = @name AND UserID = @userId', { name, userId });
        if (dupCheck.recordset.length > 0) {
            return res.status(400).json({ success: false, error: 'Yeh service pehle se maujood hai!' });
        }

        const maxSortRes = await query('SELECT ISNULL(MAX(SortOrder), 0) + 1 as NextSort FROM CSCServices WHERE UserID = @userId', { userId });
        const nextSort = maxSortRes.recordset[0].NextSort;

        const insertRes = await query(`
            INSERT INTO CSCServices (ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder, CreatedAt, UpdatedAt, UserID)
            OUTPUT INSERTED.*, (INSERTED.GovtFee + INSERTED.OperatorFee) AS TotalFee
            VALUES (@name, @gFee, @opFee, @days, @iconName, 1, @nextSort, GETDATE(), GETDATE(), @userId)
        `, {
            name,
            gFee,
            opFee,
            days,
            iconName,
            nextSort,
            userId
        });

        res.json({
            success: true,
            message: 'Nayi CSC service kamyabi se add ho gayi! ✅',
            data: insertRes.recordset[0]
        });
    } catch (err) {
        console.error('Error creating CSC service:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/csc/services/:id - Existing service aur fees update karein
router.put('/services/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;
        const { ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive } = req.body || {};

        if (!id) {
            return res.status(400).json({ success: false, error: 'Valid ServiceID zaroori hai.' });
        }
        if (ServiceName !== undefined && !ServiceName.trim()) {
            return res.status(400).json({ success: false, error: 'Service Name khali nahi ho sakta.' });
        }

        const currentRes = await query('SELECT * FROM CSCServices WHERE ServiceID = @id AND UserID = @userId', { id, userId });
        if (currentRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Service nahi mili.' });
        }
        const current = currentRes.recordset[0];

        const name = ServiceName !== undefined ? ServiceName.trim() : current.ServiceName;
        const gFee = GovtFee !== undefined ? Math.max(0, parseFloat(GovtFee) || 0) : current.GovtFee;
        const opFee = OperatorFee !== undefined ? Math.max(0, parseFloat(OperatorFee) || 0) : current.OperatorFee;
        const days = DefaultDays !== undefined ? Math.max(1, parseInt(DefaultDays) || 10) : current.DefaultDays;
        const iconName = Icon !== undefined ? (Icon || 'file-text').trim() : current.Icon;
        const active = IsActive !== undefined ? (IsActive ? 1 : 0) : current.IsActive;

        if (name !== current.ServiceName) {
            const dup = await query('SELECT ServiceID FROM CSCServices WHERE ServiceName = @name AND ServiceID <> @id AND UserID = @userId', { name, id, userId });
            if (dup.recordset.length > 0) {
                return res.status(400).json({ success: false, error: 'Is naam se doosri service pehle se hai!' });
            }
        }

        await query(`
            UPDATE CSCServices
            SET ServiceName = @name,
                GovtFee = @gFee,
                OperatorFee = @opFee,
                DefaultDays = @days,
                Icon = @iconName,
                IsActive = @active,
                UpdatedAt = GETDATE()
            WHERE ServiceID = @id AND UserID = @userId
        `, {
            id,
            name,
            gFee,
            opFee,
            days,
            iconName,
            active,
            userId
        });

        const updated = await query('SELECT *, (GovtFee + OperatorFee) AS TotalFee FROM CSCServices WHERE ServiceID = @id AND UserID = @userId', { id, userId });

        res.json({
            success: true,
            message: 'Service aur fees update ho gayi! ✅',
            data: updated.recordset[0]
        });
    } catch (err) {
        console.error('Error updating CSC service:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/csc/services/:id - Service delete ya deactivate karein
router.delete('/services/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;
        const hard = req.query.hard === '1';

        const serviceLookup = await query('SELECT ServiceName FROM CSCServices WHERE ServiceID = @id AND UserID = @userId', { id, userId });
        if (serviceLookup.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Service nahi mili.' });
        }
        const sName = serviceLookup.recordset[0].ServiceName;

        const usageCheck = await query('SELECT COUNT(*) as count FROM CSCApplications WHERE ServiceType = @sName AND UserID = @userId', { sName, userId });
        const usageCount = usageCheck.recordset[0].count;

        if (usageCount > 0 && !hard) {
            await query('UPDATE CSCServices SET IsActive = 0, UpdatedAt = GETDATE() WHERE ServiceID = @id AND UserID = @userId', { id, userId });
            return res.json({
                success: true,
                message: `Yeh service ${usageCount} aavedan me use ho chuki hai, isliye ise Deactivate (Inactive) kar diya gaya hai.`
            });
        }

        await query('DELETE FROM CSCServices WHERE ServiceID = @id AND UserID = @userId', { id, userId });
        res.json({
            success: true,
            message: 'Service list se hata di gayi! 🗑️'
        });
    } catch (err) {
        console.error('Error deleting CSC service:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 2.9 CSC EXCEL EXPORT, TEMPLATE & IMPORT
// ==========================================================================
router.get('/export/excel', async (req, res) => {
    await exportCSCToExcel(req.query, res, req.user?.UserID || 1);
});

router.get('/template/excel', async (req, res) => {
    await getCSCTemplateExcel(res);
});

router.post('/import/excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Kripya Excel file (.xlsx, .xls, .csv) upload karein.' });
        }
        const result = await importCSCFromExcel(req.file.buffer, req.file.originalname, req.user?.UserID || 1);
        res.json(result);
    } catch (err) {
        console.error('Error importing CSC excel:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 3. GET /api/csc/:id - Single Application Details
// ==========================================================================
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;
        const sql = `
            SELECT 
                a.*,
                COALESCE(a.DateOfBirth, c.DateOfBirth) as CustomerDOB,
                c.DateOfBirth as LinkedCustomerDOB,
                c.CustomerName as LinkedCustomerName,
                c.Phone as LinkedCustomerPhone,
                c.AadhaarNumber as LinkedCustomerAadhaar,
                c.CurrentBalance as LinkedCustomerBalance,
                c.Address as LinkedCustomerAddress
            FROM CSCApplications a
            LEFT JOIN Customers c ON a.CustomerID = c.CustomerID
            WHERE a.AppID = @id AND a.IsActive = 1 AND a.UserID = @userId
        `;
        const result = await query(sql, { id, userId });
        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Application nahi mili' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Error fetching CSC application by ID:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 4. POST /api/csc & /api/csc/applications - Create New Application
// ==========================================================================
router.post(['/', '/applications'], async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const b = req.body || {};
        const customerId = b.CustomerID !== undefined ? b.CustomerID : b.customerId;
        const customerName = b.CustomerName !== undefined ? b.CustomerName : b.customerName;
        const customerPhone = b.CustomerPhone !== undefined ? b.CustomerPhone : b.customerPhone;
        const customerAadhaar = b.CustomerAadhaar !== undefined ? b.CustomerAadhaar : b.customerAadhaar;
        const serviceType = b.ServiceType !== undefined ? b.ServiceType : b.serviceType;
        const ackNumber = b.AckNumber !== undefined ? b.AckNumber : b.ackNumber;
        const portalName = b.PortalName !== undefined ? b.PortalName : b.portalName;
        const applyDate = b.ApplyDate !== undefined ? b.ApplyDate : b.applyDate;
        const expectedDate = b.ExpectedDate !== undefined ? b.ExpectedDate : b.expectedDate;
        const govtFee = b.GovtFee !== undefined ? b.GovtFee : b.govtFee;
        const operatorFee = b.OperatorFee !== undefined ? b.OperatorFee : b.operatorFee;
        const totalFee = b.TotalFee !== undefined ? b.TotalFee : b.totalFee;
        const paidAmount = b.PaidAmount !== undefined ? b.PaidAmount : b.paidAmount;
        const paymentMode = b.PaymentMode !== undefined ? b.PaymentMode : b.paymentMode;
        const status = b.Status !== undefined ? b.Status : b.status;
        const statusRemarks = b.StatusRemarks !== undefined ? b.StatusRemarks : b.statusRemarks;
        const dob = b.DateOfBirth || b.CustomerDateOfBirth || b.dob || null;

        if (!customerName || !customerName.trim()) {
            return res.status(400).json({ success: false, error: 'Grahak ka naam zaroori hai.' });
        }
        if (!serviceType || !serviceType.trim()) {
            return res.status(400).json({ success: false, error: 'Service Type chunein.' });
        }

        function stripNamePrefix(name) {
            if (!name) return '';
            let s = String(name).trim();
            s = s.replace(/^(?:M\/s\.?|M\/S\.?|Shri\.?|Smt\.?|Sri\.?|Mr\.?|Mrs\.?|Ms\.?|Late\.?|Doctor\.?|Dr\.?)\s*/i, '');
            s = s.replace(/^[:\-–—#=\s]+/, '').trim();
            return s;
        }

        const cleanCustName = stripNamePrefix(customerName);
        const cleanPhone = (customerPhone || '').replace(/\D/g, '');
        const cleanAadhaar = (customerAadhaar || '').replace(/\D/g, '');

        const numGovtFee = Math.max(0, parseFloat(govtFee) || 0);
        let numOperatorFee = Math.max(0, parseFloat(operatorFee) || 0);
        let numTotalFee = Math.max(0, parseFloat(totalFee) || (numGovtFee + numOperatorFee));
        if (numTotalFee < numGovtFee) {
            return res.status(400).json({ success: false, error: 'Total Fee sarkari shulk (Govt Fee) se kam nahi ho sakti' });
        }
        if (Math.abs(numTotalFee - (numGovtFee + numOperatorFee)) > 0.01) {
            numOperatorFee = Math.max(0, numTotalFee - numGovtFee);
        }
        const numPaid = Math.max(0, parseFloat(paidAmount) || 0);
        if (numPaid > numTotalFee) {
            return res.status(400).json({ success: false, error: `Paid amount kul shulk (₹${numTotalFee}) se zyada nahi ho sakti` });
        }
        const numDue = Math.max(0, numTotalFee - numPaid);

        let payStatus = 'Paid';
        if (numDue > 0 && numPaid > 0) {
            payStatus = 'Partial';
        } else if (numDue > 0 && numPaid === 0) {
            payStatus = 'Pending';
        }

        // Auto-Register or Resolve Customer in Customers table
        // NOTE: Fee validation ke BAAD resolve karo — warna galat fee par naya
        // customer create ho jata aur request 400 se fail hone par orphan reh jata.
        const customerResolution = await resolveOrCreateCustomer({
            customerId: customerId && parseInt(customerId) > 0 ? parseInt(customerId) : null,
            customerName: cleanCustName,
            customerPhone: cleanPhone,
            customerAadhaar: cleanAadhaar,
            dob: dob,
            source: `CSC Aavedan (${serviceType.trim()})`,
            skipFamilyLink: !!(req.body.SkipFamilyLink || req.body.skipFamilyLink),
            userId
        });
        const resolvedCustomerId = customerResolution.customerId;

        // Electricity Bill metadata handling
        const isElectricity = /electricity|bijli/i.test(serviceType) || Boolean(b.ConsumerNumber || b.consumerNo);
        const consumerNo = (b.ConsumerNumber || b.consumerNo || '').toString().trim();
        const billNo = (b.BillNumber || b.billNo || '').toString().trim();
        const discom = (b.Discom || b.discom || 'MVVNL').toString().trim();
        const division = (b.Division || b.division || '').toString().trim();
        const subDivision = (b.SubDivision || b.subDivision || '').toString().trim();
        // NOTE: `||` ki jagah explicit "provided?" check — warna user ka
        // jaan-boojh kar bheja gaya 0 (jaise CommissionEarned: 0) ignore ho kar
        // default slab lag jata tha.
        const numFromBody = (...candidates) => {
            for (const raw of candidates) {
                if (raw === undefined || raw === null || raw === '') continue;
                const n = parseFloat(raw);
                if (Number.isFinite(n)) return n;
            }
            return NaN;
        };
        const totalBillAmt = Math.max(0, numFromBody(b.TotalBillAmount, b.totalBill) || 0);
        const remainingRaw = numFromBody(b.RemainingBill, b.remainingBill);
        const remainingBill = Number.isFinite(remainingRaw)
            ? Math.max(0, remainingRaw)
            : (totalBillAmt > 0 ? Math.max(0, totalBillAmt - numGovtFee) : 0);
        const custCharge = numOperatorFee;
        const commissionRaw = numFromBody(b.CommissionEarned, b.commission);
        const commEarned = Number.isFinite(commissionRaw)
            ? commissionRaw
            : (numGovtFee >= 200 && numGovtFee <= 2000 ? 15 : numGovtFee * 0.005);
        const netProfit = parseFloat((custCharge + commEarned).toFixed(2));

        let finalRemarks = (statusRemarks || '').trim();
        if (isElectricity) {
            const elecData = {
                consumerNo,
                billNo,
                discom,
                division,
                subDivision,
                totalBill: totalBillAmt,
                paidAmount: numPaid,
                remainingBill,
                customerCharge: custCharge,
                commission: commEarned,
                netProfit,
                paymentDate: b.PaymentDate || new Date().toISOString()
            };
            finalRemarks = JSON.stringify(elecData);
        }

        // Calculate expected delivery date if not specified
        let finalExpectedDate = expectedDate || null;
        if (!finalExpectedDate) {
            const addDays = isElectricity ? 0 : (SERVICE_DEFAULT_DAYS[serviceType] || 10);
            const expDateObj = new Date();
            expDateObj.setDate(expDateObj.getDate() + addDays);
            // Local date (toISOString UTC hota hai - IST me ek din peeche)
            const ey = expDateObj.getFullYear();
            const em = String(expDateObj.getMonth() + 1).padStart(2, '0');
            const ed = String(expDateObj.getDate()).padStart(2, '0');
            finalExpectedDate = `${ey}-${em}-${ed}`;
        }

        const insertSql = `
            INSERT INTO CSCApplications (
                CustomerID, CustomerName, CustomerPhone, CustomerAadhaar, DateOfBirth,
                ServiceType, ServiceSubtype, AckNumber, PortalName,
                ApplyDate, ExpectedDate,
                GovtFee, OperatorFee, TotalFee, PaidAmount, DueAmount,
                PaymentStatus, PaymentMode, Status, StatusRemarks, CertificateDocNo, UserID,
                ExtraFieldsJson
            )
            OUTPUT INSERTED.AppID
            VALUES (
                @customerId, @customerName, @customerPhone, @customerAadhaar, @dob,
                @serviceType, @serviceSubtype, @ackNumber, @portalName,
                ISNULL(@applyDate, GETDATE()), @expectedDate,
                @govtFee, @operatorFee, @totalFee, @paidAmount, @dueAmount,
                @paymentStatus, @paymentMode, ISNULL(@status, 'Applied'), @statusRemarks, @certDocNo, @userId,
                @extraFieldsJson
            )
        `;

        let newId = null;
        let insertRecord = null;
        let globalTxn = null;
        let khataInfo = null;

        // Atomic Execution: Insert CSC Application + Universal SN + Accounting Transactions in one DB Transaction
        await withTransaction(async (tQuery) => {
            // User-scoped cash and bank account lookup (prevents cross-user pollution)
            const cashAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Cash' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
            const bankAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Bank' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
            const userCashAccId = cashAcc.recordset[0]?.AccountID || (userId === 1 ? 1 : null);
            const userBankAccId = bankAcc.recordset[0]?.AccountID || (userId === 1 ? 2 : null);

            const insertRes = await tQuery(insertSql, {
                customerId: resolvedCustomerId,
                customerName: cleanCustName,
                customerPhone: cleanPhone || null,
                customerAadhaar: cleanAadhaar || null,
                dob: dob || null,
                serviceType: isElectricity ? 'Bijli Bill / Electricity Service' : serviceType.trim(),
                serviceSubtype: isElectricity && discom ? (discom + (division ? ' - ' + division : '')) : null,
                ackNumber: (ackNumber || '').trim() || null,
                portalName: (portalName || '').trim() || (isElectricity ? 'UPPCL eWallet (CSC)' : null),
                applyDate: applyDate || new Date(),
                expectedDate: finalExpectedDate,
                govtFee: numGovtFee,
                operatorFee: numOperatorFee,
                totalFee: numTotalFee,
                paidAmount: numPaid,
                dueAmount: numDue,
                paymentStatus: payStatus,
                paymentMode: paymentMode || 'Cash',
                status: isElectricity ? 'Delivered' : (status || 'Applied'),
                statusRemarks: finalRemarks || null,
                certDocNo: isElectricity && consumerNo ? consumerNo : null,
                extraFieldsJson: req.body.ExtraFieldsJson ? (typeof req.body.ExtraFieldsJson === 'object' ? JSON.stringify(req.body.ExtraFieldsJson) : String(req.body.ExtraFieldsJson)) : null,
                userId
            });

            newId = insertRes.recordset[0].AppID;
            insertRecord = insertRes.recordset[0];

            // Universal Global Transaction Registry (Rule 4 Atomic Registration)
            try {
                globalTxn = await registerGlobalTransaction({
                    sourceModule: 'CSC',
                    recordId: newId,
                    entityName: cleanCustName,
                    amount: numTotalFee,
                    transDate: applyDate || new Date(),
                    createdAt: new Date(),
                    userId
                }, tQuery);
            } catch (regErr) {
                console.error('Failed to register global transaction for CSC:', regErr);
                throw new Error('Universal SN Registry me CSC register nahi ho saka: ' + regErr.message);
            }

            // === AUTO-ACCOUNT POSTING FOR ELECTRICITY BILL ===
            if (isElectricity && numGovtFee > 0) {
                const walletAccId = userBankAccId;
                const cashAccId = userCashAccId;

                if (walletAccId) {
                    await tQuery(`
                        INSERT INTO Transactions (
                            TransDate, TransTime, TransType, Amount, AccountID,
                            Description, Reference, UserID, Tags,
                            SourceModule, SourceID, LineType,
                            GlobalSerialNo, SNCode, ModuleCode
                        )
                        VALUES (
                            CAST(GETDATE() AS DATE), CAST(GETDATE() AS TIME), 'Expense', @amt, @accId,
                            @desc, @ref, @userId, 'UPPCL_BILL_OUT',
                            'CSC', @appId, 'UPPCL_OUT',
                            @sn, @snCode, @modCode
                        )
                    `, {
                        amt: numGovtFee,
                        accId: walletAccId,
                        desc: `UPPCL Bijli Bill Paid - Consumer: ${consumerNo} (${cleanCustName}) [${discom}]`,
                        ref: `APP-${newId}`,
                        userId,
                        appId: newId,
                        sn: globalTxn?.globalSerialNo,
                        snCode: globalTxn?.snCode,
                        modCode: globalTxn?.moduleCode
                    });
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: walletAccId });
                }

                if (cashAccId && numPaid > 0) {
                    await tQuery(`
                        INSERT INTO Transactions (
                            TransDate, TransTime, TransType, Amount, AccountID,
                            Description, Reference, UserID, Tags,
                            SourceModule, SourceID, LineType,
                            GlobalSerialNo, SNCode, ModuleCode
                        )
                        VALUES (
                            CAST(GETDATE() AS DATE), CAST(GETDATE() AS TIME), 'Income', @amt, @accId,
                            @desc, @ref, @userId, 'UPPCL_BILL_IN',
                            'CSC', @appId, 'UPPCL_IN',
                            @sn, @snCode, @modCode
                        )
                    `, {
                        amt: numPaid,
                        accId: cashAccId,
                        desc: `Cash for Bijli Bill - Consumer: ${consumerNo} (${cleanCustName}) [Bill: ₹${numGovtFee} + Fee: ₹${custCharge}]`,
                        ref: `APP-${newId}`,
                        userId,
                        appId: newId,
                        sn: globalTxn?.globalSerialNo,
                        snCode: globalTxn?.snCode,
                        modCode: globalTxn?.moduleCode
                    });
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: cashAccId });
                }
            } else if (!isElectricity && numPaid > 0) {
                // === AUTO-ACCOUNT POSTING FOR STANDARD CSC CITIZEN SERVICES (PAN, CERTIFICATES, RATION) ===
                const isOnline = Boolean(paymentMode && /bank|online|upi|net\s*banking|qr/i.test(paymentMode));
                const targetAccId = isOnline ? userBankAccId : userCashAccId;
                const walletAccId = userBankAccId;

                if (targetAccId) {
                    await tQuery(`
                        INSERT INTO Transactions (
                            TransDate, TransTime, TransType, Amount, AccountID,
                            Description, Reference, UserID, Tags,
                            SourceModule, SourceID, LineType,
                            GlobalSerialNo, SNCode, ModuleCode
                        )
                        VALUES (
                            CAST(GETDATE() AS DATE), CAST(GETDATE() AS TIME), 'Income', @amt, @accId,
                            @desc, @ref, @userId, 'CSC_FEE_IN',
                            'CSC', @appId, 'FEE_IN',
                            @sn, @snCode, @modCode
                        )
                    `, {
                        amt: numPaid,
                        accId: targetAccId,
                        desc: `CSC Fee - ${serviceType} (${cleanCustName})${ackNumber ? ' [Ack: ' + ackNumber + ']' : ''}`,
                        ref: `APP-${newId}`,
                        userId,
                        appId: newId,
                        sn: globalTxn?.globalSerialNo,
                        snCode: globalTxn?.snCode,
                        modCode: globalTxn?.moduleCode
                    });
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: targetAccId });
                }

                if (numGovtFee > 0 && walletAccId) {
                    await tQuery(`
                        INSERT INTO Transactions (
                            TransDate, TransTime, TransType, Amount, AccountID,
                            Description, Reference, UserID, Tags,
                            SourceModule, SourceID, LineType,
                            GlobalSerialNo, SNCode, ModuleCode
                        )
                        VALUES (
                            CAST(GETDATE() AS DATE), CAST(GETDATE() AS TIME), 'Expense', @amt, @accId,
                            @desc, @ref, @userId, 'CSC_GOVT_FEE_OUT',
                            'CSC', @appId, 'GOVT_OUT',
                            @sn, @snCode, @modCode
                        )
                    `, {
                        amt: numGovtFee,
                        accId: walletAccId,
                        desc: `CSC Govt Fee - ${serviceType} (${cleanCustName})${ackNumber ? ' [Ack: ' + ackNumber + ']' : ''}`,
                        ref: `APP-${newId}`,
                        userId,
                        appId: newId,
                        sn: globalTxn?.globalSerialNo,
                        snCode: globalTxn?.snCode,
                        modCode: globalTxn?.moduleCode
                    });
                    await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: walletAccId });
                }
            }
            // === KHATA AUTO-LINK + ADVANCE SETTLEMENT ===
            // CSC shulk aur jama ko customer ke Khatabook me auto-record karo,
            // phir advance se pending dues auto-settle karo (All-in-one atomic transaction).
            if (resolvedCustomerId) {
                await syncCSCToKhata(tQuery, {
                    CustomerID: resolvedCustomerId,
                    CSCAppID: newId,
                    TotalFee: numTotalFee,
                    PaidAmount: numPaid,
                    EntryDate: toDateOnly(applyDate),
                    PaymentMode: paymentMode || 'Cash',
                    ServiceType: serviceType,
                    UserID: userId
                });
                khataInfo = await processKhataAfterChange(tQuery, resolvedCustomerId);
            }
        });

        await logAudit({
            action: 'CREATE',
            module: 'CSC Tracker',
            tableName: 'CSCApplications',
            recordId: newId,
            entityName: cleanCustName,
            amount: numTotalFee,
            description: `CSC Aavedan Joda: ${serviceType} (₹${numTotalFee.toLocaleString('en-IN')}) - ${cleanCustName}`,
            newData: insertRecord,
            details: `Service: ${serviceType}, Total: ₹${numTotalFee}, Paid: ₹${numPaid}, Due: ₹${numDue}, Ack: ${ackNumber || 'N/A'}, Status: ${status || 'Applied'}`
        });

        res.status(201).json({
            success: true,
            message: customerResolution.isNew
                ? `Grahak '${cleanCustName}' auto-register ho gaye aur aavedan save ho gaya!`
                : 'CSC Form Application safaltapoorvak save ho gaya!',
            appId: newId,
            globalSerialNo: globalTxn?.globalSerialNo || null,
            snCode: globalTxn?.snCode || null,
            moduleCode: globalTxn?.moduleCode || null,
            customerId: resolvedCustomerId,
            autoRegisteredCustomer: customerResolution.isNew ? customerResolution.customer : null,
            khataSettled: khataInfo && khataInfo.settled ? khataInfo.settled : []
        });
    } catch (err) {
        console.error('Error creating CSC application:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 5. PATCH /api/csc/:id/status - Fast Status & Certificate Update
// ==========================================================================
router.patch('/:id/status', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const status = b.Status !== undefined ? b.Status : b.status;
        const statusRemarks = b.StatusRemarks !== undefined ? b.StatusRemarks : b.statusRemarks;
        const certificateDocNo = b.CertificateDocNo !== undefined ? b.CertificateDocNo : b.certificateDocNo;
        const certificateFile = b.CertificateFile !== undefined ? b.CertificateFile : b.certificateFile;
        const collectDue = b.CollectDue !== undefined ? b.CollectDue : b.collectDue;
        let paidAmountAdd = b.PaidAmountAdd !== undefined ? b.PaidAmountAdd : b.paidAmountAdd;

        if (!status) {
            return res.status(400).json({ success: false, error: 'Status zaroori hai.' });
        }

        // Fetch current application
        const userId = req.user?.UserID || 1;
        const curRes = await query('SELECT * FROM CSCApplications WHERE AppID = @id AND IsActive = 1 AND UserID = @userId', { id, userId });
        if (curRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Application nahi mili' });
        }
        const cur = curRes.recordset[0];

        if (collectDue) {
            paidAmountAdd = parseFloat(cur.DueAmount) || 0;
        }

        let completionDate = cur.CompletionDate;
        if (['Approved', 'Delivered'].includes(status) && !completionDate) {
            completionDate = new Date();
        }

        let newPaid = Math.max(0, parseFloat(cur.PaidAmount) || 0);
        const totalFee = Math.max(0, parseFloat(cur.TotalFee) || 0);
        const curDue = Math.max(0, totalFee - newPaid);

        if (paidAmountAdd !== undefined && paidAmountAdd !== null) {
            const addAmt = Math.max(0, parseFloat(paidAmountAdd) || 0);
            if (addAmt > 0) {
                if (addAmt > curDue) {
                    return res.status(400).json({ success: false, error: `Payment amount baaki shulk (₹${curDue}) se zyada nahi ho sakti` });
                }
                newPaid += addAmt;
            }
        }
        const newDue = Math.max(0, totalFee - newPaid);

        let payStatus = cur.PaymentStatus;
        if (newDue <= 0) payStatus = 'Paid';
        else if (newPaid > 0) payStatus = 'Partial';
        else payStatus = 'Pending';

        const updateSql = `
            UPDATE CSCApplications
            SET 
                Status = @status,
                StatusRemarks = ISNULL(@statusRemarks, StatusRemarks),
                CertificateDocNo = ISNULL(@certificateDocNo, CertificateDocNo),
                CertificateFile = ISNULL(@certificateFile, CertificateFile),
                CompletionDate = @completionDate,
                PaidAmount = @newPaid,
                DueAmount = @newDue,
                PaymentStatus = @payStatus,
                UpdatedAt = GETDATE()
            WHERE AppID = @id AND IsActive = 1 AND UserID = @userId
        `;

        const oldPaid = parseFloat(cur.PaidAmount) || 0;
        const paymentChanged = newPaid !== oldPaid;

        await withTransaction(async (tQuery) => {
            await tQuery(updateSql, {
                id,
                userId,
                status,
                statusRemarks: statusRemarks !== undefined ? statusRemarks : null,
                certificateDocNo: certificateDocNo !== undefined ? certificateDocNo : null,
                certificateFile: certificateFile !== undefined ? certificateFile : null,
                completionDate,
                newPaid,
                newDue,
                payStatus
            });

            // === KHATA RE-SYNC + ADVANCE SETTLEMENT (payment badla ho to) ===
            // Agar is status-update me payment (collectDue / PaidAmountAdd) darj hui,
            // to CSC ke charge/jama ko Khatabook me dobara reconcile karo
            if (paymentChanged && cur.CustomerID) {
                await syncCSCToKhata(tQuery, {
                    CustomerID: cur.CustomerID,
                    CSCAppID: id,
                    TotalFee: totalFee,
                    PaidAmount: newPaid,
                    EntryDate: toDateOnly(cur.ApplyDate),
                    PaymentMode: cur.PaymentMode,
                    ServiceType: cur.ServiceType,
                    UserID: userId
                });
                await processKhataAfterChange(tQuery, cur.CustomerID);
            }

            // === GAP-1 FIX: Mirror Income row ko naye PaidAmount se sync karo ===
            const txnAcc = await tQuery(`
                SELECT TOP 1 TransactionID, AccountID FROM Transactions
                WHERE UserID = @userId AND SourceModule = 'CSC' AND SourceID = @id AND LineType = 'FEE_IN' AND IsDeleted = 0
            `, { userId, id });
            if (txnAcc.recordset.length && newPaid > 0) {
                await tQuery(`UPDATE Transactions SET Amount = @amt, UpdatedAt = GETDATE() WHERE TransactionID = @txnId`,
                    { amt: newPaid, txnId: txnAcc.recordset[0].TransactionID });
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: txnAcc.recordset[0].AccountID });
            }

            // Propagate Universal SN to any new Transactions in status update
            if (cur.GlobalSerialNo) {
                await tQuery(`
                    UPDATE Transactions
                    SET GlobalSerialNo = @sn, SNCode = @snCode, ModuleCode = @modCode
                    WHERE UserID = @userId AND GlobalSerialNo IS NULL
                      AND SourceModule = 'CSC' AND SourceID = @id
                `, {
                    sn: cur.GlobalSerialNo,
                    snCode: cur.SNCode,
                    modCode: cur.ModuleCode,
                    userId,
                    id
                });
            }
        });

        await logAudit({
            action: 'UPDATE',
            module: 'CSC Tracker',
            tableName: 'CSCApplications',
            recordId: id,
            entityName: cur.CustomerName,
            amount: parseFloat(paidAmountAdd) || null,
            description: `CSC Status Badla: ${cur.ServiceType} (${cur.CustomerName}) -> ${status}`,
            oldData: { Status: cur.Status, PaidAmount: cur.PaidAmount, DueAmount: cur.DueAmount },
            newData: { Status: status, PaidAmount: newPaid, DueAmount: newDue, CertificateDocNo: certificateDocNo },
            details: `Status: ${cur.Status} -> ${status}, Paid: ₹${cur.PaidAmount} -> ₹${newPaid}, Due: ₹${newDue}`
        });

        res.json({
            success: true,
            message: `Status updated to ${status}!`
        });
    } catch (err) {
        console.error('Error updating CSC status:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 6. PUT /api/csc/:id - Edit Full Application Details
// ==========================================================================
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'Application ID galat hai' });
        }
        const b = req.body || {};

        // Purana record lo - jo field body me nahi aayi wahi DB value rahe,
        // warna partial edit se PaidAmount 0 ho jata tha (paisa record kho deta tha)
        const userId = req.user?.UserID || 1;
        const curRes = await query('SELECT * FROM CSCApplications WHERE AppID = @id AND IsActive = 1 AND UserID = @userId', { id, userId });
        if (!curRes.recordset.length) {
            return res.status(404).json({ success: false, error: 'Application nahi mili' });
        }
        const cur = curRes.recordset[0];

        const pick = (camel, snake, dbVal) => {
            const v = b[camel] !== undefined ? b[camel] : (b[snake] !== undefined ? b[snake] : dbVal);
            return v;
        };

        const customerName = pick('CustomerName', 'customerName', cur.CustomerName);
        const customerPhone = pick('CustomerPhone', 'customerPhone', cur.CustomerPhone);
        const customerAadhaar = pick('CustomerAadhaar', 'customerAadhaar', cur.CustomerAadhaar);
        const serviceType = pick('ServiceType', 'serviceType', cur.ServiceType);
        const serviceSubtype = pick('ServiceSubtype', 'serviceSubtype', cur.ServiceSubtype);
        const ackNumber = pick('AckNumber', 'ackNumber', cur.AckNumber);
        const portalName = pick('PortalName', 'portalName', cur.PortalName);
        const applyDate = pick('ApplyDate', 'applyDate', cur.ApplyDate);
        const expectedDate = pick('ExpectedDate', 'expectedDate', cur.ExpectedDate);
        const govtFee = pick('GovtFee', 'govtFee', cur.GovtFee);
        const operatorFee = pick('OperatorFee', 'operatorFee', cur.OperatorFee);
        const totalFee = pick('TotalFee', 'totalFee', cur.TotalFee);
        const paidAmount = pick('PaidAmount', 'paidAmount', cur.PaidAmount);
        const paymentMode = pick('PaymentMode', 'paymentMode', cur.PaymentMode);
        const status = pick('Status', 'status', cur.Status);
        const statusRemarks = pick('StatusRemarks', 'statusRemarks', cur.StatusRemarks);
        const certificateDocNo = pick('CertificateDocNo', 'certificateDocNo', cur.CertificateDocNo);
        const certificateFile = pick('CertificateFile', 'certificateFile', cur.CertificateFile);

        const numGovtFee = Math.max(0, parseFloat(govtFee) || 0);
        let numOperatorFee = Math.max(0, parseFloat(operatorFee) || 0);
        let numTotalFee = Math.max(0, parseFloat(totalFee) || (numGovtFee + numOperatorFee));
        if (numTotalFee < numGovtFee) {
            return res.status(400).json({ success: false, error: 'Total Fee sarkari shulk (Govt Fee) se kam nahi ho sakti' });
        }
        if (Math.abs(numTotalFee - (numGovtFee + numOperatorFee)) > 0.01) {
            numOperatorFee = Math.max(0, numTotalFee - numGovtFee);
        }
        const numPaid = Math.max(0, parseFloat(paidAmount) || 0);
        if (numPaid > numTotalFee) {
            return res.status(400).json({ success: false, error: `Paid amount kul shulk (₹${numTotalFee}) se zyada nahi ho sakti` });
        }
        const numDue = Math.max(0, numTotalFee - numPaid);

        let payStatus = 'Paid';
        if (numDue > 0 && numPaid > 0) payStatus = 'Partial';
        else if (numDue > 0 && numPaid === 0) payStatus = 'Pending';

        const cleanPhone = (customerPhone || '').replace(/\D/g, '');
        const cleanAadhaar = (customerAadhaar || '').replace(/\D/g, '');

        let targetCustId = b.CustomerID !== undefined ? (b.CustomerID ? parseInt(b.CustomerID) : null) : cur.CustomerID;
        const dob = b.DateOfBirth || b.CustomerDateOfBirth || b.dob || null;

        const updateSql = `
            UPDATE CSCApplications
            SET
                CustomerID = @customerId,
                CustomerName = @customerName,
                CustomerPhone = @customerPhone,
                CustomerAadhaar = @customerAadhaar,
                DateOfBirth = COALESCE(@dob, DateOfBirth),
                ServiceType = @serviceType,
                ServiceSubtype = @serviceSubtype,
                AckNumber = @ackNumber,
                PortalName = @portalName,
                ApplyDate = @applyDate,
                ExpectedDate = @expectedDate,
                GovtFee = @govtFee,
                OperatorFee = @operatorFee,
                TotalFee = @totalFee,
                PaidAmount = @paidAmount,
                DueAmount = @dueAmount,
                PaymentStatus = @paymentStatus,
                PaymentMode = @paymentMode,
                Status = @status,
                StatusRemarks = @statusRemarks,
                CertificateDocNo = @certificateDocNo,
                CertificateFile = @certificateFile,
                UpdatedAt = GETDATE()
            WHERE AppID = @id AND IsActive = 1 AND UserID = @userId
        `;

        await withTransaction(async (tQuery) => {
            const customerResolution = await resolveOrCreateCustomer({
                customerId: targetCustId,
                customerName: customerName.trim(),
                customerPhone: cleanPhone,
                customerAadhaar: cleanAadhaar,
                dob: dob,
                source: `CSC Aavedan Update (${serviceType.trim()})`,
                userId
            }, tQuery);
            const resolvedCustomerId = customerResolution.customerId;

            await tQuery(updateSql, {
                id,
                userId,
                customerId: resolvedCustomerId,
                customerName: customerName.trim(),
                customerPhone: cleanPhone || null,
                customerAadhaar: cleanAadhaar || null,
                dob: dob || null,
                serviceType: serviceType.trim(),
                serviceSubtype: (serviceSubtype || '').trim() || null,
                ackNumber: (ackNumber || '').trim() || null,
                portalName: (portalName || '').trim() || null,
                applyDate: applyDate || new Date(),
                expectedDate: expectedDate || null,
                govtFee: numGovtFee,
                operatorFee: numOperatorFee,
                totalFee: numTotalFee,
                paidAmount: numPaid,
                dueAmount: numDue,
                paymentStatus: payStatus,
                paymentMode: paymentMode || 'Cash',
                status: status || 'Applied',
                statusRemarks: (statusRemarks || '').trim() || null,
                certificateDocNo: (certificateDocNo || '').trim() || null,
                certificateFile: (certificateFile || '').trim() || null
            });

            // === ATOMIC KHATA RE-SYNC + ADVANCE SETTLEMENT ===
            if (resolvedCustomerId) {
                await syncCSCToKhata(tQuery, {
                    CustomerID: resolvedCustomerId,
                    CSCAppID: id,
                    TotalFee: numTotalFee,
                    PaidAmount: numPaid,
                    EntryDate: toDateOnly(applyDate),
                    PaymentMode: paymentMode || 'Cash',
                    ServiceType: serviceType,
                    UserID: userId
                });
                await processKhataAfterChange(tQuery, resolvedCustomerId);
            }

            // === CASHBOOK / TRANSACTIONS LEDGER SYNCHRONIZATION ===
            const cleanCustName = customerName.trim();
            const oldAck = (cur.AckNumber || '').trim();
            const newAck = (ackNumber || '').trim();
            const appRef = `APP-${id}`;

            // Check if oldAck is shared with another active application
            let allowOldAck = 0;
            if (oldAck.length > 0) {
                const otherWithAck = await tQuery(`
                    SELECT TOP 1 AppID FROM CSCApplications 
                    WHERE UserID = @userId AND AppID != @id AND IsActive = 1 AND AckNumber = @oldAck
                `, { userId, id, oldAck });
                if (otherWithAck.recordset.length === 0) {
                    allowOldAck = 1;
                }
            }

            // User-scoped cash and bank account lookup (prevents cross-user pollution)
            const cashAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Cash' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
            const bankAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Bank' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
            const userCashAccId = cashAcc.recordset[0]?.AccountID || (userId === 1 ? 1 : null);
            const userBankAccId = bankAcc.recordset[0]?.AccountID || (userId === 1 ? 2 : null);

            // Resolve target receiving account: APNA BANK if online, else PHYSICAL CASH
            const effPayMode = (paymentMode || 'Cash').toLowerCase();
            const isOnline = ['bank', 'online', 'netbanking', 'upi', 'gpay', 'phonepe', 'paytm'].some(m => effPayMode.includes(m));
            const targetAccId = isOnline ? userBankAccId : userCashAccId;
            const walletAccId = userBankAccId; // Govt fee always cuts online from user's bank account

            // 1. Sync Income Transaction (CSC_FEE_IN)
            const feeInCheck = await tQuery(`
                SELECT TransactionID, AccountID FROM Transactions 
                WHERE UserID = @userId AND SourceModule = 'CSC' AND SourceID = @id AND LineType = 'FEE_IN' AND IsDeleted = 0
            `, { userId, id });

            if (feeInCheck.recordset.length > 0) {
                const txn = feeInCheck.recordset[0];
                const oldIncomeAccId = txn.AccountID;
                if (numPaid > 0 && targetAccId) {
                    await tQuery(`
                        UPDATE Transactions 
                        SET Amount = @amt, AccountID = @accId, Reference = @ref,
                            Description = @desc, TransDate = @date, UpdatedAt = GETDATE()
                        WHERE TransactionID = @txnId
                    `, {
                        amt: numPaid,
                        accId: targetAccId,
                        ref: appRef,
                        desc: `CSC Fee - ${serviceType.trim()} (${cleanCustName})${newAck ? ' [Ack: ' + newAck + ']' : ''}`,
                        date: applyDate || new Date(),
                        txnId: txn.TransactionID
                    });
                    if (oldIncomeAccId && oldIncomeAccId !== targetAccId) {
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: oldIncomeAccId });
                    }
                } else {
                    await tQuery(`UPDATE Transactions SET IsDeleted = 1 WHERE TransactionID = @txnId`, { txnId: txn.TransactionID });
                    if (oldIncomeAccId) {
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: oldIncomeAccId });
                    }
                }
            } else if (numPaid > 0 && targetAccId) {
                await tQuery(`
                    INSERT INTO Transactions (
                        TransDate, TransTime, TransType, Amount, AccountID,
                        Description, Reference, UserID, Tags,
                        SourceModule, SourceID, LineType
                    )
                    VALUES (
                        @date, CAST(GETDATE() AS TIME), 'Income', @amt, @accId,
                        @desc, @ref, @userId, 'CSC_FEE_IN',
                        'CSC', @id, 'FEE_IN'
                    )
                `, {
                    date: applyDate || new Date(),
                    amt: numPaid,
                    accId: targetAccId,
                    desc: `CSC Fee - ${serviceType.trim()} (${cleanCustName})${newAck ? ' [Ack: ' + newAck + ']' : ''}`,
                    ref: appRef,
                    userId,
                    id
                });
            }
            if (targetAccId) {
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: targetAccId });
            }

            // 2. Sync Govt Fee Outflow Transaction (CSC_GOVT_FEE_OUT)
            const govtOutCheck = await tQuery(`
                SELECT TransactionID, AccountID FROM Transactions 
                WHERE UserID = @userId AND SourceModule = 'CSC' AND SourceID = @id AND LineType = 'GOVT_OUT' AND IsDeleted = 0
            `, { userId, id });

            if (govtOutCheck.recordset.length > 0) {
                const txn = govtOutCheck.recordset[0];
                const oldGovtAccId = txn.AccountID;
                if (numGovtFee > 0 && walletAccId) {
                    await tQuery(`
                        UPDATE Transactions 
                        SET Amount = @amt, AccountID = @accId, Reference = @ref,
                            Description = @desc, TransDate = @date, UpdatedAt = GETDATE()
                        WHERE TransactionID = @txnId
                    `, {
                        amt: numGovtFee,
                        accId: walletAccId,
                        ref: appRef,
                        desc: `CSC Govt Fee - ${serviceType.trim()} (${cleanCustName})${newAck ? ' [Ack: ' + newAck + ']' : ''}`,
                        date: applyDate || new Date(),
                        txnId: txn.TransactionID
                    });
                    if (oldGovtAccId && oldGovtAccId !== walletAccId) {
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: oldGovtAccId });
                    }
                } else {
                    await tQuery(`UPDATE Transactions SET IsDeleted = 1 WHERE TransactionID = @txnId`, { txnId: txn.TransactionID });
                    if (oldGovtAccId) {
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: oldGovtAccId });
                    }
                }
            } else if (numGovtFee > 0 && walletAccId) {
                await tQuery(`
                    INSERT INTO Transactions (
                        TransDate, TransTime, TransType, Amount, AccountID,
                        Description, Reference, UserID, Tags,
                        SourceModule, SourceID, LineType
                    )
                    VALUES (
                        @date, CAST(GETDATE() AS TIME), 'Expense', @amt, @accId,
                        @desc, @ref, @userId, 'CSC_GOVT_FEE_OUT',
                        'CSC', @id, 'GOVT_OUT'
                    )
                `, {
                    date: applyDate || new Date(),
                    amt: numGovtFee,
                    accId: walletAccId,
                    desc: `CSC Govt Fee - ${serviceType.trim()} (${cleanCustName})${newAck ? ' [Ack: ' + newAck + ']' : ''}`,
                    ref: appRef,
                    userId,
                    id
                });
            }
            if (walletAccId) {
                await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: walletAccId });
            }

            // Update Universal Global Transaction Registry
            try {
                await updateGlobalTransaction({
                    sourceModule: 'CSC',
                    recordId: id,
                    entityName: customerName.trim(),
                    amount: numTotalFee,
                    transDate: applyDate || new Date()
                }, tQuery);

                // Propagate Universal SN to child Transactions on edit
                const cscSnRes = await tQuery(`SELECT GlobalSerialNo, SNCode, ModuleCode FROM CSCApplications WHERE AppID = @id`, { id });
                const cscSn = cscSnRes.recordset[0];
                if (cscSn?.GlobalSerialNo) {
                    await tQuery(`
                        UPDATE Transactions
                        SET GlobalSerialNo = @GlobalSerialNo, SNCode = @SNCode, ModuleCode = @ModuleCode
                        WHERE SourceModule = 'CSC' AND SourceID = @id
                          AND (GlobalSerialNo IS NULL OR GlobalSerialNo = 0)
                    `, {
                        GlobalSerialNo: cscSn.GlobalSerialNo,
                        SNCode: cscSn.SNCode,
                        ModuleCode: cscSn.ModuleCode,
                        id
                    });
                }
            } catch (regErr) {
                console.error('Failed to update UniversalTxnRegistry for CSC:', regErr);
                throw new Error('Failed to update UniversalTxnRegistry for CSC: ' + regErr.message);
            }
        });

        await logAudit({
            action: 'UPDATE',
            module: 'CSC Tracker',
            tableName: 'CSCApplications',
            recordId: id,
            entityName: customerName.trim(),
            amount: numTotalFee,
            description: `CSC Application Update: ${serviceType.trim()} - ${customerName.trim()}`,
            newData: { customerName, serviceType, totalFee: numTotalFee, paidAmount: numPaid, dueAmount: numDue, status, ackNumber },
            details: `Aavedan ID #${id} (${serviceType}) update kiya gaya.`
        });

        res.json({
            success: true,
            message: 'Application update ho gayi!'
        });
    } catch (err) {
        console.error('Error updating CSC application:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================================
// 7. DELETE /api/csc/:id - Soft Delete (Atomic & Auto-Settlement safe - F8 Fix)
// ==========================================================================
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;
        if (!id || isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Awaidh CSC Application ID' });
        }

        await withTransaction(async (tQuery) => {
            // 1. Fetch application details
            const custLookup = await tQuery('SELECT * FROM CSCApplications WHERE AppID = @id AND UserID = @userId AND IsActive = 1', { id, userId });
            if (custLookup.recordset.length === 0) {
                throw Object.assign(new Error('CSC Application record nahi mila ya pehle se deleted hai'), { status: 404 });
            }
            const oldApp = custLookup.recordset[0];
            const custIdForKhata = oldApp.CustomerID || null;

            // 2. Soft-delete application
            await tQuery('UPDATE CSCApplications SET IsActive = 0, UpdatedAt = GETDATE() WHERE AppID = @id AND UserID = @userId', { id, userId });

            // 3. Khata Cleanup & Auto-settlement reallocation
            if (custIdForKhata) {
                await tQuery(`
                    UPDATE UniversalTxnRegistry
                    SET IsActive = 0
                    WHERE SourceModule = 'Khata'
                      AND RecordID IN (SELECT KhataID FROM KhataEntries WHERE CSCAppID = @cscId)
                `, { cscId: id });
                await tQuery('DELETE FROM KhataEntries WHERE CSCAppID = @cscId', { cscId: id });
                await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: custIdForKhata });
                // Reopen/reallocate dues and advances (F8 Fix)
                if (typeof processKhataAfterChange === 'function') {
                    await processKhataAfterChange(tQuery, custIdForKhata);
                }
            }

            // 4. Transactions Cleanup & Balance Update via Rule 1 SourceModule Identity
            const txns = await tQuery(`
                SELECT DISTINCT AccountID, TransactionID FROM Transactions
                WHERE UserID = @userId AND SourceModule = 'CSC' AND SourceID = @id
            `, { userId, id });

            if (txns.recordset.length > 0) {
                const accIds = [...new Set(txns.recordset.map(t => t.AccountID))];
                await tQuery(`
                    DELETE FROM Transactions 
                    WHERE UserID = @userId AND SourceModule = 'CSC' AND SourceID = @id
                `, { userId, id });
                for (const aId of accIds) {
                    await tQuery('EXEC sp_UpdateAccountBalance @id', { id: aId });
                }
            }

            // 5. Deactivate Global Transaction
            await deactivateGlobalTransaction('CSC', id, tQuery);

            // 6. Audit Log
            await logAudit({
                action: 'DELETE',
                module: 'CSC Tracker',
                tableName: 'CSCApplications',
                recordId: id,
                entityName: oldApp.CustomerName,
                amount: parseFloat(oldApp.TotalFee) || 0,
                description: `CSC Application Delete: ${oldApp.ServiceType} - ${oldApp.CustomerName}`,
                oldData: oldApp,
                details: `CSC ID #${id} (${oldApp.ServiceType}, Ack: ${oldApp.AckNumber || 'N/A'}) delete kiya gaya.`,
                tQuery
            });
        });

        res.json({ success: true, message: 'Application hata di gayi aur accounts/khata sync ho gaye!' });
    } catch (err) {
        console.error('Error deleting CSC application:', err);
        const status = err.status || 500;
        res.status(status).json({ success: false, error: err.message });
    }
});

module.exports = router;
