const fs = require('fs');
const bpCode = fs.readFileSync('routes/bill_payments.js', 'utf8');

const matches = [...bpCode.matchAll(/deactivateGlobalTransaction/g)];
console.log('Matches for deactivateGlobalTransaction in bill_payments.js:');
matches.forEach(m => {
    console.log(bpCode.substring(m.index - 50, m.index + 120).replace(/\n/g, ' '));
});
