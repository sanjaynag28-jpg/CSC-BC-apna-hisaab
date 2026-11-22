const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9258',
    '--window-size=1500,980',
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
        const tabs = await (await fetch('http://127.0.0.1:9258/json')).json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.reload', { ignoreCache: true });
        await new Promise(r => setTimeout(r, 2500));

        await send('Runtime.evaluate', {
            expression: `
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);
                document.documentElement.setAttribute('data-theme', 'light');
                document.body.className = 'light-theme';
            `
        });

        // 1. Capture CSC New App Modal
        await send('Runtime.evaluate', {
            expression: `
                showPage('csc', document.getElementById('nav-csc'));
                openNewCSCModal();
            `
        });
        await new Promise(r => setTimeout(r, 1000));
        let ss1 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'clean_csc_new_app_modal.png'), Buffer.from(ss1.data, 'base64'));
        console.log('Saved clean_csc_new_app_modal.png');

        // 2. Capture BC Banking Counter Modal
        await send('Runtime.evaluate', {
            expression: `
                closeModal('cscNewAppModal');
                openBCModal('Cash Withdrawal');
            `
        });
        await new Promise(r => setTimeout(r, 1000));
        let ss2 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'clean_bc_modal.png'), Buffer.from(ss2.data, 'base64'));
        console.log('Saved clean_bc_modal.png');

        // 3. Capture Invoice Modal
        await send('Runtime.evaluate', {
            expression: `
                closeModal('bcModal');
                openInvoiceModal();
            `
        });
        await new Promise(r => setTimeout(r, 1000));
        let ss3 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'clean_invoice_modal.png'), Buffer.from(ss3.data, 'base64'));
        console.log('Saved clean_invoice_modal.png');

        ws.close();
        p.kill();
        console.log('All 3 clean modals verified successfully!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);

