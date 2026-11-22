const fs = require('fs');
const repCode = fs.readFileSync('routes/reports.js', 'utf8');

const idx = repCode.indexOf('router.get(\'/kpis\'');
console.log(repCode.substring(idx + 3800, idx + 6000));
