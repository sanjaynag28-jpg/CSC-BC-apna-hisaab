const fs = require('fs');

const golden = fs.readFileSync('D:/Cash Managment BC/backups/app.js.golden.bak', 'utf8');

const regex = /function (render[a-zA-Z0-9_]*(?:Receipt|Slip|Voucher|Bill|Invoice|Passbook)[a-zA-Z0-9_]*)/g;
let m;
const found = [];
while ((m = regex.exec(golden)) !== null) {
    found.push(m[1]);
}

console.log('Golden render functions:', [...new Set(found)]);

