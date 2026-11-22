const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const matches = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)];
console.log('Total tables in index.html:', matches.length);
matches.forEach((m, idx) => {
    if (m[0].includes('billPaymentsTableBody') || m[0].includes('bill') || m[0].includes('Parchi')) {
        console.log(`--- Table ${idx} ---`);
        console.log(m[0].substring(0, 500));
    }
});
