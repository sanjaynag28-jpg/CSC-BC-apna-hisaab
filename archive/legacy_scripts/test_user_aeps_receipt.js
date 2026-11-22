const sampleReceipt = `Transaction Receipt

Payment Status: SUCCESS

Transaction ID: CZUCW17937850055120593N8RFW45487472
Balance: ₹261.78
Date: November 04, 2026 03:06:48 PM
Amount: ₹2,000
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
    const digits = String(val).replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
}

function cleanAadhaar(val) {
    if (!val) return '';
    const s = String(val).trim();
    // Masked patterns: XXXX XXXX 1234 or XXXXXXXX1234 or **** **** 1234
    if (/^[xX*]{4}[\s\-]?[xX*]{4}[\s\-]?\d{4}$/.test(s) || /^[xX*]{4,8}[\s\-]?\d{4}$/.test(s)) {
        return s;
    }
    const digits = s.replace(/\D/g, '');
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
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    // Format 3: DD Month YYYY (e.g. 04 Nov 2026)
    const namedMatch = s.match(/(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{4})/i);
    if (namedMatch) {
        const day = namedMatch[1].padStart(2, '0');
        const mKey = namedMatch[2].substring(0, 3).toLowerCase();
        const month = monthMap[mKey] || '01';
        const year = namedMatch[3];
        return `${year}-${month}-${day}`;
    }

    // Format 4: YYYY-MM-DD
    const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymd) {
        return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }

    return new Date().toISOString().split('T')[0];
}

function extractTime(raw) {
    if (!raw) return '';
    const m = String(raw).match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
    return m ? m[1].trim() : '';
}

function parseAEPSImproved(rawText, domPairs = {}) {
    const text = (rawText || '').replace(/\r/g, '\n');

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
        PortalName: 'CSC Digipay AEPS'
    };

    // 1. Service Type
    const typeMatch = text.match(/(?:Transaction\s*Type|Service\s*Type|Txn\s*Type)\s*[:\-]\s*([^\n\r]+)/i);
    const typeStr = typeMatch ? typeMatch[1] : text;

    if (/balance\s*enquiry/i.test(typeStr)) result.ServiceType = 'Balance Enquiry';
    else if (/mini\s*statement/i.test(typeStr)) result.ServiceType = 'Mini Statement';
    else if (/cash\s*deposit|deposit/i.test(typeStr) && !/withdrawal/i.test(typeStr)) result.ServiceType = 'Cash Deposit';
    else if (/money\s*transfer|dmt|remittance|payout/i.test(typeStr)) result.ServiceType = 'Money Transfer';
    else if (/aadhaar\s*pay/i.test(typeStr)) result.ServiceType = 'Cash Withdrawal';
    else result.ServiceType = 'Cash Withdrawal';

    // 2. Status
    const statusMatch = text.match(/(?:Payment\s*Status|Transaction\s*Status|Txn\s*Status|Status)\s*[:\-]\s*([A-Za-z]+)/i);
    if (statusMatch) {
        const s = statusMatch[1].toUpperCase();
        if (/SUCCESS/.test(s)) result.Status = 'Success';
        else if (/FAIL/.test(s)) result.Status = 'Failed';
        else if (/PENDING/.test(s)) result.Status = 'Pending';
    }

    // 3. RRN, Bank Ref No, Transaction ID
    // Priority: Real 12-digit numeric RRN
    const rrnMatch = text.match(/(?:\bRRN\b|\bBank\s*Ref(?:\.|erence)?\s*(?:No|Num|Number)?)\s*[:\-#]*\s*(\d{11,14})/i);
    if (rrnMatch) {
        result.RRN_UTR = rrnMatch[1].trim();
        result.BankRefNo = rrnMatch[1].trim();
    }

    // Bank Ref No if separate
    const bankRefMatch = text.match(/Bank\s*Ref(?:\.|erence)?(?:\s*(?:No|Num|Number|\.))*\s*[:\-#]*\s*([A-Za-z0-9]+)/i);
    if (bankRefMatch) {
        result.BankRefNo = bankRefMatch[1].trim();
        if (!result.RRN_UTR) result.RRN_UTR = result.BankRefNo;
    }

    // Gateway Transaction ID
    const txnIdMatch = text.match(/(?:Transaction\s*ID|Txn\s*ID)\s*[:\-#]*\s*([A-Za-z0-9]{10,45})/i);
    if (txnIdMatch) {
        result.TransactionID = txnIdMatch[1].trim();
        if (!result.RRN_UTR) result.RRN_UTR = result.TransactionID;
    }

    // Fallback RRN if not captured yet
    if (!result.RRN_UTR) {
        const genRrn = text.match(/(?:RRN|UTR|STAN)[:\s\-\#]*([A-Za-z0-9]{8,22})/i);
        if (genRrn) result.RRN_UTR = genRrn[1].trim();
    }

    // 4. Amount
    const amtMatch = text.match(/(?:Amount|Txn\s*Amount|Withdrawal\s*Amount|Total\s*Amount)\s*[:\-]\s*[₹Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i);
    if (amtMatch) {
        result.Amount = cleanAmount(amtMatch[1]);
    } else {
        const fallbackAmt = text.match(/(?:₹|Rs\.?)\s*([\d,]+\.?\d{0,2})\s*(?:debited|credited|withdrawn|successful)?/i);
        if (fallbackAmt) result.Amount = cleanAmount(fallbackAmt[1]);
    }

    // 5. Account Balance
    const balMatch = text.match(/(?:Balance|Available\s*Balance|Ledger\s*Balance|Acc(?:\.|ount)?\s*Bal(?:ance)?)\s*[:\-]\s*[₹Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i);
    if (balMatch) {
        result.AccountBalance = cleanAmount(balMatch[1]);
    }

    // 6. Aadhaar / Customer ID
    // Look specifically for Customer ID: XXXX XXXX 6431 or Aadhaar: XXXX XXXX 6431
    const custIdMatch = text.match(/(?:Customer\s*ID|Aadhaar|UID|UIDAI|Aadhar)\s*[:\-]\s*([xX\*\d\s\-]{8,20})/i);
    if (custIdMatch) {
        result.Aadhaar = cleanAadhaar(custIdMatch[1]);
        result.CustomerAadhaarLast4 = extractAadhaarLast4(custIdMatch[1]);
    } else {
        // Generic masked Aadhaar pattern XXXX XXXX 1234
        const maskedMatch = text.match(/([xX\*]{4}[\s\-]?[xX\*]{4}[\s\-]?\d{4})/i) || text.match(/([xX\*]{4,8}[\s\-]?\d{4})/i);
        if (maskedMatch) {
            result.Aadhaar = cleanAadhaar(maskedMatch[1]);
            result.CustomerAadhaarLast4 = extractAadhaarLast4(maskedMatch[1]);
        }
    }

    // 7. Date & Time
    const dateMatch = text.match(/(?:Date(?:\s*(?:&|and)?\s*Time)?|Txn\s*Date)\s*[:\-]\s*([^\n\r]+)/i);
    if (dateMatch) {
        result.TransDate = normalizeDate(dateMatch[1]);
        result.TransTime = extractTime(dateMatch[1]);
    }

    // 8. Bank Name
    const bankMatch = text.match(/(?:Bank(?:\s*Name)?|Issuer\s*Bank)\s*[:\-]\s*([A-Za-z0-9\s\.\(\)\&]{3,40})(?:\n|$)/i);
    if (bankMatch) {
        const b = bankMatch[1].trim();
        if (!/^(null|undefined|na|n\/a)$/i.test(b)) result.BankName = b;
    } else {
        const prominentBanks = [
            'State Bank of India', 'Punjab National Bank', 'Bank of Baroda',
            'Central Bank of India', 'Union Bank of India', 'Canara Bank',
            'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank',
            'Indian Bank', 'Bank of India', 'Aryavart Bank', 'Baroda UP Bank',
            'Prathama UP Gramin Bank', 'Airtel Payments Bank', 'Paytm Payments Bank',
            'Fino Payments Bank', 'India Post Payments Bank', 'IndusInd Bank'
        ];
        for (const pb of prominentBanks) {
            const rx = new RegExp('\\b' + pb.replace(/\s+/g, '\\s+') + '\\b', 'i');
            if (rx.test(text)) {
                result.BankName = pb;
                break;
            }
        }
    }

    // 9. Account Number
    const accMatch = text.match(/(?:Account|Acc|A\/c|Acct)(?:\s*(?:No|Num|Number))?\s*[:\-]\s*([xX\*\d]{6,22})/i);
    if (accMatch) result.AccountNumber = accMatch[1].trim();

    // 10. Agent ID, Terminal ID, Agent Name, Authorize Code
    const agentIdMatch = text.match(/Agent\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
    if (agentIdMatch) result.AgentID = agentIdMatch[1].trim();

    const agentNameMatch = text.match(/Agent\s*Name\s*[:\-]\s*([^\n\r]+)/i);
    if (agentNameMatch) result.AgentName = agentNameMatch[1].trim();

    const terminalMatch = text.match(/Terminal\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
    if (terminalMatch) result.TerminalID = terminalMatch[1].trim();

    const authCodeMatch = text.match(/Authorize\s*Code\s*[:\-]\s*([A-Za-z0-9]+)/i);
    if (authCodeMatch) result.AuthorizeCode = authCodeMatch[1].trim();

    // Customer Name: only if specifically Customer Name / Card Holder Name
    // IMPORTANT: Make sure Agent Name is NEVER picked as Customer Name
    const custNameMatch = text.match(/(?:Customer|Cust|Card\s*Holder|Acc(?:ount)?\s*Holder|Beneficiary)\s*Name\s*[:\-]\s*([A-Za-z\s\.]{3,35})(?:\n|$)/i);
    if (custNameMatch) {
        const cn = custNameMatch[1].trim();
        if (!/^(null|undefined|na|n\/a)$/i.test(cn) && cn !== result.AgentName) {
            result.CustomerName = cn;
        }
    }

    // 11. Portal identification
    if (/CSC\s*E-Governance|CSC\s*Logo|Digipay/i.test(text)) {
        result.PortalName = 'CSC Digipay (IndusInd Bank AEPS)';
    }

    // 12. Commission & Charge
    if (result.Amount && result.Amount > 0) {
        if (result.Amount >= 1000) result.CustomerCharge = 10;
        result.CommissionEarned = parseFloat((result.Amount * 0.002).toFixed(2));
    }

    return result;
}

const res = parseAEPSImproved(sampleReceipt);
console.log('--- IMPROVED PARSER OUTPUT FOR USER RECEIPT ---');
console.log(JSON.stringify(res, null, 2));
