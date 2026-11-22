const fs = require('fs');
const path = require('path');

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        if (f === 'node_modules' || f === '.git') continue;
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            searchDir(full);
        } else if (f.endsWith('.js') || f.endsWith('.html')) {
            const text = fs.readFileSync(full, 'utf8');
            if (text.includes('openBillReceiptModal')) {
                console.log('Found openBillReceiptModal in:', full);
            }
            if (text.includes('CATEGORY & BOARD') || text.includes('TARIQH & SAMAY')) {
                console.log('Found TABLE HEADERS in:', full);
            }
        }
    }
}

searchDir('.');
