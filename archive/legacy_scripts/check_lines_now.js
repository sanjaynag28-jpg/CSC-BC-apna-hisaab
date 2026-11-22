const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');

const start = lines.findIndex(l => l.includes('id="bcReceiptModal"'));
const end = lines.findIndex((l, i) => i > start && l.includes('id="khataReceiptModal"'));

console.log(`bcReceiptModal is from line ${start+1} to line ${end}`);
fs.writeFileSync('scripts/current_modal_lines.txt', lines.slice(start, end).join('\n'));
