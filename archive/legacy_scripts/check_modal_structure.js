const fs = require('fs');
const html = fs.readFileSync('scripts/extracted_bc_receipt_modal.html', 'utf8');
const lines = html.split('\n');

console.log('Total lines in modal:', lines.length);

lines.forEach((l, idx) => {
  if (l.includes('modal-header') || l.includes('slip-hero-amount') || l.includes('modal-footer') || l.includes('print-format-bar')) {
    console.log(`Line ${idx+1}: ${l.trim()}`);
  }
});
