const fs = require('fs');
const regCode = fs.readFileSync('database/globalTxnRegistry.js', 'utf8');

const idx = regCode.indexOf('deactivateGlobalTransaction');
console.log(regCode.substring(idx, idx + 800));
