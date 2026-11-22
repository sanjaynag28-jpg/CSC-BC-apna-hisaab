const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');

const modalStart = lines.findIndex(l => l.includes('id="bcReceiptModal"'));
console.log('Modal starts at line:', modalStart + 1);

// print 100 lines around modalStart
console.log('--- HEADER ---');
for (let i = modalStart; i < modalStart + 90; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

const modalEnd = lines.findIndex((l, idx) => idx > modalStart && l.includes('id="khataReceiptModal"'));
console.log('--- FOOTER ---');
for (let i = modalEnd - 40; i < modalEnd; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
