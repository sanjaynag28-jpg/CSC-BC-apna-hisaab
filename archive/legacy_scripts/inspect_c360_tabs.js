const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9254',
    '--window-size=1440,900',
    'http://localhost:3000/#customers'
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
        const res = await fetch('http://127.0.0.1:9254/json');
        const tabs = await res.json();
        const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Wait for app.js to be ready
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `new Promise(resolve => {
                const check = () => {
                    if (typeof window.openCustomer360Modal === 'function') resolve(true);
                    else setTimeout(check, 100);
                };
                check();
            })`,
            awaitPromise: true
        }, msgId++);

        // Navigate to customers and open 360 modal for first customer
        const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const cid = 779; // Kanti Devi
                await window.openCustomer360Modal(cid);
                await new Promise(r => setTimeout(r, 800));

                const tabsNav = document.querySelector('.c360-tabs-nav');
                const tabBtn = document.querySelector('.c360-tab-btn');
                const body = document.querySelector('.c360-body');
                const panel = document.querySelector('.c360-panel.active');
                const hero = document.querySelector('.c360-hero-card');
                const kpi = document.querySelector('.c360-kpi-grid');
                const dialog = document.querySelector('.customer-360-dialog');

                return {
                    dialogH: dialog ? dialog.offsetHeight : 0,
                    dialogW: dialog ? dialog.offsetWidth : 0,
                    bodyH: body ? body.offsetHeight : 0,
                    bodyScrollH: body ? body.scrollHeight : 0,
                    heroH: hero ? hero.offsetHeight : 0,
                    kpiH: kpi ? kpi.offsetHeight : 0,
                    tabsNavH: tabsNav ? tabsNav.offsetHeight : 0,
                    tabsNavRect: tabsNav ? {
                        top: tabsNav.getBoundingClientRect().top,
                        bottom: tabsNav.getBoundingClientRect().bottom,
                        height: tabsNav.getBoundingClientRect().height
                    } : null,
                    tabBtnH: tabBtn ? tabBtn.offsetHeight : 0,
                    panelH: panel ? panel.offsetHeight : 0,
                    panelRect: panel ? {
                        top: panel.getBoundingClientRect().top,
                        bottom: panel.getBoundingClientRect().bottom,
                        height: panel.getBoundingClientRect().height
                    } : null
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('Full evalRes:', JSON.stringify(evalRes, null, 2));

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 3000);
