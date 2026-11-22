const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9295',
    '--window-size=1440,1020',
    'http://localhost:3000'
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
        const res = await fetch('http://127.0.0.1:9295/json');
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

        // Go to CSC page
        console.log('Navigating to CSC page...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                if (typeof showPage === 'function') await showPage('csc');
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 1000));

        // Click "+ Naya Aavedan" button
        console.log('Clicking #btn-csc-new button...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.getElementById('btn-csc-new').click()`
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));

        // Capture screenshot of opened modal
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_new_app_modal_opened.png'), Buffer.from(ss.data, 'base64'));
        console.log('Captured csc_new_app_modal_opened.png!');

        // Check fields inside the modal
        const fieldsCheck = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const modal = document.getElementById('cscNewAppModal');
                const title = document.getElementById('cscModalTitle')?.innerText;
                const custName = document.getElementById('cscCustName');
                const sType = document.getElementById('cscServiceType');
                const govtFee = document.getElementById('cscGovtFee')?.value;
                const operFee = document.getElementById('cscOperatorFee')?.value;
                const totalFee = document.getElementById('cscTotalFee')?.value;
                const saveBtn = document.getElementById('cscSaveBtn');
                return {
                    title,
                    hasCustName: !!custName,
                    serviceOptionsCount: sType?.options.length,
                    selectedService: sType?.value,
                    govtFee,
                    operFee,
                    totalFee,
                    saveBtnText: saveBtn?.innerText.trim()
                };
            })()`,
            returnByValue: true
        }, msgId++);

        console.log('Fields Check:', fieldsCheck.result.value);

        // Also test Dark Mode screenshot
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `if (typeof applyTheme === 'function') applyTheme('dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 500));

        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_new_app_modal_dark.png'), Buffer.from(ss.data, 'base64'));
        console.log('Captured csc_new_app_modal_dark.png!');

        ws.close();
        p.kill();
        process.exit(0);
    } catch(err) {
        console.error('Test script error:', err);
        p.kill();
        process.exit(1);
    }
}, 2000);
