const fs = require('fs');
const bpCode = fs.readFileSync('routes/bill_payments.js', 'utf8');

const idx = bpCode.indexOf('deactivateGlobalTransaction');
console.log(bpCode.substring(idx - 100, idx + 200));
const secondIdx = bpCode.indexOf('deactivateGlobalTransaction', idx + 50);
console.log(bpCode.substring(secondIdx - 100, secondIdx + 200));
