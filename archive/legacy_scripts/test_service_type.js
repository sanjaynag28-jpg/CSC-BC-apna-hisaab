const fs = require('fs');

global.window = { __CM_CONTENT_SCRIPT_LOADED__: false, addEventListener: () => {} };
global.document = {
    title: 'Portal',
    body: { innerText: '', hasAttribute: () => false },
    documentElement: { setAttribute: () => {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
};
global.location = { hostname: 'csc.example.com', href: 'https://csc.example.com/aeps', origin: 'https://csc.example.com' };
global.sessionStorage = { getItem: () => null, setItem: () => {} };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.chrome = {
    runtime: { sendMessage: () => {}, onMessage: { addListener: () => {} }, lastError: null },
    storage: { local: { set: () => Promise.resolve(), get: () => Promise.resolve({}) } }
};

let content = fs.readFileSync('extension/content.js', 'utf8');
content = content.replace('(function () {', 'function initCM() {');
content = content.replace('})();', '} initCM();');
content = content.replace('function parseAEPS(', 'global.parseAEPS = parseAEPS; function parseAEPS(');
eval(content);

console.log('1. AEPS_CASH_WITHDRAWAL text:', global.parseAEPS('Success\nAEPS_CASH_WITHDRAWAL\nTransaction Mode : AEPS_CASH_WITHDRAWAL').ServiceType);
console.log('2. AEPS_CASH_DEPOSIT text:', global.parseAEPS('Success\nAEPS_CASH_DEPOSIT\nTransaction Mode : AEPS_CASH_DEPOSIT').ServiceType);
console.log('3. Cash Deposit (AEPS) text:', global.parseAEPS('Transaction Type: Cash Deposit (AEPS)').ServiceType);
console.log('4. Cash Withdrawal (AEPS) text:', global.parseAEPS('Transaction Type: Cash Withdrawal (AEPS)').ServiceType);
console.log('5. DOM with transaction mode: AEPS_CASH_DEPOSIT:', global.parseAEPS('', { 'transaction mode': ': AEPS_CASH_DEPOSIT' }).ServiceType);
console.log('6. DOM with transaction mode: AEPS_CASH_WITHDRAWAL:', global.parseAEPS('', { 'transaction mode': ': AEPS_CASH_WITHDRAWAL' }).ServiceType);

