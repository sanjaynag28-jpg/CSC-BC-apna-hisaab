const fs = require('fs');

const css = fs.readFileSync('public/style.css', 'utf8');

const modalIds = [
    'bcReceiptModal',
    'cscReceiptModal',
    'khataReceiptModal',
    'transReceiptModal',
    'cscDetailModal',
    'printableReceipt',
    'printableCSCReceipt',
    'printableKhataSlip',
    'printableTransVoucher',
    'csc-detail'
];

for (const id of modalIds) {
    const idx = css.indexOf(id);
    console.log(`${id}: ${idx !== -1 ? 'FOUND at char ' + idx : 'NOT FOUND in style.css'}`);
}

