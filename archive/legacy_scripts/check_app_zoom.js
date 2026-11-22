const fs = require('fs');
const app = fs.readFileSync('public/app.js', 'utf8');

const idx = app.indexOf('function toggleSlipZoomMode');
console.log('Found toggleSlipZoomMode at char:', idx);
console.log(app.substring(idx, idx + 800));
