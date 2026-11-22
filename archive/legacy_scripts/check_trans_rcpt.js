const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const start = content.indexOf('<div class="modal-overlay" id="transReceiptModal">');
const end = content.indexOf('</div>\n    </div>', start);
console.log('transReceiptModal ends around:', end);
console.log('Followed by:', content.substring(end, end + 200));

