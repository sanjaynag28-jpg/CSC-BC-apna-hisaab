const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9249',
    '--window-size=1400,950',
    'http://localhost:3000/#bc'
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
        const res = await fetch('http://127.0.0.1:9249/json');
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

        // 1. Capture bcGallaModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof openModal === 'function') openModal('bcGallaModal');
                const n500 = document.getElementById('note500');
                if (n500) { n500.value = '20'; n500.dispatchEvent(new Event('input', { bubbles: true })); }
                const n200 = document.getElementById('note200');
                if (n200) { n200.value = '15'; n200.dispatchEvent(new Event('input', { bubbles: true })); }
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotGalla = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_galla_live_light.png'), Buffer.from(shotGalla.data, 'base64'));

        // Close galla and open bcSettlementModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof closeModal === 'function') closeModal('bcGallaModal');
                if (typeof openModal === 'function') openModal('bcSettlementModal');
                const amt = document.getElementById('settleAmount');
                if (amt) { amt.value = '15000'; amt.dispatchEvent(new Event('input', { bubbles: true })); }
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotSettle = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_settlement_live_light.png'), Buffer.from(shotSettle.data, 'base64'));

        // Close settlement and open accountModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof closeModal === 'function') closeModal('bcSettlementModal');
                if (typeof openModal === 'function') openModal('accountModal');
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotAcc = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'account_modal_live_light.png'), Buffer.from(shotAcc.data, 'base64'));

        console.log('Saved Batch 2 live screenshots');
        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);

