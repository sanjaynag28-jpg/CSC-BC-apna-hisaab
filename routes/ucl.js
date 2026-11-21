/**
 * routes/ucl.js
 * ---------------------------------------------------------------------------
 * Aadhaar UCL (Update Client Lite) Demographics & Document Update Router
 * 
 * Features:
 * - OCR Receipt Scanning (UIDAI Acknowledgement/Consent slips)
 * - Auto Customer Match/Register (Same Customer Logic via customerAutoRegister)
 * - Multi-mode Payment (Cash Counter, Online/Bank, Khata/Udhaar, Split)
 * - Direct Khatabook synchronization with zero balance drift
 * - Universal Txn Registry integration (UCL-1, UCL-2...)
 * - PAC Code auto-linkage
 * ---------------------------------------------------------------------------
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

const { query, withTransaction, sql } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');
const { escapeLike } = require('../utils/helpers');
const { resolveOrCreateCustomer } = require('../database/customerAutoRegister');
const { registerGlobalTransaction, updateGlobalTransaction, deactivateGlobalTransaction } = require('../database/globalTxnRegistry');
const { addKhataEntry, refreshCustomerBalance } = require('../database/khataEngine');

// Multer storage for uploaded UCL receipts
const uploadDir = path.join(__dirname, '../public/uploads/documents');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        const unique = `ucl_receipt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
        cb(null, unique);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }
});

// ---------------------------------------------------------------------------
// Aadhaar input normalisation.
// UI me "12-Digit ya Last 4" allowed hai aur user spaced Aadhaar bhi paste
// kar sakta hai (e.g. "9626 0210 9626"). UCLUpdates.AadhaarLast4 sirf
// varchar(10) hai, isliye raw input kabhi DB me nahi bhejna - hamesha digits
// nikaal kar sirf last 4 store karna hai.
// ---------------------------------------------------------------------------
function parseAadhaarInput(raw) {
    const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (!digits) return { last4: null, full: null };
    return {
        last4: digits.length >= 4 ? digits.slice(-4) : digits,
        full: digits.length === 12 ? digits : null
    };
}

// DB truncation jaise raw SQL errors ko user-friendly message me badalta hai.
function friendlyUclError(err) {
    const msg = err && err.message ? err.message : String(err);
    if (/truncat/i.test(msg)) {
        return 'Kuch field ki value bahut lambi hai (DB limit se zyada). Aadhaar last-4, SID aur Notes check karke dobara save karein.';
    }
    return msg;
}

// Insert se pehle DB column limits check karta hai taaki SQL truncation error
// na aaye aur user ko saaf message mile. (Silently data cut nahi karte.)
function uclLengthError(fields) {
    for (const [label, value, max] of fields) {
        if (value != null && String(value).length > max) {
            return `${label} bahut lamba hai (max ${max} characters, aapne ${String(value).length} diye). Kripya chhota karke dobara save karein.`;
        }
    }
    return null;
}

// ============================================================================
// Intelligent UIDAI UCL Acknowledgement / Consent Slip Parser
// ============================================================================
function parseUCLReceipt(text) {
    if (!text || typeof text !== 'string') return {};

    const res = {
        sid: '',
        date: '',
        time: '',
        aadhaarLast4: '',
        aadhaarMasked: '',
        customerName: '',
        customerPhone: '',
        updateType: 'Demographics Update',
        biometrics: 'No',
        registrar: 'CSC e-Gov.',
        enrolmentAgency: 'CSC Bank BC',
        locationId: '',
        rawText: text
    };

    // 1. SID / Enrollment number (e.g. S325112317949020261120155058)
    const sidMatch = text.match(/(?:SID|नामांकन|URN)[^\n\r]*?([S§$5\d][\d\s]{18,35})/i) || text.match(/\b([S§$][\d\s]{20,32})\b/i);
    if (sidMatch) {
        res.sid = sidMatch[1].replace(/[§$]/g, 'S').replace(/\s+/g, '');
    }

    // 2. Date & Time (e.g. 20/11/2026 15:50:58)
    const dateMatch = text.match(/(?:Date|तिथि)[^\n\r]*?(\d{2})[\/\.\-0]?(\d{2})[\/\.\-0]?(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/i)
        || text.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/);
    if (dateMatch && dateMatch[3] && dateMatch[3].length === 4) {
        res.date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        if (dateMatch[4]) res.time = dateMatch[4];
    }
    if (!res.date) {
        res.date = new Date().toISOString().split('T')[0];
    }

    // 3. Mobile Number (10 digits starting with 6, 7, 8, 9)
    const phoneMatch = text.match(/(?:Mobile|मोबाईल|Phone)[^\d\n\r]*?([6-9][\d\s]{9,12})/i) || text.match(/\b([6-9]\d{9})\b/);
    if (phoneMatch) {
        res.customerPhone = phoneMatch[1].replace(/\D/g, '').slice(0, 10);
    }

    // 4. Resident Name (after Name: or नाम: or Update(s) made as per request)
    const nameMatch = text.match(/(?:Name|नाम)\s*[:\-]\s*([A-Za-z\s]{2,35})/i) ||
        text.match(/(?:Update\(s\)\s*made[^\n\r]*?[:\-]\s*)([A-Za-z\s]{2,30})/i);
    if (nameMatch) {
        let n = nameMatch[1].trim().split('\n')[0].trim();
        n = n.replace(/^(?:M\/s\.?|Shri|Smt|Mr|Mrs|Ms)\s*/i, '').trim();
        if (n.length >= 2) res.customerName = n;
    }

    // 5. Masked Aadhaar / Last 4 Digits (e.g. XXXXXXXX1047)
    const aadhaarMatch = text.match(/(?:AADHAAR|आधार)[^\n\r]*?(?:[X\dO0]{4,14}\s*)(\d{3,4})/i) ||
        text.match(/(?:[X\dO0]{6,14}\s*)(\d{3,4})/i);
    if (aadhaarMatch) {
        res.aadhaarLast4 = aadhaarMatch[1];
        res.aadhaarMasked = 'XXXX-XXXX-' + (res.aadhaarLast4 || 'XXXX');
    }

    // 6. Biometrics Update (Yes / No)
    if (/Biometrics?\s*Update[^\n\r]*?\b(Yes|हा|हाँ)\b/i.test(text)) {
        res.biometrics = 'Yes';
    } else {
        res.biometrics = 'No';
    }

    // 7. Update Type detection
    const updates = [];
    if (/Demograph/i.test(text)) updates.push('Demographics');
    if (/Name\s*[:\-]/i.test(text)) updates.push('Name');
    if (/Mobile|Phone/i.test(text) && !/Mobile\s*Update/i.test(text)) updates.push('Mobile');
    if (/Address|Pata|Niwas/i.test(text)) updates.push('Address');
    if (/DOB|Birth|Janm/i.test(text)) updates.push('DOB');
    if (/Document|POI|POA/i.test(text)) updates.push('Document POI/POA');
    if (updates.length > 0) {
        res.updateType = updates.join(' + ');
    }

    // 8. Agency & Location
    const agencyMatch = text.match(/Enrol?l?ment\s*Agency\s*[:\-]\s*([^\n\r]+?)(?:Location|$)/i);
    if (agencyMatch) res.enrolmentAgency = agencyMatch[1].trim();

    const locMatch = text.match(/Location\s*Id\s*[:\-]\s*([^\n\r]+)/i);
    if (locMatch) res.locationId = locMatch[1].trim();

    return res;
}

// ============================================================================
// 1. POST /api/ucl/scan-receipt - Upload & OCR Parse UIDAI UCL Receipt
// ============================================================================
router.post('/scan-receipt', upload.single('receipt'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Koi receipt file upload nahi ki gayi' });
        }

        const userId = req.user?.UserID || 1;
        const filePath = req.file.path;
        const fileName = req.file.filename;
        const originalName = req.file.originalname;
        const fileType = req.file.mimetype || 'image/jpeg';
        const fileSize = req.file.size || 0;
        const relativePath = `/uploads/documents/${fileName}`;

        // Run Sharp preprocessing + Tesseract OCR on the receipt
        let ocrText = '';
        try {
            let imageSource = filePath;
            if (fileType.startsWith('image/')) {
                try {
                    const meta = await sharp(filePath).metadata();
                    const targetWidth = meta.width && meta.width < 1800 ? 1800 : meta.width;
                    imageSource = await sharp(filePath)
                        .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
                        .png()
                        .toBuffer();
                } catch (sharpErr) {
                    console.warn('[UCL Sharp Preprocess Warning]:', sharpErr.message);
                    imageSource = filePath;
                }
            }
            const ocrResult = await Tesseract.recognize(imageSource, 'eng');
            ocrText = ocrResult?.data?.text || '';
        } catch (ocrErr) {
            console.error('[UCL OCR Error]:', ocrErr.message);
        }

        // Parse extracted text
        const parsed = parseUCLReceipt(ocrText);

        // Targeted Aadhaar Crop Fallback if Aadhaar not cleanly detected
        if (fileType.startsWith('image/') && (!parsed.aadhaarLast4 || parsed.aadhaarLast4.length < 4)) {
            try {
                const meta = await sharp(filePath).metadata();
                const cropBuf = await sharp(filePath)
                    .extract({
                        left: Math.round(meta.width * 0.05),
                        top: Math.round(meta.height * 0.28),
                        width: Math.round(meta.width * 0.55),
                        height: Math.round(meta.height * 0.08)
                    })
                    .resize({ width: 1200 })
                    .grayscale()
                    .png()
                    .toBuffer();
                const aadhRes = await Tesseract.recognize(cropBuf, 'eng');
                const aadhM = aadhRes.data.text.match(/(?:[X\dO0]{4,14}\s*)(\d{4})/i) || aadhRes.data.text.match(/(\d{4})\s*$/m);
                if (aadhM) {
                    parsed.aadhaarLast4 = aadhM[1];
                    parsed.aadhaarMasked = `XXXX-XXXX-${aadhM[1]}`;
                }
            } catch (aadhErr) {
                console.warn('[UCL Aadhaar Crop Fallback Warning]:', aadhErr.message);
            }
        }

        // Database Candidate Enrichment (Direct match or OCR digit confusions like 3 <-> 9)
        if (parsed.customerPhone) {
            try {
                const dbRes = await query(`
                    SELECT CustomerID, CustomerName, Phone, AadhaarNumber 
                    FROM Customers 
                    WHERE Phone = @p AND UserID = @userId
                `, { p: parsed.customerPhone, userId });
                if (dbRes.recordset?.length > 0) {
                    parsed.matchedCustomerId = dbRes.recordset[0].CustomerID;
                    parsed.customerName = dbRes.recordset[0].CustomerName || parsed.customerName;
                    if (dbRes.recordset[0].AadhaarNumber && (!parsed.aadhaarLast4 || parsed.aadhaarLast4.length < 4)) {
                        const cleanAad = String(dbRes.recordset[0].AadhaarNumber).replace(/\D/g, '');
                        if (cleanAad.length >= 4) {
                            parsed.aadhaarLast4 = cleanAad.slice(-4);
                            parsed.aadhaarMasked = `XXXX-XXXX-${parsed.aadhaarLast4}`;
                        }
                    }
                } else {
                    const cand1 = parsed.customerPhone.replace(/3/g, '9');
                    const cand2 = parsed.customerPhone.replace(/9/g, '3');
                    const altRes = await query(`
                        SELECT CustomerID, CustomerName, Phone, AadhaarNumber 
                        FROM Customers 
                        WHERE Phone IN (@c1, @c2) AND UserID = @userId
                    `, { c1: cand1, c2: cand2, userId });
                    if (altRes.recordset?.length > 0) {
                        parsed.matchedCustomerId = altRes.recordset[0].CustomerID;
                        parsed.customerPhone = altRes.recordset[0].Phone;
                        parsed.customerName = altRes.recordset[0].CustomerName || parsed.customerName;
                        if (altRes.recordset[0].AadhaarNumber && (!parsed.aadhaarLast4 || parsed.aadhaarLast4.length < 4)) {
                            const cleanAad = String(altRes.recordset[0].AadhaarNumber).replace(/\D/g, '');
                            if (cleanAad.length >= 4) {
                                parsed.aadhaarLast4 = cleanAad.slice(-4);
                                parsed.aadhaarMasked = `XXXX-XXXX-${parsed.aadhaarLast4}`;
                            }
                        }
                    }
                }
            } catch (candErr) {
                console.warn('[UCL DB Candidate Warning]:', candErr.message);
            }
        }

        // Save entry in Documents table
        let documentId = null;
        try {
            const docRes = await query(`
                INSERT INTO Documents (
                    UserID, CustomerID, FileName, OriginalName, FileType, FileSize, FilePath,
                    UploadedBy, Description, IsArchived, CreatedAt, UpdatedAt, EntityType, EntityID
                ) VALUES (
                    @userId, NULL, @fileName, @originalName, @fileType, @fileSize, @filePath,
                    'shop', @description, 0, GETDATE(), GETDATE(), 'UCL', NULL
                );
                SELECT SCOPE_IDENTITY() AS DocumentID;
            `, {
                userId,
                fileName,
                originalName,
                fileType,
                fileSize,
                filePath: relativePath,
                description: `Aadhaar UCL Receipt: ${parsed.customerName || 'Resident'} (${parsed.sid || 'Update'})`
            });
            if (docRes.recordset?.length) {
                documentId = docRes.recordset[0].DocumentID;
            }
        } catch (docErr) {
            console.warn('[UCL Documents Save Warning]:', docErr.message);
        }

        res.json({
            success: true,
            parsed,
            document: {
                documentId,
                fileName,
                originalName,
                filePath: relativePath,
                fileSize,
                fileType
            }
        });
    } catch (err) {
        console.error('[UCL Scan Receipt Error]:', err);
        res.status(500).json({ success: false, error: 'Raseed scan nahi ho saki: ' + err.message });
    }
});

// ============================================================================
// 2. GET /api/ucl - List UCL Updates with Search, Filters & KPIs
// ============================================================================
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { search, status, startDate, endDate, page = 1, limit = 50 } = req.query;

        let whereClause = 'WHERE u.IsDeleted = 0 AND u.UserID = @userId';
        const params = { userId };

        if (status && status !== 'all') {
            whereClause += ' AND u.Status = @status';
            params.status = status;
        }

        if (startDate) {
            whereClause += ' AND CAST(u.UpdateDate AS DATE) >= @startDate';
            params.startDate = startDate;
        }

        if (endDate) {
            whereClause += ' AND CAST(u.UpdateDate AS DATE) <= @endDate';
            params.endDate = endDate;
        }

        if (search && search.trim()) {
            params.search = `%${escapeLike(search.trim())}%`;
            whereClause += ` AND (
                u.CustomerName LIKE @search OR
                u.CustomerPhone LIKE @search OR
                u.AadhaarLast4 LIKE @search OR
                u.SID LIKE @search OR
                u.SerialNo LIKE @search OR
                u.PACCode LIKE @search
            )`;
        }

        // Get total count
        const countRes = await query(`
            SELECT COUNT(*) AS total
            FROM UCLUpdates u
            ${whereClause}
        `, params);
        const total = countRes.recordset[0]?.total || 0;

        // KPI aggregates
        const kpiRes = await query(`
            SELECT
                COUNT(*) AS TotalCount,
                SUM(CASE WHEN Status IN ('Generated', 'In-Process', 'Pending', 'Uploaded') THEN 1 ELSE 0 END) AS PendingCount,
                SUM(CASE WHEN Status IN ('Approved', 'Success', 'Generated_Success') THEN 1 ELSE 0 END) AS ApprovedCount,
                ISNULL(SUM(PaidAmount), 0) AS TotalFeesCollected,
                ISNULL(SUM(BalanceAmount), 0) AS TotalBalanceDue
            FROM UCLUpdates
            WHERE IsDeleted = 0 AND UserID = @userId
        `, { userId });
        const kpi = kpiRes.recordset[0] || {};

        // Paginated rows
        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        params.offset = offset;
        params.limit = parseInt(limit);

        const rowsRes = await query(`
            SELECT 
                u.*,
                c.CustomerName AS RegisteredCustomerName,
                c.Phone AS RegisteredCustomerPhone,
                a.AccountName
            FROM UCLUpdates u
            LEFT JOIN Customers c ON u.CustomerID = c.CustomerID
            LEFT JOIN Accounts a ON u.AccountID = a.AccountID
            ${whereClause}
            ORDER BY u.UpdateDate DESC, u.UCLID DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `, params);

        res.json({
            success: true,
            data: rowsRes.recordset,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            stats: {
                total: kpi.TotalCount || 0,
                pending: kpi.PendingCount || 0,
                approved: kpi.ApprovedCount || 0,
                fees: parseFloat(kpi.TotalFeesCollected || 0),
                balance: parseFloat(kpi.TotalBalanceDue || 0)
            }
        });
    } catch (err) {
        console.error('[UCL List Error]:', err);
        res.status(500).json({ success: false, error: 'UCL updates load nahi ho sake: ' + err.message });
    }
});

// ============================================================================
// 3. POST /api/ucl - Create New UCL Update with Auto-Customer & Ledger Sync
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const body = req.body;

        const customerName = (body.customerName || body.CustomerName || '').trim();
        if (!customerName) {
            return res.status(400).json({ success: false, error: 'Customer / Resident naam zaroori hai' });
        }

        const phone = (body.customerPhone || body.CustomerPhone || '').trim();
        const rawAadhaar = (body.aadhaarLast4 || body.AadhaarLast4 || '').trim();
        const aadhaarInput = parseAadhaarInput(rawAadhaar);
        const aadhaarLast4 = aadhaarInput.last4;
        const sid = (body.sid || body.SID || '').trim();
        const updateType = (body.updateType || body.UpdateType || 'Demographics Update').trim();
        const pacCode = (body.pacCode || body.PACCode || '').trim();
        const biometrics = body.biometricsUpdate || body.BiometricsUpdate || 'No';

        // Robust date parsing (handles ISO, YYYY-MM-DD, DD/MM/YYYY)
        let safeDate = new Date();
        const rawDate = body.updateDate || body.UpdateDate;
        if (rawDate) {
            if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(rawDate)) {
                const parts = rawDate.split(/[\/\-]/);
                const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                if (!isNaN(d.getTime())) safeDate = d;
            } else {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) safeDate = d;
            }
        }
        const transDateStr = safeDate.toISOString().slice(0, 10);
        const transTimeStr = safeDate.toTimeString().slice(0, 8);

        const totalFee = parseFloat(body.totalFee ?? body.TotalFee ?? 50.00);
        const operatorFee = parseFloat(body.operatorFee ?? body.OperatorFee ?? 0.00);
        const totalAmount = parseFloat((totalFee + operatorFee).toFixed(2));
        const paidAmount = parseFloat(body.paidAmount ?? body.PaidAmount ?? totalAmount);
        const balanceAmount = parseFloat(Math.max(0, totalAmount - paidAmount).toFixed(2));

        const paymentMode = body.paymentMode || body.PaymentMode || (balanceAmount > 0 ? 'Khata' : 'Cash');
        const accountId = body.accountId || body.AccountID ? parseInt(body.accountId || body.AccountID) : null;
        const status = body.status || body.Status || 'Generated';
        const receiptDocumentId = body.receiptDocumentId || body.ReceiptDocumentID ? parseInt(body.receiptDocumentId || body.ReceiptDocumentID) : null;
        const receiptPath = body.receiptPath || body.ReceiptPath || null;
        const notes = body.notes || body.Notes || null;

        // Column-limit validation (DB truncation se pehle saaf error).
        const lengthErr = uclLengthError([
            ['Customer naam', customerName, 150],
            ['Mobile number', phone, 20],
            ['SID / URN', sid, 60],
            ['Update Type', updateType, 100],
            ['PAC Code', pacCode, 50],
            ['Payment mode', paymentMode, 50],
            ['Status', status, 50],
            ['Receipt path', receiptPath, 500],
            ['Notes', notes, 500]
        ]);
        if (lengthErr) {
            return res.status(400).json({ success: false, error: lengthErr });
        }

        // Auto Customer Resolution (Rule: Zero Duplicates, Auto-Enrichment)
        const custRes = await resolveOrCreateCustomer({
            customerId: body.customerId ? parseInt(body.customerId) : null,
            customerName,
            customerPhone: phone,
            customerAadhaar: aadhaarInput.full || null,
            source: 'Aadhaar UCL Update',
            skipFamilyLink: !!(body.SkipFamilyLink || body.skipFamilyLink),
            userId
        });
        const resolvedCustomerId = custRes.customerId;

        // Atomic Transaction for UCL Record, Global Registry & Ledgers
        const savedRecord = await withTransaction(async (tQuery) => {
            // 1. Insert UCL Record
            const insertRes = await tQuery(`
                INSERT INTO UCLUpdates (
                    UserID, CustomerID, CustomerName, CustomerPhone, AadhaarLast4,
                    AadhaarMasked, SID, UpdateType, PACCode, BiometricsUpdate,
                    UpdateDate, TotalFee, OperatorFee, TotalAmount, PaidAmount,
                    BalanceAmount, PaymentMode, AccountID, Status, ReceiptDocumentID,
                    ReceiptPath, Notes, IsActive, IsDeleted, CreatedAt, UpdatedAt
                ) VALUES (
                    @userId, @customerId, @customerName, @phone, @aadhaarLast4,
                    @aadhaarMasked, @sid, @updateType, @pacCode, @biometrics,
                    @updateDate, @totalFee, @operatorFee, @totalAmount, @paidAmount,
                    @balanceAmount, @paymentMode, @accountId, @status, @receiptDocumentId,
                    @receiptPath, @notes, 1, 0, GETDATE(), GETDATE()
                );
                SELECT SCOPE_IDENTITY() AS UCLID;
            `, {
                userId,
                customerId: resolvedCustomerId,
                customerName,
                phone: phone || null,
                aadhaarLast4: aadhaarLast4 || null,
                aadhaarMasked: aadhaarLast4 ? `XXXX-XXXX-${aadhaarLast4}` : null,
                sid: sid || null,
                updateType,
                pacCode: pacCode || null,
                biometrics,
                updateDate: safeDate,
                totalFee,
                operatorFee,
                totalAmount,
                paidAmount,
                balanceAmount,
                paymentMode,
                accountId,
                status,
                receiptDocumentId,
                receiptPath,
                notes
            });

            const uclId = insertRes.recordset[0].UCLID;

            // 2. Register Global Transaction (Generates SNCode e.g. UCL-1)
            let effGlobSN = null;
            let effSNCode = `UCL-${uclId}`;
            try {
                const regRes = await registerGlobalTransaction({
                    sourceModule: 'UCL',
                    recordId: uclId,
                    entityName: customerName,
                    amount: totalAmount,
                    transDate: safeDate,
                    userId
                }, tQuery);
                if (regRes) {
                    effGlobSN = regRes.globalSerialNo || regRes.GlobalSerialNo || null;
                    effSNCode = regRes.snCode || regRes.SNCode || effSNCode;
                }
            } catch (regErr) {
                console.warn('[UCL Global Registry Warning]:', regErr.message);
            }

            // Update UCL SerialNo
            await tQuery(`UPDATE UCLUpdates SET SerialNo = @sn WHERE UCLID = @id`, {
                sn: effSNCode,
                id: uclId
            });

            // 3. Transactions Table Mirror Entry (Cash in Hand or Bank Account)
            if (paidAmount > 0) {
                // If accountId is null, resolve Default Cash Account
                let effAccountId = accountId;
                if (!effAccountId) {
                    const cashAccRes = await tQuery(`
                        SELECT TOP 1 AccountID FROM Accounts 
                        WHERE UserID = @userId AND AccountType = 'Cash' AND IsActive = 1
                    `, { userId });
                    if (cashAccRes.recordset?.length) {
                        effAccountId = cashAccRes.recordset[0].AccountID;
                    }
                }

                if (effAccountId) {
                    await tQuery(`
                        INSERT INTO Transactions (
                            TransDate, TransTime, TransType, Amount, AccountID,
                            Description, Reference, UserID, Tags,
                            SourceModule, SourceID, LineType,
                            GlobalSerialNo, SNCode, ModuleCode
                        ) VALUES (
                            @transDate, @transTime, 'Income', @amount, @accId,
                            @desc, @ref, @userId, 'UCL',
                            'UCL', @sourceId, 'UCL_FEE_IN',
                            @globSN, @sn, 'UCL'
                        )
                    `, {
                        accId: effAccountId,
                        amount: paidAmount,
                        transDate: transDateStr,
                        transTime: transTimeStr,
                        desc: `UCL Shulk Jama: ${customerName} (${updateType})`,
                        ref: effSNCode,
                        userId,
                        sourceId: uclId,
                        globSN: effGlobSN,
                        sn: effSNCode
                    });

                    // Update account balance
                    await tQuery(`
                        UPDATE Accounts 
                        SET CurrentBalance = CurrentBalance + @amount, UpdatedAt = GETDATE()
                        WHERE AccountID = @accId
                    `, { accId: effAccountId, amount: paidAmount });
                }
            }

            // 4. Khatabook Synchronization (If Udhaar / Balance Due or PaymentMode is Khata)
            if (resolvedCustomerId && (balanceAmount > 0 || paymentMode === 'Khata')) {
                // Customer Gave (Due Shulk)
                await addKhataEntry(tQuery, {
                    CustomerID: resolvedCustomerId,
                    EntryType: 'Gave',
                    Amount: totalAmount,
                    EntryDate: transDateStr,
                    PaymentMode: paymentMode,
                    Description: `Aadhaar UCL Update Shulk (${updateType}) [${effSNCode}]`,
                    ReferenceNo: effSNCode,
                    UserID: userId,
                    GlobalSerialNo: effGlobSN,
                    SNCode: effSNCode,
                    ModuleCode: 'UCL',
                    SourceModule: 'UCL',
                    SourceID: uclId
                });

                // If partially paid in cash/online, record Got entry
                if (paidAmount > 0) {
                    await addKhataEntry(tQuery, {
                        CustomerID: resolvedCustomerId,
                        EntryType: 'Got',
                        Amount: paidAmount,
                        EntryDate: transDateStr,
                        PaymentMode: paymentMode,
                        Description: `UCL Jama (${paymentMode}) [${effSNCode}]`,
                        ReferenceNo: `${effSNCode}-PAY`,
                        UserID: userId,
                        GlobalSerialNo: effGlobSN,
                        SNCode: effSNCode,
                        ModuleCode: 'UCL',
                        SourceModule: 'UCL',
                        SourceID: uclId
                    });
                }

                // Zero balance drift: recalculate customer ledger balance
                await refreshCustomerBalance(tQuery, resolvedCustomerId);
            }

            // 5. PAC Code linkage (If PAC code was provided, mark it Used)
            if (pacCode) {
                await tQuery(`
                    UPDATE PACEntries
                    SET Status = 'Used',
                        UsedForUCLID = @uclId,
                        UsedForCustomerName = @cName,
                        UsedForSID = @sid,
                        UsedDate = GETDATE(),
                        UpdatedAt = GETDATE()
                    WHERE PACCode = @pacCode AND UserID = @userId
                `, {
                    uclId,
                    cName: customerName,
                    sid: sid || null,
                    pacCode,
                    userId
                });
            }

            // 6. Link Document EntityID
            if (receiptDocumentId) {
                await tQuery(`
                    UPDATE Documents
                    SET EntityID = @uclId, CustomerID = @custId
                    WHERE DocumentID = @docId
                `, {
                    uclId,
                    custId: resolvedCustomerId,
                    docId: receiptDocumentId
                });
            }

            return {
                uclId,
                serialNo: effSNCode,
                customerName,
                totalAmount,
                paidAmount,
                balanceAmount
            };
        });

        await logAudit({
            userId,
            action: 'CREATE',
            module: 'UCL',
            tableName: 'UCLUpdates',
            recordId: savedRecord.uclId,
            entityName: customerName,
            amount: totalAmount,
            description: `UCL Update ${savedRecord.serialNo} - ${customerName}`,
            newData: { serialNo: savedRecord.serialNo, customerName, totalAmount }
        });

        res.json({
            success: true,
            data: savedRecord,
            message: `Aadhaar UCL Update ${savedRecord.serialNo} darz ho gaya!`
        });
    } catch (err) {
        console.error('[UCL Create Error]:', err);
        res.status(500).json({ success: false, error: 'UCL update save nahi ho saka: ' + friendlyUclError(err) });
    }
});

// ============================================================================
// 4. GET /api/ucl/:id - Single Record Details
// ============================================================================
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id);

        const recRes = await query(`
            SELECT 
                u.*,
                c.CustomerName AS RegisteredCustomerName,
                c.Phone AS RegisteredCustomerPhone,
                a.AccountName
            FROM UCLUpdates u
            LEFT JOIN Customers c ON u.CustomerID = c.CustomerID
            LEFT JOIN Accounts a ON u.AccountID = a.AccountID
            WHERE u.UCLID = @id AND u.UserID = @userId AND u.IsDeleted = 0
        `, { id, userId });

        if (!recRes.recordset?.length) {
            return res.status(404).json({ success: false, error: 'UCL update record nahi mila' });
        }

        res.json({ success: true, data: recRes.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// 5. PUT /api/ucl/:id - Update UCL Record Status or Details
// ============================================================================
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id);
        const body = req.body;

        const customerName = (body.customerName || body.CustomerName || '').trim();
        const phone = (body.customerPhone || body.CustomerPhone || '').trim();
        const rawAadhaar = (body.aadhaarLast4 || body.AadhaarLast4 || '').trim();
        const aadhaarLast4 = parseAadhaarInput(rawAadhaar).last4;
        const sid = (body.sid || body.SID || '').trim();
        const updateType = (body.updateType || body.UpdateType || 'Demographics Update').trim();
        const biometrics = body.biometricsUpdate || body.BiometricsUpdate || 'No';
        const status = body.status || body.Status || 'Generated';
        const notes = body.notes || body.Notes || null;

        const totalFee = parseFloat(body.totalFee ?? body.TotalFee ?? 50.00);
        const operatorFee = parseFloat(body.operatorFee ?? body.OperatorFee ?? 0.00);
        const totalAmount = parseFloat((totalFee + operatorFee).toFixed(2));
        const paidAmount = parseFloat(body.paidAmount ?? body.PaidAmount ?? totalAmount);
        const balanceAmount = parseFloat(Math.max(0, totalAmount - paidAmount).toFixed(2));
        const paymentMode = body.paymentMode || body.PaymentMode || (balanceAmount > 0 ? 'Khata' : 'Cash');

        // Column-limit validation (DB truncation se pehle saaf error).
        const lengthErr = uclLengthError([
            ['Customer naam', customerName, 150],
            ['Mobile number', phone, 20],
            ['SID / URN', sid, 60],
            ['Update Type', updateType, 100],
            ['Payment mode', paymentMode, 50],
            ['Status', status, 50],
            ['Notes', notes, 500]
        ]);
        if (lengthErr) {
            return res.status(400).json({ success: false, error: lengthErr });
        }

        await withTransaction(async (tQuery) => {
            const curRes = await tQuery(`SELECT * FROM UCLUpdates WHERE UCLID = @id AND UserID = @userId AND IsDeleted = 0`, { id, userId });
            if (!curRes.recordset?.length) {
                throw new Error('UCL Update record nahi mila');
            }
            const old = curRes.recordset[0];
            const effCustomerId = old.CustomerID;
            const finalCustName = customerName || old.CustomerName;

            // 1. Update UCL Record
            await tQuery(`
                UPDATE UCLUpdates
                SET CustomerName = @customerName,
                    CustomerPhone = @phone,
                    AadhaarLast4 = @aadhaarLast4,
                    AadhaarMasked = CASE WHEN @aadhaarLast4 IS NOT NULL THEN 'XXXX-XXXX-' + @aadhaarLast4 ELSE AadhaarMasked END,
                    SID = @sid,
                    UpdateType = @updateType,
                    BiometricsUpdate = @biometrics,
                    TotalFee = @totalFee,
                    OperatorFee = @operatorFee,
                    TotalAmount = @totalAmount,
                    PaidAmount = @paidAmount,
                    BalanceAmount = @balanceAmount,
                    PaymentMode = @paymentMode,
                    Status = @status,
                    Notes = @notes,
                    UpdatedAt = GETDATE()
                WHERE UCLID = @id AND UserID = @userId
            `, {
                id,
                userId,
                customerName: finalCustName,
                phone: phone || old.CustomerPhone || null,
                aadhaarLast4: aadhaarLast4 || old.AadhaarLast4 || null,
                sid: sid || old.SID || null,
                updateType,
                biometrics,
                totalFee,
                operatorFee,
                totalAmount,
                paidAmount,
                balanceAmount,
                paymentMode,
                status,
                notes
            });

            // 2. Update Global Transaction Registry
            try {
                await updateGlobalTransaction({
                    sourceModule: 'UCL',
                    recordId: id,
                    entityName: finalCustName,
                    amount: totalAmount
                }, tQuery);
            } catch (err) {
                console.warn('[UCL Global Registry Update Warning]:', err.message);
            }

            // 3. Transactions Mirror Update
            const oldPaid = parseFloat(old.PaidAmount || 0);
            const paidDiff = paidAmount - oldPaid;
            if (paidDiff !== 0) {
                const mRes = await tQuery(`SELECT TOP 1 TransactionID, AccountID FROM Transactions WHERE SourceModule = 'UCL' AND SourceID = @id`, { id });
                if (mRes.recordset?.length) {
                    const accId = mRes.recordset[0].AccountID;
                    await tQuery(`UPDATE Transactions SET Amount = @amt, Description = @desc WHERE TransactionID = @txId`, {
                        amt: paidAmount,
                        desc: `UCL Shulk Jama: ${finalCustName} (${updateType})`,
                        txId: mRes.recordset[0].TransactionID
                    });
                    await tQuery(`UPDATE Accounts SET CurrentBalance = CurrentBalance + @diff, UpdatedAt = GETDATE() WHERE AccountID = @accId`, {
                        accId,
                        diff: paidDiff
                    });
                }
            }

            // 4. Khatabook sync if customer linked
            if (effCustomerId) {
                const kRes = await tQuery(`SELECT KhataID, EntryType FROM KhataEntries WHERE SourceModule = 'UCL' AND SourceID = @id`, { id });
                if (kRes.recordset?.length) {
                    for (const ke of kRes.recordset) {
                        if (ke.EntryType === 'Gave') {
                            await tQuery(`UPDATE KhataEntries SET Amount = @amt, Description = @desc WHERE KhataID = @kid`, {
                                amt: totalAmount,
                                desc: `Aadhaar UCL Update Shulk (${updateType}) [${old.SerialNo || 'UCL-' + id}]`,
                                kid: ke.KhataID
                            });
                        } else if (ke.EntryType === 'Got') {
                            await tQuery(`UPDATE KhataEntries SET Amount = @amt, Description = @desc WHERE KhataID = @kid`, {
                                amt: paidAmount,
                                desc: `UCL Jama (${paymentMode}) [${old.SerialNo || 'UCL-' + id}]`,
                                kid: ke.KhataID
                            });
                        }
                    }
                    await refreshCustomerBalance(tQuery, effCustomerId);
                } else if (balanceAmount > 0 || paymentMode === 'Khata') {
                    await addKhataEntry(tQuery, {
                        CustomerID: effCustomerId,
                        EntryType: 'Gave',
                        Amount: totalAmount,
                        PaymentMode: paymentMode,
                        Description: `Aadhaar UCL Update Shulk (${updateType}) [${old.SerialNo || 'UCL-' + id}]`,
                        ReferenceNo: old.SerialNo || `UCL-${id}`,
                        UserID: userId,
                        GlobalSerialNo: old.GlobalSerialNo,
                        SNCode: old.SerialNo,
                        ModuleCode: 'UCL',
                        SourceModule: 'UCL',
                        SourceID: id
                    });
                    if (paidAmount > 0) {
                        await addKhataEntry(tQuery, {
                            CustomerID: effCustomerId,
                            EntryType: 'Got',
                            Amount: paidAmount,
                            PaymentMode: paymentMode,
                            Description: `UCL Jama (${paymentMode}) [${old.SerialNo || 'UCL-' + id}]`,
                            ReferenceNo: `${old.SerialNo || 'UCL-' + id}-PAY`,
                            UserID: userId,
                            GlobalSerialNo: old.GlobalSerialNo,
                            SNCode: old.SerialNo,
                            ModuleCode: 'UCL',
                            SourceModule: 'UCL',
                            SourceID: id
                        });
                    }
                    await refreshCustomerBalance(tQuery, effCustomerId);
                }
            }
        });

        await logAudit({
            userId,
            action: 'UPDATE',
            module: 'UCL',
            tableName: 'UCLUpdates',
            recordId: id,
            entityName: customerName || null,
            amount: totalAmount,
            description: `UCL Update #${id} updated`,
            newData: { customerName, totalAmount, paidAmount, status }
        });

        res.json({ success: true, message: 'UCL record safaltapoorvak update ho gaya' });
    } catch (err) {
        console.error('[UCL Update Error]:', err);
        res.status(500).json({ success: false, error: friendlyUclError(err) });
    }
});

// ============================================================================
// 6. DELETE /api/ucl/:id - Soft Delete UCL Record
// ============================================================================
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id);

        await withTransaction(async (tQuery) => {
            // Record owner + account BEFORE deleting mirrors (delete ke baad nahi milega).
            const uclRec = await tQuery(
                `SELECT CustomerID, AccountID FROM UCLUpdates WHERE UCLID = @id AND UserID = @userId`,
                { id, userId }
            );
            const custId = uclRec.recordset[0]?.CustomerID;
            const uclAccountId = uclRec.recordset[0]?.AccountID || null;

            // Soft delete UCL
            await tQuery(`
                UPDATE UCLUpdates
                SET IsDeleted = 1, UpdatedAt = GETDATE()
                WHERE UCLID = @id AND UserID = @userId
            `, { id, userId });

            // Deactivate global registry
            await deactivateGlobalTransaction('UCL', id, tQuery);

            // Kaun-kaun se accounts is UCL ke mirror transactions se affected hain
            // (delete se pehle capture karo, warna rows gayab ho jayengi).
            const accRes = await tQuery(`
                SELECT DISTINCT AccountID FROM Transactions
                WHERE SourceModule = 'UCL' AND SourceID = @id AND UserID = @userId AND AccountID IS NOT NULL
                UNION
                SELECT DISTINCT ToAccountID AS AccountID FROM Transactions
                WHERE SourceModule = 'UCL' AND SourceID = @id AND UserID = @userId AND ToAccountID IS NOT NULL
            `, { id, userId });
            const affectedAccounts = new Set(
                accRes.recordset.map(r => parseInt(r.AccountID)).filter(n => n > 0)
            );
            if (uclAccountId) affectedAccounts.add(parseInt(uclAccountId));

            // Remove mirror transactions
            await tQuery(`
                DELETE FROM Transactions
                WHERE SourceModule = 'UCL' AND SourceID = @id AND UserID = @userId
            `, { id, userId });

            // Remove Khata entries
            await tQuery(`
                DELETE FROM KhataEntries
                WHERE SourceModule = 'UCL' AND SourceID = @id AND UserID = @userId
            `, { id, userId });

            // Recompute affected account balances from ledgers.
            // Warna delete ke baad cash/bank balance stale (inflated) reh jata hai.
            for (const accId of affectedAccounts) {
                await tQuery(`EXEC sp_UpdateAccountBalance @id`, { id: accId });
            }

            if (custId) {
                await refreshCustomerBalance(tQuery, custId);
            }
        });

        await logAudit({
            userId,
            action: 'DELETE',
            module: 'UCL',
            tableName: 'UCLUpdates',
            recordId: id
        });

        res.json({ success: true, message: 'UCL record hata diya gaya' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
