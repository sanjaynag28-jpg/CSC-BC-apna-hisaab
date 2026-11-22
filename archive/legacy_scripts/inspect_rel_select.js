const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const startIdx = content.indexOf('<div class="modal-overlay" id="customerModal">');
const relStart = content.indexOf('<select id="custRelationshipSelect"', startIdx);
console.log(content.substring(relStart, relStart + 800));

