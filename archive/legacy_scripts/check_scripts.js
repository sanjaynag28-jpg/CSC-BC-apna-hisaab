const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/g)].map(m => m[1]);
console.log('Script tags in index.html:', scripts);
