const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const modalIdx = html.indexOf('id="billPaymentModal"');
console.log('billPaymentModal found at index:', modalIdx);
if (modalIdx !== -1) {
    console.log(html.substring(modalIdx, modalIdx + 2000));
}
