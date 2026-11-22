const fs = require('fs');

function detectServiceType(rawText, domPairs, amount) {
    let detectedType = '';

    // 1. Check DOM pairs for explicit mode/type
    if (domPairs) {
        for (const [k, v] of Object.entries(domPairs)) {
            const cleanK = k.toLowerCase().trim();
            const cleanV = String(v).replace(/^[\s:\-–—#=]+/, '').trim().toLowerCase();
            if (/^(transaction mode|txn mode|mode|transaction type|txn type|service type|service)$/.test(cleanK)) {
                if (/deposit|jama/.test(cleanV)) {
                    detectedType = 'Cash Deposit';
                    break;
                } else if (/withdrawal|nikasi|cw/.test(cleanV)) {
                    detectedType = 'Cash Withdrawal';
                    break;
                } else if (/transfer|dmt|remittance|payout/.test(cleanV)) {
                    detectedType = 'Money Transfer';
                    break;
                }
            }
        }
    }

    // 2. Check explicit field regex on receipt text
    if (!detectedType && rawText) {
        const typeMatch = rawText.match(/(?:Transaction\s*Mode|Txn\s*Mode|Transaction\s*Type|Service\s*Type|Txn\s*Type)\s*[:\-]\s*([^\n\r]+)/i);
        const specificHeading = rawText.match(/\b(AEPS_CASH_WITHDRAWAL|AEPS_CASH_DEPOSIT|AEPS_DEPOSIT|AEPS_WITHDRAWAL)\b/i);
        const candidate = (typeMatch ? typeMatch[1] : (specificHeading ? specificHeading[1] : '')).toLowerCase();

        if (/deposit|jama/.test(candidate)) {
            detectedType = 'Cash Deposit';
        } else if (/withdrawal|nikasi/.test(candidate)) {
            detectedType = 'Cash Withdrawal';
        } else if (/transfer|dmt|remittance|payout/.test(candidate)) {
            detectedType = 'Money Transfer';
        }
    }

    // 3. Fallback: if amount > 0, cannot be Balance Enquiry
    if (!detectedType) {
        if (/deposit|jama/i.test(rawText) && !/withdrawal|nikasi/i.test(rawText)) {
            detectedType = 'Cash Deposit';
        } else {
            detectedType = 'Cash Withdrawal';
        }
    }

    return detectedType;
}

// Test cases
const cscTechWithdrawalText = `CSC Technology
Dashboard
Services
Money Transfer
Unified AEPS
mATM
UPI Cash Point
Txn. Report
Balance Enquiry
Success
AEPS_CASH_WITHDRAWAL
Transaction Mode : AEPS_CASH_WITHDRAWAL
Transaction ID : 627427670627454165
Transaction Amount : 10000
Bank Name : Indian Bank
Amount : Rs. 10000`;

const cscTechDepositText = `CSC Technology
Dashboard
Services
Money Transfer
Unified AEPS
mATM
UPI Cash Point
Txn. Report
Balance Enquiry
Success
AEPS_CASH_DEPOSIT
Transaction Mode : AEPS_CASH_DEPOSIT
Transaction ID : 627427670627454165
Transaction Amount : 5000
Bank Name : Indian Bank
Amount : Rs. 5000`;

const digipayDepositText = `Transaction Receipt
Payment Status: SUCCESS
Transaction ID: CZUCW17938736505520593N8RFW41250707
Amount: ₹2000
Bank Name: Uttar Pradesh Gramin Bank
Transaction Type: Cash Deposit (AEPS)`;

const digipayWithdrawalText = `Transaction Receipt
Payment Status: SUCCESS
Transaction ID: CZUCW17938736505520593N8RFW41250707
Amount: ₹900
Bank Name: Uttar Pradesh Gramin Bank
Transaction Type: Cash Withdrawal (AEPS)`;

console.log('Case 1 (CSC Tech Withdrawal with Balance Enquiry sidebar):', detectServiceType(cscTechWithdrawalText, { 'transaction mode': ': AEPS_CASH_WITHDRAWAL' }, 10000));
console.log('Case 2 (CSC Tech Deposit with Balance Enquiry sidebar):', detectServiceType(cscTechDepositText, { 'transaction mode': ': AEPS_CASH_DEPOSIT' }, 5000));
console.log('Case 3 (DigiPay Deposit):', detectServiceType(digipayDepositText, { 'transaction type': 'Cash Deposit (AEPS)' }, 2000));
console.log('Case 4 (DigiPay Withdrawal):', detectServiceType(digipayWithdrawalText, { 'transaction type': 'Cash Withdrawal (AEPS)' }, 900));
console.log('Case 5 (CSC Tech Deposit - Text Only, no DOM):', detectServiceType(cscTechDepositText, {}, 5000));
console.log('Case 6 (CSC Tech Withdrawal - Text Only, no DOM):', detectServiceType(cscTechWithdrawalText, {}, 10000));
