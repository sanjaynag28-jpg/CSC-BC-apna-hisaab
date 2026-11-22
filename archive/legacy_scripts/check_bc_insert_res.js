const fs = require('fs');
const bcCode = fs.readFileSync('routes/bc.js', 'utf8');

const matches = [...bcCode.matchAll(/insertRes/g)];
matches.forEach(m => {
    console.log(bcCode.substring(m.index - 50, m.index + 100).replace(/\n/g, ' '));
});
