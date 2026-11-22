const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9266',
    '--window-size=1500,980',
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
        const tabs = await (await fetch('http://127.0.0.1:9266/json')).json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.reload', { ignoreCache: true });
        await new Promise(r => setTimeout(r, 2000));

        await send('Runtime.evaluate', {
            expression: `
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);
                showPage('bc', document.getElementById('nav-bc'));
            `
        });
        await new Promise(r => setTimeout(r, 1000));

        // Call openPipelinePassbook('bank') and wait for network idle
        await send('Runtime.evaluate', {
            expression: `openPipelinePassbook('bank');`
        });
        await new Promise(r => setTimeout(r, 2000));

        const res = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    return {
                        title: document.getElementById('pbModalAccountName')?.textContent,
                        type: document.getElementById('pbModalAccountType')?.textContent,
                        opening: document.getElementById('pbKpiOpening')?.textContent,
                        closing: document.getElementById('pbKpiClosing')?.textContent,
                        rows: document.querySelectorAll('#pbPassbookTableBody tr').length
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('Bank Passbook Final State:', res.result.value);

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);

