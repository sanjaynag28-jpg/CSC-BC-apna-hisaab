const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const formIdx = html.indexOf('id="billPaymentForm"');
const endModal = html.indexOf('</div>\n    </div>', formIdx);
console.log('Form length:', endModal - formIdx);
console.log(html.substring(formIdx, formIdx + 3000));
