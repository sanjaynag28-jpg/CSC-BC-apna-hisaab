const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('function deleteBillPayment');
console.log(appJs.substring(idx, idx + 1000));
