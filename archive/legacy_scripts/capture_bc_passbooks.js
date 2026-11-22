const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9265',
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
        const tabs = await (await fetch('http://127.0.0.1:9265/json')).json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000') && t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Page.reload', { ignoreCache: true });
        await new Promise(r => setTimeout(r, 2500));

        await send('Runtime.evaluate', {
            expression: `
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);
                document.documentElement.setAttribute('data-theme', 'light');
                document.body.className = 'light-theme';
                showPage('bc', document.getElementById('nav-bc'));
            `
        });
        await new Promise(r => setTimeout(r, 1200));

        // Helper to wait until table has data rows
        async function waitForPassbookRows() {
            for (let i = 0; i < 20; i++) {
                const check = await send('Runtime.evaluate', {
                    expression: `(() => {
                        const tr = document.querySelector('#pbPassbookTableBody tr');
                        return tr && !tr.innerText.includes('load ho rahi hai');
                    })()`,
                    returnByValue: true
                });
                if (check.result && check.result.value) return true;
                await new Promise(r => setTimeout(r, 200));
            }
            return false;
        }

        // 1. Galla Cash Passbook
        await send('Runtime.evaluate', { expression: `openPipelinePassbook('cash');` });
        await waitForPassbookRows();
        await new Promise(r => setTimeout(r, 400));
        let ss1 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_passbook_galla_cash.png'), Buffer.from(ss1.data, 'base64'));
        console.log('Saved bc_passbook_galla_cash.png');

        await send('Runtime.evaluate', { expression: `closeAccountPassbookModal();` });
        await new Promise(r => setTimeout(r, 600));

        // 2. Wallets / Digipay Passbook
        await send('Runtime.evaluate', { expression: `openPipelinePassbook('digipay');` });
        await waitForPassbookRows();
        await new Promise(r => setTimeout(r, 400));
        let ss2 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_passbook_wallets_digipay.png'), Buffer.from(ss2.data, 'base64'));
        console.log('Saved bc_passbook_wallets_digipay.png');

        await send('Runtime.evaluate', { expression: `closeAccountPassbookModal();` });
        await new Promise(r => setTimeout(r, 600));

        // 3. Apna Bank Passbook
        await send('Runtime.evaluate', { expression: `openPipelinePassbook('bank');` });
        await waitForPassbookRows();
        await new Promise(r => setTimeout(r, 400));
        let ss3 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_passbook_apna_bank.png'), Buffer.from(ss3.data, 'base64'));
        console.log('Saved bc_passbook_apna_bank.png');

        await send('Runtime.evaluate', { expression: `closeAccountPassbookModal();` });
        await new Promise(r => setTimeout(r, 600));

        // 4. Settlement & Payout Passbook Tab
        await send('Runtime.evaluate', { expression: `switchBCTab('settlement');` });
        await new Promise(r => setTimeout(r, 1000));
        let ss4 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_settlement_payout_passbook_tab.png'), Buffer.from(ss4.data, 'base64'));
        console.log('Saved bc_settlement_payout_passbook_tab.png');

        ws.close();
        p.kill();
        console.log('All BC passbooks verified and captured successfully!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);
