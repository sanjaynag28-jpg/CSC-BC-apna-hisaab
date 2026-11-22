const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

function showMatch(regex, len = 1000) {
    const match = appJs.match(regex);
    if (match) {
        const idx = match.index;
        console.log(`=== Regex: ${regex} ===`);
        console.log(appJs.substring(idx, idx + len));
    } else {
        console.log(`=== Regex: ${regex} NOT FOUND ===`);
    }
}

showMatch(/function updateBP/);
showMatch(/bpModalBillAmount/);
