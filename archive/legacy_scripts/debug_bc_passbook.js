const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9264',
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
        const tabs = await (await fetch('http://127.0.0.1:9264/json')).json();
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
                console.log('CONSOLE:', data.params.type, ...data.params.args.map(a => a.value || a.description));
            }
            if (data.method === 'Runtime.exceptionThrown') {
                console.log('EXCEPTION:', data.params.exceptionDetails);
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
        await new Promise(r => setTimeout(r, 1200));

        // Test 1: openPipelinePassbook('cash')
        console.log('--- Testing openPipelinePassbook("cash") ---');
        const resCash = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    try {
                        openPipelinePassbook('cash');
                        const modal = document.getElementById('accountPassbookModal');
                        return { modalExists: Boolean(modal), modalActive: modal?.classList.contains('active'), curPage: window.location.hash };
                    } catch (e) {
                        return { error: e.stack };
                    }
                })()
            `,
            returnByValue: true
        });
        console.log('Cash Passbook Result:', resCash.result.value);

        await new Promise(r => setTimeout(r, 1000));
        const modalCashState = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const modal = document.getElementById('accountPassbookModal');
                    const title = document.getElementById('pbModalAccountName')?.textContent;
                    const rows = document.querySelectorAll('#pbPassbookTableBody tr').length;
                    return { active: modal?.classList.contains('active'), title, rows };
                })()
            `,
            returnByValue: true
        });
        console.log('Cash Modal State:', modalCashState.result.value);

        // Close it
        await send('Runtime.evaluate', { expression: `closeModal('accountPassbookModal');` });
        await new Promise(r => setTimeout(r, 500));

        // Test 2: openPipelinePassbook('digipay')
        console.log('--- Testing openPipelinePassbook("digipay") ---');
        const resDigi = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    try {
                        openPipelinePassbook('digipay');
                        const modal = document.getElementById('accountPassbookModal');
                        return { modalExists: Boolean(modal), modalActive: modal?.classList.contains('active') };
                    } catch (e) {
                        return { error: e.stack };
                    }
                })()
            `,
            returnByValue: true
        });
        console.log('Digipay Passbook Result:', resDigi.result.value);

        await new Promise(r => setTimeout(r, 1000));
        const modalDigiState = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const modal = document.getElementById('accountPassbookModal');
                    const title = document.getElementById('pbModalAccountName')?.textContent;
                    const rows = document.querySelectorAll('#pbPassbookTableBody tr').length;
                    return { active: modal?.classList.contains('active'), title, rows };
                })()
            `,
            returnByValue: true
        });
        console.log('Digipay Modal State:', modalDigiState.result.value);

        // Close it
        await send('Runtime.evaluate', { expression: `closeModal('accountPassbookModal');` });
        await new Promise(r => setTimeout(r, 500));

        // Test 3: openPipelinePassbook('bank')
        console.log('--- Testing openPipelinePassbook("bank") ---');
        const resBank = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    try {
                        openPipelinePassbook('bank');
                        const modal = document.getElementById('accountPassbookModal');
                        return { modalExists: Boolean(modal), modalActive: modal?.classList.contains('active') };
                    } catch (e) {
                        return { error: e.stack };
                    }
                })()
            `,
            returnByValue: true
        });
        console.log('Bank Passbook Result:', resBank.result.value);

        await new Promise(r => setTimeout(r, 1000));
        const modalBankState = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const modal = document.getElementById('accountPassbookModal');
                    const title = document.getElementById('pbModalAccountName')?.textContent;
                    const rows = document.querySelectorAll('#pbPassbookTableBody tr').length;
                    return { active: modal?.classList.contains('active'), title, rows };
                })()
            `,
            returnByValue: true
        });
        console.log('Bank Modal State:', modalBankState.result.value);

        // Test 4: switchBCTab('settlement')
        console.log('--- Testing switchBCTab("settlement") ---');
        const resSettlement = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    try {
                        switchBCTab('settlement');
                        const tab = document.getElementById('tabSettlementRegister');
                        const custContainer = document.getElementById('customerTableContainer');
                        const settContainer = document.getElementById('settlementTableContainer');
                        return {
                            tabActive: tab?.classList.contains('active'),
                            custDisplay: custContainer ? window.getComputedStyle(custContainer).display : null,
                            settDisplay: settContainer ? window.getComputedStyle(settContainer).display : null,
                            settRows: document.querySelectorAll('#settlementTableBody tr').length
                        };
                    } catch (e) {
                        return { error: e.stack };
                    }
                })()
            `,
            returnByValue: true
        });
        console.log('Settlement Tab Result:', resSettlement.result.value);

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);

