const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

console.log('openNewBillPaymentModal index:', appJs.indexOf('function openNewBillPaymentModal'));
console.log('handleBillPaymentFormSubmit index:', appJs.indexOf('function handleBillPaymentFormSubmit'));
console.log('renderBillPaymentsTable index:', appJs.indexOf('function renderBillPaymentsTable'));
