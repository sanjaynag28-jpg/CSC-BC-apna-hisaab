const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9296',
    '--window-size=1500,980',
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
        const tabs = await (await fetch('http://127.0.0.1:9296/json')).json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.reload', { ignoreCache: true });
        await new Promise(r => setTimeout(r, 2000));

        // 1. LIGHT MODE: Khatabook Table
        await send('Runtime.evaluate', {
            expression: `
                (async () => {
                    if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);
                    document.documentElement.setAttribute('data-theme', 'light');
                    document.body.className = 'light-theme';
                    showPage('khatabook', document.getElementById('nav-khatabook'));
                    await loadKhatabookPage();
                })()
            `,
            awaitPromise: true
        });
        await new Promise(r => setTimeout(r, 1200));

        let ssLight = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'kb_table_redesigned_light.png'), Buffer.from(ssLight.data, 'base64'));
        console.log('Saved kb_table_redesigned_light.png');

        // 2. LIGHT MODE: Khata Passbook Modal (Customer 780)
        await send('Runtime.evaluate', {
            expression: `openKhataHistoryModal(780);`
        });
        await new Promise(r => setTimeout(r, 1200));

        let ssHistLight = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'kb_passbook_modal_redesigned_light.png'), Buffer.from(ssHistLight.data, 'base64'));
        console.log('Saved kb_passbook_modal_redesigned_light.png');

        await send('Runtime.evaluate', { expression: `closeModal('khataHistoryModal');` });
        await new Promise(r => setTimeout(r, 400));

        // 3. DARK MODE: Khatabook Table
        await send('Runtime.evaluate', {
            expression: `
                document.documentElement.setAttribute('data-theme', 'dark');
                document.body.className = 'dark-theme';
                renderKbCustomerList();
            `
        });
        await new Promise(r => setTimeout(r, 600));

        let ssDark = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'kb_table_redesigned_dark.png'), Buffer.from(ssDark.data, 'base64'));
        console.log('Saved kb_table_redesigned_dark.png');

        // 4. DARK MODE: Khata Passbook Modal (Customer 780)
        await send('Runtime.evaluate', {
            expression: `openKhataHistoryModal(780);`
        });
        await new Promise(r => setTimeout(r, 1200));

        let ssHistDark = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'kb_passbook_modal_redesigned_dark.png'), Buffer.from(ssHistDark.data, 'base64'));
        console.log('Saved kb_passbook_modal_redesigned_dark.png');

        ws.close();
        p.kill();
        console.log('ALL KHATABOOK SCREENSHOTS CAPTURED SUCCESSFULLY!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);

