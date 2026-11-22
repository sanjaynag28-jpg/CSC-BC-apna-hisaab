const fs = require('fs');

const golden = fs.readFileSync('D:/Cash Managment BC/backups/app.js.golden.bak', 'utf8');

const start = golden.indexOf('function renderCSCReceipt');
console.log(golden.substring(start, start + 3500));

