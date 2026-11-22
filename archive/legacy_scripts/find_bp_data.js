const fs = require('fs');
const content = fs.readFileSync('public/app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('bpCurrent') || l.includes('bpRecords') || l.includes('allBillPayments')) {
    console.log(`${i + 1}: ${l.trim()}`);
  }
});
