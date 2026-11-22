const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const lines = html.split('\n');

const modals = ['transModal', 'invoiceModal', 'bcModal', 'cscNewAppModal', 'khataModal'];

modals.forEach(mId => {
    let inModal = false;
    let modalLines = [];
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`id="${mId}"`)) {
            inModal = true;
            startLine = i + 1;
        }
        if (inModal) {
            modalLines.push({ num: i + 1, text: lines[i] });
            // stop when next modal-overlay starts or closing div for modal-overlay
            if (modalLines.length > 5 && lines[i].includes('class="modal-overlay"')) {
                break;
            }
        }
    }

    console.log(`\n================== MODAL: ${mId} (starts line ${startLine}) ==================`);
    modalLines.forEach(l => {
        const t = l.text.toLowerCase();
        if (t.includes('customer') || t.includes('grahak') || t.includes('party') || t.includes('alt+c') || t.includes('f2') || t.includes('user-plus') || t.includes('newcust') || t.includes('opennew') || t.includes('opencustomer')) {
            console.log(`Line ${l.num}: ${l.text.trim()}`);
        }
    });
});

