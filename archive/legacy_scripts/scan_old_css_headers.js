const fs = require('fs');

const oldCss = fs.readFileSync('D:/New folder (2)/Cash Managment BC/public/style.css', 'utf8');

const regex = /\/\* =+[^\*]*=+\ \*\//g;
let m;
const headers = [];
while ((m = regex.exec(oldCss)) !== null) {
    headers.push(m[0]);
}

console.log('Old CSS section headers count:', headers.length);
headers.forEach(h => console.log(h.replace(/\n/g, ' ')));

