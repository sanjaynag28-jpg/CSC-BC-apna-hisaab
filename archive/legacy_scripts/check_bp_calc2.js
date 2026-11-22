const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const idx = appJs.indexOf('function calculateBPProfitInModal');
if (idx !== -1) {
    console.log(appJs.substring(idx - 500, idx + 2500));
}
