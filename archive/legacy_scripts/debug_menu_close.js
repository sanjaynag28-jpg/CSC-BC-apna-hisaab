const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9262',
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
        const tabs = await (await fetch('http://127.0.0.1:9262/json')).json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');
        await send('Runtime.enable');
        ws.addEventListener('message', (evt) => {
            const data = JSON.parse(evt.data);
            if (data.method === 'Runtime.consoleAPICalled') {
                console.log('BROWSER CONSOLE:', ...data.params.args.map(a => a.value));
            }
        });
        await send('Page.reload', { ignoreCache: true });
        await new Promise(r => setTimeout(r, 2500));

        await send('Runtime.evaluate', {
            expression: `
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);
                showPage('bc', document.getElementById('nav-bc'));
            `
        });
        await new Promise(r => setTimeout(r, 1000));

        // Intercept closeBCActionMenu and closeAllActionMenus with stack trace logging
        await send('Runtime.evaluate', {
            expression: `
                window._closeLogs = [];
                const origCloseBC = window.closeBCActionMenu;
                window.closeBCActionMenu = function() {
                    window._closeLogs.push({ fn: 'closeBCActionMenu', stack: new Error().stack });
                    return origCloseBC.apply(this, arguments);
                };
                const origCloseAll = window.closeAllActionMenus;
                window.closeAllActionMenus = function() {
                    window._closeLogs.push({ fn: 'closeAllActionMenus', stack: new Error().stack });
                    return origCloseAll.apply(this, arguments);
                };
            `
        });

        // Click 3 dots
        await send('Runtime.evaluate', {
            expression: `document.querySelector('#bcTableBody .bc-menu-trigger-btn').click();`
        });
        console.log('Clicked 3-dots');

        // Scroll
        await send('Runtime.evaluate', {
            expression: `
                window.scrollBy(0, 40);
                window.dispatchEvent(new Event('scroll'));
            `
        });
        console.log('Dispatched scroll');

        await new Promise(r => setTimeout(r, 800));

        const logs = await send('Runtime.evaluate', {
            expression: `window._closeLogs`,
            returnByValue: true
        });
        console.log('Close logs:', JSON.stringify(logs.result.value, null, 2));

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);
