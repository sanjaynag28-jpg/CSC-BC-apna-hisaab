const fs = require('fs');
const css = fs.readFileSync('public/style.css', 'utf8');

const idx = css.indexOf('.slip-hero-amount .hero-val');
console.log('Found .slip-hero-amount .hero-val at char:', idx);
console.log(css.substring(idx, idx + 400));
