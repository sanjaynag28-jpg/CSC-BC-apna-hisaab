const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9299',
    '--window-size=1440,960',
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

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

setTimeout(async () => {
    try {
        const res = await fetch('http://127.0.0.1:9299/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Helper to capture a named screenshot
        async function capture(filename) {
            await cdpSend(ws, 'Runtime.evaluate', {
                expression: `if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);`
            }, msgId++);
            await wait(200);
            const ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
            fs.writeFileSync(path.join(previewDir, filename), Buffer.from(ss.data, 'base64'));
            console.log('Saved:', filename);
        }

        // 1. KHATABOOK RECEIPT (LIGHT & DARK)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                applyTheme('dark', false);
                const stRes = await fetch('/api/khatabook/statement/780');
                const stJson = await stRes.json();
                const sampleEntry = (stJson.entries && stJson.entries.length > 0) ? stJson.entries[0] : null;
                if (sampleEntry) {
                    sampleEntry.CustomerName = 'Ram Charan';
                    sampleEntry.CustomerPhone = '7897043288';
                    if (typeof openKhataSlipFromData === 'function') {
                        openKhataSlipFromData(sampleEntry);
                    }
                }
            })()`,
            awaitPromise: true
        }, msgId++);
        await wait(600);
        await capture('verify_khata_receipt_dark.png');

        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `applyTheme('light', false);`
        }, msgId++);
        await wait(300);
        await capture('verify_khata_receipt_light.png');

        // Close khataReceiptModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('khataReceiptModal');`
        }, msgId++);
        await wait(200);

        // 2. BC RECEIPT WITH UPDATED MODAL PADDING (DARK & LIGHT)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                applyTheme('dark', false);
                const transRes = await fetch('/api/bc');
                const transJson = await transRes.json();
                const trans = (transJson.data && transJson.data.length > 0) ? transJson.data[0] : null;
                if (trans) {
                    openSlipFromData(encodeURIComponent(JSON.stringify(trans)));
                }
            })()`,
            awaitPromise: true
        }, msgId++);
        await wait(500);
        await capture('verify_bc_receipt_dark.png');

        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `applyTheme('light', false);`
        }, msgId++);
        await wait(300);
        await capture('verify_bc_receipt_light.png');

        // Close bcReceiptModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('bcReceiptModal');`
        }, msgId++);
        await wait(200);

        p.kill();
        process.exit(0);
    } catch(err) {
        console.error('Error:', err);
        p.kill();
        process.exit(1);
    }
}, 3000);
