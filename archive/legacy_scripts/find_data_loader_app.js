const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');
const idx = appJs.indexOf('Data Load Ho Raha Hai');
console.log('In app.js at:', idx);
if (idx !== -1) {
    console.log(appJs.substring(idx - 200, idx + 400));
}
