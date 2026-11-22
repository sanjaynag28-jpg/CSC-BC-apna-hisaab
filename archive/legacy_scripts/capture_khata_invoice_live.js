const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9251',
    '--window-size=1400,950',
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
        const res = await fetch('http://127.0.0.1:9251/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Set Light mode
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.remove('dark'); document.documentElement.classList.remove('dark'); document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light');`
        }, msgId++);

        // 1. Open khataEntryModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof openAddKhataModal === 'function') {
                    openAddKhataModal('Got');
                } else if (typeof openModal === 'function') {
                    openModal('khataEntryModal');
                }
                const amtIn = document.getElementById('khataAmountInput');
                if (amtIn) amtIn.value = '2500';
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotKhata = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'khata_entry_live_light.png'), Buffer.from(shotKhata.data, 'base64'));

        // 2. Close khataEntryModal and open invoiceModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof closeModal === 'function') closeModal('khataEntryModal');
                if (typeof openNewInvoiceModal === 'function') {
                    openNewInvoiceModal();
                } else if (typeof openModal === 'function') {
                    openModal('invoiceModal');
                }
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotInv = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'invoice_modal_live_light.png'), Buffer.from(shotInv.data, 'base64'));

        // 3. Dark mode invoiceModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.add('dark'); document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotInvDark = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'invoice_modal_live_dark.png'), Buffer.from(shotInvDark.data, 'base64'));

        console.log('Saved Khata and Invoice live screenshots');
        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);

