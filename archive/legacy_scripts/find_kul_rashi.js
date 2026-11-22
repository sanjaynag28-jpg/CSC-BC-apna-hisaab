const fs = require('fs');

function findInFile(file, text) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = [...content.matchAll(new RegExp(text, 'gi'))];
    matches.forEach(m => console.log(file, ':', content.substring(m.index - 50, m.index + 100).replace(/\n/g, ' ')));
}

findInFile('public/index.html', 'Kul Rashi');
findInFile('public/app.js', 'totalAmount');
