const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('addBPCustomFieldRow');
console.log(appJs.substring(idx - 100, idx + 800));
