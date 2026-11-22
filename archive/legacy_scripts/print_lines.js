const fs = require('fs');
const lines = fs.readFileSync('scripts/extracted_bc_receipt_modal.html', 'utf8').split('\n');

console.log('--- AMOUNT & FOOTER ---');
for (let i = 175; i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
