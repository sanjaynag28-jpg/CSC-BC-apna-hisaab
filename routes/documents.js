// ============================================================================
// DOCUMENTS ROUTES — Customer/Shop ke sabhi prakar ke documents (files)
// Upload, View, Print, Download, Rename, Delete — sab kuch live DB se linked
// Data-safety: delete par file recycle folder me jati hai (0 data loss)
// Multi-Tenant: har dukan ka document storage isolated by UserID
// ============================================================================
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');

// ---------------------------------------------------------------------------
// Uploads directory (project ke andar hi — portable)
// ---------------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'documents');
const RECYCLE_DIR = path.join(UPLOAD_DIR, '_recycle');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(RECYCLE_DIR)) fs.mkdirSync(RECYCLE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Multer storage config — unique filename, original name DB me save hoga
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '').substring(0, 15);
        const unique = `DOC_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
        cb(null, unique + safeExt);
    }
});

const ALLOWED_MIMES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv'
]);

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
    '.pdf', '.txt', '.csv',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
]);

// Path traversal guard
function isInsideUploadDir(filePath) {
    if (!filePath) return false;
    const resolved = path.resolve(filePath);
    const root = path.resolve(UPLOAD_DIR);
    return resolved === root || resolved.startsWith(root + path.sep);
}

// Google Drive / external link wali documents
function isExternalUrl(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    return /^https?:\/\//i.test(filePath.trim());
}

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: 10 }, // 25MB per file, max 10
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return cb(new Error(`File type allowed nahi hai: ${ext || 'unknown'}`));
        }
        if (!ALLOWED_MIMES.has(file.mimetype)) {
            return cb(new Error(`File type allowed nahi hai: ${file.mimetype}`));
        }
        cb(null, true);
    }
});

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------
async function ensureDocumentsTable() {
    try {
        await query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Documents' AND xtype='U')
            BEGIN
                CREATE TABLE Documents (
                    DocumentID      INT IDENTITY(1,1) PRIMARY KEY,
                    UserID          INT NOT NULL DEFAULT 1 REFERENCES Users(UserID),
                    CustomerID      INT NULL REFERENCES Customers(CustomerID),
                    FileName        NVARCHAR(255) NOT NULL,
                    OriginalName    NVARCHAR(255) NOT NULL,
                    FileType        NVARCHAR(100),
                    FileSize        BIGINT DEFAULT 0,
                    FilePath        NVARCHAR(500) NOT NULL,
                    UploadedBy      NVARCHAR(50) DEFAULT 'shop',
                    Description     NVARCHAR(500) NULL,
                    IsArchived      BIT DEFAULT 0,
                    CreatedAt       DATETIME DEFAULT GETDATE(),
                    UpdatedAt       DATETIME DEFAULT GETDATE()
                );
            END

            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Documents' AND COLUMN_NAME='EntityType')
            BEGIN
                ALTER TABLE Documents ADD EntityType NVARCHAR(50) NULL;
            END

            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Documents' AND COLUMN_NAME='EntityID')
            BEGIN
                ALTER TABLE Documents ADD EntityID INT NULL;
            END
        `);
    } catch (err) {
        console.error('⚠️ Documents table setup error:', err.message);
    }
}
ensureDocumentsTable();

// Helper to standardize EntityType casing and values across all uploads and modules
function normalizeEntityType(rawType, customerId = null) {
    if (!rawType) return customerId ? 'Customer' : 'Shop';
    const lower = String(rawType).trim().toLowerCase();
    switch (lower) {
        case 'customer': return 'Customer';
        case 'csc': return 'CSC';
        case 'billpay':
        case 'billpayment': return 'BillPay';
        case 'invoice':
        case 'invoices': return 'Invoice';
        case 'khata': return 'Khata';
        case 'transaction':
        case 'bc': return 'BC';
        case 'shop': return 'Shop';
        default: return String(rawType).trim();
    }
}

// ===========================================================================
// POST /api/documents/upload — file upload (single/multiple, entity/customer linked)
// ===========================================================================
router.post('/upload', upload.array('files', 15), async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'Koi file select nahi hui' });
        }

        let customerId = req.body.CustomerID ? parseInt(req.body.CustomerID) : null;
        let entityType = normalizeEntityType(req.body.EntityType || req.body.entityType, customerId);
        let entityId = (req.body.EntityID || req.body.entityId) ? parseInt(req.body.EntityID || req.body.entityId) : (entityType === 'Customer' ? customerId : null);
        const uploadedBy = (req.body.UploadedBy || 'shop').trim().substring(0, 50);
        const description = (req.body.Description || '').trim().substring(0, 500) || null;

        // Auto-resolve CustomerID from Entity if not directly provided
        if (!customerId && entityId) {
            try {
                if (entityType === 'CSC') {
                    const cscR = await query('SELECT CustomerID FROM CSCApplications WHERE AppID = @id AND UserID = @userId', { id: entityId, userId });
                    if (cscR.recordset.length && cscR.recordset[0].CustomerID) customerId = cscR.recordset[0].CustomerID;
                } else if (entityType === 'Invoice') {
                    const invR = await query('SELECT CustomerID FROM Invoices WHERE InvoiceID = @id AND UserID = @userId', { id: entityId, userId });
                    if (invR.recordset.length && invR.recordset[0].CustomerID) customerId = invR.recordset[0].CustomerID;
                } else if (entityType === 'Khata') {
                    const khR = await query('SELECT CustomerID FROM KhataEntries WHERE KhataID = @id AND UserID = @userId', { id: entityId, userId });
                    if (khR.recordset.length && khR.recordset[0].CustomerID) customerId = khR.recordset[0].CustomerID;
                } else if (entityType === 'BillPay') {
                    const bpR = await query('SELECT CustomerID FROM BillPayments WHERE PaymentID = @id AND UserID = @userId', { id: entityId, userId });
                    if (bpR.recordset.length && bpR.recordset[0].CustomerID) customerId = bpR.recordset[0].CustomerID;
                } else if (entityType === 'BC') {
                    const txR = await query('SELECT CustomerID, PartyID FROM Transactions WHERE TransactionID = @id AND UserID = @userId', { id: entityId, userId });
                    if (txR.recordset.length) customerId = txR.recordset[0].CustomerID || txR.recordset[0].PartyID || null;
                }
            } catch (resolveErr) {
                console.warn('Auto-resolve customerId warning:', resolveErr.message);
            }
        }

        // Parse custom names if provided for renaming
        let customNamesList = [];
        if (req.body.customNames) {
            try {
                if (typeof req.body.customNames === 'string') {
                    customNamesList = JSON.parse(req.body.customNames);
                } else if (Array.isArray(req.body.customNames)) {
                    customNamesList = req.body.customNames;
                }
            } catch (e) {
                if (typeof req.body.customNames === 'string') {
                    customNamesList = [req.body.customNames];
                }
            }
        }

        // Customer link validation (if customerId specified)
        if (customerId) {
            const custCheck = await query('SELECT CustomerID FROM Customers WHERE CustomerID = @id AND UserID = @userId', { id: customerId, userId });
            if (!custCheck.recordset.length) {
                console.warn(`Customer #${customerId} not found for document link; saving as general doc`);
                customerId = null;
            }
        }

        const savedDocs = [];
        for (let i = 0; i < req.files.length; i++) {
            const f = req.files[i];
            const ext = path.extname(f.originalname).toLowerCase();

            let customName = null;
            if (Array.isArray(customNamesList) && customNamesList[i]) {
                customName = String(customNamesList[i]).trim();
            }

            let displayName = customName || f.originalname;
            if (customName && path.extname(displayName).toLowerCase() !== ext) {
                displayName = displayName + ext;
            }

            const result = await query(`
                INSERT INTO Documents (UserID, CustomerID, FileName, OriginalName, FileType, FileSize, FilePath, UploadedBy, Description, EntityType, EntityID)
                OUTPUT INSERTED.DocumentID
                VALUES (@userId, @custId, @fileName, @origName, @fileType, @fileSize, @filePath, @uploadedBy, @desc, @entityType, @entityId)
            `, {
                userId,
                custId: customerId,
                fileName: f.filename,
                origName: displayName.substring(0, 255),
                fileType: ext.substring(0, 100),
                fileSize: f.size,
                filePath: f.path,
                uploadedBy,
                desc: description,
                entityType: entityType ? entityType.substring(0, 50) : null,
                entityId: entityId || null
            });

            const docId = result.recordset[0].DocumentID;
            savedDocs.push({
                DocumentID: docId,
                OriginalName: displayName,
                FileName: f.filename,
                EntityType: entityType,
                EntityID: entityId,
                CustomerID: customerId,
                FileSize: f.size
            });

            await logAudit({
                action: 'CREATE',
                module: 'Document Vault',
                tableName: 'Documents',
                recordId: docId,
                entityName: displayName,
                description: `Document Upload Kiya Gaya: "${displayName}" (${(f.size / 1024).toFixed(1)} KB)`,
                newData: { DocumentID: docId, FileName: f.filename, OriginalName: displayName, FileSize: f.size, CustomerID: customerId, EntityType: entityType, EntityID: entityId },
                details: `Document "${displayName}" uploaded for [${entityType || 'shop'}: #${entityId || customerId || '-'}] by ${uploadedBy}`
            });
        }

        const linkLabel = entityType ? `${entityType.toUpperCase()} #${entityId || ''}` : (customerId ? `Customer #${customerId}` : 'General');
        res.json({
            success: true,
            data: savedDocs,
            message: `${req.files.length} document(s) upload ho gaye (${linkLabel})`
        });
    } catch (err) {
        if (req.files) { for (const f of req.files) { try { fs.unlinkSync(f.path); } catch (e) { } } }
        console.error('Document upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===========================================================================
// GET /api/documents/by-entity/:entityType/:entityId — documents linked to entity
// ===========================================================================
router.get('/by-entity/:entityType/:entityId', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const rawType = req.params.entityType;
        const entityType = normalizeEntityType(rawType);
        const entityId = parseInt(req.params.entityId);

        let whereClause = `(d.EntityType = @entityType OR (d.EntityType = 'BillPayment' AND @entityType = 'BillPay') OR (d.EntityType = 'csc' AND @entityType = 'CSC') OR (d.EntityType = 'customer' AND @entityType = 'Customer')) AND d.EntityID = @entityId AND d.IsArchived = 0 AND d.UserID = @userId`;
        const params = { entityType, entityId, userId };

        if (entityType === 'Customer') {
            whereClause = `((d.EntityType IN ('Customer', 'customer') AND d.EntityID = @entityId) OR (d.CustomerID = @entityId AND (d.EntityType IS NULL OR d.EntityType IN ('Customer', 'customer')))) AND d.IsArchived = 0 AND d.UserID = @userId`;
        }

        const result = await query(`
            SELECT d.*,
                   c.CustomerName,
                   CAST(CASE WHEN d.FilePath LIKE 'http://%' OR d.FilePath LIKE 'https://%' THEN 1 ELSE 0 END AS BIT) as IsExternal,
                   CASE
                    WHEN d.FileType IN ('.jpg','.jpeg','.png','.gif','.webp','.bmp','.svg') THEN 'image'
                    WHEN d.FileType = '.pdf' THEN 'pdf'
                    WHEN d.FileType IN ('.doc','.docx','.txt','.rtf','.csv') THEN 'document'
                    WHEN d.FileType IN ('.xls','.xlsx') THEN 'excel'
                    WHEN d.FileType IN ('.ppt','.pptx') THEN 'presentation'
                    ELSE 'other'
                   END AS Category
            FROM Documents d
            LEFT JOIN Customers c ON c.CustomerID = d.CustomerID AND c.UserID = @userId
            WHERE ${whereClause}
            ORDER BY d.CreatedAt DESC
        `, params);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Error fetching documents by entity:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===========================================================================
// GET /api/documents/customer/:customerId — Universal Customer Documents
// ===========================================================================
router.get('/customer/:customerId', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const custId = parseInt(req.params.customerId);
        if (!custId || isNaN(custId)) {
            return res.status(400).json({ success: false, error: 'Valid Customer ID zaroori hai' });
        }

        const custRes = await query(`
            SELECT CustomerID, CustomerName, Phone, AadhaarNumber, DateOfBirth, Address, CurrentBalance 
            FROM Customers 
            WHERE CustomerID = @custId AND UserID = @userId
        `, { custId, userId });

        if (!custRes.recordset.length) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }
        const customer = custRes.recordset[0];

        const docsRes = await query(`
            SELECT d.*,
                   COALESCE(c.CustomerName, @custName) as CustomerName,
                   CAST(CASE WHEN d.FilePath LIKE 'http://%' OR d.FilePath LIKE 'https://%' THEN 1 ELSE 0 END AS BIT) as IsExternal,
                   CASE
                    WHEN d.FileType IN ('.jpg','.jpeg','.png','.gif','.webp','.bmp','.svg') THEN 'image'
                    WHEN d.FileType = '.pdf' THEN 'pdf'
                    WHEN d.FileType IN ('.doc','.docx','.txt','.rtf','.csv') THEN 'document'
                    WHEN d.FileType IN ('.xls','.xlsx') THEN 'excel'
                    WHEN d.FileType IN ('.ppt','.pptx') THEN 'presentation'
                    ELSE 'other'
                   END AS Category,
                   CASE
                    WHEN d.EntityType IN ('CSC', 'csc') THEN 'CSC Aavedan #' + CAST(d.EntityID AS NVARCHAR(20))
                    WHEN d.EntityType IN ('Invoice', 'invoice') THEN 'Bill / Invoice #' + CAST(d.EntityID AS NVARCHAR(20))
                    WHEN d.EntityType IN ('Khata', 'khata') THEN 'Khata Parchi #' + CAST(d.EntityID AS NVARCHAR(20))
                    WHEN d.EntityType IN ('BC', 'bc', 'transaction') THEN 'BC Banking Txn #' + CAST(d.EntityID AS NVARCHAR(20))
                    WHEN d.EntityType IN ('BillPay', 'BillPayment', 'billpay') THEN 'Bill Payment #' + CAST(d.EntityID AS NVARCHAR(20))
                    ELSE 'Customer Profile'
                   END AS SourceLabel
            FROM Documents d
            LEFT JOIN Customers c ON c.CustomerID = COALESCE(d.CustomerID, @custId) AND c.UserID = @userId
            WHERE d.IsArchived = 0 AND d.UserID = @userId
              AND (
                  d.CustomerID = @custId
                  OR (d.EntityType IN ('Customer', 'customer') AND d.EntityID = @custId)
                  OR (d.EntityType IN ('CSC', 'csc') AND d.EntityID IN (SELECT csc.AppID FROM CSCApplications csc WHERE csc.CustomerID = @custId AND csc.UserID = @userId))
                  OR (d.EntityType IN ('Invoice', 'invoice') AND d.EntityID IN (SELECT inv.InvoiceID FROM Invoices inv WHERE inv.CustomerID = @custId AND inv.UserID = @userId))
                  OR (d.EntityType IN ('Khata', 'khata') AND d.EntityID IN (SELECT ke.KhataID FROM KhataEntries ke WHERE ke.CustomerID = @custId AND ke.UserID = @userId))
                  OR (d.EntityType IN ('BillPay', 'BillPayment', 'billpay') AND d.EntityID IN (SELECT bp.PaymentID FROM BillPayments bp WHERE bp.CustomerID = @custId AND bp.UserID = @userId))
                  OR (d.EntityType IN ('transaction', 'bc', 'BC') AND (
                      d.EntityID IN (SELECT tx.TransactionID FROM Transactions tx WHERE tx.PartyID = @custId AND tx.UserID = @userId)
                      OR d.EntityID IN (SELECT bc.BCID FROM BCTransactions bc WHERE bc.CustomerID = @custId AND bc.UserID = @userId)
                  ))
              )
            ORDER BY d.CreatedAt DESC
        `, { custId, userId, custName: customer.CustomerName });

        res.json({
            success: true,
            customer,
            count: docsRes.recordset.length,
            data: docsRes.recordset
        });
    } catch (err) {
        console.error('Error fetching universal customer documents:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/documents — list
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { customerId, search, type } = req.query;
        const whereClauses = ['d.IsArchived = 0', 'd.UserID = @userId'];
        const params = { userId };

        if (customerId && customerId !== 'all') {
            if (String(customerId) === 'shop' || String(customerId) === '0') {
                whereClauses.push('d.CustomerID IS NULL');
            } else {
                whereClauses.push('d.CustomerID = @custId');
                params.custId = parseInt(customerId);
            }
        }
        if (search && search.trim() !== '') {
            whereClauses.push('(d.OriginalName LIKE @search OR d.Description LIKE @search)');
            params.search = `%${search.trim()}%`;
        }
        if (type && type !== 'all') {
            const types = type.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            if (types.length > 0) {
                whereClauses.push(`d.FileType IN (${types.map((t, i) => `@type${i}`).join(',')})`);
                types.forEach((t, i) => { params[`type${i}`] = t; });
            }
        }

        const result = await query(`
            SELECT d.*, c.CustomerName,
                   CAST(CASE WHEN d.FilePath LIKE 'http://%' OR d.FilePath LIKE 'https://%' THEN 1 ELSE 0 END AS BIT) as IsExternal,
                   CASE
                    WHEN d.FileType IN ('.jpg','.jpeg','.png','.gif','.webp','.bmp','.svg') THEN 'image'
                    WHEN d.FileType = '.pdf' THEN 'pdf'
                    WHEN d.FileType IN ('.doc','.docx','.txt','.rtf','.csv') THEN 'document'
                    WHEN d.FileType IN ('.xls','.xlsx') THEN 'excel'
                    WHEN d.FileType IN ('.ppt','.pptx') THEN 'presentation'
                    ELSE 'other'
                   END AS Category
            FROM Documents d
            LEFT JOIN Customers c ON c.CustomerID = d.CustomerID AND c.UserID = @userId
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY d.CreatedAt DESC
        `, params);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Document list error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/documents/stats — counts for badges
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const result = await query(`
            SELECT COUNT(*) as TotalDocs,
                   ISNULL(SUM(FileSize), 0) as TotalSize,
                   SUM(CASE WHEN CustomerID IS NOT NULL THEN 1 ELSE 0 END) as CustomerDocs,
                   SUM(CASE WHEN CustomerID IS NULL THEN 1 ELSE 0 END) as ShopDocs
            FROM Documents WHERE IsArchived = 0 AND UserID = @userId
        `, { userId });
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/documents/:id/view — browser preview
router.get('/:id/view', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const result = await query('SELECT * FROM Documents WHERE DocumentID = @id AND UserID = @userId', { id: parseInt(req.params.id), userId });
        if (!result.recordset.length) return res.status(404).json({ success: false, error: 'Document nahi mila' });

        const doc = result.recordset[0];
        if (isExternalUrl(doc.FilePath)) {
            res.setHeader('Cache-Control', 'no-store');
            return res.redirect(302, doc.FilePath.trim());
        }
        if (!isInsideUploadDir(doc.FilePath)) {
            console.error('🚫 Document path traversal blocked:', doc.FilePath);
            return res.status(403).json({ success: false, error: 'File path invalid hai' });
        }
        if (!fs.existsSync(doc.FilePath)) {
            return res.status(410).json({ success: false, error: 'File server par maujood nahi hai' });
        }
        const inlineTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.pdf', '.txt'];
        const disp = inlineTypes.includes((doc.FileType || '').toLowerCase()) ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disp}; filename="${encodeURIComponent(doc.OriginalName)}"`);
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path.resolve(doc.FilePath));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/documents/:id/download — file download
router.get('/:id/download', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const result = await query('SELECT * FROM Documents WHERE DocumentID = @id AND UserID = @userId', { id: parseInt(req.params.id), userId });
        if (!result.recordset.length) return res.status(404).json({ success: false, error: 'Document nahi mila' });

        const doc = result.recordset[0];
        if (isExternalUrl(doc.FilePath)) {
            res.setHeader('Cache-Control', 'no-store');
            return res.redirect(302, doc.FilePath.trim());
        }
        if (!isInsideUploadDir(doc.FilePath)) {
            console.error('🚫 Document path traversal blocked:', doc.FilePath);
            return res.status(403).json({ success: false, error: 'File path invalid hai' });
        }
        if (!fs.existsSync(doc.FilePath)) {
            return res.status(410).json({ success: false, error: 'File server par maujood nahi hai' });
        }
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.OriginalName)}"`);
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path.resolve(doc.FilePath));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/documents/:id/rename
router.put('/:id/rename', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const docId = parseInt(req.params.id);
        let newName = (req.body.newName || '').trim();
        if (!newName) return res.status(400).json({ success: false, error: 'Naya naam khali nahi ho sakta' });
        newName = newName.substring(0, 255);

        const result = await query('SELECT * FROM Documents WHERE DocumentID = @id AND UserID = @userId', { id: docId, userId });
        if (!result.recordset.length) return res.status(404).json({ success: false, error: 'Document nahi mila' });

        const doc = result.recordset[0];
        const oldExt = path.extname(doc.OriginalName).toLowerCase();
        if (oldExt && path.extname(newName).toLowerCase() !== oldExt) newName += oldExt;

        await query(`
            UPDATE Documents SET OriginalName = @newName, UpdatedAt = GETDATE() WHERE DocumentID = @id AND UserID = @userId
        `, { newName, id: docId, userId });

        res.json({ success: true, message: `Rename ho gaya: "${doc.OriginalName}" → "${newName}"` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/documents/:id/description
router.put('/:id/description', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const docId = parseInt(req.params.id);
        const desc = (req.body.description || '').trim().substring(0, 500) || null;
        const result = await query(`
            UPDATE Documents SET Description = @desc, UpdatedAt = GETDATE() WHERE DocumentID = @id AND UserID = @userId;
            SELECT @@ROWCOUNT AS affected;
        `, { desc, id: docId, userId });
        if (!result.recordset[0].affected) return res.status(404).json({ success: false, error: 'Document nahi mila' });
        res.json({ success: true, message: 'Description update ho gaya' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const docId = parseInt(req.params.id);
        const result = await query('SELECT * FROM Documents WHERE DocumentID = @id AND UserID = @userId', { id: docId, userId });
        if (!result.recordset.length) return res.status(404).json({ success: false, error: 'Document nahi mila' });

        const doc = result.recordset[0];

        if (!isExternalUrl(doc.FilePath)) {
            if (!isInsideUploadDir(doc.FilePath)) {
                console.error('🚫 Document path traversal blocked:', doc.FilePath);
                return res.status(403).json({ success: false, error: 'File path invalid hai' });
            }
            if (fs.existsSync(doc.FilePath)) {
                const recName = `${Date.now()}_${doc.FileName}`;
                try {
                    fs.renameSync(doc.FilePath, path.join(RECYCLE_DIR, recName));
                } catch (moveErr) {
                    fs.copyFileSync(doc.FilePath, path.join(RECYCLE_DIR, recName));
                    fs.unlinkSync(doc.FilePath);
                }
            }
        }

        await query(`
            UPDATE Documents SET IsArchived = 1, UpdatedAt = GETDATE() WHERE DocumentID = @id AND UserID = @userId
        `, { id: docId, userId });

        await logAudit({
            action: 'DELETE',
            module: 'Document Vault',
            tableName: 'Documents',
            recordId: docId,
            entityName: doc.OriginalName,
            description: `Document Delete (Archived): "${doc.OriginalName}"`,
            oldData: doc,
            details: `Document ID #${docId} ("${doc.OriginalName}") recycle bin me move kiya gaya.`
        });

        res.json({ success: true, message: `"${doc.OriginalName}" delete ho gaya (recycle bin me surakshit hai)` });
    } catch (err) {
        console.error('Document delete error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
