const fs = require('fs');
const appJs = fs.readFileSync('public/app.js', 'utf8');

const matches = [...appJs.matchAll(/function\s+(start|stop)TopLoading/g)];
matches.forEach(m => console.log(m[0], 'at', m.index));
if (matches.length) {
    console.log(appJs.substring(matches[0].index, matches[0].index + 400));
}
