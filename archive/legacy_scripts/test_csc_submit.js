const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9296',
    '--window-size=1440,1020',
    'http://localhost:3000'
]);

function cdpSend(ws, method, params = {}, id = 1) {
    return new Promise((resolve, reject) => {
        const msg = JSON.stringify({ id, method, params });
        ws.send(msg);
        const handler = (event) => {
            const res = JSON.parse(event.data);
            if (res.id === id) {
                ws.removeEventListener('message', handler);
                if (res.error) reject(res.error);
                else resolve(res.result);
            }
        };
        ws.addEventListener('message', handler);
    });
}

setTimeout(async () => {
    try {
        const res = await fetch('http://127.0.0.1:9296/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000')) || tabs[0];
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP!');
        await new Promise(r => setTimeout(r, 1200));

        // Go to CSC page
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof showPage === 'function') await showPage('csc');
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));

        // Open modal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.getElementById('btn-csc-new').click()`
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));

        // Fill form fields
        const testAck = 'ACK' + Date.now().toString().slice(-8);
        console.log('Filling form with Ack:', testAck);
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                document.getElementById('cscCustName').value = 'Ramesh Kumar Test';
                document.getElementById('cscCustPhone').value = '9876543210';
                document.getElementById('cscCustAadhaar').value = '1234 5678 9999';
                document.getElementById('cscAckNumber').value = '${testAck}';
            })()`
        }, msgId++);

        // Submit form
        console.log('Submitting form...');
        const submitRes = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const saveBtn = document.getElementById('cscSaveBtn');
                saveBtn.click();
                await new Promise(r => setTimeout(r, 2600));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                const receiptModal = document.getElementById('cscReceiptModal');
                const isReceiptVis = receiptModal && (receiptModal.classList.contains('active') || receiptModal.style.display === 'flex' || receiptModal.style.display === 'block');
                return {
                    receiptVisible: isReceiptVis,
                    modalClasses: receiptModal?.className,
                    snText: document.getElementById('cscSlipUniversalSN')?.innerText,
                    ackText: document.getElementById('cscSlipAckNo')?.innerText,
                    custText: document.getElementById('cscSlipCustomer')?.innerText
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('Submit Result:', submitRes.result.value);

        // Capture screenshot of receipt modal
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_saved_new_receipt_modal.png'), Buffer.from(ss.data, 'base64'));
        console.log('Captured csc_saved_new_receipt_modal.png!');

        ws.close();
        p.kill();
        process.exit(0);
    } catch(err) {
        console.error('Test error:', err);
        p.kill();
        process.exit(1);
    }
}, 2000);
