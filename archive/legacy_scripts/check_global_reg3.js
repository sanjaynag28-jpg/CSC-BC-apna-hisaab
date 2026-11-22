const fs = require('fs');
const regCode = fs.readFileSync('database/globalTxnRegistry.js', 'utf8');
const idx = regCode.indexOf('updateGlobalTransaction');
console.log(regCode.substring(idx, idx + 1000));
