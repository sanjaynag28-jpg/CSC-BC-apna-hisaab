const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
}

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9258',
    '--window-size=1440,950',
    'http://localhost:3000/#transactions'
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
        const res = await fetch('http://127.0.0.1:9258/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'DOM.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Navigating and switching to transactions page...');
        await wait(2000);

        // Switch to transactions page and dark mode
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `
                (async () => {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.body.classList.remove('light-theme');
                    document.body.classList.add('dark-theme');
                    if (window.switchPage) window.switchPage('transactions');
                    if (window.loadTransactions) await window.loadTransactions(1);
                })()
            `,
            awaitPromise: true
        }, msgId++);

        await wait(2000);

        // Capture Dark Mode
        let shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'transactions_compact_dark.png'), Buffer.from(shot.data, 'base64'));
        console.log('Dark screenshot saved: transactions_compact_dark.png');

        // Switch to Light Mode
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `
                (async () => {
                    document.documentElement.setAttribute('data-theme', 'light');
                    document.body.classList.remove('dark-theme');
                    document.body.classList.add('light-theme');
                })()
            `,
            awaitPromise: true
        }, msgId++);

        await wait(1000);

        // Capture Light Mode
        shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'transactions_compact_light.png'), Buffer.from(shot.data, 'base64'));
        console.log('Light screenshot saved: transactions_compact_light.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);
