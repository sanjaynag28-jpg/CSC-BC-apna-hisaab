const fs = require('fs');
const content = fs.readFileSync('public/app.js', 'utf8');
const lines = content.split('\n');

const patterns = ['function openNewBillPaymentModal', 'function calculateBPProfitInModal', 'function onBPCustomerSelectChange', 'function handleBillPayPhoneInput', 'function handleBillPaymentFormSubmit'];
patterns.forEach(pat => {
  lines.forEach((l, i) => {
    if (l.includes(pat)) {
      console.log(`${pat} found at line ${i + 1}`);
    }
  });
});
