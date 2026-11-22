const fs = require('fs');

const files = [
    'D:/Cash Managment BC/backups/index.html.bak',
    'D:/Cash Managment BC/backups/app.js.golden_1.bak',
    'D:/Cash Managment BC/backups/app.js.golden.bak',
    'D:/Cash Managment BC/backups/app.js.pre_offline_fix.bak',
    'D:/Cash Managment BC/public/app.js.bak'
];

for (const f of files) {
    if (fs.existsSync(f)) {
        const s = fs.readFileSync(f);
        let nonNull = 0;
        for (let i = 0; i < Math.min(1000, s.length); i++) {
            if (s[i] !== 0 && s[i] !== 32) nonNull++;
        }
        console.log(f, 'size:', s.length, 'non-space/null in first 1000:', nonNull);
    } else {
        console.log(f, 'NOT FOUND');
    }
}

