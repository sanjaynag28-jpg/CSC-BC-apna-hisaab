const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const idx = html.indexOf('id="page-billpayments"');
console.log(html.substring(idx, idx + 1000));
