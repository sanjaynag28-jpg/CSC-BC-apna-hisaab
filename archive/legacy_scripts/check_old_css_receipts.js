const fs = require('fs');

const oldCss = fs.readFileSync('D:/New folder (2)/Cash Managment BC/public/style.css', 'utf8');
const curCss = fs.readFileSync('public/style.css', 'utf8');

console.log('Old CSS length:', oldCss.length, 'Cur CSS length:', curCss.length);

function findMatches(css, query) {
    const lines = css.split('\n');
    const matched = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(query)) {
            matched.push(`L${i+1}: ${lines[i]}`);
        }
    }
    return matched;
}

console.log('=== Old CSS .csc-receipt ===');
console.log(findMatches(oldCss, 'csc-receipt').slice(0, 15));

console.log('=== Old CSS #printableReceipt ===');
console.log(findMatches(oldCss, 'printableReceipt').slice(0, 15));

console.log('=== Old CSS #bcReceiptModal ===');
console.log(findMatches(oldCss, 'bcReceiptModal').slice(0, 15));

console.log('=== Old CSS .thermal ===');
console.log(findMatches(oldCss, 'thermal').slice(0, 15));

