const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9299',
    '--window-size=1200,1600',
    'http://localhost:3000/receipt_samples.html'
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
        const res = await fetch('http://127.0.0.1:9299/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('receipt_samples.html')) || tabs[0];
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP!');
        await new Promise(r => setTimeout(r, 1200));

        // 1. Capture Full Page in Light Mode
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'receipt_samples_all_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('1. Saved receipt_samples_all_light.png');

        // 2. Capture Option 1 Closeup
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.querySelectorAll('.sample-container')[0].scrollIntoView({ block: 'start' });`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'receipt_sample_option1.png'), Buffer.from(ss.data, 'base64'));
        console.log('2. Saved receipt_sample_option1.png');

        // 3. Capture Option 2 Closeup
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.querySelectorAll('.sample-container')[1].scrollIntoView({ block: 'start' });`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'receipt_sample_option2.png'), Buffer.from(ss.data, 'base64'));
        console.log('3. Saved receipt_sample_option2.png');

        // 4. Capture Option 3 Closeup
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.querySelectorAll('.sample-container')[2].scrollIntoView({ block: 'start' });`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'receipt_sample_option3.png'), Buffer.from(ss.data, 'base64'));
        console.log('4. Saved receipt_sample_option3.png');

        // 5. Switch to Dark Mode & Capture Full Page
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `
                document.documentElement.setAttribute('data-theme', 'dark');
                document.body.classList.add('dark-theme');
                window.scrollTo(0, 0);
            `
        }, msgId++);
        await new Promise(r => setTimeout(r, 500));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'receipt_samples_all_dark.png'), Buffer.from(ss.data, 'base64'));
        console.log('5. Saved receipt_samples_all_dark.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 1500);

