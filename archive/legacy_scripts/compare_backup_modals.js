const fs = require('fs');

const oldHtml = fs.readFileSync('D:/New folder (2)/Cash Managment BC/public/index_1.html', 'utf8');
const curHtml = fs.readFileSync('public/index.html', 'utf8');

console.log('Old length:', oldHtml.length, 'Cur length:', curHtml.length);

function getModalIds(html) {
    const regex = /id=["']([a-zA-Z0-9_-]*modal[a-zA-Z0-9_-]*)["']/gi;
    const ids = [];
    let m;
    while ((m = regex.exec(html)) !== null) {
        ids.push(m[1]);
    }
    return [...new Set(ids)];
}

const oldModals = getModalIds(oldHtml);
const curModals = getModalIds(curHtml);

console.log('Old modals (' + oldModals.length + '):', oldModals);
console.log('Cur modals (' + curModals.length + '):', curModals);

// Check receipt or slip in old
const slipMatches = oldHtml.match(/slip|receipt|raseed/gi) || [];
console.log('Slip matches in old:', slipMatches.length);

