const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9252',
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
        const res = await fetch('http://127.0.0.1:9252/json');
        const tabs = await res.json();
        const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        const diag = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const r = await fetch('/api/customers?limit=5');
                const j = await r.json();
                const list = j.customers || j.data || [];
                if (list.length > 0 && typeof openCustomer360Modal === 'function') {
                    await openCustomer360Modal(list[0].CustomerID);
                }
                await new Promise(r => setTimeout(r, 600));

                const dialog = document.querySelector('.customer-360-dialog');
                const header = document.querySelector('.c360-header');
                const headerActions = document.querySelector('.c360-header-actions');
                const closeBtn = document.querySelector('.c360-header-actions .modal-close');
                const body = document.querySelector('.c360-body');
                const hero = document.querySelector('.c360-hero-card');
                const avatar = document.getElementById('c360Avatar');
                const balBox = document.getElementById('c360BalanceBox');
                const kpiGrid = document.querySelector('.c360-kpi-grid');
                const tabsNav = document.querySelector('.c360-tabs-nav');
                const tabKhata = document.getElementById('c360TabKhata');
                const table = document.getElementById('c360KhataTable');
                const footer = document.querySelector('.c360-footer');
                const footerBtnWrap = footer ? footer.querySelector('div:last-child') : null;

                function getInfo(el) {
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    const cs = window.getComputedStyle(el);
                    return {
                        w: Math.round(r.width),
                        h: Math.round(r.height),
                        top: Math.round(r.top),
                        display: cs.display,
                        flexShrink: cs.flexShrink,
                        overflow: cs.overflow,
                        overflowX: cs.overflowX,
                        overflowY: cs.overflowY,
                        height: cs.height,
                        maxHeight: cs.maxHeight,
                        padding: cs.padding,
                        margin: cs.margin
                    };
                }

                return {
                    dialog: getInfo(dialog),
                    header: getInfo(header),
                    headerActions: getInfo(headerActions),
                    closeBtn: getInfo(closeBtn),
                    body: getInfo(body),
                    hero: getInfo(hero),
                    avatar: getInfo(avatar),
                    balBox: getInfo(balBox),
                    kpiGrid: getInfo(kpiGrid),
                    tabsNav: getInfo(tabsNav),
                    tabKhata: getInfo(tabKhata),
                    table: getInfo(table),
                    footer: getInfo(footer),
                    footerBtnWrap: getInfo(footerBtnWrap)
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('Diagnostic result:', JSON.stringify(diag.result.value, null, 2));

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 3000);
