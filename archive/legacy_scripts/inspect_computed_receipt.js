const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9288',
    '--window-size=1440,960',
    'http://localhost:3000/#csc'
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
        const res = await fetch('http://127.0.0.1:9288/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Evaluate styles
        const styles = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light', false);
                const apps = typeof allCSCApplications !== 'undefined' ? allCSCApplications : [];
                const firstId = (apps.length > 0) ? apps[0].AppID : 806;
                if (typeof openCSCReceiptModal === 'function') await openCSCReceiptModal(firstId);
                
                const rec = document.getElementById('printableCSCReceipt');
                const title = rec ? rec.querySelector('.csc-receipt-title') : null;
                const firstVal = rec ? rec.querySelector('td.val') : null;
                const firstLabel = rec ? rec.querySelector('td.label') : null;

                return {
                    themeAttr: document.documentElement.getAttribute('data-theme'),
                    bodyClasses: document.body.className,
                    recBg: rec ? window.getComputedStyle(rec).backgroundColor : null,
                    recColor: rec ? window.getComputedStyle(rec).color : null,
                    titleColor: title ? window.getComputedStyle(title).color : null,
                    labelColor: firstLabel ? window.getComputedStyle(firstLabel).color : null,
                    valColor: firstVal ? window.getComputedStyle(firstVal).color : null,
                    valText: firstVal ? firstVal.innerText : null
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('LIGHT MODE STYLES:', JSON.stringify(styles.result.value, null, 2));

        const darkStyles = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('dark', false);
                const rec = document.getElementById('printableCSCReceipt');
                const title = rec ? rec.querySelector('.csc-receipt-title') : null;
                const firstVal = rec ? rec.querySelector('td.val') : null;
                const firstLabel = rec ? rec.querySelector('td.label') : null;

                return {
                    themeAttr: document.documentElement.getAttribute('data-theme'),
                    recBg: rec ? window.getComputedStyle(rec).backgroundColor : null,
                    recColor: rec ? window.getComputedStyle(rec).color : null,
                    titleColor: title ? window.getComputedStyle(title).color : null,
                    labelColor: firstLabel ? window.getComputedStyle(firstLabel).color : null,
                    valColor: firstVal ? window.getComputedStyle(firstVal).color : null,
                    valText: firstVal ? firstVal.innerText : null
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('DARK MODE STYLES:', JSON.stringify(darkStyles.result.value, null, 2));

        p.kill();
        process.exit(0);
    } catch(e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 3000);

