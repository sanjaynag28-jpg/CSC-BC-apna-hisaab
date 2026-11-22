const fs = require('fs');
const s = fs.readFileSync('public/index.html', 'utf8');
const matches = [...s.matchAll(/id="([^"]*Modal[^"]*)"/g)].map(m => m[1]);
console.log('Modals in index.html (' + matches.length + '):', matches);

