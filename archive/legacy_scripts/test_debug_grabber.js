const fs = require('fs');

function cleanVal(v) {
    if (!v) return '';
    return String(v).replace(/^[\s:\-–—#=]+/, '').trim();
}

function cleanAadhaar(val) {
    if (!val) return '';
    const s = cleanVal(val);
    if (/^[xX*]{4}[\s\-]?[xX*]{4}[\s\-]?\d{4}$/.test(s) || /^[xX*]{4,8}[\s\-]?\d{4}$/.test(s)) {
        return s;
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length === 12) {
        return digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
    }
    return s;
}

function testLogic() {
    const sampleCSC = `Success
AEPS_CASH_WITHDRAWAL
Transaction Mode : AEPS_CASH_WITHDRAWAL
Transaction ID : 627427670627454165
Transaction Amount : 10000
Bank Name : Indian Bank
Aadhar Number : xxxx-xxxx-0929
API Tid : 630917631056
Amount : Rs. 10000
Mobile : 8960804559
Created Date : 2026-11-07 10:15:18
Updated Date : 2026-11-07 10:15:20
Status : SUCCESS
Message : APPROVED
A/C Balance : Rs. 2476.0`;

    const domPairsWithColons = {
        'transaction mode': ': AEPS_CASH_WITHDRAWAL',
        'transaction id': ': 627427670627454165',
        'transaction amount': ': 10000',
        'bank name': ': Indian Bank',
        'aadhar number': ': xxxx-xxxx-0929',
        'api tid': ': 630917631056',
        'amount': ': Rs. 10000',
        'mobile': ': 8960804559',
        'created date': ': 2026-11-07 10:15:18',
        'status': ': SUCCESS',
        'a c balance': ': Rs. 2476.0'
    };

    const result = {
        ServiceType: 'Cash Withdrawal',
        BankName: '',
        RRN_UTR: '',
        TransactionID: '',
        BankRefNo: '',
        Amount: null,
        AccountBalance: null,
        Aadhaar: '',
        CustomerAadhaarLast4: '',
        Mobile: ''
    };

    for (const [k, v] of Object.entries(domPairsWithColons)) {
        const val = cleanVal(v);
        // RRN & Bank Ref No & API Tid (Prioritize 11-14 digit numeric RRN / Tid)
        if (/^(rrn|bank ref no|bank ref|bank reference|utr|api tid|apitid|api txn id|api txnid|api ref)/.test(k) && !result.RRN_UTR) {
            const digits = val.replace(/\D/g, '');
            if (digits.length >= 11 && digits.length <= 14) {
                result.RRN_UTR = digits;
                result.BankRefNo = digits;
            } else {
                result.RRN_UTR = val;
            }
        }
        if (/^(transaction id|txnid|gateway txn id|journal)/.test(k) && !result.TransactionID) {
            result.TransactionID = val;
        }
        if (/bank|bankname|issuerbank/.test(k) && !result.BankName) {
            result.BankName = val;
        }
        if (/^(aadhaar|uid|uidai|aadhar|customer id|cust id)/.test(k) && !result.Aadhaar) {
            result.Aadhaar = cleanAadhaar(val);
            result.CustomerAadhaarLast4 = val.slice(-4);
        }
        if (/amount|txnamount/.test(k) && result.Amount === null) {
            result.Amount = parseFloat(val.replace(/[^\d.]/g, ''));
        }
        if (/balance/.test(k) && result.AccountBalance === null) {
            result.AccountBalance = parseFloat(val.replace(/[^\d.]/g, ''));
        }
        if (/mobile|phone/.test(k) && !result.Mobile) {
            result.Mobile = val.replace(/\D/g, '').slice(-10);
        }
    }

    console.log('Result with proposed domPairs logic:');
    console.log(JSON.stringify(result, null, 2));

    // Test text matching fallback
    const textResult = { ...result, RRN_UTR: '', TransactionID: '', BankRefNo: '', BankName: '' };
    const rrnMatch = sampleCSC.match(/(?:\bRRN\b|\bBank\s*Ref(?:\.|erence)?\s*(?:No|Num|Number)?|\bAPI\s*Tid|\bAPI\s*Txn\s*ID)\s*[:\-#]*\s*(\d{11,14})/i);
    if (rrnMatch) {
        textResult.RRN_UTR = rrnMatch[1].trim();
        textResult.BankRefNo = rrnMatch[1].trim();
    }
    const txnIdMatch = sampleCSC.match(/(?:Transaction\s*ID|Txn\s*ID)\s*[:\-#]*\s*([A-Za-z0-9]{10,45})/i);
    if (txnIdMatch) {
        textResult.TransactionID = txnIdMatch[1].trim();
    }
    const bankMatch = sampleCSC.match(/(?:^|\n)\s*(?:Bank(?:\s*Name)?|Issuer\s*Bank)\s*[:\-]\s*([A-Za-z0-9\s\.\(\)\&]{3,40})(?:\n|$)/i);
    if (bankMatch) {
        textResult.BankName = cleanVal(bankMatch[1]);
    }
    console.log('\nResult with proposed text-only logic:');
    console.log(JSON.stringify(textResult, null, 2));

    // Test Notes regex in app.js
    const noteSample = 'Digipay Lite | TxnID: : 627427670627454165';
    const rawTxnId = (noteSample && noteSample.match(/TxnID:\s*[:\s]*([A-Za-z0-9]+)/i)?.[1]);
    console.log('\nExtracted TxnID from old Notes with double colon:', rawTxnId);
}

testLogic();
