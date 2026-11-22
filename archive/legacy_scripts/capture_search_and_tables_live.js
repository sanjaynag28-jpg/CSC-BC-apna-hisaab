const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9258',
    '--window-size=1440,960',
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
        const res = await fetch('http://127.0.0.1:9258/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP!');

        // 1. Light Mode - Universal Search Dropdown
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof setAppTheme === 'function') setAppTheme('light');
                else {
                    document.body.classList.add('light-theme');
                    document.documentElement.setAttribute('data-theme', 'light');
                }
                const inp = document.getElementById('universalSearchInput');
                if (inp) {
                    inp.value = '9616928635';
                    if (typeof executeUniversalSearch === 'function') {
                        await executeUniversalSearch('9616928635');
                    }
                }
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'universal_search_dropdown_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('1. Captured universal_search_dropdown_light.png');

        // Close dropdown and scroll down to BC table
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const dropdown = document.getElementById('universalSearchDropdown');
                if (dropdown) dropdown.style.display = 'none';
                window.scrollTo(0, 600);
            })()`
        }, msgId++);

        await new Promise(r => setTimeout(r, 500));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_table_scrolled_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('2. Captured bc_table_scrolled_light.png');

        // 2. Navigate to Customers Table (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const navCust = document.getElementById('nav-customers') || document.querySelector('.nav-item[onclick*="customers"]');
                if (typeof showPage === 'function') showPage('customers', navCust);
                window.scrollTo(0, 0);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 700));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'customers_table_border_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('3. Captured customers_table_border_light.png');

        // 3. Navigate to Khatabook (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const navKhata = document.getElementById('nav-khatabook') || document.querySelector('.nav-item[onclick*="khatabook"]');
                if (typeof showPage === 'function') showPage('khatabook', navKhata);
                window.scrollTo(0, 0);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 700));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'khatabook_cards_border_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('4. Captured khatabook_cards_border_light.png');

        // 4. Navigate to CSC Tracker (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const navCSC = document.getElementById('nav-csc') || document.querySelector('.nav-item[onclick*="csc"]');
                if (typeof showPage === 'function') showPage('csc', navCSC);
                window.scrollTo(0, 200);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 700));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_table_border_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('5. Captured csc_table_border_light.png');

        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        p.kill();
        process.exit(1);
    }
}, 3000);
