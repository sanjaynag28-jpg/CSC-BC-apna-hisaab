const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9245',
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
        const res = await fetch('http://127.0.0.1:9245/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Trigger openBCModal and fill with test data
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof openBCModal === 'function') {
                    openBCModal('Cash Withdrawal');
                    const nameIn = document.getElementById('bcCustomerName');
                    if (nameIn) nameIn.value = 'Ramesh Kumar';
                    const phoneIn = document.getElementById('bcCustomerPhone');
                    if (phoneIn) {
                        phoneIn.value = '8353824041';
                        if (typeof handleBCPhoneInput === 'function') handleBCPhoneInput(phoneIn);
                    }
                    const aadhIn = document.getElementById('bcAadhaar');
                    if (aadhIn) aadhIn.value = '1234 5678 3126';
                    const bankIn = document.getElementById('bcBankName');
                    if (bankIn) bankIn.value = 'Indian Bank';
                    const amtIn = document.getElementById('bcAmount');
                    if (amtIn) {
                        amtIn.value = '3000';
                        amtIn.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            })()`
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));

        // Light mode screenshot
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.remove('dark'); document.documentElement.classList.remove('dark'); document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shot1 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_modal_current_live_light.png'), Buffer.from(shot1.data, 'base64'));
        console.log('Saved bc_modal_current_live_light.png');

        // Dark mode screenshot
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.add('dark'); document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shot2 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_modal_current_live_dark.png'), Buffer.from(shot2.data, 'base64'));
        console.log('Saved bc_modal_current_live_dark.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);
