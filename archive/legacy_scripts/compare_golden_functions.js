const fs = require('fs');

const golden = fs.readFileSync('D:/Cash Managment BC/backups/app.js.golden.bak', 'utf8');
const current = fs.readFileSync('public/app.js', 'utf8');

function extractFunction(code, fnName) {
    const idx = code.indexOf(`function ${fnName}`);
    if (idx === -1) return null;
    return code.substring(idx, idx + 2500);
}

const fns = [
    'openCSCReceiptModal',
    'openCSCDetailModal',
    'openKhataReceiptModal',
    'openTransReceiptModal',
    'showBCSlipModal',
    'printBCReceipt'
];

for (const fn of fns) {
    const g = extractFunction(golden, fn);
    const c = extractFunction(current, fn);
    console.log(`=== ${fn} ===`);
    console.log('In golden:', g ? 'FOUND (' + g.length + ' chars)' : 'NOT FOUND');
    console.log('In current:', c ? 'FOUND (' + c.length + ' chars)' : 'NOT FOUND');
    if (g) {
        console.log('--- Golden preview ---');
        console.log(g.substring(0, 300));
    }
}

