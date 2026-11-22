const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = 1015231;
console.log(appJs.substring(idx + 5000, idx + 6500));
