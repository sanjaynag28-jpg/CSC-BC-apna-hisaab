const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('openEditBillPaymentModal');
console.log(appJs.substring(idx - 100, idx + 400));
