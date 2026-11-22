const fs = require('fs');
const regCode = fs.readFileSync('database/globalTxnRegistry.js', 'utf8');
console.log(regCode.substring(0, 1500));
