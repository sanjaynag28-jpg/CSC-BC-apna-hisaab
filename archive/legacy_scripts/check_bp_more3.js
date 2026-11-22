const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

function showContextAt(needle, offset = 2200, len = 2000) {
    const idx = appJs.indexOf(needle);
    if (idx !== -1) {
        console.log(`=== Needle: ${needle} + ${offset} ===`);
        console.log(appJs.substring(idx + offset, idx + offset + len));
    }
}

showContextAt('function handleBillPaymentFormSubmit', 2200);
showContextAt('function renderBillPaymentsTable', 2800);
