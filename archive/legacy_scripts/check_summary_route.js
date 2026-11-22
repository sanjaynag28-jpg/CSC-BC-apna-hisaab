const fs = require('fs');
const repCode = fs.readFileSync('routes/reports.js', 'utf8');

const idx = repCode.indexOf('router.get(\'/summary\'');
console.log(repCode.substring(idx, idx + 2500));
