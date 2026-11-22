const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const formIdx = html.indexOf('id="billPaymentForm"');
const formEnd = html.indexOf('</form>', formIdx);
const formContent = html.substring(formIdx, formEnd + 7);

const btnIdx = formContent.indexOf('type="submit"');
console.log(formContent.substring(btnIdx - 200, btnIdx + 400));
