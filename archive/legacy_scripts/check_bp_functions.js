const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

function showContext(needle, len = 1500) {
    const idx = appJs.indexOf(needle);
    console.log(`=== Needle: ${needle} (Found: ${idx !== -1}) ===`);
    if (idx !== -1) {
        console.log(appJs.substring(idx, idx + len));
    }
}

showContext('function openNewBillPaymentModal');
showContext('function handleBillPaymentFormSubmit');
showContext('renderBillPaymentsTable');
