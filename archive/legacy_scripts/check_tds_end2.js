const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('function renderBillPaymentsTable');
console.log(appJs.substring(idx + 4400, idx + 5600));
