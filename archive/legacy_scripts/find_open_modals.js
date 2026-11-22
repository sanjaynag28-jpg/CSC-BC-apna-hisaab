const fs = require('fs');
const content = fs.readFileSync('public/app.js', 'utf8');
const lines = content.split('\n');

const patterns = ["openModal('cscAppModal')", "openModal('invoiceModal')", "openModal('khataEntryModal')", "openModal('bcModal')"];
patterns.forEach(pat => {
  lines.forEach((l, i) => {
    if (l.includes(pat)) {
      console.log(`${pat} found at line ${i + 1}`);
    }
  });
});
