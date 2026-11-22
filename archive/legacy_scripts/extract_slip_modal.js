const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const startIdx = content.indexOf('<div class="modal-overlay" id="bcReceiptModal">');
const endIdx = content.indexOf('<div class="modal-overlay" id="khataReceiptModal">');

const modalHtml = content.substring(startIdx, endIdx);
fs.writeFileSync('scripts/extracted_bc_receipt_modal.html', modalHtml);
console.log('Extracted bcReceiptModal, length:', modalHtml.length);
