const fs = require('fs');
const s = fs.readFileSync('scripts/line_11213_dump.txt', 'utf8');
const modals = [...s.matchAll(/id="([^"]*Modal[^"]*)"/g)].map(m => m[1]);
console.log('Modals in line 11213:', Array.from(new Set(modals)));

