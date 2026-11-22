const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);
lines.forEach((line, idx) => {
  if (line.includes('modal-overlay') || line.includes('ReceiptModal') || line.includes('printableReceipt')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
