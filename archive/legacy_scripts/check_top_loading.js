const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('function startTopLoading');
console.log(appJs.substring(idx, idx + 800));
