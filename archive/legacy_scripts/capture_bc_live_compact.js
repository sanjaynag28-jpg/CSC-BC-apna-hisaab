const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9247',
    '--window-size=1440,1050',
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
        const res = await fetch('http://127.0.0.1:9247/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Trigger navigateTo('bc') and loadBCDashboard()
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof navigateTo === 'function') navigateTo('bc');
                if (typeof loadBCDashboard === 'function') await loadBCDashboard();
                if (typeof loadBCTransactions === 'function') await loadBCTransactions();
                if (window.lucide) lucide.createIcons();
            })()`
        }, msgId++);

        await new Promise(r => setTimeout(r, 1500));

        // 1. Dark Mode full view
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.add('dark'); document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 500));
        const shotDark = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_counter_compact_dark.png'), Buffer.from(shotDark.data, 'base64'));
        console.log('Saved bc_counter_compact_dark.png');

        // Focused clip on .bc-compact-hub in Dark Mode
        const clipDark = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const el = document.querySelector('.bc-compact-hub');
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
            })()`,
            returnByValue: true
        }, msgId++);

        if (clipDark.result && clipDark.result.value) {
            const shotHeaderDark = await cdpSend(ws, 'Page.captureScreenshot', {
                format: 'png',
                clip: clipDark.result.value
            }, msgId++);
            fs.writeFileSync(path.join(previewDir, 'bc_header_focused_dark.png'), Buffer.from(shotHeaderDark.data, 'base64'));
            console.log('Saved bc_header_focused_dark.png');
        }

        // 2. Light Mode full view
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.body.classList.remove('dark'); document.documentElement.classList.remove('dark'); document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 500));
        const shotLight = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_counter_compact_light.png'), Buffer.from(shotLight.data, 'base64'));
        console.log('Saved bc_counter_compact_light.png');

        // Focused clip on .bc-compact-hub in Light Mode
        const clipLight = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const el = document.querySelector('.bc-compact-hub');
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
            })()`,
            returnByValue: true
        }, msgId++);

        if (clipLight.result && clipLight.result.value) {
            const shotHeaderLight = await cdpSend(ws, 'Page.captureScreenshot', {
                format: 'png',
                clip: clipLight.result.value
            }, msgId++);
            fs.writeFileSync(path.join(previewDir, 'bc_header_focused_light.png'), Buffer.from(shotHeaderLight.data, 'base64'));
            console.log('Saved bc_header_focused_light.png');
        }

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 3000);
