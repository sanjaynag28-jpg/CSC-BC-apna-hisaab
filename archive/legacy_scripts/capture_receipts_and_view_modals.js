const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9261',
    '--window-size=1440,960',
    'http://localhost:3000/#csc'
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
        const res = await fetch('http://127.0.0.1:9261/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP!');

        // 1. Open cscReceiptModal (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof setAppTheme === 'function') setAppTheme('light');
                const apps = typeof allCSCApplications !== 'undefined' ? allCSCApplications : [];
                const firstId = (apps.length > 0) ? apps[0].AppID : 806;
                if (typeof openCSCReceiptModal === 'function') {
                    await openCSCReceiptModal(firstId);
                }
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_receipt_golden_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('1. Captured csc_receipt_golden_light.png');

        // 2. Open cscReceiptModal (Dark Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof setAppTheme === 'function') setAppTheme('dark');
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 400));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_receipt_golden_dark.png'), Buffer.from(ss.data, 'base64'));
        console.log('2. Captured csc_receipt_golden_dark.png');

        // Close receipt and Open cscDetailModal (Dark Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                closeModal('cscReceiptModal');
                const apps = typeof allCSCApplications !== 'undefined' ? allCSCApplications : [];
                const firstId = (apps.length > 0) ? apps[0].AppID : 806;
                if (typeof openCSCDetailModal === 'function') {
                    await openCSCDetailModal(firstId);
                }
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_detail_golden_dark.png'), Buffer.from(ss.data, 'base64'));
        console.log('3. Captured csc_detail_golden_dark.png');

        // Switch to Light Mode for cscDetailModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof setAppTheme === 'function') setAppTheme('light');
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 400));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_detail_golden_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('4. Captured csc_detail_golden_light.png');

        // Close detail and open bcReceiptModal (Dark Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                closeModal('cscDetailModal');
                if (typeof setAppTheme === 'function') setAppTheme('dark');
                if (typeof showBCSlipModal === 'function') {
                    await showBCSlipModal(135);
                } else {
                    openModal('bcReceiptModal');
                }
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_receipt_golden_dark.png'), Buffer.from(ss.data, 'base64'));
        console.log('5. Captured bc_receipt_golden_dark.png');

        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        p.kill();
        process.exit(1);
    }
}, 3000);

