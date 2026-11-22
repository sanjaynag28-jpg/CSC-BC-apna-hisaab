const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9247',
    '--window-size=1400,950',
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

setTimeout(async () => {
    try {
        const res = await fetch('http://127.0.0.1:9247/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Open transModal via openAddTransaction()
        const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                console.log('typeof openAddTransaction:', typeof openAddTransaction);
                if (typeof openAddTransaction === 'function') {
                    openAddTransaction('Expense');
                } else if (typeof openModal === 'function') {
                    openModal('transModal');
                }
                const amtIn = document.getElementById('transAmount');
                if (amtIn) {
                    amtIn.value = '1500';
                    amtIn.dispatchEvent(new Event('input', { bubbles: true }));
                }
                const modal = document.getElementById('transModal');
                return {
                    isOpen: modal ? modal.classList.contains('active') : false,
                    modalClass: modal ? modal.className : 'no modal',
                    style: modal ? modal.getAttribute('style') : ''
                };
            })()`,
            returnByValue: true,
            awaitPromise: true
        }, msgId++);
        console.log('Eval result:', JSON.stringify(evalRes));

        await new Promise(r => setTimeout(r, 600));

        // Light mode
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.remove('dark'); document.documentElement.classList.remove('dark'); document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 300));
        const shot1 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'trans_modal_live_light.png'), Buffer.from(shot1.data, 'base64'));

        // Dark mode
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.add('dark'); document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 300));
        const shot2 = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'trans_modal_live_dark.png'), Buffer.from(shot2.data, 'base64'));

        console.log('Saved transModal live screenshots');
        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);
