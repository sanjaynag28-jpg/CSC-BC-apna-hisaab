const ExcelJS = require('exceljs');
const { query, withTransaction } = require('../database/db');
const { syncCSCToKhata, processKhataAfterChange } = require('../database/khataEngine');
const { registerGlobalTransaction } = require('../database/globalTxnRegistry');
const { escapeLike } = require('../utils/helpers');

// Standard expected service delivery days catalog
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

// Helper: Normalize 10-digit phone
function normalizePhone(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : (digits.length > 0 ? digits : null);
}

// Helper: Normalize 12-digit Aadhaar
function normalizeAadhaar(aadhaar) {
    if (!aadhaar) return null;
    const digits = String(aadhaar).replace(/\D/g, '');
    return digits.length === 12 ? digits : (digits.length > 0 ? digits : null);
}

// Helper: Aadhaar exactly 12 digits hona chahiye (customers route ke rule ke mutabik)
function isValidAadhaar(aadhaar) {
    return !!aadhaar && /^\d{12}$/.test(String(aadhaar));
}

// Helper: Excel cell se paisa parse karo.
// "1,200.50" / "₹1200" / "Rs. 1,20,000.75" / "(500)" / 1200.50 sab sahi se padhe.
// Pehle sirf parseFloat use hota tha -> "1,200.50" par sirf 1 milta tha (paisa galat!)
function parseExcelMoney(val, fallback = 0) {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : fallback;
    }
    let s = String(val).trim();
    if (!s) return fallback;

    let negative = false;
    // (500) / (1,200.50) -> accounting negative notation
    if (/^\(.*\)$/.test(s)) {
        negative = true;
        s = s.slice(1, -1);
    }
    // Currency symbol aur words hatao
    s = s.replace(/[₹$€£]/g, '').replace(/\b(rs\.?|inr|ruppees?)\b/gi, '').trim();
    // Leading/trailing minus
    if (/^[-−–]/.test(s)) {
        negative = !negative;
        s = s.replace(/^[-−–]\s*/, '');
    }
    // Indian (1,20,000) aur Western (1,200) dono grouping hatao
    s = s.replace(/,/g, '');
    // Spaces / aakhri mein "Rs."
    s = s.replace(/\s+/g, '').replace(/\.$/, '');

    if (s === '' || s === '-' || s === '.') return fallback;

    const n = parseFloat(s);
    if (!Number.isFinite(n)) return fallback;
    return negative ? -n : n;
}

// Helper: Local timezone date (YYYY-MM-DD) — toISOString() UTC hota hai
function localYMD(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Helper: Date string (YYYY-MM-DD) se local Date object (timezone shift nahi)
function parseYMD(str) {
    if (!str) return null;
    const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Helper: Parse Date from Excel (handles Date object, ISO string, DD/MM/YYYY, Excel serial number)
function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return localYMD(val);
    }
    if (typeof val === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + val * 86400000);
        return localYMD(date);
    }
    if (typeof val === 'string') {
        const str = val.trim();
        if (!str) return null;
        // DD/MM/YYYY or DD-MM-YYYY
        const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (dmyMatch) {
            const day = dmyMatch[1].padStart(2, '0');
            const month = dmyMatch[2].padStart(2, '0');
            const year = dmyMatch[3];
            return `${year}-${month}-${day}`;
        }
        // YYYY-MM-DD
        const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
        if (ymdMatch) {
            const year = ymdMatch[1];
            const month = ymdMatch[2].padStart(2, '0');
            const day = ymdMatch[3].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            // Local date (toISOString UTC hota hai - IST me ek din peeche)
            return localYMD(parsed);
        }
    }
    return null;
}

// Helper: Format Date for Display
function formatDateDisplay(d) {
    if (!d) return '';
    try {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return String(d);
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return String(d);
    }
}

// Helper: Auto-fit columns with padding
function autoFitColumns(worksheet, minWidth = 12) {
    worksheet.columns.forEach(column => {
        let maxLen = minWidth;
        if (column.header) {
            maxLen = Math.max(maxLen, String(column.header).length + 4);
        }
        column.eachCell({ includeEmpty: false }, cell => {
            const val = cell.value;
            if (val !== undefined && val !== null) {
                let cellLen = 0;
                if (typeof val === 'object' && val.text) {
                    cellLen = String(val.text).length;
                } else {
                    cellLen = String(val).length;
                }
                if (cellLen > maxLen) {
                    maxLen = Math.min(cellLen + 3, 50); // cap max width to 50
                }
            }
        });
        column.width = maxLen;
    });
}

// ============================================================================
// 1. CUSTOMERS EXPORT TO EXCEL (.xlsx)
// ============================================================================
async function exportCustomersToExcel(res, userId) {
    try {
        const sql = `
            SELECT c.*,
                   p.CustomerName as ParentCustomerName,
                   (SELECT COUNT(*) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) AS FamilyMembersCount,
                   (SELECT COUNT(*) FROM Invoices i WHERE i.CustomerID = c.CustomerID AND i.Status != 'Cancelled' AND i.UserID = @userId) AS TotalBills,
                   (SELECT COUNT(*) FROM KhataEntries k WHERE k.CustomerID = c.CustomerID AND k.UserID = @userId) AS TotalKhataEntries
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            WHERE c.IsActive = 1 AND c.UserID = @userId
            ORDER BY c.CustomerID ASC
        `;
        const result = await query(sql, { userId });
        const customers = result.recordset || [];

        // Summary calculations
        const totalCustomers = customers.length;
        const totalToReceive = customers.reduce((sum, c) => sum + (c.CurrentBalance > 0 ? parseFloat(c.CurrentBalance) : 0), 0);
        const totalToPay = customers.reduce((sum, c) => sum + (c.CurrentBalance < 0 ? Math.abs(parseFloat(c.CurrentBalance)) : 0), 0);
        const netBalance = totalToReceive - totalToPay;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Cash Management & BC System';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Grahak Data (Customers)', {
            views: [{ showGridLines: true }]
        });

        // 1. Main Title Banner Row
        const titleRow = sheet.addRow(['CASH MANAGEMENT SYSTEM - CUSTOMER DIRECTORY (ग्राहक सूची)']);
        titleRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Dark Slate
        sheet.mergeCells('A1:S1');
        titleRow.height = 34;
        titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // 2. Subtitle / Summary Stats Row
        const subRow = sheet.addRow([
            `Kul Grahak: ${totalCustomers} | Lena Hai (Udhaar): ₹${totalToReceive.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Dena Hai (Advance): ₹${totalToPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Net Khata: ₹${netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Export Tarikh: ${new Date().toLocaleString('en-IN')}`
        ]);
        subRow.font = { italic: true, size: 10, color: { argb: 'FFFFFFFF' } };
        subRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        sheet.mergeCells('A2:S2');
        subRow.height = 22;
        subRow.alignment = { vertical: 'middle', horizontal: 'center' };

        sheet.addRow([]); // Blank spacer row

        // 3. Table Column Headers
        const headerRow = sheet.addRow([
            'Customer ID',
            'Grahak ka Naam (Customer Name)',
            'Mobile Number',
            '12-Digit Aadhaar',
            'Parivar Pad (Head / Member)',
            'Rishta (Relationship)',
            'Parivar Mukhiya (Family Head)',
            'Parivar ID',
            'Khata Mode',
            'Current Balance (₹)',
            'Hisaab Type',
            'Opening Balance (₹)',
            'Pata (Address)',
            'Date of Birth',
            'Email',
            'GSTIN',
            'Udhaar Limit (₹)',
            'Total Bills',
            'Notes'
        ]);

        headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Vibrant Teal Header
        headerRow.height = 26;
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // 4. Data Rows
        customers.forEach((c, idx) => {
            const isHead = c.IsFamilyHead === 1 || c.IsFamilyHead === true;
            const headLabel = isHead ? 'Mukhiya (Head)' : 'Sadasya (Member)';
            const headName = isHead ? c.CustomerName : (c.ParentCustomerName || `ID #${c.FamilyID || c.ParentCustomerID || ''}`);
            const balType = c.CurrentBalance > 0 ? 'ToReceive (Lena Hai)' : (c.CurrentBalance < 0 ? 'ToPay (Dena Hai)' : 'Settled (Chukta)');
            const dobStr = c.DateOfBirth ? formatDateDisplay(c.DateOfBirth) : '';

            const row = sheet.addRow([
                c.CustomerID,
                c.CustomerName || '',
                c.Phone || '',
                c.AadhaarNumber ? String(c.AadhaarNumber) : '',
                headLabel,
                c.Relationship || (isHead ? 'Self' : 'Anya (Other)'),
                headName,
                c.FamilyID || c.CustomerID,
                c.KhataMode || 'Separate',
                parseFloat(c.CurrentBalance || 0),
                balType,
                parseFloat(c.OpeningBalance || 0),
                c.Address || '',
                dobStr,
                c.Email || '',
                c.GSTIN || '',
                parseFloat(c.CreditLimit || 0),
                c.TotalBills || 0,
                c.Notes || ''
            ]);

            row.height = 22;
            row.alignment = { vertical: 'middle' };

            // Zebra striping
            if (idx % 2 === 1) {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }

            // Alignments & formats
            row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }; // ID
            row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' }; // Phone
            row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' }; // Aadhaar
            row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' }; // Head/Member
            row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' }; // Relationship
            row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' }; // Family ID
            row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' }; // Khata Mode
            row.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' }; // Hisaab Type
            row.getCell(14).alignment = { vertical: 'middle', horizontal: 'center' }; // DOB

            // Currency formatting
            row.getCell(10).numFmt = '₹#,##0.00;[Red]-₹#,##0.00;"₹0.00"';
            row.getCell(12).numFmt = '₹#,##0.00;[Red]-₹#,##0.00;"₹0.00"';
            row.getCell(17).numFmt = '₹#,##0.00;"₹0.00"';

            // Text color on balance
            if (c.CurrentBalance > 0) {
                row.getCell(10).font = { bold: true, color: { argb: 'FFDC2626' } }; // Red for Lena Hai (Udhaar)
            } else if (c.CurrentBalance < 0) {
                row.getCell(10).font = { bold: true, color: { argb: 'FF16A34A' } }; // Green for Dena Hai (Advance)
            }

            // Border for each cell
            row.eachCell({ includeEmpty: true }, cell => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            });
        });

        autoFitColumns(sheet, 14);

        const filename = `Customers_List_${localYMD(new Date())}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error in exportCustomersToExcel:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
}

// ============================================================================
// 2. CUSTOMERS EXCEL SAMPLE TEMPLATE DOWNLOAD (.xlsx)
// ============================================================================
async function getCustomersTemplateExcel(res) {
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Cash Management & BC System';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Customer Import Template', {
            views: [{ showGridLines: true }]
        });

        // Title row
        const titleRow = sheet.addRow(['CASH MANAGEMENT SYSTEM - CUSTOMER IMPORT TEMPLATE (ग्राहक आयात टेम्पलेट)']);
        titleRow.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        sheet.mergeCells('A1:L1');
        titleRow.height = 30;
        titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Instructions row
        const hintRow = sheet.addRow([
            '⚠️ Zaroori Nirdesh: CustomerName likhna zaroori hai. Duplicate Aadhaar ya Name+Phone aane par auto-skip honge. Shared mobile number par Parivar detect hoga aur Relationship auto "Anya (Other)" select ho jayega.'
        ]);
        hintRow.font = { italic: true, size: 9.5, color: { argb: 'FFFFFFFF' } };
        hintRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        sheet.mergeCells('A2:L2');
        hintRow.height = 22;
        hintRow.alignment = { vertical: 'middle', horizontal: 'center' };

        sheet.addRow([]); // Blank spacer

        // Column Headers
        const headerRow = sheet.addRow([
            'CustomerName',
            'Phone',
            'AadhaarNumber',
            'Relationship',
            'OpeningBalance',
            'BalanceType',
            'CreditLimit',
            'Address',
            'DateOfBirth',
            'Email',
            'GSTIN',
            'Notes'
        ]);

        headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo Header
        headerRow.height = 26;
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // 3 Sample Rows
        const sampleRows = [
            [
                'Ramesh Kumar (Mukhiya)',
                '9876543210',
                '123456789012',
                'Self',
                1500,
                'ToReceive',
                5000,
                'Main Market, Ward No. 4',
                '1985-06-15',
                'ramesh@example.com',
                '',
                'Purana kirana grahak'
            ],
            [
                'Sita Devi (Family Sadasya)',
                '9876543210',
                '234567890123',
                'Anya (Other)',
                0,
                'Settled',
                0,
                'Main Market, Ward No. 4',
                '1989-08-20',
                '',
                '',
                'Ramesh ji ke parivar sadasya (Phone same hai, auto family judegi)'
            ],
            [
                'Vikas Sharma',
                '9811223344',
                '345678901234',
                'Self',
                500,
                'ToPay',
                10000,
                'Near Bus Stand, Station Road',
                '1992-11-10',
                'vikas@example.com',
                '09AAACH7409R1ZZ',
                'Advance jama paisa'
            ]
        ];

        sampleRows.forEach(sr => {
            const row = sheet.addRow(sr);
            row.height = 22;
            row.alignment = { vertical: 'middle' };
            row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(5).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(7).numFmt = '₹#,##0.00;"₹0.00"';
        });

        autoFitColumns(sheet, 16);

        const filename = 'Customer_Import_Template.xlsx';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error generating customer template:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
}

// ============================================================================
// 3. CUSTOMERS EXCEL IMPORT WITH DUPLICATE SKIP & FAMILY AUTO-OTHER
// ============================================================================
async function importCustomersFromExcel(fileBuffer, originalName, userId) {
    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('Khali (Empty) file upload hui hai');
    }

    const workbook = new ExcelJS.Workbook();
    const isCsv = (originalName || '').toLowerCase().endsWith('.csv');

    if (isCsv) {
        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(fileBuffer);
        await workbook.csv.read(bufferStream);
    } else {
        await workbook.xlsx.load(fileBuffer);
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
        throw new Error('Uploaded Excel file me koi worksheet nahi mili');
    }

    // 1. Locate Header Row (inspect first 10 rows for columns like customer, name, naam, phone, mobile)
    let headerRowIdx = -1;
    let colMap = {};

    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
        const row = sheet.getRow(r);
        const tempMap = {};
        let matches = 0;

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const raw = String(cell.value || '').trim().toLowerCase().replace(/[\s\-_]/g, '');
            if (raw.includes('phone') || raw.includes('mobile') || raw.includes('contact') || raw.includes('sampark')) {
                tempMap.phone = colNumber;
                matches++;
            } else if (raw.includes('aadhaar') || raw.includes('aadhar')) {
                tempMap.aadhaar = colNumber;
                matches++;
            } else if (raw.includes('relation') || raw.includes('rishta')) {
                tempMap.relationship = colNumber;
                matches++;
            } else if (raw === 'customername' || (raw.includes('customer') && !raw.includes('id')) || (raw.includes('name') && !raw.includes('family') && !raw.includes('head')) || raw.includes('naam') || raw.includes('grahak')) {
                tempMap.name = colNumber;
                matches++;
            } else if (raw.includes('opening') || (raw.includes('balance') && !raw.includes('type'))) {
                tempMap.opening = colNumber;
                matches++;
            } else if (raw.includes('balancetype') || raw.includes('baltype') || raw.includes('hisaabtype')) {
                tempMap.balanceType = colNumber;
                matches++;
            } else if (raw.includes('creditlimit') || raw.includes('limit')) {
                tempMap.creditLimit = colNumber;
                matches++;
            } else if (raw.includes('address') || raw.includes('pata') || raw.includes('gaon')) {
                tempMap.address = colNumber;
                matches++;
            } else if (raw.includes('dob') || raw.includes('dateofbirth') || raw.includes('birth') || raw.includes('janam')) {
                tempMap.dob = colNumber;
                matches++;
            } else if (raw.includes('email') || raw.includes('mail')) {
                tempMap.email = colNumber;
                matches++;
            } else if (raw.includes('gst')) {
                tempMap.gstin = colNumber;
                matches++;
            } else if (raw.includes('note') || raw.includes('remark') || raw.includes('vivran') || raw.includes('tippani')) {
                tempMap.notes = colNumber;
                matches++;
            }
        });

        if (tempMap.name || (matches >= 2)) {
            headerRowIdx = r;
            colMap = tempMap;
            break;
        }
    }

    if (headerRowIdx === -1 || !colMap.name) {
        throw new Error('Excel sheet me "CustomerName" ya "Name / Grahak" column header nahi mila. Kripya template download karke check karein.');
    }

    // 2. Pre-fetch existing active customers from SQL Server for fast duplicate & family checking
    const existingCustRes = await query(`
        SELECT CustomerID, CustomerName, Phone, AadhaarNumber, FamilyID, FamilyName, IsFamilyHead, Relationship
        FROM Customers
        WHERE IsActive = 1 AND UserID = @userId
    `, { userId });
    const existingList = existingCustRes.recordset || [];

    const existingAadhaars = new Set();
    const existingPhones = new Map(); // phone -> Customer object (Head or first member)
    const existingNamePhones = new Set(); // lowercase name + '|' + phone

    existingList.forEach(c => {
        if (c.AadhaarNumber) {
            const cleanA = String(c.AadhaarNumber).replace(/\D/g, '');
            if (cleanA.length === 12) existingAadhaars.add(cleanA);
        }
        if (c.Phone) {
            const cleanP = normalizePhone(c.Phone);
            if (cleanP && cleanP.length === 10) {
                if (!existingPhones.has(cleanP)) {
                    existingPhones.set(cleanP, c);
                } else if (c.IsFamilyHead && !existingPhones.get(cleanP).IsFamilyHead) {
                    existingPhones.set(cleanP, c); // Prefer Family Head
                }
                if (c.CustomerName) {
                    existingNamePhones.add(`${c.CustomerName.trim().toLowerCase()}|${cleanP}`);
                }
            }
        }
    });

    // In-memory sets to catch intra-file duplicates within the same uploaded Excel
    const sheetAadhaars = new Set();
    const sheetNamePhones = new Set();

    let totalRows = 0;
    const imported = [];
    const skipped = [];
    const errors = [];

    // Helper to get cell string (handles formulas, text, numbers)
    function getCellVal(row, colIdx) {
        if (!colIdx) return null;
        const cell = row.getCell(colIdx);
        if (!cell || cell.value === null || cell.value === undefined) return null;
        if (typeof cell.value === 'object') {
            if (cell.value.result !== undefined && cell.value.result !== null) {
                return String(cell.value.result).trim();
            }
            if (cell.value.text) {
                return String(cell.value.text).trim();
            }
        }
        return String(cell.value).trim();
    }

    // Date columns ke liye raw value chahiye (Excel serial number / Date object
    // ko string me badalne se date info lost ho jaati thi)
    function getCellRaw(row, colIdx) {
        if (!colIdx) return null;
        const cell = row.getCell(colIdx);
        if (!cell || cell.value === null || cell.value === undefined) return null;
        if (typeof cell.value === 'object' && cell.value.text) return cell.value.text;
        if (cell.value instanceof Date) return cell.value;
        if (typeof cell.value === 'number') return cell.value;
        return String(cell.value).trim();
    }

    // 3. Process each row sequentially
    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const rawName = getCellVal(row, colMap.name);

        // Check if row is empty
        if (!rawName) {
            // Check if entire row is empty; if so, skip silently
            let hasAnyVal = false;
            row.eachCell({ includeEmpty: false }, () => { hasAnyVal = true; });
            if (!hasAnyVal) continue;
            totalRows++;
            errors.push({ row: r, reason: 'Customer Name khali (blank) hai' });
            continue;
        }

        totalRows++;
        const custName = rawName.trim();
        const rawPhone = getCellVal(row, colMap.phone);
        const cleanPhone = normalizePhone(rawPhone);
        const rawAadhaar = getCellVal(row, colMap.aadhaar);
        const cleanAadhaar = normalizeAadhaar(rawAadhaar);
        const rawRel = getCellVal(row, colMap.relationship);
        const rawOpening = getCellVal(row, colMap.opening);
        const rawBalType = getCellVal(row, colMap.balanceType);
        const rawCredit = getCellVal(row, colMap.creditLimit);
        const rawAddress = getCellVal(row, colMap.address);
        const rawDob = getCellRaw(row, colMap.dob);
        const cleanDob = parseExcelDate(rawDob);
        const rawEmail = getCellVal(row, colMap.email);
        const rawGstin = getCellVal(row, colMap.gstin);
        const rawNotes = getCellVal(row, colMap.notes);

        // --- A. DUPLICATE CHECK 1: 12-DIGIT AADHAAR ---
        if (cleanAadhaar && cleanAadhaar.length === 12) {
            if (existingAadhaars.has(cleanAadhaar) || sheetAadhaars.has(cleanAadhaar)) {
                skipped.push({
                    row: r,
                    name: custName,
                    phone: cleanPhone || rawPhone || 'N/A',
                    aadhaar: cleanAadhaar,
                    reason: `Duplicate 12-Digit Aadhaar (${cleanAadhaar}) pehle se registered hai (Skip ho gaya)`
                });
                continue;
            }
        } else if (cleanAadhaar) {
            // Aadhaar diya hai par 12-digit nahi hai - customers route ke rule se match karo
            errors.push({ row: r, name: custName, reason: 'Aadhaar 12 digit ka hona chahiye' });
            continue;
        }

        // --- B. DUPLICATE CHECK 2: EXACT NAME + PHONE NUMBER ---
        if (cleanPhone && cleanPhone.length === 10) {
            const nameKey = `${custName.toLowerCase()}|${cleanPhone}`;
            if (existingNamePhones.has(nameKey) || sheetNamePhones.has(nameKey)) {
                skipped.push({
                    row: r,
                    name: custName,
                    phone: cleanPhone,
                    aadhaar: cleanAadhaar || 'N/A',
                    reason: `Duplicate Grahak: '${custName}' is mobile number (${cleanPhone}) par pehle se registered hain (Skip ho gaya)`
                });
                continue;
            }
        }

        // --- C. FAMILY PLAN & RELATIONSHIP AUTO 'OTHER' ---
        // Requirement: "aur family wala bhi auto other select ho jaaye"
        let isHead = 1;
        let parentId = null;
        let familyId = null;
        let familyName = `${custName} Parivar`;
        let relationship = 'Self';
        let khataMode = 'Separate';

        if (cleanPhone && existingPhones.has(cleanPhone)) {
            // Mobile number already exists in DB or previous rows!
            // This person belongs to that family.
            const existingHead = existingPhones.get(cleanPhone);
            isHead = 0;
            parentId = existingHead.CustomerID;
            familyId = existingHead.FamilyID || existingHead.CustomerID;
            familyName = existingHead.FamilyName || `${existingHead.CustomerName} Parivar`;
            
            // "aur family wala bhi auto other select ho jaaye"
            // If user provided a specific valid relation, use it, otherwise automatically set to 'Anya (Other)'
            if (rawRel && rawRel.trim() && rawRel.trim().toLowerCase() !== 'self') {
                relationship = rawRel.trim();
            } else {
                relationship = 'Anya (Other)';
            }
        } else {
            // Brand new phone number
            if (rawRel && rawRel.trim()) {
                relationship = rawRel.trim();
                if (relationship.toLowerCase().includes('other') || relationship.toLowerCase().includes('anya')) {
                    relationship = 'Anya (Other)';
                }
            } else {
                relationship = 'Self';
            }
        }

        // Parse Opening Balance
        let opening = parseExcelMoney(rawOpening, 0);
        let balType = 'Settled';
        if (rawBalType) {
            const btLower = rawBalType.toLowerCase();
            if (btLower.includes('pay') || btLower.includes('dena') || btLower.includes('advance')) {
                balType = 'ToPay';
            } else if (btLower.includes('receive') || btLower.includes('lena') || btLower.includes('udhaar')) {
                balType = 'ToReceive';
            }
        } else {
            balType = opening > 0 ? 'ToReceive' : (opening < 0 ? 'ToPay' : 'Settled');
        }

        if (balType === 'ToPay' && opening > 0) {
            opening = -opening;
        }

        // --- D. INSERT INTO SQL SERVER ---
        try {
            const newCust = await withTransaction(async (tQuery) => {
                const insertRes = await tQuery(`
                    INSERT INTO Customers (
                        UserID, CustomerName, Phone, AadhaarNumber, Email, Address, GSTIN, DateOfBirth,
                        OpeningBalance, CurrentBalance, BalanceType, CreditLimit, Notes, IsActive,
                        ParentCustomerID, FamilyID, IsFamilyHead, Relationship, KhataMode, FamilyName
                    )
                    OUTPUT INSERTED.*
                    VALUES (
                        @userId, @name, @phone, @aadhaar, @email, @address, @gstin, @dob,
                        @opening, @opening, @balType, @creditLimit, @notes, 1,
                        @parentId, @familyId, @isHead, @rel, @khata, @famName
                    )
                `, {
                    userId,
                    name: custName,
                    phone: cleanPhone || (rawPhone ? rawPhone.trim() : null),
                    aadhaar: cleanAadhaar,
                    email: rawEmail || null,
                    address: rawAddress || null,
                    gstin: rawGstin || null,
                    dob: cleanDob,
                    opening: opening,
                    balType: balType,
                    creditLimit: parseExcelMoney(rawCredit, 0),
                    notes: rawNotes || null,
                    parentId: parentId,
                    familyId: familyId,
                    isHead: isHead,
                    rel: relationship,
                    khata: khataMode,
                    famName: familyName
                });

                const created = insertRes.recordset[0];

                // If customer is newly created head without familyId, set FamilyID = CustomerID
                if (!familyId) {
                    await tQuery(`UPDATE Customers SET FamilyID = CustomerID WHERE CustomerID = @id`, { id: created.CustomerID });
                    created.FamilyID = created.CustomerID;
                }

                // If opening balance != 0, add Khata entry
                if (opening !== 0) {
                    const entryType = opening > 0 ? 'Gave' : 'Got';
                    const absAmt = Math.abs(opening);
                    await tQuery(`
                        INSERT INTO KhataEntries (
                            CustomerID, EntryDate, EntryTime, EntryType, Amount,
                            PaymentMode, Description, ReferenceNo, UserID
                        )
                        VALUES (
                            @custId, CAST(GETDATE() AS DATE), CONVERT(VARCHAR(5), GETDATE(), 108), @entryType, @amt,
                            'Opening Balance', 'Purana / Opening Hisaab (Excel Import)', 'OPENING-BAL', @userId
                        )
                    `, {
                        custId: created.CustomerID,
                        entryType: entryType,
                        amt: absAmt,
                        userId: userId
                    });

                    await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: created.CustomerID });
                }

                return created;
            });

            // Update in-memory lookups so subsequent rows in this file can detect family & duplicates
            if (cleanAadhaar) {
                existingAadhaars.add(cleanAadhaar);
                sheetAadhaars.add(cleanAadhaar);
            }
            if (cleanPhone) {
                const nameKey = `${custName.toLowerCase()}|${cleanPhone}`;
                existingNamePhones.add(nameKey);
                sheetNamePhones.add(nameKey);
                if (!existingPhones.has(cleanPhone)) {
                    existingPhones.set(cleanPhone, newCust);
                }
            }

            imported.push({
                row: r,
                id: newCust.CustomerID,
                name: newCust.CustomerName,
                phone: newCust.Phone || 'N/A',
                aadhaar: newCust.AadhaarNumber || 'N/A',
                relationship: newCust.Relationship,
                isHead: newCust.IsFamilyHead === 1,
                familyId: newCust.FamilyID
            });
        } catch (dbErr) {
            console.error(`Error inserting customer at row ${r}:`, dbErr);
            errors.push({ row: r, name: custName, reason: dbErr.message });
        }
    }

    return {
        success: true,
        message: `Customer Excel import sampann! ${imported.length} grahak jode gaye, ${skipped.length} duplicate skip huye.`,
        totalRows,
        importedCount: imported.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        imported,
        skipped,
        errors
    };
}

// ============================================================================
// 4. CSC WORK TRACKER EXPORT TO EXCEL (.xlsx)
// ============================================================================
async function exportCSCToExcel(reqQuery, res, userId) {
    try {
        const { q, status, serviceType, paymentStatus, startDate, endDate } = reqQuery || {};
        let whereClauses = ['a.IsActive = 1', 'a.UserID = @userId'];
        const params = { userId };

        if (q && q.trim()) {
            whereClauses.push(`(
                a.CustomerName LIKE @q ESCAPE '\\' OR 
                a.CustomerPhone LIKE @q ESCAPE '\\' OR 
                a.CustomerAadhaar LIKE @q ESCAPE '\\' OR 
                a.AckNumber LIKE @q ESCAPE '\\' OR 
                a.CertificateDocNo LIKE @q ESCAPE '\\' OR 
                a.PortalName LIKE @q ESCAPE '\\'
            )`);
            params.q = `%${escapeLike(q.trim())}%`;
        }

        if (status && status.toLowerCase() !== 'all') {
            if (status === 'ActivePending') {
                whereClauses.push(`a.Status IN ('Pending', 'Applied', 'Under Process')`);
            } else {
                whereClauses.push(`a.Status = @status`);
                params.status = status;
            }
        }

        // Service chip values partial hote hain (e.g. 'PAN Card'), isliye
        // table ke filter logic (partial match) se hi match karo.
        if (serviceType && serviceType.toLowerCase() !== 'all') {
            whereClauses.push(`a.ServiceType LIKE @serviceType ESCAPE '\\'`);
            params.serviceType = `%${escapeLike(serviceType.trim())}%`;
        }

        if (paymentStatus && paymentStatus.toLowerCase() !== 'all') {
            if (paymentStatus.toLowerCase() === 'due') {
                // UI ka "Bakiya (Due Fees Only)" filter - DueAmount > 0
                whereClauses.push(`a.DueAmount > 0`);
            } else if (paymentStatus.toLowerCase() === 'paid') {
                whereClauses.push(`ISNULL(a.DueAmount, 0) <= 0`);
            } else {
                whereClauses.push(`a.PaymentStatus = @paymentStatus`);
                params.paymentStatus = paymentStatus;
            }
        }

        if (startDate) {
            whereClauses.push(`CAST(a.ApplyDate AS DATE) >= @startDate`);
            params.startDate = startDate;
        }

        if (endDate) {
            whereClauses.push(`CAST(a.ApplyDate AS DATE) <= @endDate`);
            params.endDate = endDate;
        }

        const sql = `
            SELECT 
                a.*,
                c.CustomerName as LinkedCustomerName,
                c.Phone as LinkedCustomerPhone,
                c.AadhaarNumber as LinkedCustomerAadhaar,
                DATEDIFF(day, a.ApplyDate, GETDATE()) as DaysPassed
            FROM CSCApplications a
            LEFT JOIN Customers c ON a.CustomerID = c.CustomerID
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY a.ApplyDate DESC, a.AppID DESC
        `;

        const result = await query(sql, params);
        const apps = result.recordset || [];

        // KPI Summary
        const totalCount = apps.length;
        const totalBilled = apps.reduce((sum, a) => sum + parseFloat(a.TotalFee || 0), 0);
        const totalCollected = apps.reduce((sum, a) => sum + parseFloat(a.PaidAmount || 0), 0);
        const totalDue = apps.reduce((sum, a) => sum + parseFloat(a.DueAmount || 0), 0);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Cash Management & BC System';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('CSC Seva Tracker', {
            views: [{ showGridLines: true }]
        });

        // 1. Title Banner
        const titleRow = sheet.addRow(['CASH MANAGEMENT SYSTEM - CSC WORK TRACKER (सेवा ट्रैकर डेटा)']);
        titleRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } }; // Deep Indigo
        sheet.mergeCells('A1:R1');
        titleRow.height = 34;
        titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // 2. Summary Row
        const subRow = sheet.addRow([
            `Kul Aavedan: ${totalCount} | Kul Shulk (Billed): ₹${totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Jama (Paid): ₹${totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Baki (Due): ₹${totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Export: ${new Date().toLocaleString('en-IN')}`
        ]);
        subRow.font = { italic: true, size: 10, color: { argb: 'FFFFFFFF' } };
        subRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
        sheet.mergeCells('A2:R2');
        subRow.height = 22;
        subRow.alignment = { vertical: 'middle', horizontal: 'center' };

        sheet.addRow([]); // Blank spacer

        // 3. Table Column Headers
        const headerRow = sheet.addRow([
            'App ID',
            'Grahak ka Naam (Customer)',
            'Mobile Number',
            '12-Digit Aadhaar',
            'Sewa Prakar (Service Type)',
            'Sub-Service / Vivran',
            'Aavedan / Ack Number',
            'Portal Name',
            'Apply Date',
            'Expected Date',
            'Govt Fee (₹)',
            'Operator Fee (₹)',
            'Total Fee (₹)',
            'Jama Rashi (Paid ₹)',
            'Baki Rashi (Due ₹)',
            'Payment Status',
            'Application Status',
            'Praman Patra / Doc No'
        ]);

        headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo
        headerRow.height = 26;
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // 4. Data Rows
        apps.forEach((a, idx) => {
            const applyStr = a.ApplyDate ? formatDateDisplay(a.ApplyDate) : '';
            const expStr = a.ExpectedDate ? formatDateDisplay(a.ExpectedDate) : '';

            const row = sheet.addRow([
                a.AppID,
                a.CustomerName || '',
                a.CustomerPhone || (a.LinkedCustomerPhone || ''),
                a.CustomerAadhaar ? String(a.CustomerAadhaar) : (a.LinkedCustomerAadhaar ? String(a.LinkedCustomerAadhaar) : ''),
                a.ServiceType || '',
                a.ServiceSubtype || '',
                a.AckNumber || '',
                a.PortalName || '',
                applyStr,
                expStr,
                parseFloat(a.GovtFee || 0),
                parseFloat(a.OperatorFee || 0),
                parseFloat(a.TotalFee || 0),
                parseFloat(a.PaidAmount || 0),
                parseFloat(a.DueAmount || 0),
                a.PaymentStatus || 'Paid',
                a.Status || 'Applied',
                a.CertificateDocNo || ''
            ]);

            row.height = 22;
            row.alignment = { vertical: 'middle' };

            // Zebra striping
            if (idx % 2 === 1) {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }

            // Alignments
            row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }; // AppID
            row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' }; // Phone
            row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' }; // Aadhaar
            row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' }; // Ack
            row.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' }; // Apply
            row.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' }; // Expected
            row.getCell(17).alignment = { vertical: 'middle', horizontal: 'center' }; // Pay status
            row.getCell(18).alignment = { vertical: 'middle', horizontal: 'center' }; // App status

            // Currency formatting
            row.getCell(12).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(13).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(14).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(15).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(16).numFmt = '₹#,##0.00;[Red]-₹#,##0.00;"₹0.00"';

            // Due highlight
            if (a.DueAmount > 0) {
                row.getCell(16).font = { bold: true, color: { argb: 'FFDC2626' } };
            }

            // Status color highlight
            const stCell = row.getCell(18);
            if (a.Status === 'Approved' || a.Status === 'Delivered') {
                stCell.font = { bold: true, color: { argb: 'FF059669' } };
            } else if (a.Status === 'Rejected') {
                stCell.font = { bold: true, color: { argb: 'FFDC2626' } };
            } else {
                stCell.font = { bold: true, color: { argb: 'FFD97706' } };
            }

            // Cell borders
            row.eachCell({ includeEmpty: true }, cell => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            });
        });

        autoFitColumns(sheet, 14);

        const filename = `CSC_Work_Tracker_${localYMD(new Date())}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error in exportCSCToExcel:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
}

// ============================================================================
// 5. CSC WORK TRACKER SAMPLE TEMPLATE DOWNLOAD (.xlsx)
// ============================================================================
async function getCSCTemplateExcel(res) {
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Cash Management & BC System';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('CSC Import Template', {
            views: [{ showGridLines: true }]
        });

        // Title Row
        const titleRow = sheet.addRow(['CSC WORK TRACKER - APPLICATION IMPORT TEMPLATE (CSC सेवा आयात टेम्पलेट)']);
        titleRow.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
        sheet.mergeCells('A1:Q1');
        titleRow.height = 30;
        titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Hint Row
        const hintRow = sheet.addRow([
            '⚠️ Zaroori Nirdesh: CustomerName aur ServiceType likhna zaroori hai. Duplicate Ack Number ya Customer+Service aavedan auto-skip honge. Phone ya Aadhaar match hone par grahak se auto-link hoga.'
        ]);
        hintRow.font = { italic: true, size: 9.5, color: { argb: 'FFFFFFFF' } };
        hintRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
        sheet.mergeCells('A2:Q2');
        hintRow.height = 22;
        hintRow.alignment = { vertical: 'middle', horizontal: 'center' };

        sheet.addRow([]); // Blank spacer

        // Column Headers
        const headerRow = sheet.addRow([
            'CustomerName',
            'CustomerPhone',
            'CustomerAadhaar',
            'ServiceType',
            'AckNumber',
            'PortalName',
            'ApplyDate',
            'ExpectedDate',
            'GovtFee',
            'OperatorFee',
            'TotalFee',
            'PaidAmount',
            'PaymentMode',
            'Status',
            'CertificateDocNo',
            'Remarks'
        ]);

        headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } }; // Sky Blue Header
        headerRow.height = 26;
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // 3 Sample Rows
        const sampleRows = [
            [
                'Amit Kumar',
                '9876543210',
                '123456789012',
                'PAN Card',
                'New PAN Form 49A',
                'PAN-2026-9901',
                'NSDL',
                '2026-10-15',
                '2026-10-27',
                107,
                100,
                207,
                207,
                'Cash',
                'Applied',
                '',
                'Physical documents submitted'
            ],
            [
                'Sunita Devi',
                '9811223344',
                '234567890123',
                'Aay Praman Patra',
                'Fresh Income Certificate',
                'AY-88776655',
                'Edistrict',
                '2026-10-16',
                '2026-10-26',
                30,
                70,
                100,
                50,
                'UPI',
                'Under Process',
                '',
                'Lekhpal report pending'
            ],
            [
                'Rahul Singh',
                '9988776655',
                '',
                'Ration Card',
                'Add Member / Sanshodhan',
                'RC-44332211',
                'FCS Portal',
                '2026-10-10',
                '2026-10-30',
                50,
                100,
                150,
                150,
                'Online',
                'Approved',
                'RC-CERT-99120',
                'Ready to print'
            ]
        ];

        sampleRows.forEach(sr => {
            const row = sheet.addRow(sr);
            row.height = 22;
            row.alignment = { vertical: 'middle' };
            row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(14).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(15).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(10).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(11).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(12).numFmt = '₹#,##0.00;"₹0.00"';
            row.getCell(13).numFmt = '₹#,##0.00;"₹0.00"';
        });

        autoFitColumns(sheet, 16);

        const filename = 'CSC_Import_Template.xlsx';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error generating CSC template:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
}

// ============================================================================
// 6. CSC WORK TRACKER EXCEL IMPORT WITH DUPLICATE SKIP & CUSTOMER LINKING
// ============================================================================
async function importCSCFromExcel(fileBuffer, originalName, userId) {
    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('Khali (Empty) file upload hui hai');
    }

    const workbook = new ExcelJS.Workbook();
    const isCsv = (originalName || '').toLowerCase().endsWith('.csv');

    if (isCsv) {
        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(fileBuffer);
        await workbook.csv.read(bufferStream);
    } else {
        await workbook.xlsx.load(fileBuffer);
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
        throw new Error('Uploaded Excel file me koi worksheet nahi mili');
    }

    // 1. Locate Header Row
    let headerRowIdx = -1;
    let colMap = {};

    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
        const row = sheet.getRow(r);
        const tempMap = {};
        let matches = 0;

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const raw = String(cell.value || '').trim().toLowerCase().replace(/[\s\-_]/g, '');
            if (raw.includes('phone') || raw.includes('mobile') || raw.includes('contact')) {
                tempMap.phone = colNumber;
                matches++;
            } else if (raw.includes('aadhaar') || raw.includes('aadhar')) {
                tempMap.aadhaar = colNumber;
                matches++;
            } else if (raw.includes('portal')) {
                tempMap.portal = colNumber;
                matches++;
            } else if (raw.includes('subtype') || raw.includes('subservice')) {
                tempMap.subtype = colNumber;
                matches++;
            } else if (raw.includes('servicetype') || raw.includes('service') || raw.includes('sewa')) {
                tempMap.service = colNumber;
                matches++;
            } else if (raw === 'customername' || (raw.includes('customer') && !raw.includes('id')) || raw.includes('grahak') || (raw.includes('name') && !raw.includes('portal')) || raw.includes('naam')) {
                tempMap.name = colNumber;
                matches++;
            } else if (raw.includes('ack') || raw.includes('receipt') || raw.includes('applicationno') || raw.includes('appno') || raw.includes('ref')) {
                tempMap.ack = colNumber;
                matches++;
            } else if (raw.includes('applydate') || (raw.includes('apply') && raw.includes('date')) || raw.includes('tarikh')) {
                tempMap.applyDate = colNumber;
                matches++;
            } else if (raw.includes('expected') || raw.includes('delivery')) {
                tempMap.expectedDate = colNumber;
                matches++;
            } else if (raw.includes('govtfee') || raw.includes('govt')) {
                tempMap.govtFee = colNumber;
                matches++;
            } else if (raw.includes('operatorfee') || raw.includes('operator')) {
                tempMap.operatorFee = colNumber;
                matches++;
            } else if (raw.includes('totalfee') || raw.includes('total') || raw.includes('kulshulk')) {
                tempMap.totalFee = colNumber;
                matches++;
            } else if (raw.includes('paidamount') || raw.includes('paid') || raw.includes('jama')) {
                tempMap.paidAmount = colNumber;
                matches++;
            } else if (raw.includes('paymentmode') || raw.includes('mode')) {
                tempMap.paymentMode = colNumber;
                matches++;
            } else if (raw.includes('status') && !raw.includes('remark') && !raw.includes('payment')) {
                tempMap.status = colNumber;
                matches++;
            } else if (raw.includes('certificate') || raw.includes('docno') || raw.includes('pramanpatra')) {
                tempMap.docNo = colNumber;
                matches++;
            } else if (raw.includes('remark') || raw.includes('note') || raw.includes('vivran') || raw.includes('tippani')) {
                tempMap.remarks = colNumber;
                matches++;
            }
        });

        if (tempMap.name && tempMap.service) {
            headerRowIdx = r;
            colMap = tempMap;
            break;
        }
    }

    if (headerRowIdx === -1 || !colMap.name) {
        throw new Error('Excel sheet me "CustomerName" aur "ServiceType" column headers nahi mile. Kripya template download karke check karein.');
    }

    // 2. Pre-fetch existing CSC records for duplicate checking
    const existingCscRes = await query(`
        SELECT AppID, CustomerName, ServiceType, AckNumber, ApplyDate
        FROM CSCApplications
        WHERE IsActive = 1 AND UserID = @userId
    `, { userId });
    const existingAcks = new Set();
    const existingCombos = new Set(); // lowercase name + '|' + lowercase service + '|' + YYYY-MM-DD

    (existingCscRes.recordset || []).forEach(a => {
        if (a.AckNumber && a.AckNumber.trim()) {
            existingAcks.add(a.AckNumber.trim().toUpperCase());
        }
        if (a.CustomerName && a.ServiceType && a.ApplyDate) {
            const dStr = a.ApplyDate instanceof Date ? localYMD(a.ApplyDate) : String(a.ApplyDate).split('T')[0];
            existingCombos.add(`${a.CustomerName.trim().toLowerCase()}|${a.ServiceType.trim().toLowerCase()}|${dStr}`);
        }
    });

    // Pre-fetch active customers for auto customer linking
    const activeCustRes = await query(`
        SELECT CustomerID, CustomerName, Phone, AadhaarNumber
        FROM Customers
        WHERE IsActive = 1 AND UserID = @userId
    `, { userId });
    const phoneToCust = new Map();
    const aadhaarToCust = new Map();

    (activeCustRes.recordset || []).forEach(c => {
        if (c.Phone) {
            const p = normalizePhone(c.Phone);
            if (p && p.length === 10 && !phoneToCust.has(p)) {
                phoneToCust.set(p, c.CustomerID);
            }
        }
        if (c.AadhaarNumber) {
            const a = normalizeAadhaar(c.AadhaarNumber);
            if (a && a.length === 12 && !aadhaarToCust.has(a)) {
                aadhaarToCust.set(a, c.CustomerID);
            }
        }
    });

    // In-memory sets to catch intra-file duplicates
    const sheetAcks = new Set();
    const sheetCombos = new Set();

    let totalRows = 0;
    const imported = [];
    const skipped = [];
    const errors = [];

    function getCellVal(row, colIdx) {
        if (!colIdx) return null;
        const cell = row.getCell(colIdx);
        if (!cell || cell.value === null || cell.value === undefined) return null;
        if (typeof cell.value === 'object' && cell.value.text) {
            return String(cell.value.text).trim();
        }
        return String(cell.value).trim();
    }

    // Date columns ke liye raw value (Excel serial number / Date object)
    function getCellRaw(row, colIdx) {
        if (!colIdx) return null;
        const cell = row.getCell(colIdx);
        if (!cell || cell.value === null || cell.value === undefined) return null;
        if (typeof cell.value === 'object' && cell.value.text) return cell.value.text;
        if (cell.value instanceof Date) return cell.value;
        if (typeof cell.value === 'number') return cell.value;
        return String(cell.value).trim();
    }

    // 3. Process each row sequentially
    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const rawName = getCellVal(row, colMap.name);
        const rawService = getCellVal(row, colMap.service) || 'Other';

        if (!rawName) {
            let hasAnyVal = false;
            row.eachCell({ includeEmpty: false }, () => { hasAnyVal = true; });
            if (!hasAnyVal) continue;
            totalRows++;
            errors.push({ row: r, reason: 'Customer Name khali hai' });
            continue;
        }

        totalRows++;
        const custName = rawName.trim();
        const serviceType = rawService.trim();
        const rawPhone = getCellVal(row, colMap.phone);
        const cleanPhone = normalizePhone(rawPhone);
        const rawAadhaar = getCellVal(row, colMap.aadhaar);
        const cleanAadhaar = normalizeAadhaar(rawAadhaar);
        const rawSubtype = getCellVal(row, colMap.subtype);
        const rawAck = getCellVal(row, colMap.ack);
        const cleanAck = rawAck ? rawAck.trim() : null;
        const rawPortal = getCellVal(row, colMap.portal);
        const rawApplyDate = getCellRaw(row, colMap.applyDate);
        const cleanApplyDate = parseExcelDate(rawApplyDate) || localYMD(new Date());
        const rawExpDate = getCellRaw(row, colMap.expectedDate);
        let cleanExpDate = parseExcelDate(rawExpDate);

        // --- A. DUPLICATE CHECK 1: ACK / APPLICATION NUMBER ---
        if (cleanAck && cleanAck.length > 2) {
            const upperAck = cleanAck.toUpperCase();
            if (existingAcks.has(upperAck) || sheetAcks.has(upperAck)) {
                skipped.push({
                    row: r,
                    name: custName,
                    service: serviceType,
                    ack: cleanAck,
                    reason: `Duplicate Aavedan No: Ack / Reference number '${cleanAck}' pehle se darj hai (Skip ho gaya)`
                });
                continue;
            }
        }

        // --- B. DUPLICATE CHECK 2: SAME CUSTOMER + SERVICE + APPLY DATE ---
        const comboKey = `${custName.toLowerCase()}|${serviceType.toLowerCase()}|${cleanApplyDate}`;
        if (existingCombos.has(comboKey) || sheetCombos.has(comboKey)) {
            skipped.push({
                row: r,
                name: custName,
                service: serviceType,
                ack: cleanAck || 'N/A',
                reason: `Duplicate Entry: '${custName}' ka ${serviceType} aavedan (${cleanApplyDate}) pehle se darj hai (Skip ho gaya)`
            });
            continue;
        }

        // --- C. AUTO CUSTOMER LINKING ---
        let customerId = null;
        if (cleanPhone && phoneToCust.has(cleanPhone)) {
            customerId = phoneToCust.get(cleanPhone);
        } else if (cleanAadhaar && aadhaarToCust.has(cleanAadhaar)) {
            customerId = aadhaarToCust.get(cleanAadhaar);
        }

        // --- D. FEES & DUES CALCULATION ---
        const govtFee = Math.max(0, parseExcelMoney(getCellVal(row, colMap.govtFee), 0));
        const opFee = Math.max(0, parseExcelMoney(getCellVal(row, colMap.operatorFee), 0));
        let totalFee = parseExcelMoney(getCellVal(row, colMap.totalFee), 0);
        if (totalFee <= 0) {
            totalFee = govtFee + opFee;
        }
        const paidAmount = Math.max(0, parseExcelMoney(getCellVal(row, colMap.paidAmount), 0));
        const dueAmount = Math.max(0, totalFee - paidAmount);

        let payStatus = 'Paid';
        if (dueAmount > 0 && paidAmount > 0) {
            payStatus = 'Partial';
        } else if (dueAmount > 0 && paidAmount === 0) {
            payStatus = 'Pending';
        }

        // Calculate expected delivery date if not provided
        if (!cleanExpDate) {
            const addDays = SERVICE_DEFAULT_DAYS[serviceType] || 10;
            const expObj = parseYMD(cleanApplyDate) || new Date();
            expObj.setDate(expObj.getDate() + addDays);
            cleanExpDate = localYMD(expObj);
        }

        const rawStatus = getCellVal(row, colMap.status);
        const status = (rawStatus && rawStatus.trim()) ? rawStatus.trim() : 'Applied';
        const paymentMode = getCellVal(row, colMap.paymentMode) || 'Cash';
        const docNo = getCellVal(row, colMap.docNo);
        const remarks = getCellVal(row, colMap.remarks);

        // --- E. INSERT APPLICATION INTO DATABASE + CASHBOOK POSTING (N1 Fix) ---
        try {
            let newApp = null;
            await withTransaction(async (tQuery) => {
                // User-scoped cash and bank account lookup
                const cashAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Cash' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
                const bankAcc = await tQuery("SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Bank' AND IsActive = 1 ORDER BY AccountID ASC", { userId });
                const userCashAccId = cashAcc.recordset[0]?.AccountID || null;
                const userBankAccId = bankAcc.recordset[0]?.AccountID || null;

                const insertSql = `
                    INSERT INTO CSCApplications (
                        UserID, CustomerID, CustomerName, CustomerPhone, CustomerAadhaar,
                        ServiceType, ServiceSubtype, AckNumber, PortalName,
                        ApplyDate, ExpectedDate,
                        GovtFee, OperatorFee, TotalFee, PaidAmount, DueAmount,
                        PaymentStatus, PaymentMode, Status, StatusRemarks,
                        CertificateDocNo, CreatedAt, UpdatedAt, IsActive
                    )
                    OUTPUT INSERTED.*
                    VALUES (
                        @userId, @customerId, @custName, @custPhone, @custAadhaar,
                        @serviceType, @serviceSubtype, @ackNumber, @portalName,
                        @applyDate, @expectedDate,
                        @govtFee, @operatorFee, @totalFee, @paidAmount, @dueAmount,
                        @paymentStatus, @paymentMode, @status, @statusRemarks,
                        @docNo, GETDATE(), GETDATE(), 1
                    )
                `;

                const insertRes = await tQuery(insertSql, {
                    userId,
                    customerId,
                    custName,
                    custPhone: cleanPhone || (rawPhone ? rawPhone.trim() : null),
                    custAadhaar: cleanAadhaar,
                    serviceType,
                    serviceSubtype: rawSubtype ? String(rawSubtype).trim() : null,
                    ackNumber: cleanAck,
                    portalName: rawPortal || null,
                    applyDate: cleanApplyDate,
                    expectedDate: cleanExpDate,
                    govtFee,
                    operatorFee: opFee,
                    totalFee,
                    paidAmount,
                    dueAmount,
                    paymentStatus: payStatus,
                    paymentMode,
                    status,
                    statusRemarks: remarks || null,
                    docNo: docNo || null
                });

                newApp = insertRes.recordset[0];
                const newId = newApp.AppID;

                // Global Serial Number Registration (Atomic Rule 4)
                let regInfo = null;
                try {
                    regInfo = await registerGlobalTransaction({
                        sourceModule: 'CSC',
                        recordId: newId,
                        entityName: custName,
                        amount: totalFee,
                        transDate: cleanApplyDate,
                        createdAt: new Date(),
                        userId
                    }, tQuery);
                } catch (regErr) {
                    console.error('CSC Excel import registerGlobalTransaction failed:', regErr.message);
                    throw new Error('Universal SN Registry fail for CSC Excel row: ' + regErr.message);
                }

                // Auto-Account Posting for CSC Cashbook with Rule 1 Identity (csc.js:670-714 parity)
                const isElectricity = /electricity|bijli/i.test(serviceType);
                const isOnline = Boolean(paymentMode && /bank|online|upi|net\s*banking|qr/i.test(paymentMode));
                const targetAccId = isOnline ? userBankAccId : userCashAccId;
                const walletAccId = userBankAccId;

                if (isElectricity) {
                    if (govtFee > 0 && walletAccId) {
                        await tQuery(`
                            INSERT INTO Transactions (
                                TransDate, TransTime, TransType, Amount, AccountID,
                                Description, Reference, UserID, Tags, IsDeleted, CreatedAt, UpdatedAt,
                                SourceModule, SourceID, LineType,
                                GlobalSerialNo, SNCode, ModuleCode
                            )
                            VALUES (
                                @transDate, CAST(GETDATE() AS TIME), 'Expense', @amt, @accId,
                                @desc, @ref, @userId, 'UPPCL_BILL_OUT', 0, GETDATE(), GETDATE(),
                                'CSC', @appId, 'UPPCL_OUT',
                                @sn, @snCode, @modCode
                            )
                        `, {
                            transDate: cleanApplyDate,
                            amt: govtFee,
                            accId: walletAccId,
                            desc: `UPPCL Bijli Bill Paid - Consumer: ${docNo || cleanAck || ''} (${custName})`,
                            ref: `APP-${newId}`,
                            userId,
                            appId: newId,
                            sn: regInfo?.globalSerialNo,
                            snCode: regInfo?.snCode,
                            modCode: regInfo?.moduleCode
                        });
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: walletAccId });
                    }
                    if (paidAmount > 0 && userCashAccId) {
                        await tQuery(`
                            INSERT INTO Transactions (
                                TransDate, TransTime, TransType, Amount, AccountID,
                                Description, Reference, UserID, Tags, IsDeleted, CreatedAt, UpdatedAt,
                                SourceModule, SourceID, LineType,
                                GlobalSerialNo, SNCode, ModuleCode
                            )
                            VALUES (
                                @transDate, CAST(GETDATE() AS TIME), 'Income', @amt, @accId,
                                @desc, @ref, @userId, 'UPPCL_BILL_IN', 0, GETDATE(), GETDATE(),
                                'CSC', @appId, 'UPPCL_IN',
                                @sn, @snCode, @modCode
                            )
                        `, {
                            transDate: cleanApplyDate,
                            amt: paidAmount,
                            accId: userCashAccId,
                            desc: `Cash for Bijli Bill - Consumer: ${docNo || cleanAck || ''} (${custName}) [Bill: ₹${govtFee} + Fee: ₹${opFee}]`,
                            ref: `APP-${newId}`,
                            userId,
                            appId: newId,
                            sn: regInfo?.globalSerialNo,
                            snCode: regInfo?.snCode,
                            modCode: regInfo?.moduleCode
                        });
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: userCashAccId });
                    }
                } else {
                    if (paidAmount > 0 && targetAccId) {
                        await tQuery(`
                            INSERT INTO Transactions (
                                TransDate, TransTime, TransType, Amount, AccountID,
                                Description, Reference, UserID, Tags, IsDeleted, CreatedAt, UpdatedAt,
                                SourceModule, SourceID, LineType,
                                GlobalSerialNo, SNCode, ModuleCode
                            )
                            VALUES (
                                @transDate, CAST(GETDATE() AS TIME), 'Income', @amt, @accId,
                                @desc, @ref, @userId, 'CSC_FEE_IN', 0, GETDATE(), GETDATE(),
                                'CSC', @appId, 'FEE_IN',
                                @sn, @snCode, @modCode
                            )
                        `, {
                            transDate: cleanApplyDate,
                            amt: paidAmount,
                            accId: targetAccId,
                            desc: `CSC Fee - ${serviceType} (${custName})${cleanAck ? ' [Ack: ' + cleanAck + ']' : ''}`,
                            ref: `APP-${newId}`,
                            userId,
                            appId: newId,
                            sn: regInfo?.globalSerialNo,
                            snCode: regInfo?.snCode,
                            modCode: regInfo?.moduleCode
                        });
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: targetAccId });
                    }
                    if (govtFee > 0 && walletAccId) {
                        await tQuery(`
                            INSERT INTO Transactions (
                                TransDate, TransTime, TransType, Amount, AccountID,
                                Description, Reference, UserID, Tags, IsDeleted, CreatedAt, UpdatedAt,
                                SourceModule, SourceID, LineType,
                                GlobalSerialNo, SNCode, ModuleCode
                            )
                            VALUES (
                                @transDate, CAST(GETDATE() AS TIME), 'Expense', @amt, @accId,
                                @desc, @ref, @userId, 'CSC_GOVT_FEE_OUT', 0, GETDATE(), GETDATE(),
                                'CSC', @appId, 'GOVT_OUT',
                                @sn, @snCode, @modCode
                            )
                        `, {
                            transDate: cleanApplyDate,
                            amt: govtFee,
                            accId: walletAccId,
                            desc: `CSC Govt Fee - ${serviceType} (${custName})${cleanAck ? ' [Ack: ' + cleanAck + ']' : ''}`,
                            ref: `APP-${newId}`,
                            userId,
                            appId: newId,
                            sn: regInfo?.globalSerialNo,
                            snCode: regInfo?.snCode,
                            modCode: regInfo?.moduleCode
                        });
                        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: walletAccId });
                    }
                }

                // If Customer is linked and fee applies, sync with Khatabook
                if (customerId && totalFee > 0) {
                    await syncCSCToKhata(tQuery, {
                        CustomerID: customerId,
                        CSCAppID: newId,
                        TotalFee: totalFee,
                        PaidAmount: paidAmount,
                        EntryDate: cleanApplyDate,
                        PaymentMode: paymentMode,
                        ServiceType: serviceType,
                        UserID: userId
                    });
                    await processKhataAfterChange(tQuery, customerId);
                }
            });

            // Update in-memory sets for intra-file deduplication
            if (cleanAck) {
                existingAcks.add(cleanAck.toUpperCase());
                sheetAcks.add(cleanAck.toUpperCase());
            }
            existingCombos.add(comboKey);
            sheetCombos.add(comboKey);

            imported.push({
                row: r,
                appId: newApp.AppID,
                name: custName,
                service: serviceType,
                ack: cleanAck || 'N/A',
                totalFee,
                paid: paidAmount,
                due: dueAmount,
                status,
                linkedCustomer: !!customerId
            });
        } catch (dbErr) {
            console.error(`Error inserting CSC application at row ${r}:`, dbErr);
            errors.push({ row: r, name: custName, service: serviceType, reason: dbErr.message });
        }
    }

    return {
        success: true,
        message: `CSC Work Tracker Excel import sampann! ${imported.length} aavedan jode gaye, ${skipped.length} duplicate skip huye.`,
        totalRows,
        importedCount: imported.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        imported,
        skipped,
        errors
    };
}

module.exports = {
    exportCustomersToExcel,
    getCustomersTemplateExcel,
    importCustomersFromExcel,
    exportCSCToExcel,
    getCSCTemplateExcel,
    importCSCFromExcel
};
