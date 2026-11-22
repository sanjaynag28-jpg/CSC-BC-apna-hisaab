const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const idx = html.indexOf('id="billPaymentsTable"');
console.log(html.substring(idx - 200, idx + 800));
