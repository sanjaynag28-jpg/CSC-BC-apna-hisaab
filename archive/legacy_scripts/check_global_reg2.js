const fs = require('fs');
const regCode = fs.readFileSync('database/globalTxnRegistry.js', 'utf8');
const fns = [...regCode.matchAll(/function\s+([a-zA-Z0-9_]+)/g)].map(m => m[1]);
console.log('Functions in globalTxnRegistry.js:', fns);
