/**
 * routes/service_records.js
 * ---------------------------------------------------------------------------
 * Universal Dynamic Services API.
 *
 *   GET    /api/service/modules              - module list (CSC, BC, Insurance...)
 *   POST   /api/service/modules              - naya module register (1 row, no DDL)
 *   GET    /api/service/services?module=     - service master
 *   POST   /api/service/services             - naya service (1 row, no DDL)
 *   GET    /api/service/services/:id/fields  - dynamic form fields
 *   POST   /api/service/services/:id/fields  - naya field (1 row, no DDL)
 *   GET    /api/service/records              - records list (filters + pagination)
 *   GET    /api/service/records/:id          - single record
 *   POST   /api/service/records              - naya record (ledger+khata+SN auto)
 *   PUT    /api/service/records/:id          - record update (safe reverse+rewrite)
 *   DELETE /api/service/records/:id          - soft delete + full reversal
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { listModules, upsertModule, resolveModule } = require('../database/moduleRegistry');
const { createServiceRecord, updateServiceRecord, deleteServiceRecord } = require('../database/recordEngine');
const { logAudit } = require('../utils/auditLogger');

function userIdOf(req) {
    return req.user?.UserID || 1;
}

function isAdmin(req) {
    const role = String(req.user?.Role || '').toLowerCase();
    return role === 'superadmin' || role === 'admin' || role === 'owner' || role === 'shopowner';
}

function bad(res, msg, code = 400) {
    return res.status(code).json({ success: false, error: msg });
}

// ---------------------------------------------------------------------------
// MODULES
// ---------------------------------------------------------------------------
router.get('/modules', async (req, res) => {
    try {
        const includeInactive = String(req.query.includeInactive || '') === 'true';
        const modules = await listModules({ includeInactive });
        res.json({ success: true, data: modules });
    } catch (err) {
        console.error('Error listing modules:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/modules', async (req, res) => {
    try {
        if (!isAdmin(req)) return bad(res, 'Sirf admin naya module add kar sakta hai', 403);

        const moduleCode = String(req.body.moduleCode || req.body.ModuleCode || '').trim();
        const moduleName = String(req.body.moduleName || req.body.ModuleName || '').trim();
        const prefix = String(req.body.prefix || req.body.Prefix || '').trim().toUpperCase();

        if (!moduleCode || !/^[A-Za-z][A-Za-z0-9_]{1,29}$/.test(moduleCode)) {
            return bad(res, 'moduleCode 2-30 characters, letters/digits/underscore only');
        }
        if (!moduleName) return bad(res, 'moduleName zaroori hai');
        if (!prefix) return bad(res, 'prefix zaroori hai (e.g. INS, GAS)');

        const mod = await upsertModule({
            moduleCode,
            moduleName,
            prefix,
            // Dynamic modules ka data ServiceRecords me hi rehta hai
            targetTable: req.body.targetTable || 'ServiceRecords',
            primaryKeyColumn: req.body.primaryKeyColumn || 'RecordID',
            isCore: false,
            displayOrder: parseInt(req.body.displayOrder, 10) || 100
        });

        try {
            await logAudit({
                action: 'CREATE',
                tableName: 'TxnModules',
                recordId: null,
                entityName: moduleCode,
                module: 'Service',
                description: `Naya dynamic module register hua: ${moduleCode} (${moduleName})`
            });
        } catch (_) { }

        res.status(201).json({ success: true, data: mod });
    } catch (err) {
        console.error('Error creating module:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// SERVICES (CSCServices = universal service master)
// ---------------------------------------------------------------------------
router.get('/services', async (req, res) => {
    try {
        const moduleCode = req.query.module ? String(req.query.module) : null;
        const includeInactive = String(req.query.includeInactive || '') === 'true';

        const result = await query(`
            SELECT ServiceID, ServiceName, GovtFee, OperatorFee, DefaultDays, Icon,
                   IsActive, SortOrder, Category, ModuleCode, CustomFieldsSchema
            FROM dbo.CSCServices
            WHERE (@module IS NULL OR ModuleCode = @module)
              AND (@includeInactive = 1 OR IsActive = 1)
            ORDER BY SortOrder, ServiceName
        `, { module: moduleCode, includeInactive: includeInactive ? 1 : 0 });

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Error listing services:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/services', async (req, res) => {
    try {
        if (!isAdmin(req)) return bad(res, 'Sirf admin naya service add kar sakta hai', 403);

        const serviceName = String(req.body.serviceName || req.body.ServiceName || '').trim();
        if (!serviceName) return bad(res, 'serviceName zaroori hai');

        const moduleCode = String(req.body.moduleCode || req.body.ModuleCode || 'CSC').trim();
        const mod = await resolveModule(moduleCode);
        if (!mod) return bad(res, 'Module resolve nahi hua');

        const num = (v, d = 0) => {
            const n = parseFloat(v);
            return isFinite(n) ? Math.round(n * 100) / 100 : d;
        };

        const ins = await query(`
            INSERT INTO dbo.CSCServices
                (ServiceName, GovtFee, OperatorFee, DefaultDays, Icon, IsActive, SortOrder,
                 UserID, Category, ModuleCode)
            OUTPUT INSERTED.ServiceID
            VALUES
                (@name, @govt, @op, @days, @icon, 1, @order, @uid, @category, @module)
        `, {
            name: serviceName,
            govt: num(req.body.govtFee),
            op: num(req.body.operatorFee),
            days: parseInt(req.body.defaultDays, 10) || 0,
            icon: req.body.icon || 'file-text',
            order: parseInt(req.body.sortOrder, 10) || 999,
            uid: userIdOf(req),
            category: req.body.category || mod.moduleName || 'General',
            module: moduleCode
        });

        const serviceId = ins.recordset[0].ServiceID;

        try {
            await logAudit({
                action: 'CREATE',
                tableName: 'CSCServices',
                recordId: serviceId,
                entityName: serviceName,
                module: 'Service',
                description: `Naya service add hua: ${serviceName} (${moduleCode})`
            });
        } catch (_) { }

        res.status(201).json({
            success: true,
            data: { serviceID: serviceId, serviceName, moduleCode }
        });
    } catch (err) {
        console.error('Error creating service:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// DYNAMIC FIELDS
// ---------------------------------------------------------------------------
router.get('/services/:id/fields', async (req, res) => {
    try {
        const serviceId = parseInt(req.params.id, 10);
        if (!serviceId) return bad(res, 'ServiceID galat hai');

        const result = await query(`
            SELECT FieldID, ServiceID, FieldKey, FieldLabel, FieldType, FieldOptionsJson,
                   DefaultValue, Placeholder, IsRequired, DisplayOrder, IsActive
            FROM dbo.FieldDefinitions
            WHERE ServiceID = @sid AND IsActive = 1
            ORDER BY DisplayOrder, FieldID
        `, { sid: serviceId });

        const data = result.recordset.map(f => ({
            ...f,
            FieldOptions: f.FieldOptionsJson ? safeParse(f.FieldOptionsJson) : null
        }));
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error listing fields:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/services/:id/fields', async (req, res) => {
    try {
        if (!isAdmin(req)) return bad(res, 'Sirf admin field add kar sakta hai', 403);

        const serviceId = parseInt(req.params.id, 10);
        if (!serviceId) return bad(res, 'ServiceID galat hai');

        const fieldKey = String(req.body.fieldKey || req.body.FieldKey || '').trim();
        const fieldLabel = String(req.body.fieldLabel || req.body.FieldLabel || '').trim();
        if (!fieldKey || !/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(fieldKey)) {
            return bad(res, 'fieldKey 1-50 chars, letters/digits/underscore only');
        }
        if (!fieldLabel) return bad(res, 'fieldLabel zaroori hai');

        const svc = await query(`SELECT ServiceID FROM dbo.CSCServices WHERE ServiceID = @id`, { id: serviceId });
        if (!svc.recordset.length) return bad(res, 'Service nahi mila', 404);

        const options = req.body.options !== undefined ? JSON.stringify(req.body.options) : null;

        const ins = await query(`
            IF EXISTS (SELECT 1 FROM dbo.FieldDefinitions WHERE ServiceID = @sid AND FieldKey = @key)
            BEGIN
                UPDATE dbo.FieldDefinitions
                SET FieldLabel = @label,
                    FieldType = @type,
                    FieldOptionsJson = @options,
                    DefaultValue = @def,
                    Placeholder = @ph,
                    IsRequired = @req,
                    DisplayOrder = @order,
                    IsActive = 1,
                    UpdatedAt = GETDATE()
                WHERE ServiceID = @sid AND FieldKey = @key;
                SELECT FieldID FROM dbo.FieldDefinitions WHERE ServiceID = @sid AND FieldKey = @key;
            END
            ELSE
            BEGIN
                INSERT INTO dbo.FieldDefinitions
                    (ServiceID, FieldKey, FieldLabel, FieldType, FieldOptionsJson,
                     DefaultValue, Placeholder, IsRequired, DisplayOrder, IsActive)
                OUTPUT INSERTED.FieldID
                VALUES
                    (@sid, @key, @label, @type, @options, @def, @ph, @req, @order, 1);
            END
        `, {
            sid: serviceId,
            key: fieldKey,
            label: fieldLabel,
            type: req.body.fieldType || 'text',
            options,
            def: req.body.defaultValue || null,
            ph: req.body.placeholder || null,
            req: req.body.isRequired ? 1 : 0,
            order: parseInt(req.body.displayOrder, 10) || 0
        });

        res.status(201).json({
            success: true,
            data: { fieldID: ins.recordset[0].FieldID, serviceID: serviceId, fieldKey }
        });
    } catch (err) {
        console.error('Error creating field:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// RECORDS
// ---------------------------------------------------------------------------
router.get('/records', async (req, res) => {
    try {
        const userId = userIdOf(req);
        const moduleCode = req.query.module ? String(req.query.module) : null;
        const customerId = parseInt(req.query.customerId, 10) || null;
        const from = req.query.from || null;
        const to = req.query.to || null;
        const status = req.query.status ? String(req.query.status) : null;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

        const result = await query(`
            SELECT r.RecordID, r.ModuleCode, r.ServiceID, r.CustomerID, r.UserID,
                   r.GovtFee, r.OperatorFee, r.TotalFee, r.PaidAmount, r.BalanceAmount,
                   r.RecordDate, r.Status, r.PaymentStatus, r.PaymentMode, r.Remarks,
                   r.ExtraFieldsJson, r.GlobalSerialNo, r.SNCode, r.ModuleCodeSerial,
                   r.IsActive, r.CreatedAt,
                   s.ServiceName,
                   c.CustomerName, c.Phone
            FROM dbo.ServiceRecords r
            LEFT JOIN dbo.CSCServices s ON s.ServiceID = r.ServiceID
            LEFT JOIN dbo.Customers c ON c.CustomerID = r.CustomerID
            WHERE r.UserID = @userId
              AND (@module IS NULL OR r.ModuleCode = @module)
              AND (@customerId IS NULL OR r.CustomerID = @customerId)
              AND (@from IS NULL OR r.RecordDate >= @from)
              AND (@to IS NULL OR r.RecordDate <= @to)
              AND (@status IS NULL OR r.Status = @status)
              AND r.IsActive = 1
            ORDER BY r.RecordDate DESC, r.RecordID DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `, { userId, module: moduleCode, customerId, from, to, status, offset, limit });

        const countRes = await query(`
            SELECT COUNT(*) AS total
            FROM dbo.ServiceRecords r
            WHERE r.UserID = @userId
              AND (@module IS NULL OR r.ModuleCode = @module)
              AND (@customerId IS NULL OR r.CustomerID = @customerId)
              AND (@from IS NULL OR r.RecordDate >= @from)
              AND (@to IS NULL OR r.RecordDate <= @to)
              AND (@status IS NULL OR r.Status = @status)
              AND r.IsActive = 1
        `, { userId, module: moduleCode, customerId, from, to, status });

        const data = result.recordset.map(r => ({
            ...r,
            ExtraFields: r.ExtraFieldsJson ? safeParse(r.ExtraFieldsJson) : null
        }));

        res.json({ success: true, data, total: countRes.recordset[0]?.total || 0, limit, offset });
    } catch (err) {
        console.error('Error listing service records:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/records/:id', async (req, res) => {
    try {
        const userId = userIdOf(req);
        const id = parseInt(req.params.id, 10);
        if (!id) return bad(res, 'RecordID galat hai');

        const result = await query(`
            SELECT r.*, s.ServiceName, c.CustomerName, c.Phone
            FROM dbo.ServiceRecords r
            LEFT JOIN dbo.CSCServices s ON s.ServiceID = r.ServiceID
            LEFT JOIN dbo.Customers c ON c.CustomerID = r.CustomerID
            WHERE r.RecordID = @id AND r.UserID = @userId
        `, { id, userId });

        if (!result.recordset.length) return bad(res, 'Record nahi mila', 404);

        const row = result.recordset[0];
        row.ExtraFields = row.ExtraFieldsJson ? safeParse(row.ExtraFieldsJson) : null;
        res.json({ success: true, data: row });
    } catch (err) {
        console.error('Error fetching service record:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/records', async (req, res) => {
    try {
        const userId = userIdOf(req);
        const out = await createServiceRecord(req.body, userId);

        try {
            await logAudit({
                action: 'CREATE',
                tableName: 'ServiceRecords',
                recordId: out.recordID,
                entityName: req.body.customerName || `Record #${out.recordID}`,
                amount: out.totalFee,
                module: out.moduleCode,
                description: `${out.moduleCode} service record banaya (${out.snCode || ''})`
            });
        } catch (_) { }

        res.status(201).json({ success: true, data: out });
    } catch (err) {
        console.error('Error creating service record:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

router.put('/records/:id', async (req, res) => {
    try {
        const userId = userIdOf(req);
        const out = await updateServiceRecord(req.params.id, req.body, userId);
        res.json({ success: true, data: out });
    } catch (err) {
        console.error('Error updating service record:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/records/:id', async (req, res) => {
    try {
        const userId = userIdOf(req);
        const out = await deleteServiceRecord(req.params.id, userId);
        res.json({ success: true, data: out, message: 'Record delete ho gaya aur ledger/khata reverse ho gaya.' });
    } catch (err) {
        console.error('Error deleting service record:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

function safeParse(value) {
    try { return JSON.parse(value); } catch (_) { return value; }
}

module.exports = router;
