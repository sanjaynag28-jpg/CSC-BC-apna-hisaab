const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

function showContextAt(needle, offset = 4200, len = 2000) {
    const idx = appJs.indexOf(needle);
    if (idx !== -1) {
        console.log(`=== Needle: ${needle} + ${offset} ===`);
        console.log(appJs.substring(idx + offset, idx + offset + len));
    }
}

showContextAt('function renderBillPaymentsTable', 4200);
