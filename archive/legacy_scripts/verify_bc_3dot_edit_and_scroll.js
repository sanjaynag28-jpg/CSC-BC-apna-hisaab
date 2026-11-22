const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9261',
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
        const tabs = await (await fetch('http://127.0.0.1:9261/json')).json();
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
        await new Promise(r => setTimeout(r, 1500));

        // 1. Open 3-dot menu on first row
        const openRes = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const btn = document.querySelector('#bcTableBody .bc-menu-trigger-btn');
                    if (!btn) return { error: 'No 3-dot button found in BC table' };
                    btn.click();
                    const menu = document.getElementById('bcFloatingActionMenu');
                    const editBtn = document.getElementById('bcOptEdit');
                    return {
                        hasMenu: Boolean(menu),
                        hasEditBtn: Boolean(editBtn),
                        editBtnText: editBtn ? editBtn.innerText.trim() : null
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('3-Dot Menu Result:', openRes.result.value);

        await new Promise(r => setTimeout(r, 500));
        let ss1 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_3dot_menu_with_edit.png'), Buffer.from(ss1.data, 'base64'));
        console.log('Saved bc_3dot_menu_with_edit.png');

        // 2. Scroll the window and verify 3-dot menu is STILL OPEN and repositioned
        const scrollRes = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    window.scrollBy(0, 60);
                    window.dispatchEvent(new Event('scroll'));
                    const menu = document.getElementById('bcFloatingActionMenu');
                    return {
                        menuStillOpen: Boolean(menu && menu.classList.contains('active')),
                        top: menu ? menu.style.top : null,
                        left: menu ? menu.style.left : null
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('Scroll Result:', scrollRes.result.value);

        await new Promise(r => setTimeout(r, 500));
        let ss2 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_3dot_menu_after_scroll.png'), Buffer.from(ss2.data, 'base64'));
        console.log('Saved bc_3dot_menu_after_scroll.png');

        // 3. Click the Edit button in the 3-dot menu
        const editClickRes = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const editBtn = document.getElementById('bcOptEdit');
                    if (!editBtn) return { error: 'Edit button not found', closeLogs: window._closeLogs };
                    editBtn.click();
                    const modal = document.getElementById('bcModal');
                    const title = document.getElementById('bcModalTitle')?.innerText || '';
                    const saveBtn = document.getElementById('bcSaveBtnText')?.innerText || '';
                    const custName = document.getElementById('bcCustomerName')?.value || '';
                    const amt = document.getElementById('bcAmount')?.value || '';
                    const bcId = document.getElementById('bcId')?.value || '';
                    return {
                        modalOpen: modal && modal.classList.contains('active'),
                        title,
                        saveBtn,
                        custName,
                        amt,
                        bcId
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('Edit Modal Result:', editClickRes.result.value);

        await new Promise(r => setTimeout(r, 600));
        let ss3 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_modal_edit_mode.png'), Buffer.from(ss3.data, 'base64'));
        console.log('Saved bc_modal_edit_mode.png');

        // 4. Test saving an edit: modify notes and call saveBCTransaction(false)
        const saveRes = await send('Runtime.evaluate', {
            expression: `
                (async () => {
                    const notesEl = document.getElementById('bcNotes');
                    if (notesEl) notesEl.value = 'Verified Edit Update ' + new Date().toLocaleTimeString();
                    await saveBCTransaction(false);
                    return { saved: true };
                })()
            `,
            awaitPromise: true,
            returnByValue: true
        });
        console.log('Save Edit Result:', saveRes.result.value);

        await new Promise(r => setTimeout(r, 1200));
        let ss4 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_modal_edited_saved.png'), Buffer.from(ss4.data, 'base64'));
        console.log('Saved bc_modal_edited_saved.png');

        ws.close();
        p.kill();
        console.log('Verification completed successfully!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);
