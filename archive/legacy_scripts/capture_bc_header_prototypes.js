const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9246',
    '--window-size=1440,1800',
    'http://localhost:3000/prototype_bc_designs.html'
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
        const res = await fetch('http://127.0.0.1:9246/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('prototype_bc_designs.html'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Wait for Lucide icons to render
        await new Promise(r => setTimeout(r, 1000));

        // 1. Dark Mode Overview (all 3 options)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.documentElement.setAttribute('data-theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotDark = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_designs_overview_dark.png'), Buffer.from(shotDark.data, 'base64'));
        console.log('Saved bc_designs_overview_dark.png');

        // 2. Light Mode Overview (all 3 options)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.documentElement.setAttribute('data-theme', 'light');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        const shotLight = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_designs_overview_light.png'), Buffer.from(shotLight.data, 'base64'));
        console.log('Saved bc_designs_overview_light.png');

        // Capture individual cards for crisp side-by-side comparison
        const sections = ['Option 1', 'Option 2', 'Option 3'];
        for (let i = 0; i < 3; i++) {
            const clip = await cdpSend(ws, 'Runtime.evaluate', {
                expression: `(() => {
                    const el = document.querySelectorAll('.design-section')[${i}];
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
                })()`,
                returnByValue: true
            }, msgId++);

            if (clip.result && clip.result.value) {
                const shotSection = await cdpSend(ws, 'Page.captureScreenshot', {
                    format: 'png',
                    clip: clip.result.value
                }, msgId++);
                fs.writeFileSync(path.join(previewDir, `bc_design_option_${i + 1}_light.png`), Buffer.from(shotSection.data, 'base64'));
                console.log(`Saved bc_design_option_${i + 1}_light.png`);
            }
        }

        // Switch to dark for Option 1 close-up
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `document.documentElement.setAttribute('data-theme', 'dark');`
        }, msgId++);
        await new Promise(r => setTimeout(r, 400));
        for (let i = 0; i < 3; i++) {
            const clip = await cdpSend(ws, 'Runtime.evaluate', {
                expression: `(() => {
                    const el = document.querySelectorAll('.design-section')[${i}];
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
                })()`,
                returnByValue: true
            }, msgId++);

            if (clip.result && clip.result.value) {
                const shotSection = await cdpSend(ws, 'Page.captureScreenshot', {
                    format: 'png',
                    clip: clip.result.value
                }, msgId++);
                fs.writeFileSync(path.join(previewDir, `bc_design_option_${i + 1}_dark.png`), Buffer.from(shotSection.data, 'base64'));
                console.log(`Saved bc_design_option_${i + 1}_dark.png`);
            }
        }

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);

