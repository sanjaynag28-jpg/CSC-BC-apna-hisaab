const fs = require('fs');
const repCode = fs.readFileSync('routes/reports.js', 'utf8');

const idx = repCode.indexOf('router.get(\'/master\'');
const endIdx = repCode.indexOf('res.json', idx + 1000);
console.log(repCode.substring(endIdx - 100, endIdx + 300));
