const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9250',
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
        const res = await fetch('http://127.0.0.1:9250/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000')) || tabs[0];
        if (!pageTab) {
            p.kill();
            process.exit(1);
        }

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

        // 1. Open Customer Docs Viewer for Kanti Devi (ID 779)
        await send('Runtime.evaluate', {
            expression: `
                openCustomerDocsModal(779, 'Kanti Devi', 40);
            `
        });
        await new Promise(r => setTimeout(r, 1600));
        let ss1 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'universal_doc_viewer_kanti_devi.png'), Buffer.from(ss1.data, 'base64'));
        console.log('Saved universal_doc_viewer_kanti_devi.png');

        // 2. Open CSC New App Modal and select Kanti Devi (779)
        await send('Runtime.evaluate', {
            expression: `
                closeModal('universalCustomerDocsModal');
                showPage('csc', document.getElementById('nav-csc'));
                openNewCSCModal(779);
            `
        });
        await new Promise(r => setTimeout(r, 1500));

        // Scroll down modal to show loaded past docs and uploader
        await send('Runtime.evaluate', {
            expression: `
                const mb = document.querySelector('#cscNewAppModal .modal-body');
                if (mb) mb.scrollTop = mb.scrollHeight;
            `
        });
        await new Promise(r => setTimeout(r, 800));

        let ss2 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'csc_modal_kanti_devi_past_docs.png'), Buffer.from(ss2.data, 'base64'));
        console.log('Saved csc_modal_kanti_devi_past_docs.png');

        ws.close();
        p.kill();
        console.log('Kanti Devi verifications completed!');
        process.exit(0);
    } catch (e) {
        console.error('CDP error:', e);
        p.kill();
        process.exit(1);
    }
}, 2000);
