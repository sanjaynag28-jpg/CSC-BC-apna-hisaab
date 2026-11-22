const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9245',
    '--window-size=1500,950',
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
        const res = await fetch('http://127.0.0.1:9245/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000')) || tabs[0];
        if (!pageTab) {
            p.kill();
            return;
        }

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.reload', { ignoreCache: true });
        await new Promise(r => setTimeout(r, 2200));

        // Open CSC page
        await send('Runtime.evaluate', {
            expression: `
                (async () => {
                    document.documentElement.setAttribute('data-theme', 'light');
                    document.body.className = 'light-theme';
                    showPage('csc', document.getElementById('nav-csc'));
                })()
            `
        });
        await new Promise(r => setTimeout(r, 1500));

        // Open cscNewAppModal
        await send('Runtime.evaluate', {
            expression: `openNewCSCModal();`
        });
        await new Promise(r => setTimeout(r, 800));

        let ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'csc_new_app_modal_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('Saved csc_new_app_modal_light.png');

        // Close cscNewAppModal, open cscReceiptModal
        await send('Runtime.evaluate', {
            expression: `
                closeModal('cscNewAppModal');
                const appId = allCSCApplications && allCSCApplications.length > 0 ? allCSCApplications[0].AppID : 1;
                openCSCReceiptModal(appId);
            `
        });
        await new Promise(r => setTimeout(r, 800));

        ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'csc_receipt_modal_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('Saved csc_receipt_modal_light.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('CDP error:', e);
        p.kill();
        process.exit(1);
    }
}, 2000);

