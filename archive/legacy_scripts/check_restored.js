const fs = require('fs');
const content = fs.readFileSync('scripts/restored_index.html', 'utf8');
const lines = content.split('\n');
console.log('Total lines in restored index.html:', lines.length);
lines.forEach((line, idx) => {
  if (line.includes('bcReceiptModal')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
