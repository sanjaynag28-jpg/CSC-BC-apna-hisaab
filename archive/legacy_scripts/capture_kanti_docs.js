const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9257',
    '--window-size=1500,980',
    'http://localhost:3000/#csc'
]);

setTimeout(async () => {
    try {
        const tabs = await (await fetch('http://127.0.0.1:9257/json')).json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = reqId++;
            ws.send(JSON.stringify({ id, method, params }));
            const h = (e) => {
                const d = JSON.parse(e.data);
                if (d.id === id) {
                    ws.removeEventListener('message', h);
                    if (d.error) reject(d.error);
                    else resolve(d.result);
                }
            };
            ws.addEventListener('message', h);
        });

        await send('Page.enable');
        await send('Runtime.enable');
        await new Promise(r => setTimeout(r, 2200));

        // Hide universal loader
        await send('Runtime.evaluate', {
            expression: `
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);
                document.documentElement.setAttribute('data-theme', 'light');
                document.body.className = 'light-theme';
            `
        });

        // Open Document Viewer Modal for Kanti Devi (779)
        const openRes = await send('Runtime.evaluate', {
            expression: `openCustomerDocsModal(779, 'Kanti Devi', 40);`
        });
        console.log('openCustomerDocsModal called:', openRes);

        await new Promise(r => setTimeout(r, 1500));

        const ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'universal_doc_viewer_kanti_devi.png'), Buffer.from(ss.data, 'base64'));
        console.log('Saved universal_doc_viewer_kanti_devi.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);

