const fs = require('fs');
const accCode = fs.readFileSync('routes/accounts.js', 'utf8');

const idx = accCode.indexOf('router.get(\'/:id/passbook\'');
const endIdx = accCode.indexOf('res.json', idx);
console.log(accCode.substring(endIdx - 100, endIdx + 300));
