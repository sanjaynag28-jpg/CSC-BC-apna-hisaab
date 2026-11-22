const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

const searchIds = [
    'bcReceiptModal',
    'cscReceiptModal',
    'khataReceiptModal',
    'transReceiptModal',
    'invoiceViewModal',
    'cscDetailModal',
    'customer360Modal',
    'accountPassbookModal',
    'khataHistoryModal',
    'bcModal'
];

for (const id of searchIds) {
    const idx = lines.findIndex(l => l.includes(`id="${id}"`));
    console.log(`id="${id}": line ${idx + 1}`);
}

