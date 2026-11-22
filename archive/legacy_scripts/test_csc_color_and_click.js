const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9288',
    '--window-size=1380,980',
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
        const pageTab = tabs.find(t => t.url.includes('localhost:3000')) || tabs[0];
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP!');
        await new Promise(r => setTimeout(r, 1200));

        // 1. Show page-csc in Light Mode
        const initRes = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                if (typeof showPage === 'function') showPage('csc');
                if (typeof loadCSCPage === 'function') await loadCSCPage();
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                return {
                    tableRows: document.querySelectorAll('#cscTable tbody tr').length,
                    firstSN: document.querySelector('#cscTable tbody .csc-sn-pill')?.innerText || 'NONE',
                    theme: document.body.className
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('Page loaded info:', initRes.result.value);

        await new Promise(r => setTimeout(r, 1000));
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_page_colorful_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('1. Saved csc_page_colorful_light.png');

        // 2. Test clicking the Universal SN button on row 1!
        const clickRes = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const snBtn = document.querySelector('#cscTable tbody .csc-sn-pill');
                if (!snBtn) return { error: 'SN button not found' };
                const snText = snBtn.innerText.trim();
                snBtn.click();
                await new Promise(r => setTimeout(r, 600));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                const modal = document.getElementById('cscDetailModal');
                const isVisible = modal && (modal.classList.contains('active') || modal.style.display === 'flex' || modal.style.display === 'block');
                const modalTitle = modal ? modal.querySelector('.modal-title, h3, h2')?.innerText : '';
                return { clickedSN: snText, isModalOpen: isVisible, title: modalTitle };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('SN Click Result:', clickRes.result.value);

        await new Promise(r => setTimeout(r, 800));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_sn_click_modal.png'), Buffer.from(ss.data, 'base64'));
        console.log('2. Saved csc_sn_click_modal.png');

        // Close modal and switch to dark theme
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof closeModal === 'function') closeModal('cscDetailModal');
                if (typeof applyTheme === 'function') applyTheme('dark');
                await new Promise(r => setTimeout(r, 500));
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'csc_page_colorful_dark.png'), Buffer.from(ss.data, 'base64'));
        console.log('3. Saved csc_page_colorful_dark.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 1500);

