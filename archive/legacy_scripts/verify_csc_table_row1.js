const { spawn } = require('child_process');

const p = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless',
    '--remote-debugging-port=9299',
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
        const res = await fetch('http://127.0.0.1:9299/json');
        const tabs = await res.json();
        const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        const r = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof showPage === 'function') showPage('csc');
                if (typeof loadCSCApplications === 'function') await loadCSCApplications();
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                await new Promise(r => setTimeout(r, 400));
                const tr = document.querySelector('#cscTable tbody tr:first-child');
                const sn = tr?.querySelector('.csc-sn-pill, .uni-sn-pill')?.innerText;
                const ack = tr?.children[1]?.innerText;
                const cust = tr?.children[2]?.innerText;
                return { sn, ack, cust };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('Row 1 in CSC Table:', r.result.value);
        ws.close();
        p.kill();
        process.exit(0);
    } catch(e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 1500);
