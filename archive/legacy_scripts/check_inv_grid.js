const fs = require('fs');
const lines = fs.readFileSync('public/index.html', 'utf8').split('\n');

const invIdx = lines.findIndex(l => l.includes('id="invoiceModal"'));
console.log('invIdx line:', invIdx + 1);
console.log(lines.slice(invIdx, invIdx + 50).join('\n'));

