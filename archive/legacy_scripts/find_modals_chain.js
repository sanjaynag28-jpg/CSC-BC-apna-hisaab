const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const m1 = content.indexOf('<div class="modal-overlay" id="editRelationshipModal">');
const m2 = content.indexOf('<div class="modal-overlay"', m1 + 100);
const m3 = content.indexOf('<div class="modal-overlay"', m2 + 100);
const m4 = content.indexOf('<div class="modal-overlay"', m3 + 100);

console.log('m1 (editRelationship):', m1);
console.log('m2:', m2, content.substring(m2, m2 + 80).replace(/\n/g, ' '));
console.log('m3:', m3, content.substring(m3, m3 + 80).replace(/\n/g, ' '));
console.log('m4:', m4, content.substring(m4, m4 + 80).replace(/\n/g, ' '));

