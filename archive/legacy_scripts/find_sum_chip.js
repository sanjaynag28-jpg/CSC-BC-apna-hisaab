const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const matches = [...appJs.matchAll(/repTableSumChip/g)];
console.log('Matches for repTableSumChip in app.js:', matches.length);
matches.forEach((m, i) => {
    console.log(`--- Match ${i} ---`);
    console.log(appJs.substring(m.index - 50, m.index + 200));
});
