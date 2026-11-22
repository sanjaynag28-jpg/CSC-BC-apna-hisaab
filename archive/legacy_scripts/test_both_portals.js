const fs = require('fs');

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
    if (/^[xX*]{4}[\s\-]?[xX*]{4}[\s\-]?\d{4}$/.test(s) || /^[xX*]{4,8}[\s\-]?\d{4}$/.test(s)) {
        const last4 = s.slice(-4);
        return `**** **** ${last4}`;
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

function extractTime(raw) {
    if (!raw) return '';
    const m = String(raw).match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
    return m ? m[1].trim() : '';
}

function normalizeDate(raw) {
    if (!raw) return new Date().toISOString().split('T')[0];
    const s = String(raw).trim();
    const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

    // Format 1: Month DD, YYYY (e.g. November 05, 2026)
    const mdy = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
    if (mdy) {
        const mKey = mdy[1].substring(0, 3).toLowerCase();
        const month = monthMap[mKey] || '01';
        const day = mdy[2].padStart(2, '0');
        const year = mdy[3];
        return `${year}-${month}-${day}`;
    }

    // Format 2: YYYY-MM-DD
    const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymd) {
        return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }

    // Format 3: DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmy) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    return new Date().toISOString().split('T')[0];
}

function parseAEPS(rawText, domPairs = {}) {
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

    // 1. Service Type Detection (Handles both DigiPay & CSC Technology formats)
    const typeMatch = text.match(/(?:Transaction\s*Mode|Transaction\s*Type|Service\s*Type|Txn\s*Type|Txn\s*Mode)\s*[:\-]\s*([^\n\r]+)/i);
    const typeStr = (typeMatch ? typeMatch[1] : text).toLowerCase();

    if (/balance[_\s\-]*enquiry/i.test(typeStr)) result.ServiceType = 'Balance Enquiry';
    else if (/mini[_\s\-]*statement/i.test(typeStr)) result.ServiceType = 'Mini Statement';
    else if (/cash[_\s\-]*deposit|deposit/i.test(typeStr) && !/withdrawal/i.test(typeStr)) result.ServiceType = 'Cash Deposit';
    else if (/money[_\s\-]*transfer|dmt|remittance|payout/i.test(typeStr)) result.ServiceType = 'Money Transfer';
    else if (/aadhaar[_\s\-]*pay/i.test(typeStr)) result.ServiceType = 'Cash Withdrawal';
    else if (/cash[_\s\-]*withdrawal|aeps[_\s\-]*cash[_\s\-]*withdrawal/i.test(typeStr)) result.ServiceType = 'Cash Withdrawal';
    else result.ServiceType = 'Cash Withdrawal';

    // 2. Process DOM Key-Value Pairs
    for (const [k, v] of Object.entries(domPairs)) {
        // RRN / UTR / Reference No / API Tid
        if (/^(rrn|bank ref no|bank ref|bank reference|utr|api tid|apitid|api txn id|cbs rrn|npci rrn)/.test(k) && !result.RRN_UTR) {
            const digits = String(v).replace(/\D/g, '');
            if (digits.length >= 11 && digits.length <= 14) {
                result.RRN_UTR = digits;
                result.BankRefNo = digits;
            } else {
                result.RRN_UTR = String(v).trim();
            }
        }
        if (/^(transaction id|txnid|gateway txn id|journal|txn id)/.test(k) && !result.TransactionID) {
            result.TransactionID = String(v).trim();
        }
        if (/^(amount|txnamount|totalamount|principalamount|withdrawalamount|transaction amount|txn amount)/.test(k) && result.Amount === null) {
            result.Amount = cleanAmount(v);
        }
        if (/balance|availbal|ledgerbal|a c balance|ac balance|account balance/.test(k) && result.AccountBalance === null) {
            result.AccountBalance = cleanAmount(v);
        }
        if (/^(aadhaar|uid|uidai|aadhar|customer id|cust id|aadhar number|aadhaar number)/.test(k) && !result.Aadhaar) {
            result.Aadhaar = cleanAadhaar(v);
            result.CustomerAadhaarLast4 = extractAadhaarLast4(v);
        }
        if (/mobile|phone|contact/.test(k) && !result.Mobile) {
            result.Mobile = cleanPhone(v);
        }
        if (/^(customer name|cust name|account holder|card holder|beneficiary name)/.test(k) && !result.CustomerName) {
            const n = String(v).trim();
            if (!/agent|operator|kiosk|retailer/i.test(k)) result.CustomerName = n;
        }
        if (/^(agent name|operator name|retailer name)/.test(k) && !result.AgentName) {
            result.AgentName = String(v).trim();
        }
        if (/^(agent id|bc id|operator id)/.test(k) && !result.AgentID) {
            result.AgentID = String(v).trim();
        }
        if (/^(terminal id|tid)/.test(k) && !result.TerminalID) {
            result.TerminalID = String(v).trim();
        }
        if (/^(authorize code|auth code|approval code)/.test(k) && !result.AuthorizeCode) {
            result.AuthorizeCode = String(v).trim();
        }
        if (/^(payment status|transaction status|status)/.test(k)) {
            const s = String(v).toUpperCase();
            if (/SUCCESS|APPROVED/.test(s)) result.Status = 'Success';
            else if (/FAIL|DECLINED/.test(s)) result.Status = 'Failed';
            else if (/PENDING/.test(s)) result.Status = 'Pending';
        }
        if (/bank|bankname|issuerbank/.test(k) && !result.BankName) {
            result.BankName = String(v).trim();
        }
        if (/account|accno|accountnumber/.test(k) && !result.AccountNumber) {
            result.AccountNumber = String(v).trim();
        }
        if (/created date|date|datetime|txndate/.test(k) && !result.TransTime) {
            result.TransDate = normalizeDate(v);
            result.TransTime = extractTime(v);
        }
    }

    // 3. Fallback to Regex on Text for Status
    const statusMatch = text.match(/(?:Payment\s*Status|Transaction\s*Status|Txn\s*Status|Status)\s*[:\-]\s*([A-Za-z]+)/i);
    if (statusMatch) {
        const s = statusMatch[1].toUpperCase();
        if (/SUCCESS|APPROVED/.test(s)) result.Status = 'Success';
        else if (/FAIL|DECLINED/.test(s)) result.Status = 'Failed';
        else if (/PENDING/.test(s)) result.Status = 'Pending';
    }

    // 4. RRN, API Tid, Bank Ref No, Transaction ID
    // Check for API Tid (CSC Technology 12-digit RRN: e.g. "API Tid : 630917628452")
    if (!result.RRN_UTR) {
        const apiTidMatch = text.match(/(?:API\s*Tid|API\s*Txn\s*ID|API\s*Reference)[:\s\-#]*(\d{11,14})/i);
        if (apiTidMatch) {
            result.RRN_UTR = apiTidMatch[1].trim();
            result.BankRefNo = apiTidMatch[1].trim();
        }
    }

    // Standard RRN / Bank Ref No
    if (!result.RRN_UTR) {
        const rrnMatch = text.match(/(?:\bRRN\b|\bBank\s*Ref(?:\.|erence)?\s*(?:No|Num|Number)?)\s*[:\-#]*\s*(\d{11,14})/i);
        if (rrnMatch) {
            result.RRN_UTR = rrnMatch[1].trim();
            result.BankRefNo = rrnMatch[1].trim();
        }
    }
    if (!result.BankRefNo) {
        const bankRefMatch = text.match(/Bank\s*Ref(?:\.|erence)?(?:\s*(?:No|Num|Number|\.))*\s*[:\-#]*\s*([A-Za-z0-9]+)/i);
        if (bankRefMatch) {
            result.BankRefNo = bankRefMatch[1].trim();
            if (!result.RRN_UTR) result.RRN_UTR = result.BankRefNo;
        }
    }

    // Transaction ID
    if (!result.TransactionID) {
        const txnIdMatch = text.match(/(?:Transaction\s*ID|Txn\s*ID)\s*[:\-#]*\s*([A-Za-z0-9]{10,45})/i);
        if (txnIdMatch) {
            result.TransactionID = txnIdMatch[1].trim();
            if (!result.RRN_UTR) result.RRN_UTR = result.TransactionID;
        }
    }
    if (!result.RRN_UTR) {
        const genRrn = text.match(/(?:RRN|UTR|STAN)[:\s\-\#]*([A-Za-z0-9]{8,22})/i);
        if (genRrn) result.RRN_UTR = genRrn[1].trim();
    }

    // 5. Amount Extraction
    if (result.Amount === null) {
        const amtMatch = text.match(/(?:Transaction\s*Amount|Txn\s*Amount|Withdrawal\s*Amount|Amount|Total\s*Amount)\s*[:\-]\s*[₹Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i);
        if (amtMatch) {
            result.Amount = cleanAmount(amtMatch[1]);
        } else {
            const amtPatterns = [
                /(?:Txn|Transaction|Withdrawal|Transfer|Deposit)\s*Amount[:\s\-₹Rs\.]*([\d,]+\.?\d{0,2})/i,
                /(?:Amount|Total\s*Amount)[:\s\-₹Rs\.]*([\d,]+\.?\d{0,2})/i,
                /(?:₹|Rs\.?)\s*([\d,]+\.?\d{0,2})\s*(?:debited|credited|withdrawn|successful)/i
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
    }

    // 6. Account Balance
    if (result.AccountBalance === null) {
        const balMatch = text.match(/(?:A\/C\s*Balance|Account\s*Balance|Available\s*Balance|Ledger\s*Balance|Balance)\s*[:\-]\s*[₹Rs\.\s]*([\d,]+(?:\.\d{1,2})?)/i) ||
                         text.match(/(?:Available\s*Balance|Ledger\s*Balance|Acc(?:\.|ount)?\s*Bal(?:ance)?|Bal(?:ance)?)[:\s\-₹Rs\.]*([\d,]+\.?\d{0,2})/i);
        if (balMatch) result.AccountBalance = cleanAmount(balMatch[1]);
    }

    // 7. Aadhaar / Customer ID
    if (!result.Aadhaar) {
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
    }

    // 8. Mobile Number
    if (!result.Mobile) {
        const mobMatch = text.match(/(?:Mobile|Phone|Contact|Cust(?:omer)?\s*Mobile)(?:\s*(?:No|Num|Number))?[:\s\-#]*(\+?91[\-\s]?)?([6-9]\d{9})/i) ||
                         text.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/);
        if (mobMatch) result.Mobile = cleanPhone(mobMatch[2] || mobMatch[1]);
    }

    // 9. Date & Time
    if (!result.TransTime) {
        const dateMatch = text.match(/(?:Created\s*Date|Date(?:\s*(?:&|and)?\s*Time)?|Txn\s*Date)\s*[:\-]\s*([^\n\r]+)/i);
        if (dateMatch) {
            result.TransDate = normalizeDate(dateMatch[1]);
            result.TransTime = extractTime(dateMatch[1]);
        }
    }

    // 10. Agent Details & Authorize Code
    if (!result.AgentID) {
        const agentIdMatch = text.match(/Agent\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
        if (agentIdMatch) result.AgentID = agentIdMatch[1].trim();
    }
    if (!result.AgentName) {
        const agentNameMatch = text.match(/Agent\s*Name\s*[:\-]\s*([^\n\r]+)/i);
        if (agentNameMatch) result.AgentName = agentNameMatch[1].trim();
    }
    if (!result.TerminalID) {
        const terminalMatch = text.match(/Terminal\s*ID\s*[:\-]\s*([A-Za-z0-9]+)/i);
        if (terminalMatch) result.TerminalID = terminalMatch[1].trim();
    }
    if (!result.AuthorizeCode) {
        const authCodeMatch = text.match(/Authorize\s*Code\s*[:\-]\s*([A-Za-z0-9]+)/i);
        if (authCodeMatch) result.AuthorizeCode = authCodeMatch[1].trim();
    }

    // 11. Customer Name (Ensure Agent Name is NOT used as Customer Name)
    if (!result.CustomerName) {
        const nameMatch = text.match(/(?:Customer|Cust|Card\s*Holder|Acc(?:ount)?\s*Holder|Applicant|Beneficiary)\s*Name[:\s\-]+([A-Za-z\s\.]{3,35})(?:\n|$)/i);
        if (nameMatch) {
            const n = nameMatch[1].trim();
            if (!/^(null|undefined|na|n\/a)$/i.test(n) && n !== result.AgentName) {
                result.CustomerName = n;
            }
        }
    }

    // 12. Bank Name
    if (!result.BankName) {
        const bankMatch = text.match(/(?:^|\n)\s*(?:Bank(?:\s*Name)?|Issuer\s*Bank)\s*[:\-]\s*([A-Za-z0-9\s\.\(\)\&]{3,40})(?:\n|$)/i);
        if (bankMatch) {
            const b = bankMatch[1].trim();
            if (!/^(null|undefined|na|n\/a)$/i.test(b)) result.BankName = b;
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
    }

    // 13. Portal Identification (Handles DigiPay vs CSC Technology)
    if (/CSC\s*Technology|Unified\s*AEPS|API\s*Tid|AEPS_CASH_WITHDRAWAL|Startek\s*L1/i.test(text)) {
        result.PortalName = 'CSC Technology (Unified AEPS)';
    } else if (/CSC\s*E-Governance|CSC\s*Logo|Digipay|Indus\s*Bank|IndusInd/i.test(text)) {
        result.PortalName = 'CSC Digipay (IndusInd Bank AEPS)';
    } else if (/SBI\s*Kiosk|Kiosk\s*Banking/i.test(text)) {
        result.PortalName = 'SBI Kiosk Banking';
    } else if (/Spice\s*Money|Spicemoney/i.test(text)) {
        result.PortalName = 'Spice Money AEPS';
    } else if (/PayNearby/i.test(text)) {
        result.PortalName = 'PayNearby AEPS';
    }

    // 14. Financial Commission & Fee Defaults
    if (result.Amount && result.Amount > 0) {
        if (result.Amount >= 1000) result.CustomerCharge = 10;
        result.CommissionEarned = parseFloat((result.Amount * 0.002).toFixed(2));
    }

    return result;
}

// TEST 1: DigiPay
const digipayText = `
Transaction Receipt

Payment Status: SUCCESS

Transaction ID: CZUCW17938736505520593N8RFW41250707
Balance: ₹62.21
Date: November 05, 2026 03:44:14 PM
Amount: ₹900
Agent ID: 411632300012
Location: Sanjay Nag Sitapur, 183 UPIN
Agent Name: Sanjay Nag
Terminal ID: 411632300012
Authorize Code: db672691712e4f6eae647534a0ab8c4a
Customer ID: XXXX XXXX 0004
Bank Ref. No.: 630915250707
RRN: 630915250707
Bank Name: Uttar Pradesh Gramin Bank
Transaction Type: Cash Withdrawal (AEPS)
Device Type: WEB
CSC Logo
CSC E-Governance
Services India Limited
Indus Bank Logo
`;

// TEST 2: CSC Technology (Unified AEPS)
const cscTechText = `
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

// TEST 3: CSC Technology Image 1 Sample
const cscTechImageSample = `
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

console.log('--- TEST 1: DigiPay ---');
console.log(parseAEPS(digipayText));

console.log('\n--- TEST 2: CSC Technology ---');
console.log(parseAEPS(cscTechText));

console.log('\n--- TEST 3: CSC Technology Image 1 ---');
console.log(parseAEPS(cscTechImageSample));
