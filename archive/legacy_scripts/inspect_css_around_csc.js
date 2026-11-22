const fs = require('fs');

const css = fs.readFileSync('public/style.css', 'utf8');

function showAround(charIdx, len = 1500) {
    const start = Math.max(0, charIdx - 200);
    return css.substring(start, start + len);
}

console.log('=== Around cscReceiptModal (char 235517) ===');
console.log(showAround(235517));

console.log('\n=== Around cscDetailModal (char 254092) ===');
console.log(showAround(254092));

