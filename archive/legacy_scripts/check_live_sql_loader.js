const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('Live SQL Server se data aa raha hai');
console.log(appJs.substring(idx - 200, idx + 800));
