const fs = require('fs');
const accCode = fs.readFileSync('routes/accounts.js', 'utf8');

const idx = accCode.indexOf('router.get(\'/:id/passbook\'');
console.log(accCode.substring(idx, idx + 800));
