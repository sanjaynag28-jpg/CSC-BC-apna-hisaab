const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');
lines.forEach((l, i) => {
    if (l.includes('id="cscStatusModal"')) {
        console.log('cscStatusModal starts at line:', i + 1);
        console.log(lines.slice(i, i + 95).join('\n'));
    }
});

