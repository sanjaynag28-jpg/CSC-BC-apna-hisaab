const fs = require('fs');

function searchFile(path) {
    const text = fs.readFileSync(path, 'utf8');
    const matches = [...text.matchAll(/Parchi/gi)];
    if (matches.length) {
        console.log(`Found in ${path}: ${matches.length} matches`);
        matches.forEach(m => console.log('  ', text.substring(m.index - 40, m.index + 80).replace(/\n/g, ' ')));
    }
}

searchFile('public/app.js');
searchFile('public/index.html');
searchFile('public/billing.js');
