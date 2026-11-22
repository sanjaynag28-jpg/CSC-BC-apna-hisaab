const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

function showContextAt(needle, offset = 1000, len = 2500) {
    const idx = appJs.indexOf(needle);
    if (idx !== -1) {
        console.log(`=== Needle: ${needle} + ${offset} ===`);
        console.log(appJs.substring(idx + offset, idx + offset + len));
    }
}

showContextAt('function handleBillPaymentFormSubmit', 1200);
showContextAt('function renderBillPaymentsTable', 1400);
