const fs = require('fs');
const cscCode = fs.readFileSync('routes/csc.js', 'utf8');

const matches = [...cscCode.matchAll(/insertRes/g)];
console.log('insertRes matches in routes/csc.js:');
matches.forEach(m => {
    console.log(cscCode.substring(m.index - 50, m.index + 100).replace(/\n/g, ' '));
});
