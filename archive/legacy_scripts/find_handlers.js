const fs = require('fs');
const content = fs.readFileSync('public/app.js', 'utf8');
const lines = content.split('\n');

const patterns = ['function onInvoiceCustomerChanged', 'function onKhataCustomerChanged', 'function onCSCCustomerSelectChange', 'function onBCCustomerSelected'];
patterns.forEach(pat => {
  lines.forEach((l, i) => {
    if (l.includes(pat)) {
      console.log(`${pat} found at line ${i + 1}`);
    }
  });
});
