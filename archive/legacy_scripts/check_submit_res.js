const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const needle = 'handleBillPaymentFormSubmit';
const idx = appJs.indexOf(needle);
console.log(appJs.substring(idx + 1800, idx + 4000));
