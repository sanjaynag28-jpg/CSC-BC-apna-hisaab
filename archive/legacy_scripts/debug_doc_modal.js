const { spawn } = require('child_process');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9256',
    'http://localhost:3000/#csc'
]);

setTimeout(async () => {
    try {
        const tabs = await (await fetch('http://127.0.0.1:9256/json')).json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => new Promise(res => {
            const id = reqId++;
            ws.send(JSON.stringify({ id, method, params }));
            const h = (e) => {
                const d = JSON.parse(e.data);
                if (d.id === id) {
                    ws.removeEventListener('message', h);
                    res(d.result?.result?.value);
                }
            };
            ws.addEventListener('message', h);
        });

        await new Promise(r => setTimeout(r, 2000));
        const info = await send('Runtime.evaluate', {
            expression: `({
                title: document.title,
                scripts: Array.from(document.scripts).map(s => s.src),
                hasModal: !!document.getElementById('universalCustomerDocsModal'),
                hasUdu: typeof UniversalDocUploader !== 'undefined',
                hasOpenModal: typeof openCustomerDocsModal !== 'undefined'
            })`,
            returnByValue: true
        });

        console.log('Page Info:', JSON.stringify(info, null, 2));

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);
