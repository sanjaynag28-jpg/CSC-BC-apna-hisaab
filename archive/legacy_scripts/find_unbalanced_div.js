const fs = require('fs');
const s = fs.readFileSync('public/index.html', 'utf8');
const pos = s.indexOf('id="page-history"');
const endPos = s.indexOf('</main>');
const historyHtml = s.slice(pos, endPos);
const lines = historyHtml.split('\n');
console.log('Lines in page-history:', lines.length);

let depth = 0;
for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const opens = (l.match(/<div(\s|>)/g) || []).length;
    const closes = (l.match(/<\/div>/g) || []).length;
    depth += (opens - closes);
    console.log(i + 1, 'depth:', depth, l.trim().slice(0, 50));
}
