const fs = require('fs');

// Create minimal browser globals for content.js
global.window = {
    __CM_CONTENT_SCRIPT_LOADED__: false,
    addEventListener: () => {}
};
global.document = {
    title: 'Portal',
    body: { innerText: '', hasAttribute: () => false },
    documentElement: { setAttribute: () => {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
};
global.location = {
    hostname: 'csc.example.com',
    href: 'https://csc.example.com/aeps',
    origin: 'https://csc.example.com'
};
global.sessionStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; }
};
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; }
};
global.chrome = {
    runtime: {
        sendMessage: () => {},
        onMessage: { addListener: () => {} },
        lastError: null
    },
    storage: {
        local: {
            set: () => Promise.resolve(),
            get: () => Promise.resolve({})
        }
    }
};

let content = fs.readFileSync('extension/content.js', 'utf8');
content = content.replace('(function () {', 'function initCM() {');
content = content.replace('})();', '} initCM();');
content = content.replace('function parseAEPS(', 'global.parseAEPS = parseAEPS; function parseAEPS(');
content = content.replace('function recordPotentialAadhaar(', 'global.recordPotentialAadhaar = recordPotentialAadhaar; function recordPotentialAadhaar(');
content = content.replace('const recordPotentialAadhaar =', 'var recordPotentialAadhaar = global.recordPotentialAadhaar =');
eval(content);

// Portal 1: CSC Technology / Unified AEPS (from user screenshot & latest transaction)
const cscTechText = `Success
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

const cscTechDomPairs = {
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

// Portal 2: DigiPay (CSC E-Governance / IndusInd Bank)
const digipayText = `Transaction Receipt
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
CSC E-Governance Services India Limited
IndusInd Bank`;

console.log('=== TEST 1: CSC Technology / Digipay Lite (with DOM Pairs) ===');
const r1 = global.parseAEPS(cscTechText, cscTechDomPairs);
console.log('RRN_UTR (Bank Ref / API Tid):', r1.RRN_UTR);
console.log('TransactionID (Gateway Txn ID):', r1.TransactionID);
console.log('BankName:', JSON.stringify(r1.BankName));
console.log('Amount:', r1.Amount);
console.log('AccountBalance:', r1.AccountBalance);
console.log('Aadhaar:', JSON.stringify(r1.Aadhaar));
console.log('CustomerAadhaarLast4:', r1.CustomerAadhaarLast4);
console.log('Mobile:', r1.Mobile);
console.log('PortalName:', r1.PortalName);
console.log('Status:', r1.Status);

console.log('\n=== TEST 2: CSC Technology / Digipay Lite (Text Only) ===');
const r1_text = global.parseAEPS(cscTechText, {});
console.log('RRN_UTR (Bank Ref / API Tid):', r1_text.RRN_UTR);
console.log('TransactionID (Gateway Txn ID):', r1_text.TransactionID);
console.log('BankName:', JSON.stringify(r1_text.BankName));
console.log('Amount:', r1_text.Amount);
console.log('AccountBalance:', r1_text.AccountBalance);

console.log('\n=== TEST 3: DigiPay (CSC E-Gov / IndusInd Bank) ===');
const r2 = global.parseAEPS(digipayText, {});
console.log('RRN_UTR (Bank Ref):', r2.RRN_UTR);
console.log('TransactionID (Gateway Txn ID):', r2.TransactionID);
console.log('BankName:', JSON.stringify(r2.BankName));
console.log('Amount:', r2.Amount);
console.log('AccountBalance:', r2.AccountBalance);
console.log('PortalName:', r2.PortalName);
console.log('Status:', r2.Status);

// Assertions
let allPassed = true;
function assertEqual(actual, expected, desc) {
    if (actual !== expected) {
        console.error(`❌ FAILED: ${desc}. Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
        allPassed = false;
    } else {
        console.log(`✅ PASSED: ${desc}`);
    }
}

console.log('\n=== VERIFICATION CHECKS ===');
assertEqual(r1.RRN_UTR, '630917631056', 'Portal 1: RRN_UTR is 12-digit API Tid');
assertEqual(r1.TransactionID, '627427670627454165', 'Portal 1: TransactionID is 18-digit Gateway Txn ID');
assertEqual(r1.BankName, 'Indian Bank', 'Portal 1: BankName has no leading colon');
assertEqual(r1.Aadhaar, 'xxxx-xxxx-0929', 'Portal 1: Aadhaar has no leading colon');
assertEqual(r1.Amount, 10000, 'Portal 1: Amount is 10000');
assertEqual(r1.AccountBalance, 2476, 'Portal 1: AccountBalance is 2476');
assertEqual(r1.PortalName, 'Digipay Lite', 'Portal 1: Portal is Digipay Lite');

assertEqual(r1_text.RRN_UTR, '630917631056', 'Portal 1 (Text): RRN_UTR is 12-digit API Tid');
assertEqual(r1_text.TransactionID, '627427670627454165', 'Portal 1 (Text): TransactionID is 18-digit Gateway Txn ID');
assertEqual(r1_text.BankName, 'Indian Bank', 'Portal 1 (Text): BankName has no leading colon');

assertEqual(r2.RRN_UTR, '630915250707', 'Portal 2: RRN_UTR is 12-digit Bank Ref No');
assertEqual(r2.TransactionID, 'CZUCW17938736505520593N8RFW41250707', 'Portal 2: TransactionID is Gateway Txn ID');
assertEqual(r2.BankName, 'Uttar Pradesh Gramin Bank', 'Portal 2: BankName is correct');
assertEqual(r2.Amount, 900, 'Portal 2: Amount is 900');
assertEqual(r2.AccountBalance, 62.21, 'Portal 2: AccountBalance is 62.21');

if (allPassed) {
    console.log('\n🎉 ALL 15 REGRESSION TESTS PASSED! Both AEPS portals parsed with 100% precision!');
} else {
    process.exit(1);
}
