const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9290',
    '--window-size=1440,960',
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

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

setTimeout(async () => {
    try {
        const res = await fetch('http://127.0.0.1:9290/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP!');

        // Helper to capture a named screenshot
        async function capture(filename) {
            // Wait for any animations to finish and loader to hide
            await cdpSend(ws, 'Runtime.evaluate', {
                expression: `if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);`
            }, msgId++);
            await wait(200);
            const ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
            fs.writeFileSync(path.join(previewDir, filename), Buffer.from(ss.data, 'base64'));
            console.log('Saved:', filename);
        }

        // ==========================================
        // 1. CSC RECEIPT MODAL (LIGHT & DARK)
        // ==========================================
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                applyTheme('light', false);
                const apps = typeof allCSCApplications !== 'undefined' ? allCSCApplications : [];
                const firstId = (apps.length > 0) ? apps[0].AppID : 806;
                await openCSCReceiptModal(firstId);
            })()`,
            awaitPromise: true
        }, msgId++);
        await wait(500);
        await capture('verify_csc_receipt_light.png');

        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `applyTheme('dark', false);`
        }, msgId++);
        await wait(300);
        await capture('verify_csc_receipt_dark.png');

        // Close cscReceiptModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('cscReceiptModal');`
        }, msgId++);
        await wait(200);

        // ==========================================
        // 2. BC TRANSACTION RECEIPT (LIGHT & DARK)
        // ==========================================
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

        // ==========================================
        // 3. CSC DETAIL MODAL (LIGHT & DARK)
        // ==========================================
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                applyTheme('light', false);
                const apps = typeof allCSCApplications !== 'undefined' ? allCSCApplications : [];
                const firstId = (apps.length > 0) ? apps[0].AppID : 806;
                await openCSCDetailModal(firstId);
            })()`,
            awaitPromise: true
        }, msgId++);
        await wait(1200); // Wait for async docs & khata fetch
        await capture('verify_csc_detail_light.png');

        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `applyTheme('dark', false);`
        }, msgId++);
        await wait(300);
        await capture('verify_csc_detail_dark.png');

        // Close cscDetailModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('cscDetailModal');`
        }, msgId++);
        await wait(200);

        // ==========================================
        // 4. CSC STATUS MODAL (LIGHT & DARK)
        // ==========================================
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                applyTheme('light', false);
                const apps = typeof allCSCApplications !== 'undefined' ? allCSCApplications : [];
                const firstId = (apps.length > 0) ? apps[0].AppID : 806;
                if (typeof openCSCStatusModal === 'function') openCSCStatusModal(firstId);
            })()`,
            awaitPromise: true
        }, msgId++);
        await wait(400);
        await capture('verify_csc_status_light.png');

        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `applyTheme('dark', false);`
        }, msgId++);
        await wait(300);
        await capture('verify_csc_status_dark.png');

        // Close cscStatusModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('cscStatusModal');`
        }, msgId++);
        await wait(200);

        // ==========================================
        // 5. BC COUNTER ENTRY MODAL (LIGHT & DARK)
        // ==========================================
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                applyTheme('light', false);
                if (typeof openModal === 'function') openModal('bcModal');
            })()`,
            awaitPromise: true
        }, msgId++);
        await wait(400);
        await capture('verify_bc_counter_light.png');

        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `applyTheme('dark', false);`
        }, msgId++);
        await wait(300);
        await capture('verify_bc_counter_dark.png');

        // Close bcModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('bcModal');`
        }, msgId++);
        await wait(200);

        p.kill();
        console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
        process.exit(0);
    } catch (err) {
        console.error('Error during capture:', err);
        p.kill();
        process.exit(1);
    }
}, 3000);

