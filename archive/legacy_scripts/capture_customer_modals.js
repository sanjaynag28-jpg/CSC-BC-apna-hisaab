const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9250',
    '--window-size=1400,950',
    'http://localhost:3000/#customers'
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

        // 1. Open customerModal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof openCustomerModal === 'function') {
                    openCustomerModal();
                    const nameIn = document.getElementById('custNameInput');
                    if (nameIn) nameIn.value = 'Sunita Sharma';
                    const phoneIn = document.getElementById('custPhoneInput');
                    if (phoneIn) phoneIn.value = '9876543210';
                    const aadhIn = document.getElementById('custAadhaarInput');
                    if (aadhIn) aadhIn.value = '5555 6666 7777';
                }
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotCust = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'customer_modal_live_light.png'), Buffer.from(shotCust.data, 'base64'));

        // 2. Close customerModal and open customer360Modal for Kanti Devi (ID 779)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof closeModal === 'function') closeModal('customerModal');
                if (typeof openCustomer360Modal === 'function') {
                    await openCustomer360Modal(779);
                }
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        const shot360 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'customer_360_kanti_devi_light.png'), Buffer.from(shot360.data, 'base64'));

        // 3. Dark mode customer 360
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.add('dark'); document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shot360Dark = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'customer_360_kanti_devi_dark.png'), Buffer.from(shot360Dark.data, 'base64'));

        console.log('Saved Customer suite live screenshots');
        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);

