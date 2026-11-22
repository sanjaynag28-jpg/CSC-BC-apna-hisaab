const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const c360Start = content.indexOf('<div class="modal-overlay" id="customer360Modal">');
const nextModal = content.indexOf('<div class="modal-overlay"', c360Start + 100);
console.log('Next modal after c360 starts at:', nextModal);
console.log('Snippet:', content.substring(nextModal, nextModal + 300));

