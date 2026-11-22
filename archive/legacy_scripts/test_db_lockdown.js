const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9280',
    '--window-size=1360,950',
    'http://localhost:3000/#dashboard'
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
        const res = await fetch('http://127.0.0.1:9280/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        if (!pageTab) throw new Error('Localhost page tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP!');
        await new Promise(r => setTimeout(r, 2000));

        // Step 1: Simulate DB Disconnection
        console.log('Simulating Real DB Disconnection (503)...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                window._originalFetch = window.fetch;
                window.fetch = async (url, init) => {
                    if (typeof url === 'string' && url.includes('/api/health')) {
                        return new Response(JSON.stringify({ success: false, status: 'DISCONNECTED', isDatabaseDown: true, error: 'SQL Server connection is DOWN. Check SQL Server (SQLEXPRESS) service.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
                    }
                    return window._originalFetch(url, init);
                };
                setDatabaseStatus(false, 'DATABASE NOT CONNECTED! SQL Server is unreachable. Windows Services me SQLEXPRESS service ko restart karein.');
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'db_lockdown_screen.png'), Buffer.from(ss.data, 'base64'));
        console.log('Saved db_lockdown_screen.png');

        // Step 2: Restore DB Connection & Test Reconnect
        console.log('Testing Reconnect...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                window.fetch = window._originalFetch;
                await checkLiveDatabaseConnection(true);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'db_unlocked_screen.png'), Buffer.from(ss.data, 'base64'));
        console.log('Saved db_unlocked_screen.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 1500);
