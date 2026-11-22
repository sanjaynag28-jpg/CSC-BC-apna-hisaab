const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9297',
    '--window-size=1440,1020',
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
        const res = await fetch('http://127.0.0.1:9297/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000')) || tabs[0];
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        ws.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === 'Runtime.consoleAPICalled') {
                console.log('[CONSOLE]', msg.params.args.map(a => a.value || a.description).join(' '));
            }
        });

        await new Promise(r => setTimeout(r, 1000));

        // Submit a test application directly to API and check response
        const testRes = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const payload = {
                    CustomerName: 'Sanjay Test Kumar',
                    CustomerPhone: '9876543210',
                    CustomerAadhaar: '1234 5678 9012',
                    ServiceType: 'PAN Card (NSDL / UTI)',
                    AckNumber: 'TEST-' + Date.now(),
                    ApplyDate: '2026-11-05',
                    ExpectedDate: '2026-11-17',
                    GovtFee: 107,
                    OperatorFee: 50,
                    TotalFee: 157,
                    PaidAmount: 157,
                    PaymentMode: 'Cash',
                    Status: 'Pending',
                    StatusRemarks: 'Testing entry'
                };
                const r = await fetch('/api/csc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                return await r.json();
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('Direct API POST /api/csc result:', testRes.result.value);

        ws.close();
        p.kill();
        process.exit(0);
    } catch(e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);

