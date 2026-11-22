const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9277',
    '--window-size=1280,950',
    'http://localhost:3000/#khatabook'
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
        const res = await fetch('http://127.0.0.1:9277/json');
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

        // 1. Open khataReceiptModal (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                const sampleKhata = {
                    KhataID: 12,
                    CustomerName: 'Sanjay Nag',
                    CustomerID: 637,
                    CustomerPhone: '9616928635',
                    Type: 'Got',
                    Amount: 50,
                    EntryDate: new Date().toISOString(),
                    PaymentMode: 'Cash',
                    ReferenceNo: 'BILL-2026-0001',
                    Description: 'Payment for Bill #INV-2026-0001',
                    Balance: 0
                };
                openKhataSlipFromData(sampleKhata);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'khata_receipt_modal_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('1. Saved khata_receipt_modal_light.png');

        // 2. Open transReceiptModal (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                closeModal('khataReceiptModal');
                const sampleTrans = {
                    TransID: 55,
                    Type: 'Expense',
                    Amount: 350,
                    TransDate: new Date().toISOString(),
                    AccountName: 'Cash in Hand (Galla)',
                    Category: 'Chai & Nashta',
                    PartyName: 'Ramu Tea Stall',
                    ReferenceNo: 'BILL-CHAI-99',
                    Description: 'Grahak evam counter nashta'
                };
                openTransVoucherFromData(sampleTrans);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'trans_voucher_modal_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('2. Saved trans_voucher_modal_light.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 1500);
