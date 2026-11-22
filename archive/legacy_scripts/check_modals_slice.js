const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const tStart = content.indexOf('<div class="modal-overlay" id="transReceiptModal">');
const sStart = content.indexOf('<div class="modal-overlay" id="bcSettlementModal">');
const sEnd = content.indexOf('<!-- Document Upload Modal -->');

console.log('--- transReceiptModal ---');
console.log(content.substring(tStart, sStart));

console.log('--- bcSettlementModal ---');
console.log(content.substring(sStart, sEnd));

