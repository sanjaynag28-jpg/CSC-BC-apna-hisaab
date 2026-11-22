const fs = require('fs');

const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

const startIdx = content.indexOf('<div class="modal-overlay" id="khataEntryModal">');
const endIdx = content.indexOf('<!-- Searchable Select Engine -->');

if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found!');
    process.exit(1);
}

let section = content.substring(startIdx, endIdx);

const replacements = [
    ['Maine Diya ,1 (Udhaar)', 'Maine Diya ₹ (Udhaar)'],
    ['Mujhe Mila ,1 (Jama)', 'Mujhe Mila ₹ (Jama)'],
    ['dY"? Naam / Phone', '🔍 Naam / Phone'],
    ['dYZ, <b>Customer DOB:</b>', '🎂 <b>Customer DOB:</b>'],
    ['dYZ, Customer DOB', '🎂 Customer DOB'],
    ['dY"Z Docs', '📎 Docs'],
    ['Rashi (Amount ,1)', 'Rashi (Amount ₹)'],
    ['Payment Amount (,1)', 'Payment Amount (₹)'],
    ['dY", A4 Full', '📄 A4 Full'],
    ['dY"` A4/2 (1/2)', '📑 A4/2 (1/2)'],
    ['dY", Print A4', '📄 Print A4'],
    ['dY"` Print A4/2', '📑 Print A4/2'],
    ['dY _ Voucher (Slip)', '🧾 Voucher (Slip)'],
    ['dY _ Slip (Thermal)', '🧾 Slip (Thermal)'],
    [',10.00', '₹0.00'],
    ['Digipay , Lite', 'Digipay ➔ Lite'],
    ['Transfer Amount (,1)', 'Transfer Amount (₹)'],
    ['Payout Charge / Shulk (,1)', 'Payout Charge / Shulk (₹)'],
    ['Band Karo', 'Band Karein'],
    ['Transfer Confirm Karo', 'Transfer Confirm Karein']
];

let replaced = 0;
for (const [target, repl] of replacements) {
    if (section.includes(target)) {
        section = section.split(target).join(repl);
        replaced++;
    }
}

console.log('Replaced pattern types:', replaced);

content = content.substring(0, startIdx) + section + content.substring(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log('Invoicing and Khatabook modals cleaned in public/index.html');

