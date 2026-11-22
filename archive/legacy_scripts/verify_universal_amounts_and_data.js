const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
}

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9252',
    '--window-size=1440,950',
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

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

setTimeout(async () => {
    try {
        const res = await fetch('http://127.0.0.1:9252/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        async function setTheme(theme) {
            await cdpSend(ws, 'Runtime.evaluate', {
                expression: `
                    if ('${theme}' === 'light') {
                        document.body.classList.remove('dark');
                        document.documentElement.classList.remove('dark');
                        document.documentElement.setAttribute('data-theme', 'light');
                        localStorage.setItem('theme', 'light');
                    } else {
                        document.body.classList.add('dark');
                        document.documentElement.classList.add('dark');
                        document.documentElement.setAttribute('data-theme', 'dark');
                        localStorage.setItem('theme', 'dark');
                    }
                `
            }, msgId++);
            await wait(200);
        }

        async function takeScreenshot(fileName) {
            const snap = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
            const outPath = path.join(previewDir, fileName);
            fs.writeFileSync(outPath, Buffer.from(snap.data, 'base64'));
            console.log(`Saved screenshot: ${fileName}`);
        }

        // Wait for page initial load
        await wait(1800);

        // -------------------------------------------------------------
        // 1. BC Counter Table (Light and Dark)
        // -------------------------------------------------------------
        await setTheme('dark');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `showPage('bc', document.getElementById('nav-bc'));`
        }, msgId++);
        await wait(800);
        await takeScreenshot('universal_amt_bc_dark.png');

        await setTheme('light');
        await wait(400);
        await takeScreenshot('universal_amt_bc_light.png');

        // -------------------------------------------------------------
        // 2. Khatabook Customer Ledger (Light and Dark)
        // -------------------------------------------------------------
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `
                showPage('khatabook', document.getElementById('nav-khatabook'));
                if (typeof openKhataHistoryModal === 'function') {
                    // Open Sanjay Nag (637) or first customer with entries
                    openKhataHistoryModal(637);
                }
            `
        }, msgId++);
        await wait(1000);
        await takeScreenshot('universal_amt_khata_light.png');

        await setTheme('dark');
        await wait(400);
        await takeScreenshot('universal_amt_khata_dark.png');

        // Close khata modal if open
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('khataHistoryModal');`
        }, msgId++);
        await wait(300);

        // -------------------------------------------------------------
        // 3. Transactions / Cashbook (Light and Dark)
        // -------------------------------------------------------------
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `showPage('transactions', document.getElementById('nav-transactions'));`
        }, msgId++);
        await wait(800);
        await takeScreenshot('universal_amt_transactions_dark.png');

        await setTheme('light');
        await wait(400);
        await takeScreenshot('universal_amt_transactions_light.png');

        // -------------------------------------------------------------
        // 4. Customers Table (Light and Dark)
        // -------------------------------------------------------------
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `showPage('customers', document.getElementById('nav-customers'));`
        }, msgId++);
        await wait(800);
        await takeScreenshot('universal_amt_customers_light.png');

        await setTheme('dark');
        await wait(400);
        await takeScreenshot('universal_amt_customers_dark.png');

        // -------------------------------------------------------------
        // 5. Customer 360° Profile Modal (Light and Dark)
        // -------------------------------------------------------------
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `
                if (typeof openCustomer360Modal === 'function') {
                    openCustomer360Modal(245);
                }
            `
        }, msgId++);
        await wait(1000);
        await takeScreenshot('universal_amt_c360_dark.png');

        await setTheme('light');
        await wait(400);
        await takeScreenshot('universal_amt_c360_light.png');

        // Close C360 modal
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `closeModal('customer360Modal');`
        }, msgId++);
        await wait(300);

        // -------------------------------------------------------------
        // 6. Universal Search Dropdown with amount pills
        // -------------------------------------------------------------
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `
                const input = document.getElementById('universalSearchInput');
                if (input) {
                    input.focus();
                    input.value = '9616928635';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            `
        }, msgId++);
        await wait(1200);
        await takeScreenshot('universal_amt_search_light.png');

        await setTheme('dark');
        await wait(400);
        await takeScreenshot('universal_amt_search_dark.png');

        console.log('✅ ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
        p.kill();
        process.exit(0);

    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 2500);

