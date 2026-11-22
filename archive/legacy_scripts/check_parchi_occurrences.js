const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const matches = [...appJs.matchAll(/Parchi/gi)];
console.log('Matches for Parchi:', matches.length);
matches.forEach((m, idx) => {
    console.log(`--- Match ${idx} at ${m.index} ---`);
    console.log(appJs.substring(m.index - 50, m.index + 200));
});
