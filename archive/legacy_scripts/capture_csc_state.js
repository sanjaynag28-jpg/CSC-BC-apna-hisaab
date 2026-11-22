const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9280',
    '--window-size=1360,950',
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
        const res = await fetch('http://127.0.0.1:9280/json');
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

        // 1. Show page-csc in Light Mode
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                if (typeof showPage === 'function') showPage('csc');
                if (typeof loadCSCPage === 'function') await loadCSCPage();
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_page_current_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('1. Saved csc_page_current_light.png');

        // 2. Open 3-dot menu on first row
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const btn = document.querySelector('#cscTableBody .csc-menu-trigger-btn');
                if (btn) btn.click();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_action_menu_current.png'), Buffer.from(ss.data, 'base64'));
        console.log('2. Saved csc_action_menu_current.png');

        // 3. Open first CSC Detail Modal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof closeCSCActionMenu === 'function') closeCSCActionMenu();
                const firstApp = (allCSCApplications && allCSCApplications[0]) ? allCSCApplications[0].AppID : 1;
                openCSCDetailModal(firstApp);
                await new Promise(r => setTimeout(r, 400));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_detail_modal_current.png'), Buffer.from(ss.data, 'base64'));
        console.log('3. Saved csc_detail_modal_current.png');

        // 4. Open CSC Receipt Modal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                closeModal('cscDetailModal');
                const firstApp = (allCSCApplications && allCSCApplications[0]) ? allCSCApplications[0].AppID : 1;
                openCSCReceiptModal(firstApp);
                await new Promise(r => setTimeout(r, 400));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_receipt_modal_current.png'), Buffer.from(ss.data, 'base64'));
        console.log('4. Saved csc_receipt_modal_current.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 1500);
