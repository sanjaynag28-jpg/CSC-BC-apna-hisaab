const fs = require('fs');

const path = 'public/index.html';
const content = fs.readFileSync(path, 'utf8');

const regex = /dY[\x00-\x7F\u0080-\uFFFF]*/g;
const matches = content.match(regex);
console.log('Matches count:', matches ? matches.length : 0);
if (matches) {
    const set = new Set(matches.map(m => m.substring(0, 15)));
    console.log('Sample unique matches:', Array.from(set).slice(0, 20));
}

