const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9246',
    '--window-size=1400,950',
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
        const res = await fetch('http://127.0.0.1:9246/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Find first application and open detail modal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const res = await fetch('/api/csc?limit=5');
                const json = await res.json();
                const apps = json.applications || json.data || (Array.isArray(json) ? json : []);
                if (apps.length > 0 && typeof openCSCDetailModal === 'function') {
                    openCSCDetailModal(apps[0].AppID);
                }
            })()`
        }, msgId++);

        await new Promise(r => setTimeout(r, 1200));

        // Light mode detail
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.remove('dark'); document.documentElement.removeAttribute('data-theme');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shot1 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_detail_current_live_light.png'), Buffer.from(shot1.data, 'base64'));

        // Dark mode detail
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shot2 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_detail_current_live_dark.png'), Buffer.from(shot2.data, 'base64'));

        // Now open CSC Status Modal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const res = await fetch('/api/csc?limit=5');
                const json = await res.json();
                const apps = json.applications || json.data || (Array.isArray(json) ? json : []);
                if (apps.length > 0 && typeof openCSCStatusModal === 'function') {
                    openCSCStatusModal(apps[0].AppID);
                }
            })()`
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        // Light mode status modal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.remove('dark'); document.documentElement.removeAttribute('data-theme');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shot3 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_status_current_live_light.png'), Buffer.from(shot3.data, 'base64'));

        // Now open CSC Receipt Modal (Print slip preview)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const res = await fetch('/api/csc?limit=5');
                const json = await res.json();
                const apps = json.applications || json.data || (Array.isArray(json) ? json : []);
                if (apps.length > 0 && typeof openCSCReceiptModal === 'function') {
                    openCSCReceiptModal(apps[0].AppID);
                }
            })()`
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        const shot4 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_receipt_current_live_light.png'), Buffer.from(shot4.data, 'base64'));

        console.log('Saved csc detail, status, and receipt live screenshots');
        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);
