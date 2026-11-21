const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const { query, withTransaction } = require('../database/db');
const { logAudit } = require('../utils/auditLogger');
const { escapeLike, todayLocal } = require('../utils/helpers');
const { resolveOrCreateCustomer } = require('../database/customerAutoRegister');
const { registerGlobalTransaction, deactivateGlobalTransaction, updateGlobalTransaction } = require('../database/globalTxnRegistry');
const { writeBillPayLedger } = require('../database/billPayLedger');
const { resolveTenantBillAccounts } = require('../utils/billPaymentAccounts');
const { syncBillPaymentToKhata, refreshCustomerBalance } = require('../database/khataEngine');

// ---------------------------------------------------------------------------
// Document Upload Directory Setup
// ---------------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'documents');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = ext.replace(/[^a-z0-9.]/g, '').substring(0, 10) || '.jpg';
        const unique = `DOC_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
        cb(null, unique + safeExt);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }
});

function cleanCustomerName(name) {
    if (!name) return '';
    let s = String(name).trim();
    // 1. Remove prefixes like M/s., Shri, Smt, Sri, Mr., Mrs., Ms., Late, Doctor, Dr.
    s = s.replace(/^(?:M\/s\.?|M\/S\.?|Shri\.?|Smt\.?|Sri\.?|Mr\.?|Mrs\.?|Ms\.?|Late\.?|Doctor\.?|Dr\.?)\s*/i, '');
    s = s.replace(/^[:\-–—#=\s\.]+/, '').trim();
    s = s.replace(/\s+/g, ' ');
    // 2. Auto-correct uppercase or all-caps to Title Case (e.g. "RAMESH KUMAR" -> "Ramesh Kumar")
    s = s.toLowerCase().replace(/(?:^|[\s\(\[\{\.\-\/])\p{L}/gu, m => m.toUpperCase());
    return s;
}

function calculateCommission(category, amount) {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return 0;
    const cat = String(category || '').toLowerCase();

    // Sirf Bijli Bill (Electricity) me commission milta hai
    if (cat.includes('electric') || cat.includes('bijli')) {
        if (amt >= 200 && amt <= 2000) return 15.00;
        if (amt > 2000) return parseFloat((amt * 0.005).toFixed(2));
        return 0;
    }
    // Loan EMI, Mobile Kist ya kisi anya me commission nahi milta (0.00)
    return 0;
}

// AEPS Shulk Slab: ₹1-1000: 10, 1001-2000: 20, 2001-3000: 30, ..., min ₹10
function calculateBillCustomerCharge(category, amount) {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return 10;
    const cat = String(category || '').toLowerCase();
    if (cat.includes('loan') || cat.includes('emi') || cat.includes('kist') || cat.includes('finance')) {
        return Math.max(10, Math.ceil(amt / 1000) * 10);
    }
    return 10;
}

// ============================================================================
// Intelligent Receipt Parser (PhonePe / GPay / Paytm / UPPCL / Loan EMI)
// ============================================================================
function parseBillReceipt(text) {
    if (!text || typeof text !== 'string') return {};
    const res = {
        billCategory: 'Loan_EMI',
        providerName: '',
        consumerNumber: '',
        billNumber: '',
        customerName: '',
        billAmount: 0,
        customerCharge: 10,
        commission: 0,
        paymentDate: '',
        billDate: '',
        txnRef: '',
        notes: '',
        rawText: text
    };

    // 1. Category detection
    if (/electricity|bijli|uppcl|power|discom|vidyut/i.test(text)) {
        res.billCategory = 'Electricity';
    } else if (/loan|installment|emi|kist|finance|credit|fincorp/i.test(text)) {
        res.billCategory = 'Loan_EMI';
    } else if (/mobile.*finance|phone.*kist|samsung.*finance/i.test(text)) {
        res.billCategory = 'Mobile_Kist';
    } else if (/fastag|netc/i.test(text)) {
        res.billCategory = 'Fastag';
    } else if (/dth|tatasky|tata play|dish tv|sun direct|airtel dth/i.test(text)) {
        res.billCategory = 'DTH_Recharge';
    } else if (/insurance|lic\b|premium/i.test(text)) {
        res.billCategory = 'Insurance';
    }

    // 2. Provider detection
    const providers = [
        'DMI Finance', 'Bajaj Finance', 'TVS Credit', 'Samsung Finance+',
        'Hero Fincorp', 'L&T Finance', 'Muthoot Finance', 'Cholamandalam',
        'Home Credit', 'Piramal Finance', 'IDFC First', 'HDB Financial',
        'UPPCL (MVVNL - मध्यांचल)', 'UPPCL (PVVNL - पश्चिमांचल)',
        'UPPCL (PuVVNL - पूर्वांचल)', 'UPPCL (DVVNL - दक्षिणांचल)',
        'Airtel Postpaid / Fiber', 'Jio Postpaid / Fiber'
    ];
    for (const p of providers) {
        const cleanP = p.split('(')[0].replace(/\+/g, '').trim();
        const re = new RegExp(cleanP, 'i');
        if (re.test(text)) {
            res.providerName = p;
            break;
        }
    }

    // 3. Customer Name
    const custMatch = text.match(/(?:Customer|Grahak|Beneficiary|Consumer|Payer)\s*Name\s*[:\-\.©®~]*\s*([^\r\n]+)/i);
    if (custMatch) {
        let name = custMatch[1].replace(/^[.\s\-_,:]+/, '').trim();
        name = name.split(/\s{2,}|\t|\n|Bill Number/i)[0].trim();
        res.customerName = cleanCustomerName(name);
    }

    // 4. Consumer / Loan Number
    const loanNumMatch = text.match(/\b(DMI\d{8,14}|LNT\d{8,14}|TVS\d{8,14}|BJJ\d{8,14}|[A-Z]{2,6}\d{8,16})\b/i);
    if (loanNumMatch) {
        res.consumerNumber = loanNumMatch[1].trim();
    } else {
        const accMatch = text.match(/(?:Consumer|Account|Loan|Kist|CA)\s*(?:Number|No\.?|Id)?\s*[:\-\.©®~]*\s*([A-Za-z0-9]+)/i);
        if (accMatch) res.consumerNumber = accMatch[1].trim();
    }

    // 5. Bill Number / UTR / Reference
    const billNoMatch = text.match(/Bill\s*Number\s*[:\-\.©®~]*\s*([A-Za-z0-9]+(?:\s*[0-9]+)?)/i);
    if (billNoMatch) {
        res.billNumber = billNoMatch[1].replace(/\s+/g, '').trim();
    }
    const txnMatch = text.match(/(?:UTR|RRN|Txn\s*ID|Transaction\s*ID|Reference\s*No\.?)\s*[:\-\.©®~]*\s*([0-9A-Za-z]+)/i);
    if (txnMatch) {
        res.txnRef = txnMatch[1].trim();
    }

    // 6. Amounts (Total Amount / Bill Amount)
    const totalAmtMatch = text.match(/Total\s*Amount\s*[:\-\.©®~]*\s*(?:Rs\.?|INR|₹|%)?\s*([0-9,]+\.[0-9]{2}|[0-9,]+)/i);
    if (totalAmtMatch) {
        res.billAmount = parseFloat(totalAmtMatch[1].replace(/,/g, ''));
    } else {
        const billAmtMatch = text.match(/Bill\s*Amount\s*[:\-\.©®~]*\s*(?:Rs\.?|INR|₹|%|\+)?\s*([0-9,]+\.[0-9]{2}|[0-9,]+)/i);
        if (billAmtMatch) {
            res.billAmount = parseFloat(billAmtMatch[1].replace(/,/g, ''));
        } else {
            const genAmtMatch = text.match(/(?:Amount|Paid)\s*[:\-\.©®~]*\s*(?:Rs\.?|INR|₹|%|\+)?\s*([0-9,]+\.[0-9]{2}|[0-9,]+)/i);
            if (genAmtMatch) {
                res.billAmount = parseFloat(genAmtMatch[1].replace(/,/g, ''));
            }
        }
    }

    // Commission
    res.commission = calculateCommission(res.billCategory, res.billAmount);
    // Customer Charge (AEPS slab for Loan EMI, flat 10 for Electricity)
    res.customerCharge = calculateBillCustomerCharge(res.billCategory, res.billAmount);

    // 7. Payment Date
    const payDateMatch = text.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i) ||
        text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
    if (payDateMatch) {
        const d = new Date(payDateMatch[1]);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dt = String(d.getDate()).padStart(2, '0');
            res.paymentDate = `${y}-${m}-${dt}`;
        }
    }

    // 8. Bill Date
    const billDateMatch = text.match(/Bill\s*Date\s*[:\-\.©®~]*\s*(\d{1,2}[\-\/][A-Za-z]{3,9}[\-\/]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{4})/i);
    if (billDateMatch) {
        const d = new Date(billDateMatch[1]);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dt = String(d.getDate()).padStart(2, '0');
            res.billDate = `${y}-${m}-${dt}`;
        }
    }

    // 9. Extra Fields & Dynamic Custom Columns Detection
    res.extraFields = {};
    const emiM = text.match(/EMI\s*[:\-\.©®~]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (emiM && parseFloat(emiM[1]) > 0) res.extraFields['EMI Rashi'] = `₹${emiM[1]}`;

    const bncM = text.match(/Bounce\s*Charges?\s*[:\-\.©®~]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (bncM && parseFloat(bncM[1]) > 0) res.extraFields['Bounce Charges'] = `₹${bncM[1]}`;

    const penalM = text.match(/Penal\s*Charges?\s*[:\-\.©®~]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (penalM && parseFloat(penalM[1]) > 0) res.extraFields['Penal Charges'] = `₹${penalM[1]}`;

    const nonNachM = text.match(/Non-NACH[^\n\r:]*[:\-\.©®~]*\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (nonNachM && parseFloat(nonNachM[1]) > 0) res.extraFields['Non-NACH Fee'] = `₹${nonNachM[1]}`;

    const feeM = text.match(/Service\s*fee.*[:\-\.©®~]*\s*\+?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (feeM && parseFloat(feeM[1]) > 0) res.extraFields['Service Fee'] = `₹${feeM[1]}`;

    const meterM = text.match(/Meter\s*(?:No\.?|Number)\s*[:\-\.©®~]*\s*([A-Za-z0-9\-]+)/i);
    if (meterM) res.extraFields['Meter No'] = meterM[1].trim();

    const divM = text.match(/(?:Division|Sub-Division|Discom)\s*[:\-\.©®~]*\s*([A-Za-z0-9\-\s]+)/i);
    if (divM) res.extraFields['Division'] = divM[1].trim();

    // 10. Clean Notes & Breakdown
    const breakdown = [];
    for (const [k, v] of Object.entries(res.extraFields)) {
        breakdown.push(`${k}: ${v}`);
    }
    if (res.billDate) breakdown.push(`Bill Date: ${res.billDate}`);
    if (res.txnRef) breakdown.push(`Ref: ${res.txnRef}`);
    if (breakdown.length) res.notes = breakdown.join(' | ');

    return res;
}

// ============================================================================
// 0. POST /api/bill-payments/scan-receipt - AI OCR Scanner & Auto-Fill Endpoint
// ============================================================================
router.post('/scan-receipt', upload.single('receipt'), async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Koi raseed file nahi mili' });
        }

        const filePath = req.file.path;
        const fileName = req.file.filename;
        const originalName = req.file.originalname || fileName;
        const fileType = req.file.mimetype || 'image/jpeg';
        const fileSize = req.file.size || 0;
        const relativePath = `/uploads/documents/${fileName}`;

        // 1. Run Tesseract OCR on the receipt
        let ocrText = '';
        try {
            const ocrResult = await Tesseract.recognize(filePath, 'eng');
            ocrText = ocrResult?.data?.text || '';
        } catch (ocrErr) {
            console.error('Tesseract OCR error:', ocrErr);
        }

        // 2. Parse details from OCR text
        const parsed = parseBillReceipt(ocrText);

        // 3. Save pending record in Documents table
        let documentId = null;
        try {
            const docRes = await query(`
                INSERT INTO Documents (
                    UserID, CustomerID, FileName, OriginalName, FileType, FileSize, FilePath,
                    UploadedBy, Description, IsArchived, CreatedAt, UpdatedAt, EntityType, EntityID
                ) VALUES (
                    @userId, NULL, @fileName, @originalName, @fileType, @fileSize, @filePath,
                    'shop', @description, 0, GETDATE(), GETDATE(), 'BillPay', NULL
                );
                SELECT SCOPE_IDENTITY() AS DocumentID;
            `, {
                userId,
                fileName,
                originalName,
                fileType,
                fileSize,
                filePath: relativePath,
                description: `Bill Payment Receipt: ${parsed.providerName || 'Utility'} (₹${parsed.billAmount || 0})`
            });
            if (docRes.recordset?.length) {
                documentId = docRes.recordset[0].DocumentID;
            }
        } catch (docDbErr) {
            console.warn('Documents table save warning:', docDbErr.message);
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
        console.error('Scan receipt error:', err);
        res.status(500).json({ success: false, error: 'Raseed scan nahi ho saki: ' + err.message });
    }
});

// ============================================================================
// 1. GET /api/bill-payments - List Payments with Filters & Pagination
// ============================================================================
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const { search, category, startDate, endDate, page = 1, limit = 50 } = req.query;

        let whereClause = 'WHERE bp.IsDeleted = 0 AND bp.UserID = @userId';
        const params = { userId };

        if (search && search.trim()) {
            whereClause += ` AND (
                bp.CustomerName LIKE @searchEsc OR
                bp.CustomerPhone LIKE @searchEsc OR
                bp.ConsumerNumber LIKE @searchEsc OR
                bp.BillNumber LIKE @searchEsc OR
                bp.ProviderName LIKE @searchEsc OR
                bp.TxnReference LIKE @searchEsc OR
                bp.ModuleCode LIKE @searchEsc OR
                bp.SNCode LIKE @searchEsc
            )`;
            params.searchEsc = `%${escapeLike(search.trim())}%`;
        }

        if (category && category !== 'all') {
            whereClause += ' AND bp.BillCategory = @category';
            params.category = category;
        }

        if (startDate) {
            whereClause += ' AND bp.PaymentDate >= @startDate';
            params.startDate = startDate;
        }

        if (endDate) {
            whereClause += ' AND bp.PaymentDate <= @endDate';
            params.endDate = endDate;
        }

        // Count total
        const countSql = `SELECT COUNT(*) AS total FROM BillPayments bp ${whereClause}`;
        const countResult = await query(countSql, params);
        const totalRecords = countResult.recordset[0].total;

        // Fetch records
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * limitNum;
        const dataSql = `
            SELECT bp.*, c.FamilyName, c.Relationship, c.IsFamilyHead
            FROM BillPayments bp
            LEFT JOIN Customers c ON bp.CustomerID = c.CustomerID
            ${whereClause}
            ORDER BY bp.PaymentDate DESC, bp.PaymentID DESC
            OFFSET ${offset} ROWS FETCH NEXT ${limitNum} ROWS ONLY
        `;
        const dataResult = await query(dataSql, params);

        // Quick Stats for KPI
        const statsSql = `
            SELECT 
                COUNT(*) AS TotalBills,
                ISNULL(SUM(CASE WHEN bp.PaymentDate = CAST(GETDATE() AS DATE) THEN bp.TotalCollected ELSE 0 END), 0) AS TodayCollections,
                ISNULL(SUM(CASE WHEN bp.PaymentDate = CAST(GETDATE() AS DATE) THEN bp.NetProfit ELSE 0 END), 0) AS TodayProfit,
                ISNULL(SUM(CASE WHEN bp.PaymentDate = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END), 0) AS TodayCount,
                ISNULL(SUM(CASE WHEN MONTH(bp.PaymentDate) = MONTH(GETDATE()) AND YEAR(bp.PaymentDate) = YEAR(GETDATE()) THEN bp.TotalCollected ELSE 0 END), 0) AS MonthCollections,
                ISNULL(SUM(CASE WHEN MONTH(bp.PaymentDate) = MONTH(GETDATE()) AND YEAR(bp.PaymentDate) = YEAR(GETDATE()) THEN bp.NetProfit ELSE 0 END), 0) AS MonthProfit,
                ISNULL(SUM(CASE WHEN MONTH(bp.PaymentDate) = MONTH(GETDATE()) AND YEAR(bp.PaymentDate) = YEAR(GETDATE()) THEN 1 ELSE 0 END), 0) AS MonthCount,
                ISNULL(SUM(bp.TotalCollected), 0) AS LifetimeCollections,
                ISNULL(SUM(bp.NetProfit), 0) AS LifetimeProfit
            FROM BillPayments bp
            WHERE bp.IsDeleted = 0 AND bp.UserID = @userId
        `;
        const statsResult = await query(statsSql, { userId });

        const sRow = statsResult.recordset[0] || {};
        res.json({
            success: true,
            data: dataResult.recordset,
            records: dataResult.recordset,
            pagination: {
                total: totalRecords,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                totalPages: Math.ceil(totalRecords / parseInt(limit, 10))
            },
            stats: {
                todayCollected: sRow.TodayCollections || 0,
                todayProfit: sRow.TodayProfit || 0,
                todayCount: sRow.TodayCount || 0,
                monthCollected: sRow.MonthCollections || 0,
                monthProfit: sRow.MonthProfit || 0,
                lifetimeCollected: sRow.LifetimeCollections || 0,
                lifetimeProfit: sRow.LifetimeProfit || 0,
                ...sRow
            }
        });
    } catch (err) {
        console.error('Error fetching bill payments:', err);
        res.status(500).json({ success: false, error: 'Bill payments fetch karne me error aaya: ' + err.message });
    }
});

// ============================================================================
// 2. GET /api/bill-payments/stats - Quick KPI Stats
// ============================================================================
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const statsSql = `
            SELECT 
                COUNT(*) AS TotalBills,
                ISNULL(SUM(CASE WHEN bp.PaymentDate = CAST(GETDATE() AS DATE) THEN bp.TotalCollected ELSE 0 END), 0) AS TodayCollections,
                ISNULL(SUM(CASE WHEN bp.PaymentDate = CAST(GETDATE() AS DATE) THEN bp.NetProfit ELSE 0 END), 0) AS TodayProfit,
                ISNULL(SUM(CASE WHEN bp.PaymentDate = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END), 0) AS TodayCount,
                ISNULL(SUM(CASE WHEN MONTH(bp.PaymentDate) = MONTH(GETDATE()) AND YEAR(bp.PaymentDate) = YEAR(GETDATE()) THEN bp.TotalCollected ELSE 0 END), 0) AS MonthCollections,
                ISNULL(SUM(CASE WHEN MONTH(bp.PaymentDate) = MONTH(GETDATE()) AND YEAR(bp.PaymentDate) = YEAR(GETDATE()) THEN bp.NetProfit ELSE 0 END), 0) AS MonthProfit,
                ISNULL(SUM(CASE WHEN MONTH(bp.PaymentDate) = MONTH(GETDATE()) AND YEAR(bp.PaymentDate) = YEAR(GETDATE()) THEN 1 ELSE 0 END), 0) AS MonthCount,
                ISNULL(SUM(bp.TotalCollected), 0) AS LifetimeCollections,
                ISNULL(SUM(bp.NetProfit), 0) AS LifetimeProfit
            FROM BillPayments bp
            WHERE bp.IsDeleted = 0 AND bp.UserID = @userId
        `;
        const statsResult = await query(statsSql, { userId });
        res.json({ success: true, stats: statsResult.recordset[0] || {} });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// 3. GET /api/bill-payments/:id - Single Bill Payment
// ============================================================================
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id, 10);
        const result = await query(
            `SELECT bp.*, c.FamilyName, c.Relationship, c.IsFamilyHead 
             FROM BillPayments bp 
             LEFT JOIN Customers c ON bp.CustomerID = c.CustomerID 
             WHERE bp.PaymentID = @id AND bp.UserID = @userId AND bp.IsDeleted = 0`,
            { id, userId }
        );
        if (!result.recordset.length) {
            return res.status(404).json({ success: false, error: 'Bill payment record nahi mila' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// 4. POST /api/bill-payments - Create New Bill Payment Entry
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const {
            CustomerName,
            CustomerPhone,
            CustomerAadhaar,
            BillCategory = 'Electricity',
            ProviderName,
            ConsumerNumber,
            BillNumber,
            BillDate,
            DueDate,
            BillAmount,
            CustomerCharge = 10,
            CommissionEarned,
            RemainingArrear = 0,
            PaymentMode = 'Cash',
            WalletAccountID,
            CashAccountID,
            Status,
            TxnReference,
            PaymentDate,
            PaymentTime,
            Notes
        } = req.body;

        const cleanCustName = cleanCustomerName(CustomerName);
        if (!cleanCustName) {
            return res.status(400).json({ success: false, error: 'Grahak ka naam aavashyak hai.' });
        }
        if (!ConsumerNumber) {
            return res.status(400).json({ success: false, error: 'Khata / Consumer / Loan number aavashyak hai.' });
        }

        // Multi-Tenant Isolation: Validate and resolve active accounts belonging strictly to this UserID
        let effWalletId, effCashId;
        try {
            const resolvedAccs = await resolveTenantBillAccounts(userId, WalletAccountID, CashAccountID, query);
            effWalletId = resolvedAccs.effWalletId;
            effCashId = resolvedAccs.effCashId;
        } catch (accErr) {
            return res.status(400).json({ success: false, error: accErr.message });
        }

        const numBillAmount = parseFloat(BillAmount) || 0;
        const numTotalBillAmount = parseFloat(req.body.TotalBillAmount) || numBillAmount;
        const defaultCharge = calculateBillCustomerCharge(BillCategory, numBillAmount);
        const numCustomerCharge = !isNaN(parseFloat(CustomerCharge)) ? parseFloat(CustomerCharge) : defaultCharge;
        const numCommission = CommissionEarned !== undefined ? (parseFloat(CommissionEarned) || 0) : calculateCommission(BillCategory, numBillAmount);
        const numRecoveredPastDue = req.body.RecoveredPastDue !== undefined && !isNaN(parseFloat(req.body.RecoveredPastDue))
            ? Math.max(0, parseFloat(req.body.RecoveredPastDue))
            : 0;
        const numPayable = parseFloat((numBillAmount + numCustomerCharge + numRecoveredPastDue).toFixed(2));
        let numTotalCollected = parseFloat(req.body.TotalCollected);
        if (isNaN(numTotalCollected) || (numTotalCollected <= 0 && parseFloat(req.body.CustomerDue || 0) <= 0 && numPayable > 0)) {
            numTotalCollected = parseFloat(req.body.CashReceived) || numPayable;
        }
        const numCustomerDue = req.body.CustomerDue !== undefined && !isNaN(parseFloat(req.body.CustomerDue))
            ? parseFloat(req.body.CustomerDue)
            : Math.max(0, parseFloat((numPayable - numTotalCollected).toFixed(2)));
        const numNetProfit = parseFloat((numCustomerCharge + numCommission).toFixed(2));
        const numRemainingArrear = req.body.RemainingArrear !== undefined && !isNaN(parseFloat(req.body.RemainingArrear))
            ? parseFloat(req.body.RemainingArrear)
            : Math.max(0, parseFloat((numTotalBillAmount - numBillAmount).toFixed(2)));

        const resolvedStatus = numCustomerDue > 0 ? 'Partial' : (Status === 'Failed' ? 'Failed' : 'Success');

        // Auto-Register or resolve Customer in Customers table
        let resolvedCustomerId = null;
        let customerResolution = { isNew: false, customer: null };
        try {
            customerResolution = await resolveOrCreateCustomer({
                customerName: cleanCustName,
                customerPhone: CustomerPhone || null,
                phone: CustomerPhone || null,
                customerAadhaar: CustomerAadhaar || null,
                aadhaar: CustomerAadhaar || null,
                source: `Auto-registered via Bill Payment (${BillCategory} - ${ProviderName || ''})`,
                notes: `Auto-registered via Bill Payment (${BillCategory} - ${ProviderName || ''})`,
                skipFamilyLink: !!(req.body.SkipFamilyLink || req.body.skipFamilyLink),
                userId
            });
            if (customerResolution && customerResolution.customer) {
                resolvedCustomerId = customerResolution.customer.CustomerID;
            }
        } catch (cErr) {
            console.error('Customer auto-resolution warning:', cErr.message);
        }

        const todayStr = todayLocal();
        const payDate = PaymentDate || todayStr;
        const payTime = PaymentTime || new Date().toLocaleTimeString('en-US', { hour12: false });

        let newPaymentId = null;
        let txnRef = '';
        let globalTxn = null;
        const createdKhataEntries = [];

        // Atomic Execution: Insert BillPayment + Accounting Transactions + Khata in one single DB transaction
        await withTransaction(async (tQuery) => {
            // 1. Insert into BillPayments
            const insertSql = `
                INSERT INTO BillPayments (
                    CustomerID, CustomerName, CustomerPhone, CustomerAadhaar,
                    BillCategory, ProviderName, ConsumerNumber, BillNumber,
                    BillDate, DueDate, TotalBillAmount, BillAmount, CustomerCharge, TotalCollected,
                    CustomerDue, CommissionEarned, NetProfit, RemainingArrear, PaymentMode,
                    WalletAccountID, CashAccountID, Status, TxnReference,
                    PaymentDate, PaymentTime, Notes, ExtraFieldsJson, UserID
                )
                OUTPUT INSERTED.PaymentID
                VALUES (
                    @CustomerID, @CustomerName, @CustomerPhone, @CustomerAadhaar,
                    @BillCategory, @ProviderName, @ConsumerNumber, @BillNumber,
                    @BillDate, @DueDate, @TotalBillAmount, @BillAmount, @CustomerCharge, @TotalCollected,
                    @CustomerDue, @CommissionEarned, @NetProfit, @RemainingArrear, @PaymentMode,
                    @WalletAccountID, @CashAccountID, @Status, @TxnReference,
                    @PaymentDate, @PaymentTime, @Notes, @ExtraFieldsJson, @UserID
                )
            `;

            const insertParams = {
                CustomerID: resolvedCustomerId,
                CustomerName: cleanCustName,
                CustomerPhone: CustomerPhone || null,
                CustomerAadhaar: CustomerAadhaar || null,
                BillCategory: BillCategory || 'Electricity',
                ProviderName: ProviderName || 'UPPCL (MVVNL)',
                ConsumerNumber: ConsumerNumber,
                BillNumber: BillNumber || null,
                BillDate: BillDate || null,
                DueDate: DueDate || null,
                TotalBillAmount: numTotalBillAmount,
                BillAmount: numBillAmount,
                CustomerCharge: numCustomerCharge,
                TotalCollected: numTotalCollected,
                CustomerDue: numCustomerDue,
                CommissionEarned: numCommission,
                NetProfit: numNetProfit,
                RemainingArrear: numRemainingArrear,
                PaymentMode: PaymentMode || 'Cash',
                WalletAccountID: effWalletId,
                CashAccountID: effCashId,
                Status: resolvedStatus,
                TxnReference: TxnReference || null,
                PaymentDate: payDate,
                PaymentTime: payTime,
                Notes: Notes || null,
                ExtraFieldsJson: req.body.ExtraFieldsJson ? (typeof req.body.ExtraFieldsJson === 'object' ? JSON.stringify(req.body.ExtraFieldsJson) : String(req.body.ExtraFieldsJson)) : null,
                UserID: userId
            };

            const result = await tQuery(insertSql, insertParams);
            newPaymentId = result.recordset[0].PaymentID;
            const bpRef = `BP-${newPaymentId}`;
            txnRef = bpRef;

            // 2. Universal Global Transaction Registry (BP-xxx)
            try {
                globalTxn = await registerGlobalTransaction({
                    sourceModule: 'BillPay',
                    recordId: newPaymentId,
                    entityName: `${cleanCustName} (${BillCategory})`,
                    amount: numTotalCollected,
                    transDate: payDate,
                    userId
                }, tQuery);
            } catch (gErr) {
                console.error('registerGlobalTransaction error for BillPay:', gErr.message);
                throw new Error('Universal SN Registry me BillPay register nahi ho saka: ' + gErr.message);
            }

            // 3. Dual-Entry Accounting via Rule 1 Single Helper (BILL_OUT + CASH_IN)
            await writeBillPayLedger(tQuery, {
                PaymentID: newPaymentId,
                UserID: userId,
                WalletAccountID: effWalletId,
                CashAccountID: effCashId,
                BillAmount: numBillAmount,
                TotalCollected: numTotalCollected,
                PaymentDate: payDate,
                CustomerName: cleanCustName,
                BillCategory,
                ProviderName,
                ConsumerNumber,
                CustomerCharge: numCustomerCharge,
                GlobalSerialNo: globalTxn?.globalSerialNo,
                SNCode: globalTxn?.snCode,
                ModuleCode: globalTxn?.moduleCode
            }, 'CREATE');

            // 4. Khatabook Ledger Integration (Idempotent: Gave + Got entries in Khata for complete audit passbook)
            if (resolvedCustomerId) {
                await syncBillPaymentToKhata(tQuery, {
                    CustomerID: resolvedCustomerId,
                    PaymentID: newPaymentId,
                    BillCategory,
                    ProviderName,
                    ConsumerNumber,
                    TotalPayable: numPayable,
                    TotalCollected: numTotalCollected,
                    EntryDate: payDate,
                    EntryTime: payTime,
                    PaymentMode: PaymentMode || 'Cash',
                    UserID: userId,
                    TxnReference: TxnReference || bpRef
                });
            }
        });

        // Link attached document (if uploaded via OCR scanner)
        const docId = req.body.DocumentID ? parseInt(req.body.DocumentID, 10) : null;
        if (docId && newPaymentId) {
            try {
                await query(`
                    UPDATE Documents 
                    SET EntityType = 'BillPay',
                        EntityID = @paymentId,
                        CustomerID = @customerId,
                        Description = @desc,
                        UpdatedAt = GETDATE()
                    WHERE DocumentID = @docId AND UserID = @userId
                `, {
                    paymentId: newPaymentId,
                    customerId: resolvedCustomerId,
                    desc: `${BillCategory} Receipt: ${ProviderName} [₹${numBillAmount}] - ${cleanCustName}`,
                    docId,
                    userId
                });
            } catch (docErr) {
                console.warn('Document attach warning:', docErr.message);
            }
        }

        // Audit Log
        try {
            await logAudit({
                action: 'CREATE',
                tableName: 'BillPayments',
                recordId: newPaymentId,
                entityName: cleanCustName,
                amount: numTotalCollected,
                module: 'BillPay',
                description: `Naya Bill Payment entry: ${BillCategory} - ${ProviderName} (₹${numBillAmount} + ₹${numCustomerCharge})`,
                userId
            });
        } catch (_) { }

        res.status(201).json({
            success: true,
            message: `Bill Payment safaltapoorvak save ho gaya! (₹${numTotalCollected})`,
            paymentId: newPaymentId,
            globalSerialNo: globalTxn?.globalSerialNo || null,
            snCode: globalTxn?.snCode || null,
            moduleCode: globalTxn?.moduleCode || null,
            customerId: resolvedCustomerId,
            customer: customerResolution.customer
        });

    } catch (err) {
        console.error('Error creating bill payment:', err);
        res.status(500).json({ success: false, error: 'Bill payment save karne me error: ' + err.message });
    }
});

// ============================================================================
// 5. PUT /api/bill-payments/:id - Edit / Update Existing Bill Payment Entry
// Recalculates 3 impacts: 
//   1. Wallet Outflow (Transactions table)
//   2. Cash Inflow (Transactions table)
//   3. Customer Khata Udhaar (KhataEntries table)
// ============================================================================
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id, 10);

        if (!id || isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Awaidh Payment ID' });
        }

        // 1. Fetch existing record
        const check = await query(
            "SELECT * FROM BillPayments WHERE PaymentID = @id AND UserID = @userId AND IsDeleted = 0",
            { id, userId }
        );
        if (!check.recordset.length) {
            return res.status(404).json({ success: false, error: 'Bill payment record nahi mila ya pehle se deleted hai' });
        }
        const oldBp = check.recordset[0];

        const {
            CustomerName,
            CustomerPhone,
            CustomerAadhaar,
            BillCategory = oldBp.BillCategory || 'Electricity',
            ProviderName = oldBp.ProviderName,
            ConsumerNumber = oldBp.ConsumerNumber,
            BillNumber,
            BillDate,
            DueDate,
            BillAmount,
            CustomerCharge,
            CommissionEarned,
            RemainingArrear,
            PaymentMode = oldBp.PaymentMode || 'Cash',
            WalletAccountID,
            CashAccountID,
            Status,
            TxnReference,
            PaymentDate,
            PaymentTime,
            Notes
        } = req.body;

        const cleanCustName = cleanCustomerName(CustomerName || oldBp.CustomerName);
        if (!cleanCustName) {
            return res.status(400).json({ success: false, error: 'Grahak ka naam aavashyak hai.' });
        }
        if (!ConsumerNumber) {
            return res.status(400).json({ success: false, error: 'Khata / Consumer / Loan number aavashyak hai.' });
        }

        const targetWalletId = (WalletAccountID !== undefined) ? WalletAccountID : oldBp.WalletAccountID;
        const targetCashId = (CashAccountID !== undefined) ? CashAccountID : oldBp.CashAccountID;
        let effWalletId, effCashId;
        try {
            const resolvedAccs = await resolveTenantBillAccounts(userId, targetWalletId, targetCashId, query);
            effWalletId = resolvedAccs.effWalletId;
            effCashId = resolvedAccs.effCashId;
        } catch (accErr) {
            return res.status(400).json({ success: false, error: accErr.message });
        }

        const numBillAmount = parseFloat(BillAmount) || 0;
        const numTotalBillAmount = parseFloat(req.body.TotalBillAmount) || numBillAmount;
        const defaultCharge = calculateBillCustomerCharge(BillCategory, numBillAmount);
        const numCustomerCharge = !isNaN(parseFloat(CustomerCharge)) ? parseFloat(CustomerCharge) : defaultCharge;
        const numCommission = CommissionEarned !== undefined ? (parseFloat(CommissionEarned) || 0) : calculateCommission(BillCategory, numBillAmount);
        const numRecoveredPastDue = req.body.RecoveredPastDue !== undefined && !isNaN(parseFloat(req.body.RecoveredPastDue))
            ? Math.max(0, parseFloat(req.body.RecoveredPastDue))
            : 0;
        const numPayable = parseFloat((numBillAmount + numCustomerCharge + numRecoveredPastDue).toFixed(2));

        let numTotalCollected = parseFloat(req.body.TotalCollected);
        if (isNaN(numTotalCollected) || (numTotalCollected <= 0 && parseFloat(req.body.CustomerDue || 0) <= 0 && numPayable > 0)) {
            numTotalCollected = parseFloat(req.body.CashReceived) || numPayable;
        }
        const numCustomerDue = req.body.CustomerDue !== undefined && !isNaN(parseFloat(req.body.CustomerDue))
            ? parseFloat(req.body.CustomerDue)
            : Math.max(0, parseFloat((numPayable - numTotalCollected).toFixed(2)));
        const numNetProfit = parseFloat((numCustomerCharge + numCommission).toFixed(2));
        const numRemainingArrear = req.body.RemainingArrear !== undefined && !isNaN(parseFloat(req.body.RemainingArrear))
            ? parseFloat(req.body.RemainingArrear)
            : Math.max(0, parseFloat((numTotalBillAmount - numBillAmount).toFixed(2)));

        const resolvedStatus = numCustomerDue > 0 ? 'Partial' : (Status === 'Failed' ? 'Failed' : 'Success');

        // Auto-Register or resolve Customer in Customers table
        let resolvedCustomerId = oldBp.CustomerID;
        const updatedKhataEntries = [];
        try {
            const customerResolution = await resolveOrCreateCustomer({
                customerName: cleanCustName,
                customerPhone: CustomerPhone || null,
                phone: CustomerPhone || null,
                customerAadhaar: CustomerAadhaar || null,
                aadhaar: CustomerAadhaar || null,
                source: `Auto-registered via Bill Payment (${BillCategory} - ${ProviderName || ''})`,
                notes: `Auto-registered via Bill Payment (${BillCategory} - ${ProviderName || ''})`,
                skipFamilyLink: !!(req.body.SkipFamilyLink || req.body.skipFamilyLink),
                userId
            });
            if (customerResolution && customerResolution.customer) {
                resolvedCustomerId = customerResolution.customer.CustomerID;
            }
        } catch (cErr) {
            console.error('Customer auto-resolution warning on edit:', cErr.message);
        }

        const todayStr = todayLocal();
        const payDate = PaymentDate || (oldBp.PaymentDate ? (oldBp.PaymentDate.toISOString ? oldBp.PaymentDate.toISOString().split('T')[0] : String(oldBp.PaymentDate).slice(0, 10)) : todayStr);
        const payTime = PaymentTime || oldBp.PaymentTime || new Date().toLocaleTimeString('en-US', { hour12: false });
        const oldWalletId = oldBp.WalletAccountID;
        const oldCashId = oldBp.CashAccountID;
        const oldCustomerId = oldBp.CustomerID;
        const bpRef = `BP-${id}`;
        const cleanTxnRef = TxnReference !== undefined ? (TxnReference || null) : (oldBp.TxnReference || null);

        // Atomic DB Transaction: Recalculate and update the 3 impacts + BillPayments
        await withTransaction(async (tQuery) => {
            // -------------------------------------------------------------
            // IMPACT 1 & 2: Wallet & Cash Ledger via Rule 1 writeBillPayLedger
            // -------------------------------------------------------------
            await writeBillPayLedger(tQuery, {
                PaymentID: id,
                UserID: userId,
                WalletAccountID: effWalletId,
                CashAccountID: effCashId,
                BillAmount: numBillAmount,
                TotalCollected: numTotalCollected,
                PaymentDate: payDate,
                CustomerName: cleanCustName,
                BillCategory,
                ProviderName,
                ConsumerNumber,
                CustomerCharge: numCustomerCharge,
                GlobalSerialNo: oldBp.GlobalSerialNo,
                SNCode: oldBp.SNCode,
                ModuleCode: oldBp.ModuleCode
            }, 'UPDATE', { oldWalletId, oldCashId });

            // -------------------------------------------------------------
            // IMPACT 3: Customer Udhaar / Khatabook Recalculation (KhataEntries)
            // -------------------------------------------------------------
            if (oldCustomerId && oldCustomerId !== resolvedCustomerId) {
                await tQuery(`
                    UPDATE UniversalTxnRegistry
                    SET IsActive = 0
                    WHERE SourceModule = 'Khata'
                      AND RecordID IN (
                          SELECT KhataID FROM KhataEntries
                          WHERE UserID = @userId AND (PaymentID = @id OR ReferenceNo = @ref1 OR ReferenceNo = @ref2)
                      )
                `, { userId, id, ref1: bpRef, ref2: `${bpRef}-PAY` });

                await tQuery(`
                    DELETE FROM KhataEntries
                    WHERE UserID = @userId AND (PaymentID = @id OR ReferenceNo = @ref1 OR ReferenceNo = @ref2)
                `, { userId, id, ref1: bpRef, ref2: `${bpRef}-PAY` });

                await refreshCustomerBalance(tQuery, oldCustomerId);
            }

            if (resolvedCustomerId) {
                await syncBillPaymentToKhata(tQuery, {
                    CustomerID: resolvedCustomerId,
                    PaymentID: id,
                    BillCategory,
                    ProviderName,
                    ConsumerNumber,
                    TotalPayable: numPayable,
                    TotalCollected: numTotalCollected,
                    EntryDate: payDate,
                    EntryTime: payTime,
                    PaymentMode: PaymentMode || 'Cash',
                    UserID: userId,
                    TxnReference: cleanTxnRef || bpRef
                });
            }

            // -------------------------------------------------------------
            // 4. Update BillPayments Table Row
            // -------------------------------------------------------------
            const updateSql = `
                UPDATE BillPayments SET
                    CustomerID = @CustomerID,
                    CustomerName = @CustomerName,
                    CustomerPhone = @CustomerPhone,
                    CustomerAadhaar = @CustomerAadhaar,
                    BillCategory = @BillCategory,
                    ProviderName = @ProviderName,
                    ConsumerNumber = @ConsumerNumber,
                    BillNumber = @BillNumber,
                    BillDate = @BillDate,
                    DueDate = @DueDate,
                    TotalBillAmount = @TotalBillAmount,
                    BillAmount = @BillAmount,
                    CustomerCharge = @CustomerCharge,
                    TotalCollected = @TotalCollected,
                    CustomerDue = @CustomerDue,
                    CommissionEarned = @CommissionEarned,
                    NetProfit = @NetProfit,
                    RemainingArrear = @RemainingArrear,
                    PaymentMode = @PaymentMode,
                    WalletAccountID = @WalletAccountID,
                    CashAccountID = @CashAccountID,
                    Status = @Status,
                    TxnReference = @TxnReference,
                    PaymentDate = @PaymentDate,
                    PaymentTime = @PaymentTime,
                    Notes = @Notes,
                    ExtraFieldsJson = @ExtraFieldsJson,
                    UpdatedAt = GETDATE()
                WHERE PaymentID = @id AND UserID = @userId
            `;

            const updateParams = {
                id,
                CustomerID: resolvedCustomerId,
                CustomerName: cleanCustName,
                CustomerPhone: CustomerPhone || null,
                CustomerAadhaar: CustomerAadhaar || null,
                BillCategory: BillCategory || 'Electricity',
                ProviderName: ProviderName || '',
                ConsumerNumber: ConsumerNumber,
                BillNumber: BillNumber || null,
                BillDate: BillDate || null,
                DueDate: DueDate || null,
                TotalBillAmount: numTotalBillAmount,
                BillAmount: numBillAmount,
                CustomerCharge: numCustomerCharge,
                TotalCollected: numTotalCollected,
                CustomerDue: numCustomerDue,
                CommissionEarned: numCommission,
                NetProfit: numNetProfit,
                RemainingArrear: numRemainingArrear,
                PaymentMode: PaymentMode || 'Cash',
                WalletAccountID: effWalletId,
                CashAccountID: effCashId,
                Status: resolvedStatus,
                TxnReference: cleanTxnRef,
                PaymentDate: payDate,
                PaymentTime: payTime,
                Notes: Notes || null,
                ExtraFieldsJson: req.body.ExtraFieldsJson ? (typeof req.body.ExtraFieldsJson === 'object' ? JSON.stringify(req.body.ExtraFieldsJson) : String(req.body.ExtraFieldsJson)) : null,
                userId
            };

            await tQuery(updateSql, updateParams);

            // Update Universal Transaction Registry
            try {
                if (typeof updateGlobalTransaction === 'function') {
                    await updateGlobalTransaction({
                        sourceModule: 'BillPay',
                        recordId: id,
                        entityName: `${cleanCustName} (${BillCategory})`,
                        amount: numTotalCollected,
                        transDate: payDate
                    }, tQuery);
                }
            } catch (gErr) {
                console.error('UniversalTxnRegistry update warning:', gErr.message);
            }

            // Propagate Universal SN to child Cashbook Transactions on Edit
            try {
                const bpSnRes = await tQuery(`SELECT GlobalSerialNo, SNCode, ModuleCode FROM BillPayments WHERE PaymentID = @id`, { id });
                const bpSn = bpSnRes.recordset[0];
                if (bpSn?.GlobalSerialNo) {
                    await tQuery(`
                        UPDATE Transactions
                        SET GlobalSerialNo = @sn, SNCode = @snCode, ModuleCode = @modCode
                        WHERE UserID = @userId AND GlobalSerialNo IS NULL
                          AND SourceModule = 'BillPay' AND SourceID = @id
                    `, {
                        sn: bpSn.GlobalSerialNo,
                        snCode: bpSn.SNCode,
                        modCode: bpSn.ModuleCode,
                        userId,
                        id
                    });
                }
            } catch (propErr) {
                console.error('Failed to propagate BillPay Universal SN to Transactions on edit:', propErr);
                throw new Error('Failed to propagate BillPay Universal SN to Transactions on edit: ' + propErr.message);
            }
        });

        // Audit Log
        try {
            await logAudit({
                action: 'UPDATE',
                tableName: 'BillPayments',
                recordId: id,
                entityName: cleanCustName,
                amount: numTotalCollected,
                module: 'BillPay',
                description: `Bill payment ID ${id} edit kiya gaya. Galla (₹${numTotalCollected}), Wallet (₹${numBillAmount}), Udhaar (₹${numCustomerDue}) teeno recalculate ho gaye.`,
                userId
            });
        } catch (_) { }

        res.json({
            success: true,
            message: `Bill Payment safaltapoorvak update ho gaya! (Galla, Wallet aur Khata teeno recalculate ho gaye)`,
            paymentId: id
        });

    } catch (err) {
        console.error('Error updating bill payment:', err);
        res.status(500).json({ success: false, error: 'Bill payment update karne me error: ' + err.message });
    }
});

// ============================================================================
// 6. DELETE /api/bill-payments/:id - Soft Delete Entry with Complete Accounting Reversal
// ============================================================================
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const id = parseInt(req.params.id, 10);

        const check = await query(
            "SELECT * FROM BillPayments WHERE PaymentID = @id AND UserID = @userId AND IsDeleted = 0",
            { id, userId }
        );
        if (!check.recordset.length) {
            return res.status(404).json({ success: false, error: 'Record nahi mila ya pehle se deleted hai' });
        }
        const bp = check.recordset[0];

        // Atomic Reversal via Single DB Transaction
        await withTransaction(async (tQuery) => {
            // 1. Mark as Deleted
            await tQuery(
                "UPDATE BillPayments SET IsDeleted = 1, UpdatedAt = GETDATE() WHERE PaymentID = @id",
                { id }
            );

            // 2. Reverse Ledger Transactions via Single writeBillPayLedger Helper (Rule 1)
            await writeBillPayLedger(tQuery, bp, 'DELETE');

            // 4. Reverse Customer Bill Entries in Khata
            if (bp.CustomerID) {
                await tQuery(`
                    UPDATE UniversalTxnRegistry
                    SET IsActive = 0
                    WHERE SourceModule = 'Khata'
                      AND RecordID IN (
                          SELECT KhataID FROM KhataEntries
                          WHERE CustomerID = @cId AND UserID = @userId 
                            AND (PaymentID = @id OR ReferenceNo = @ref1 OR ReferenceNo = @ref2)
                      )
                `, { cId: bp.CustomerID, userId, id, ref1: `BP-${id}`, ref2: `BP-${id}-PAY` });

                await tQuery(`
                    DELETE FROM KhataEntries
                    WHERE CustomerID = @cId AND UserID = @userId 
                      AND (PaymentID = @id OR ReferenceNo = @ref1 OR ReferenceNo = @ref2)
                `, { cId: bp.CustomerID, userId, id, ref1: `BP-${id}`, ref2: `BP-${id}-PAY` });
                await refreshCustomerBalance(tQuery, bp.CustomerID);
            }

            await deactivateGlobalTransaction('BillPay', id, tQuery);
        });

        try {
            await logAudit({
                action: 'DELETE',
                tableName: 'BillPayments',
                recordId: id,
                entityName: bp.CustomerName,
                amount: bp.TotalCollected,
                module: 'BillPay',
                description: `Bill payment entry delete ki gayi (ID: ${id}) aur sabhi khate reverse ho gaye.`,
                userId
            });
        } catch (_) { }

        res.json({ success: true, message: 'Bill payment record delete ho gaya aur Accounts/Khata reverse ho gaye.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
