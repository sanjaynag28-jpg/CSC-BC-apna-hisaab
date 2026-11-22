const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const custStart = content.indexOf('<div class="modal-overlay" id="customerModal">');
const c360Start = content.indexOf('<div class="modal-overlay" id="customer360Modal">');
const c360End = content.indexOf('<!-- Khatabook Quick Add/Edit Modal', c360Start);

console.log('custStart:', custStart);
console.log('c360Start:', c360Start);
console.log('c360End:', c360End);

