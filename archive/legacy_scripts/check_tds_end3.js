const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('function renderBillPaymentsTable');
console.log(appJs.substring(idx + 5300, idx + 6200));
