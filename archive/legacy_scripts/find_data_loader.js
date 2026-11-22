const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const idx = html.indexOf('Data Load Ho Raha Hai');
console.log('In index.html at:', idx);
if (idx !== -1) {
    console.log(html.substring(idx - 100, idx + 300));
}
