const fs = require('fs');

const golden = fs.readFileSync('D:/Cash Managment BC/backups/app.js.golden.bak', 'utf8');

function getFullFunction(code, fnName) {
    const start = code.indexOf(`function ${fnName}`);
    if (start === -1) return '';
    // Find next top level function
    const nextFn = code.indexOf('\nfunction ', start + 10);
    return code.substring(start, nextFn !== -1 ? nextFn : start + 5000);
}

console.log('--- Golden openCSCReceiptModal ---');
console.log(getFullFunction(golden, 'openCSCReceiptModal'));

console.log('\n--- Golden openCSCDetailModal ---');
console.log(getFullFunction(golden, 'openCSCDetailModal'));

