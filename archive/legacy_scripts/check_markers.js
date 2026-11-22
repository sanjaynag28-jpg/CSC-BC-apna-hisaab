const fs = require('fs');

const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// 1. bcSettlementModal
const settleStart = content.indexOf('<div class="modal-overlay" id="bcSettlementModal">');
const settleEnd = content.indexOf('<!-- Document Upload Modal -->');
console.log('settleStart:', settleStart, 'settleEnd:', settleEnd);

// 2. bcReceiptModal
const bcRcptStart = content.indexOf('<div class="modal-overlay" id="bcReceiptModal">');
const bcRcptEnd = content.indexOf('<!-- Khatabook Transaction Receipt Slip Modal');
console.log('bcRcptStart:', bcRcptStart, 'bcRcptEnd:', bcRcptEnd);

// 3. transReceiptModal
const transRcptStart = content.indexOf('<div class="modal-overlay" id="transReceiptModal">');
const transRcptEnd = content.indexOf('<!-- Account Modal -->');
console.log('transRcptStart:', transRcptStart, 'transRcptEnd:', transRcptEnd);

