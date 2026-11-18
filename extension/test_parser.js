/**
 * ============================================================================
 * CASH MANAGEMENT BC - EXTENSION PARSER TEST & REGRESSION SUITE
 * ============================================================================
 * Tests parsing engines for:
 * 1. Digipay AEPS (Cash Withdrawal, Cash Deposit, Balance Enquiry)
 * 2. Digipay Lite AEPS (Cash Withdrawal, Mini Statement)
 * 3. SBI Kiosk Banking (AePS Cash Withdrawal, Transfer)
 * 4. Spice Money & PayNearby AEPS receipts
 * 5. CSC Digital Seva Application receipts (PAN Card, eDistrict, etc.)
 * 6. Generic Text & Tabular receipts
 * ============================================================================
 */

const assert = require('assert');

// ----------------------------------------------------------------------------
// UNIVERSAL EXTENSION PARSER ENGINE IMPLEMENTATION (Embedded for Unit Testing)
// ----------------------------------------------------------------------------

const testSessionAadhaarCache = new Map();

function recordPotentialAadhaar(val) {
    if (!val) return;
    const digits = String(val).replace(/\D/g, '');
    if (digits.length === 12 && !/^0{12}$/.test(digits) && !/^(\d)\1{11}$/.test(digits)) {
        const last4 = digits.slice(-4);
        testSessionAadhaarCache.set(last4, digits);
        testSessionAadhaarCache.set('__last__', digits);
    }
}

function resolveFullAadhaarFromSession(maskedOrLast4) {
    if (!maskedOrLast4) return '';
    const rawDigits = String(maskedOrLast4).replace(/\D/g, '');
    if (rawDigits.length === 12) return rawDigits;
    const last4 = rawDigits.slice(-4);
    if (testSessionAadhaarCache.has(last4)) {
        return testSessionAadhaarCache.get(last4);
    }
    return '';
}

function cleanAmount(val) {
    if (val === undefined || val === null || val === '') return null;
    const s = String(val).replace(/,/g, '');
    const m = s.match(/\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return isNaN(n) ? null : n;
}

function cleanPhone(val) {
    if (!val) return '';
    let digits = String(val).replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
}

function cleanAadhaar(val) {
    if (!val) return '';
    let s = String(val).trim();
    // Masked pattern like XXXX XXXX 1234 or XXXXXXXX1234 or ********1234
    if (/^[xX*]{4}[\s\-]?[xX*]{4}[\s\-]?\d{4}$/.test(s) || /^[xX*]{4,8}[\s\-]?\d{4}$/.test(s)) return s;
    let digits = s.replace(/\D/g, '');
    if (digits.length === 12) {
        return digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
    }
    return s;
}

function extractAadhaarLast4(val) {
    if (!val) return '';
    const s = String(val).trim();
    const m = s.match(/\d{4}$/);
    return m ? m[0] : '';
}

function extractTime(raw) {
    if (!raw) return '';
    const m = String(raw).match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
    return m ? m[1].trim() : '';
}

function normalizeDate(raw) {
    if (!raw) return new Date().toISOString().split('T')[0];
    const s = String(raw).trim();
    const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

    // Format 1: Month DD, YYYY (e.g. November 04, 2026 or Nov 4, 2026)
    const mdy = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
    if (mdy) {
        const mKey = mdy[1].substring(0, 3).toLowerCase();
        const month = monthMap[mKey] || '01';
        const day = mdy[2].padStart(2, '0');
        const year = mdy[3];
        return `${year}-${month}-${day}`;
    }

    // Format 2: DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const year = dmy[3];
        return `${year}-${month}-${day}`;
    }
    // Format 3: YYYY-MM-DD
    const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymd) {
        const year = ymd[1];
        const month = ymd[2].padStart(2, '0');
        const day = ymd[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    // Format 4: Date with month name (e.g. 04 Nov 2026 or 04-Nov-2026)
    const namedMatch = s.match(/(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{4})/i);
    if (namedMatch) {
        const day = namedMatch[1].padStart(2, '0');
        const mKey = namedMatch[2].substring(0, 3).toLowerCase();
        const month = monthMap[mKey] || '01';
        const year = namedMatch[3];
        return `${year}-${month}-${day}`;
    }
    return new Date().toISOString().split('T')[0];
}

/**
 * Parse AEPS / Banking Receipt from Text
 */
function parseAEPSReceiptText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const result = {
        ServiceType: 'Cash Withdrawal',
        CustomerName: '',
        Mobile: '',
        Aadhaar: '',
        CustomerAadhaarLast4: '',
        BankName: '',
        AccountNumber: '',
        AccountBalance: null,
        RRN_UTR: '',
        TransactionID: '',
        BankRefNo: '',
        Amount: null,
        CustomerCharge: 0,
        CommissionEarned: 0,
        TransDate: new Date().toISOString().split('T')[0],
        TransTime: '',
        Status: 'Success',
        AgentID: '',
        AgentName: '',
        TerminalID: '',
        AuthorizeCode: '',
        PortalName: 'Digipay'
    };

    // 1. Service Type Detection (Handles DigiPay, SBI Kiosk, Spice Money, etc.)
    const typeMatch = text.match(/(?:Transaction\s*Mode|Transaction\s*Type|Service\s*Type|Txn\s*Type|Txn\s*Mode)\s*[:\-]\s*([^\n\r]+)/i);
    const typeStr = (typeMatch ? typeMatch[1] : text).toLowerCase();

    if (/balance[_\s\-]*enquiry/i.test(typeStr)) {
        result.ServiceType = 'Balance Enquiry';
    } else if (/mini[_\s\-]*statement/i.test(typeStr)) {
        result.ServiceType = 'Mini Statement';
    } else if (/cash[_\s\-]*deposit|deposit/i.test(typeStr) && !/withdrawal/i.test(typeStr)) {
        result.ServiceType = 'Cash Deposit';
    } else if (/money[_\s\-]*transfer|dmt|remittance|payout/i.test(typeStr)) {
        result.ServiceType = 'Money Transfer';
    } else if (/aadhaar[_\s\-]*pay/i.test(typeStr)) {
        result.ServiceType = 'Cash Withdrawal';
    } else if (/cash[_\s\-]*withdrawal|aeps[_\s\-]*cash[_\s\-]*withdrawal/i.test(typeStr)) {
        result.ServiceType = 'Cash Withdrawal';
    } else {
        result.ServiceType = 'Cash Withdrawal';
    }

    // 2. Status Detection
    const statusMatch = text.match(/(?:Payment\s*Status|Transaction\s*Status|Txn\s*Status|Status|Message)\s*[:\-]\s*([A-Za-z]+)/i);
    if (statusMatch) {
        const s = statusMatch[1].toUpperCase();
        if (/SUCCESS|APPROVED/.test(s)) result.Status = 'Success';
        else if (/FAIL|DECLINED|FAILED/.test(s)) result.Status = 'Failed';
        else if (/PENDING/.test(s)) result.Status = 'Pending';
    }

    // 3. RRN, API Tid, Bank Ref No, Transaction ID
    // Check for API Tid (Digipay 12-digit NPCI RRN: e.g. "API Tid : 630917628452")
    if (!result.RRN_UTR) {
        const apiTidMatch = text.match(/(?:API\s*Tid|API\s*Txn\s*ID|API\s*Reference)[:\s\-#]*(\d{11,14})/i);
        if (apiTidMatch) {
            result.RRN_UTR = apiTidMatch[1].trim();
            result.BankRefNo = apiTidMatch[1].trim();
        }
    }
    const rrnMatch = text.match(/(?:\bRRN\b|\bBank\s*Ref(?:\.|erence)?\s*(?:No|Num|Number)?)\s*[:\-#]*\s*(\d{11,14})/i);
    if (rrnMatch) {
        result.RRN_UTR = rrnMatch[1].trim();
        result.BankRefNo = rrnMatch[1].trim();
    }
    const bankRefMatch = text.match(/Bank\s*Ref(?:\.|erence)?(?:\s*(?:No|Num|Number|\.))*\s*[:\-#]*\s*([A-Za-z0-9]+)/i);
    if (bankRefMatch) {
        result.BankRefNo = bankRefMatch[1].trim();
        if (!result.RRN_UTR) result.RRN_UTR = result.BankRefNo;
    }
    const txnIdMatch = text.match(/(?:Transaction\s*ID|Txn\s*ID)\s*[:\-#]*\s*([A-Za-z0-9]{10,45})/i);
    if (txnIdMatch) {
        result.TransactionID = txnIdMatch[1].trim();
        if (!result.RRN_UTR) result.RRN_UTR = result.TransactionID;
    }
    if (!result.RRN_UTR) {
        const genRrn = text.match(/(?:RRN|UTR|Ref(?:\.|erence)?\s*(?:No|Num|Number|ID)?|STAN|Txn\s*ID|Transaction\s*(?:ID|Ref|No))[:\s\-\#]*([A-Za-z0-9]{8,22})/i);
        if (genRrn) result.RRN_UTR = genRrn[1].trim();
    }

    // 4. Amount Extraction
    const amtMatch = text.match(/(?:Transaction\s*Amount|Txn\s*Amount|Withdrawal\s*Amount|Amount|Total\s*Amount)\s*[:\-]\s*[�Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i);
    if (amtMatch) {
        result.Amount = cleanAmount(amtMatch[1]);
    } else {
        const amtPatterns = [
            /(?:Txn|Transaction|Withdrawal|Transfer|Deposit)\s*Amount[:\s\-�Rs\.]*([\d,]+\.?\d{0,2})/i,
            /(?:Amount|Total\s*Amount)[:\s\-�Rs\.]*([\d,]+\.?\d{0,2})/i,
            /(?:�|Rs\.?)\s*([\d,]+\.?\d{0,2})\s*(?:debited|credited|withdrawn|successful)/i
        ];
        for (const pat of amtPatterns) {
            const m = text.match(pat);
            if (m) {
                const amt = cleanAmount(m[1]);
                if (amt !== null && amt > 0) {
                    result.Amount = amt;
                    break;
                }
            }
        }
    }

    // 5. Account Balance / Available Balance
    const balMatch = text.match(/(?:A\/C\s*Balance|Account\s*Balance|Available\s*Balance|Ledger\s*Balance|Balance)\s*[:\-]\s*[�Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i) ||
                     text.match(/(?:Available\s*Balance|Ledger\s*Balance|Acc(?:\.|ount)?\s*Bal(?:ance)?|Bal(?:ance)?)[:\s\-�Rs\.]*([\d,]+\.?\d{0,2})/i);
    if (balMatch) {
        result.AccountBalance = cleanAmount(balMatch[1]);
    }

    // 6. Aadhaar / Customer ID
    const custIdMatch = text.match(/(?:Customer\s*ID|Aadhaar(?:\s*Number)?|UID|UIDAI|Aadhar(?:\s*Number)?)\s*[:\-]\s*([xX\*\d\s\-]{8,20})/i);
    if (custIdMatch) {
        result.Aadhaar = cleanAadhaar(custIdMatch[1]);
        result.CustomerAadhaarLast4 = extractAadhaarLast4(custIdMatch[1]);
    } else {
        const aadhMatch = text.match(/(?:Aadhaar|UID|UIDAI|Aadhar)[:\s\-\#]*([xX\*\d\s\-]{12,19})/i) ||
                          text.match(/([xX\*]{4}[\s\-]?[xX\*]{4}[\s\-]?\d{4})/i) ||
                          text.match(/([xX\*]{4,8}[\s\-]?\d{4})/i);
        if (aadhMatch) {
            result.Aadhaar = cleanAadhaar(aadhMatch[1]);
            result.CustomerAadhaarLast4 = extractAadhaarLast4(aadhMatch[1]);
        }
    }

    // 6.1 Resolve full 12-digit Aadhaar from live session memory / inputs
    const fullAadhaarCandidate = resolveFullAadhaarFromSession(result.CustomerAadhaarLast4 || result.Aadhaar);
    if (fullAadhaarCandidate && fullAadhaarCandidate.length === 12) {
        result.Aadhaar = fullAadhaarCandidate;
        result.CustomerAadhaar = fullAadhaarCandidate;
        result.CustomerAadhaarLast4 = fullAadhaarCandidate.slice(-4);
    }

    // 7. Mobile Number
    const mobMatch = text.match(/(?:Mobile|Phone|Contact|Cust(?:omer)?\s*Mobile)(?:\s*(?:No|Num|Number))?[:\s\-#]*(\+?91[\-\s]?)?([6-9]\d{9})/i) ||
                     text.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/);
    if (mobMatch) {
        result.Mobile = cleanPhone(mobMatch[2] || mobMatch[1]);
    }

    // 8. Date & Time
    const dateMatch = text.match(/(?:Created\s*Date|Date(?:\s*(?:&|and)?\s*Time)?|Txn\s*Date)\s*[:\-]\s*([^\n\r]+)/i);
    if (dateMatch) {
        result.TransDate = normalizeDate(dateMatch[1]);
        result.TransTime = extractTime(dateMatch[1]);
    } else {
        result.TransDate = new Date().toISOString().split('T')[0];
    }

    // 9. Agent Details & Authorize Code
    const agentIdMatch = text.match(/Agent\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
    if (agentIdMatch) result.AgentID = agentIdMatch[1].trim();

    const agentNameMatch = text.match(/Agent\s*Name\s*[:\-]\s*([^\n\r]+)/i);
    if (agentNameMatch) result.AgentName = agentNameMatch[1].trim();

    const terminalMatch = text.match(/Terminal\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
    if (terminalMatch) result.TerminalID = terminalMatch[1].trim();

    const authCodeMatch = text.match(/Authorize\s*Code\s*[:\-]\s*([A-Za-z0-9]+)/i);
    if (authCodeMatch) result.AuthorizeCode = authCodeMatch[1].trim();

    // 10. Customer Name (Ensure Agent Name is NOT used as Customer Name)
    const nameMatch = text.match(/(?:Customer|Cust|Card\s*Holder|Acc(?:ount)?\s*Holder|Applicant|Beneficiary)\s*Name[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i);
    if (nameMatch) {
        let n = nameMatch[1].trim();
        if (!/^(null|undefined|na|n\/a)$/i.test(n) && n !== result.AgentName) {
            result.CustomerName = n;
        }
    }

    // 11. Bank Name
    const bankMatch = text.match(/(?:^|\n)\s*(?:Bank(?:\s*Name)?|Issuer\s*Bank)\s*[:\-]\s*([A-Za-z0-9\s\.\(\)\&]{3,40})(?:\n|$)/i);
    if (bankMatch) {
        let b = bankMatch[1].trim();
        if (!/^(null|undefined|na|n\/a)$/i.test(b)) {
            result.BankName = b;
        }
    } else {
        const prominentBanks = [
            'Uttar Pradesh Gramin Bank', 'UP Gramin Bank', 'State Bank of India', 'Punjab National Bank',
            'Bank of Baroda', 'Central Bank of India', 'Union Bank of India', 'Canara Bank',
            'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Indian Bank',
            'Bank of India', 'Aryavart Bank', 'Baroda UP Bank', 'Prathama UP Gramin Bank',
            'Airtel Payments Bank', 'Paytm Payments Bank', 'Fino Payments Bank',
            'India Post Payments Bank', 'IndusInd Bank'
        ];
        for (const pb of prominentBanks) {
            const rx = new RegExp('\\b' + pb.replace(/\s+/g, '\\s+') + '\\b', 'i');
            if (rx.test(text)) {
                result.BankName = pb;
                break;
            }
        }
    }

    // 12. Account Number
    const accMatch = text.match(/(?:Account|Acc|A\/c|Acct)(?:\s*(?:No|Num|Number))?[:\s\-]+([xX\*\d]{6,22})/i);
    if (accMatch) {
        result.AccountNumber = accMatch[1].trim();
    }

    // 13. Portal Identification: sirf Digipay ya Digipay Lite
        if (/Digipay\s*Lite/i.test(text)) {
            result.PortalName = 'Digipay Lite';
        } else if (/CSC\s*Technology|Unified\s*AEPS|API\s*Tid|AEPS_CASH_WITHDRAWAL|Startek\s*L1/i.test(text)) {
            result.PortalName = 'Digipay Lite';
        } else if (/CSC\s*E-Governance|CSC\s*Logo|Digipay|Indus\s*Bank|IndusInd/i.test(text)) {
            result.PortalName = 'Digipay'
    } else if (/SBI\s*Kiosk|Kiosk\s*Banking/i.test(text)) {
        result.PortalName = 'SBI Kiosk Banking';
    } else if (/Spice\s*Money|Spicemoney/i.test(text)) {
        result.PortalName = 'Spice Money AEPS';
    } else if (/PayNearby/i.test(text)) {
        result.PortalName = 'PayNearby AEPS';
    }

    // 14. Customer Charge & Commission defaults
    if (result.Amount && result.Amount > 0) {
        if (result.Amount >= 1000) {
            result.CustomerCharge = 10;
        }
        result.CommissionEarned = parseFloat((result.Amount * 0.002).toFixed(2));
    }

    return result;
}

/**
 * Parse CSC Application Receipt from Text
 */
function parseCSCReceiptText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const result = {
        ApplicantName: '',
        CustomerName: '',
        Mobile: '',
        CustomerPhone: '',
        Aadhaar: '',
        CustomerAadhaar: '',
        AckNumber: '',
        RRN_UTR: '',
        PortalName: 'CSC Digital Seva',
        ServiceType: 'PAN Card (NSDL / UTI)',
        ApplyDate: new Date().toISOString().split('T')[0],
        ExpectedDate: '',
        GovtFee: 0,
        OperatorFee: 0,
        TotalFee: 0,
        PaidAmount: 0,
        Status: 'Pending'
    };

    // 1. Service Type Detection
    if (/pan\s*card|nsdl|utiitsl/i.test(text)) {
        result.ServiceType = 'PAN Card (NSDL / UTI)';
        result.GovtFee = 107;
        result.OperatorFee = 50;
    } else if (/income\s*cert|aay\s*praman/i.test(text)) {
        result.ServiceType = 'Income Certificate (/ *M0.># *$M0)';
        result.GovtFee = 15;
        result.OperatorFee = 35;
    } else if (/caste\s*cert|jati\s*praman/i.test(text)) {
        result.ServiceType = 'Caste Certificate (>$? *M0.># *$M0)';
        result.GovtFee = 15;
        result.OperatorFee = 35;
    } else if (/domicile|nivas\s*praman/i.test(text)) {
        result.ServiceType = 'Domicile Certificate ((?5>8 *M0.># *$M0)';
        result.GovtFee = 15;
        result.OperatorFee = 35;
    } else if (/ration\s*card/i.test(text)) {
        result.ServiceType = 'Ration Card Online Apply';
        result.GovtFee = 50;
        result.OperatorFee = 50;
    } else if (/electricity|bijli\s*bill/i.test(text)) {
        result.ServiceType = 'Electricity Bill Payment';
    } else if (/pm\s*kisan/i.test(text)) {
        result.ServiceType = 'PM Kisan eKYC / Registration';
    }
    result.TotalFee = (result.GovtFee || 0) + (result.OperatorFee || 0);
    result.PaidAmount = result.TotalFee;

    // 2. Acknowledgment / Token / Application Number
    const ackMatch = text.match(/(?:^|\n)\s*(?:Ack(?:nowledg[e]?ment)?|Token|Application|Reference|Ref)\s*(?:No|Num|Number|ID)?\s*[:\-#]\s*([A-Za-z0-9]{6,30})/i);
    if (ackMatch) {
        result.AckNumber = ackMatch[1].trim();
        result.RRN_UTR = result.AckNumber;
    }

    // 3. Applicant Name
    const nameMatch = text.match(/(?:Applicant|Customer|Citizen|Beneficiary|Candidate)\s*Name[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i) ||
                      text.match(/(?:Name\s*of\s*Applicant)[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i);
    if (nameMatch) {
        result.ApplicantName = nameMatch[1].trim();
        result.CustomerName = result.ApplicantName;
    }

    // 4. Mobile Number
    const mobMatch = text.match(/(?:Mobile|Phone|Contact)(?:\s*(?:No|Num|Number))?[:\s\-#]*(\+?91[\-\s]?)?([6-9]\d{9})/i) ||
                     text.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/);
    if (mobMatch) {
        result.Mobile = cleanPhone(mobMatch[2] || mobMatch[1]);
        result.CustomerPhone = result.Mobile;
    }

    // 5. Aadhaar
    const aadhMatch = text.match(/(?:Aadhaar|UID|UIDAI)[:\s\-\#]*([xX\*\d\s]{12,19})/i) ||
                      text.match(/([xX\*]{4,8}[\s\-]?\d{4})/i);
    if (aadhMatch) {
        result.Aadhaar = cleanAadhaar(aadhMatch[1]);
        result.CustomerAadhaar = result.Aadhaar;
    }

    // 6. Fees
    const feeMatch = text.match(/(?:Total\s*Fee|Fee\s*Amount|Amount\s*Paid|Total\s*Amount)[:\s\-�Rs\.]*([\d,]+\.?\d{0,2})/i);
    if (feeMatch) {
        const amt = cleanAmount(feeMatch[1]);
        if (amt !== null && amt > 0) {
            result.TotalFee = amt;
            result.PaidAmount = amt;
        }
    }

    // 7. Apply Date
    const applyDateMatch = text.match(/(?:Apply\s*Date|Application\s*Date|Date)[:\s\-]+([\d\/\-\.]{8,10})/i);
    if (applyDateMatch) {
        result.ApplyDate = normalizeDate(applyDateMatch[1]);
    }

    return result;
}

// ----------------------------------------------------------------------------
// TEST SUITE EXECUTION
// ----------------------------------------------------------------------------

console.log('================================================================');
console.log('  CASH MANAGEMENT BC - EXTENSION PARSER UNIT REGRESSION SUITE   ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`   [PASS] ${name}`);
    } catch (err) {
        console.error(`   [FAIL] ${name}: ${err.message}`);
    }
}

// TEST 1: Digipay AEPS Cash Withdrawal Receipt
runTest('Digipay AEPS Cash Withdrawal Receipt Parsing', () => {
    const raw = `
CSC e-Governance Services India Limited
DIGIPAY RECEIPT
--------------------------------------------
Transaction Type: Cash Withdrawal
Agent ID: 123456789012
Customer Name: RAMESH CHANDRA
Aadhaar Number: XXXXXXXX9142
Bank Name: State Bank of India
RRN: 430912345678
Transaction Amount: � 2,500.00
Account Balance: � 3,450.25
Mobile Number: 9076872918
Date & Time: 04/11/2026 11:30:15 AM
Status: SUCCESS
--------------------------------------------
Thank you for using Digipay!
`;
    const res = parseAEPSReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Cash Withdrawal');
    assert.strictEqual(res.CustomerName, 'RAMESH CHANDRA');
    assert.strictEqual(res.Mobile, '9076872918');
    assert.strictEqual(res.BankName, 'State Bank of India');
    assert.strictEqual(res.RRN_UTR, '430912345678');
    assert.strictEqual(res.Amount, 2500);
    assert.strictEqual(res.AccountBalance, 3450.25);
    assert.strictEqual(res.CustomerCharge, 10);
    assert.strictEqual(res.CommissionEarned, 5);
    assert.strictEqual(res.TransDate, '2026-11-04');
});

// TEST 2: SBI Kiosk Banking AePS Receipt
runTest('SBI Kiosk Banking AePS Receipt Parsing', () => {
    const raw = `
STATE BANK OF INDIA
FINANCIAL INCLUSION KIOSK BANKING
CUSTOMER TRANSACTION RECEIPT
Date: 04/11/2026 10:45:22
Kiosk ID: 1A234567
Txn Type: AePS Cash Withdrawal
UIDAI Token: ********5678
Customer A/C: 30123456789
Bank: State Bank of India
Journal / STAN / RRN: 876543210987
Txn Amount: Rs. 10000.00
Available Balance: Rs. 15420.00
Status: SUCCESSFUL
`;
    const res = parseAEPSReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Cash Withdrawal');
    assert.strictEqual(res.BankName, 'State Bank of India');
    assert.strictEqual(res.RRN_UTR, '876543210987');
    assert.strictEqual(res.Amount, 10000);
    assert.strictEqual(res.AccountBalance, 15420);
    assert.strictEqual(res.CustomerCharge, 10);
});

// TEST 3: Spice Money AEPS Cash Withdrawal Receipt
runTest('Spice Money AEPS Receipt Parsing', () => {
    const raw = `
SPICE MONEY TRANSACTION SLIP
Service: AEPS Cash Withdrawal
Customer Name: SUNITA DEVI
Customer Mobile: 9876543210
Aadhaar No: XXXX-XXXX-4321
Bank Name: Punjab National Bank
Txn ID: 998877665544
Amount: Rs. 3,000.00
Ledger Balance: Rs. 7,850.50
Txn Date: 03-Nov-2026 04:15 PM
Status: SUCCESS
`;
    const res = parseAEPSReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Cash Withdrawal');
    assert.strictEqual(res.CustomerName, 'SUNITA DEVI');
    assert.strictEqual(res.Mobile, '9876543210');
    assert.strictEqual(res.BankName, 'Punjab National Bank');
    assert.strictEqual(res.RRN_UTR, '998877665544');
    assert.strictEqual(res.Amount, 3000);
    assert.strictEqual(res.AccountBalance, 7850.50);
});

// TEST 4: Digipay Lite AEPS Balance Enquiry
runTest('Digipay Lite Balance Enquiry Parsing', () => {
    const raw = `
CSC DIGIPAY LITE
Receipt Type: Balance Enquiry
Ref Number: 112233445566
Aadhaar: ********1122
Bank: Bank of Baroda
Available Balance: � 5,420.00
Mobile: 919876543210
Date: 04/11/2026
`;
    const res = parseAEPSReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Balance Enquiry');
    assert.strictEqual(res.BankName, 'Bank of Baroda');
    assert.strictEqual(res.RRN_UTR, '112233445566');
    assert.strictEqual(res.AccountBalance, 5420);
    assert.strictEqual(res.Mobile, '9876543210');
});

// TEST 5: CSC Digital Seva PAN Card Application Receipt
runTest('CSC Digital Seva PAN Card Application Parsing', () => {
    const raw = `
CSC DIGITAL SEVA - APPLICATION ACKNOWLEDGEMENT SLIP
Service Name: PAN Card (NSDL / UTI)
Acknowledgement No: 990079730626722
Applicant Name: Kanti Devi
Mobile Number: 9076872918
Aadhaar Number: ********9142
Application Date: 03/11/2026
Total Amount Paid: � 107.00
Status: Submitted (Pending)
`;
    const res = parseCSCReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'PAN Card (NSDL / UTI)');
    assert.strictEqual(res.ApplicantName, 'Kanti Devi');
    assert.strictEqual(res.AckNumber, '990079730626722');
    assert.strictEqual(res.Mobile, '9076872918');
    assert.strictEqual(res.TotalFee, 107);
    assert.strictEqual(res.ApplyDate, '2026-11-03');
});

// TEST 6: eDistrict UP Income Certificate Receipt
runTest('eDistrict UP Income Certificate Parsing', () => {
    const raw = `
eDistrict Uttar Pradesh - Online Nagrik Seva
Income Certificate (/ *M0.># *$M0)
Application No: 2601987654321
Citizen Name: Suresh Patel
Mobile: 8009988776
Aadhaar: 123456789012
Apply Date: 02/11/2026
Govt Fee: 15.00
`;
    const res = parseCSCReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Income Certificate (/ *M0.># *$M0)');
    assert.strictEqual(res.ApplicantName, 'Suresh Patel');
    assert.strictEqual(res.AckNumber, '2601987654321');
    assert.strictEqual(res.Mobile, '8009988776');
});

// TEST 7: Amount & Phone Sanitizers
runTest('Phone & Amount Sanitizer Edge Cases', () => {
    assert.strictEqual(cleanPhone('+91 90768-72918'), '9076872918');
    assert.strictEqual(cleanPhone('09076872918'), '9076872918');
    assert.strictEqual(cleanAmount('� 12,345.50'), 12345.5);
    assert.strictEqual(cleanAmount('Rs. 500/-'), 500);
    assert.strictEqual(cleanAmount(''), null);
});

// TEST 8: Date Normalizer
runTest('Date Normalizer Across Formats', () => {
    assert.strictEqual(normalizeDate('04/11/2026'), '2026-11-04');
    assert.strictEqual(normalizeDate('2026-11-04'), '2026-11-04');
    assert.strictEqual(normalizeDate('04-Nov-2026'), '2026-11-04');
    assert.strictEqual(normalizeDate('15 August 2026'), '2026-08-15');
    assert.strictEqual(normalizeDate('November 04, 2026 03:06:48 PM'), '2026-11-04');
});

// TEST 9: CSC Digipay IndusInd Bank AEPS Live Receipt Parsing
runTest('CSC Digipay IndusInd Bank AEPS Live Receipt Parsing', () => {
    const raw = `Transaction Receipt

Payment Status: SUCCESS

Transaction ID: CZUCW17937850055120593N8RFW45487472
Balance: �261.78
Date: November 04, 2026 03:06:48 PM
Amount: �2,000
Agent ID: 411632300012
Location: Sanjay Nag Sitapur, 183 UPIN
Agent Name: Sanjay Nag
Terminal ID: 411632300012
Authorize Code: 723c970595bf4e2aadfaab82d4781e03
Customer ID: XXXX XXXX 6431
Bank Ref. No.: 630815487472
RRN: 630815487472
Bank Name: Indian Bank
Transaction Type: Cash Withdrawal (AEPS)
Device Type: WEB
CSC Logo
CSC E-Governance
Services India Limited
Indus Bank Logo`;

    const res = parseAEPSReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Cash Withdrawal');
    assert.strictEqual(res.Status, 'Success');
    assert.strictEqual(res.Amount, 2000);
    assert.strictEqual(res.AccountBalance, 261.78);
    assert.strictEqual(res.RRN_UTR, '630815487472');
    assert.strictEqual(res.BankRefNo, '630815487472');
    assert.strictEqual(res.TransactionID, 'CZUCW17937850055120593N8RFW45487472');
    assert.strictEqual(res.BankName, 'Indian Bank');
    assert.strictEqual(res.Aadhaar, 'XXXX XXXX 6431');
    assert.strictEqual(res.CustomerAadhaarLast4, '6431');
    assert.strictEqual(res.TransDate, '2026-11-04');
    assert.strictEqual(res.TransTime, '03:06:48 PM');
    assert.strictEqual(res.AgentID, '411632300012');
    assert.strictEqual(res.AgentName, 'Sanjay Nag');
    assert.strictEqual(res.TerminalID, '411632300012');
    assert.strictEqual(res.AuthorizeCode, '723c970595bf4e2aadfaab82d4781e03');
    assert.strictEqual(res.CustomerName, ''); // Sanjay Nag is Agent, NOT customer
    assert.strictEqual(res.PortalName, 'Digipay');
});

// TEST 10: CSC Technology (Unified AEPS) Live Receipt Parsing (User Case 1)
runTest('CSC Technology Unified AEPS Live Receipt Parsing', () => {
    const raw = `
Success
AEPS_CASH_WITHDRAWAL
Transaction Mode	: AEPS_CASH_WITHDRAWAL
Transaction ID	: 627180484975142621
Transaction Amount	: 5000
Bank Name	: Uttar Pradesh Gramin Bank
Aadhar Number	: xxxx-xxxx-3147
API Tid	: 630917628452
Amount	: Rs. 5000
Mobile	: 9400000000
Created Date	: 2026-11-05 17:18:20
Updated Date	: 2026-11-05 17:18:22
Status	: SUCCESS
Message	: APPROVED
A/C Balance	: Rs. 63064.75
`;

    const res = parseAEPSReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Cash Withdrawal');
    assert.strictEqual(res.Status, 'Success');
    assert.strictEqual(res.Amount, 5000);
    assert.strictEqual(res.AccountBalance, 63064.75);
    assert.strictEqual(res.RRN_UTR, '630917628452');
    assert.strictEqual(res.BankRefNo, '630917628452');
    assert.strictEqual(res.TransactionID, '627180484975142621');
    assert.strictEqual(res.BankName, 'Uttar Pradesh Gramin Bank');
    assert.strictEqual(res.CustomerAadhaarLast4, '3147');
    assert.strictEqual(res.Mobile, '9400000000');
    assert.strictEqual(res.TransDate, '2026-11-05');
    assert.strictEqual(res.TransTime, '17:18:20');
    assert.strictEqual(res.PortalName, 'Digipay Lite');
});

// TEST 11: CSC Technology (Unified AEPS) Image 1 Sample (User Screenshot)
runTest('CSC Technology Image 1 Sample Parsing', () => {
    const raw = `
Success
AEPS_CASH_WITHDRAWAL
Transaction Mode : AEPS_CASH_WITHDRAWAL
Transaction ID : 627180988425838271
Transaction Amount : 1000
Bank Name : Indian Bank
Aadhar Number : xxxx-xxxx-3272
API Tid : 630917631056
Amount : Rs. 1000
Mobile : 9400000000
Created Date : 2026-11-05 17:23:20
Updated Date : 2026-11-05 17:23:20
Status : SUCCESS
Message : APPROVED
A/C Balance : Rs. 30918.0
`;

    const res = parseAEPSReceiptText(raw);
    assert.strictEqual(res.ServiceType, 'Cash Withdrawal');
    assert.strictEqual(res.Status, 'Success');
    assert.strictEqual(res.Amount, 1000);
    assert.strictEqual(res.AccountBalance, 30918);
    assert.strictEqual(res.RRN_UTR, '630917631056');
    assert.strictEqual(res.BankRefNo, '630917631056');
    assert.strictEqual(res.TransactionID, '627180988425838271');
    assert.strictEqual(res.BankName, 'Indian Bank');
    assert.strictEqual(res.CustomerAadhaarLast4, '3272');
    assert.strictEqual(res.Mobile, '9400000000');
    assert.strictEqual(res.TransDate, '2026-11-05');
    assert.strictEqual(res.TransTime, '17:23:20');
    assert.strictEqual(res.PortalName, 'Digipay Lite');
});

// TEST 12: Full 12-Digit Aadhaar Resolution from User Session Memory
runTest('Full 12-Digit Aadhaar Resolution from User Session Memory', () => {
    // Simulate user typing full 12 digits on the portal form
    recordPotentialAadhaar('5678 1234 3147');

    const receiptWithMaskedAadhaar = `
Success
AEPS_CASH_WITHDRAWAL
Transaction Mode : AEPS_CASH_WITHDRAWAL
Transaction ID : 627180484975142621
Aadhar Number : xxxx-xxxx-3147
API Tid : 630917628452
Amount : Rs. 5000
Bank Name : Uttar Pradesh Gramin Bank
`;

    const res = parseAEPSReceiptText(receiptWithMaskedAadhaar);
    assert.strictEqual(res.CustomerAadhaarLast4, '3147');
    // Verifies full 12-digit Aadhaar was auto-resolved from session watcher!
    assert.strictEqual(res.Aadhaar, '567812343147');
});

console.log('\n----------------------------------------------------------------');
console.log(`  RESULTS: ${passedTests}/${totalTests} Tests Passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
} else {
    process.exit(0);
}
