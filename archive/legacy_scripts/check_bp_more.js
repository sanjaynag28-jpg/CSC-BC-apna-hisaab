const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

function showContext(needle, len = 2500) {
    const idx = appJs.indexOf(needle);
    if (idx !== -1) {
        console.log(`=== Needle: ${needle} ===`);
        console.log(appJs.substring(idx, idx + len));
    }
}

showContext('function handleBillPaymentFormSubmit');
showContext('function renderBillPaymentsTable');
