const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');
const idx = appJs.indexOf('function openNewBillPaymentModal');
console.log(appJs.substring(idx + 4600, idx + 5300));
