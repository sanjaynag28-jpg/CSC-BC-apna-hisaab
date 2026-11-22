const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const formIdx = html.indexOf('id="billPaymentForm"');
const formEnd = html.indexOf('</form>', formIdx);
const formContent = html.substring(formIdx, formEnd + 7);

const idMatches = [...formContent.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
console.log('All input/element IDs in billPaymentForm:');
console.log(idMatches);
