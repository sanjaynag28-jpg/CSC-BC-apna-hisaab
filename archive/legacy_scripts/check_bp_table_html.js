const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const idx = html.indexOf('Parchi / Action');
console.log(html.substring(idx - 500, idx + 800));
