const fs = require('fs');

const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

const startIdx = content.indexOf('<div class="modal-overlay" id="customerModal">');
const endIdx = content.indexOf('<div class="modal-overlay" id="invoiceModal">');

let section = content.substring(startIdx, endIdx);

// List of replacements for corrupted text and hardcoded styles
const replacements = [
    // Corrupted Hindi words
    ['Customer Name ( -?  _ 1      _  ,  _  " _ r)', 'Customer Name (Grahak Ka Poora Naam)'],
    ['dYZ, Date of Birth (Janm Tithi)', '🎂 Date of Birth (Janm Tithi)'],
    ['dY`"??dY`c??dY` ??dY`', '👨‍👩‍👧‍👦'],
    ['Beta (Son /  ؅ Y _)', 'Beta (Son / बेटा)'],
    ['Beti (Daughter /  ؅ Y?)', 'Beti (Daughter / बेटी)'],
    ['Patni (Wife /    ? "?)', 'Patni (Wife / पत्नी)'],
    ['Pati (Husband /     )', 'Pati (Husband / पति)'],
    ['Pita (Father /      _)', 'Pita (Father / पिता)'],
    ['Mata (Mother /  r _   _)', 'Mata (Mother / माता)'],
    ['Bhai (Brother /  - _ ^)', 'Bhai (Brother / भाई)'],
    ['Behan (Sister /   1 ")', 'Behan (Sister / बहन)'],
    ['Bahu (Daughter-in-law /   1,)', 'Bahu (Daughter-in-law / बहू)'],
    ['Pota / Poti ( <   _- <  ?)', 'Pota / Poti (पोता / पोती)'],
    ['Anya Sadasya (Other /  . "? _)', 'Anya Sadasya (Other / अन्य)'],
    ['Khata Mode ( - _   _  ?    _ )', 'Khata Mode (Hisaab Ka Prakar)'],
    ['dY`  <b>Separate Khata</b>', '👤 <b>Separate Khata</b>'],
    ['dY ? <b>Joint Family Khata</b>', '👨‍👩‍👧‍👦 <b>Joint Family Khata</b>'],
    ['Opening Balance (,1)', 'Opening Balance (₹)'],
    ['Credit Limit (,1)', 'Credit Limit (₹)'],
    ['Baki Khata (,1)', 'Baki Khata (₹)'],
    ['dY Unique UID', '🔒 Unique UID'],
    ['dY"Z Dastavej / Docs', '📎 Dastavej / Docs'],
    ['dY Aadhaar: -', '🔒 Aadhaar: -'],
    ['dY`"??dY`c??dY` ??dY` Parivar', '👨‍👩‍👧‍👦 Parivar'],
    [',10.00', '₹0.00'],
    ['Udhaar: ,10 ? Jama: ,10', 'Udhaar: ₹0 • Jama: ₹0'],
    ['style="color: #0f172a;', 'style="color: var(--text-primary);'],
    ['style="font-weight: 600; color: #0f172a;', 'style="font-weight: 600; color: var(--text-primary);']
];

let replacedCount = 0;
for (const [target, repl] of replacements) {
    if (section.includes(target)) {
        section = section.split(target).join(repl);
        replacedCount++;
    }
}

console.log('Total pattern types replaced:', replacedCount);

content = content.substring(0, startIdx) + section + content.substring(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log('Customer suite cleaned successfully in public/index.html');

