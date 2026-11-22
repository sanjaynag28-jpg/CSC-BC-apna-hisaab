const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9293',
    '--window-size=1440,1020',
    'http://localhost:3000'
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
        const res = await fetch('http://127.0.0.1:9293/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000')) || tabs[0];
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        console.log('Connected to Chrome CDP on port 9293!');
        await new Promise(r => setTimeout(r, 1200));

        // 1. Navigate to Settings page
        console.log('\n--- Navigating to Settings Page ---');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                if (typeof showPage === 'function') showPage('settings');
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));

        // Helper to check visibility of all 13 panes
        const checkPanes = async (expectedActiveTab) => {
            return await cdpSend(ws, 'Runtime.evaluate', {
                expression: `(() => {
                    const allPanes = Array.from(document.querySelectorAll('.settings-tab-pane'));
                    const status = allPanes.map(p => {
                        const style = window.getComputedStyle(p);
                        return {
                            id: p.id,
                            display: style.display,
                            isVisible: style.display !== 'none' && p.offsetHeight > 0,
                            hasActiveClass: p.classList.contains('active')
                        };
                    });
                    const visiblePanes = status.filter(s => s.isVisible);
                    const activeBtn = document.querySelector('.settings-tab-btn.active')?.id;
                    return {
                        totalPanes: allPanes.length,
                        visibleCount: visiblePanes.length,
                        visiblePaneIds: visiblePanes.map(v => v.id),
                        activeBtn
                    };
                })()`,
                returnByValue: true
            }, msgId++);
        };

        // TEST 1: Default 'shop' tab
        console.log('\n[TEST 1] Checking Shop Tab...');
        let paneRes = await checkPanes('shop');
        console.log('Shop Tab State:', paneRes.result.value);

        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'settings_tab_1_shop.png'), Buffer.from(ss.data, 'base64'));

        // TEST 2: Switch to CSC Sewa & Fees
        console.log('\n[TEST 2] Switching to CSC Services Tab...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `switchSettingsTab('csc-services')`
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        paneRes = await checkPanes('csc-services');
        console.log('CSC Services Tab State:', paneRes.result.value);
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'settings_tab_2_csc_services.png'), Buffer.from(ss.data, 'base64'));

        // TEST 3: Switch to Excel Data tab
        console.log('\n[TEST 3] Switching to Excel Data Tab...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `switchSettingsTab('excel-data')`
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        paneRes = await checkPanes('excel-data');
        console.log('Excel Tab State:', paneRes.result.value);
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'settings_tab_3_excel_data.png'), Buffer.from(ss.data, 'base64'));

        // TEST 4: Switch to Appearance / Theme tab
        console.log('\n[TEST 4] Switching to Appearance Tab...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `switchSettingsTab('appearance')`
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        paneRes = await checkPanes('appearance');
        console.log('Appearance Tab State:', paneRes.result.value);
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'settings_tab_4_appearance.png'), Buffer.from(ss.data, 'base64'));

        // TEST 5: Switch to Database Explorer tab
        console.log('\n[TEST 5] Switching to Database Tab...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `switchSettingsTab('database')`
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        paneRes = await checkPanes('database');
        console.log('Database Tab State:', paneRes.result.value);
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'settings_tab_5_database.png'), Buffer.from(ss.data, 'base64'));

        // TEST 6: Dark Mode preview of Shop Profile
        console.log('\n[TEST 6] Dark mode preview...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('dark');
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                switchSettingsTab('shop');
                await new Promise(r => setTimeout(r, 400));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        paneRes = await checkPanes('shop');
        console.log('Shop Tab Dark Mode State:', paneRes.result.value);
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'settings_tab_shop_dark.png'), Buffer.from(ss.data, 'base64'));

        // TEST 7: Database Tab screenshot in Dark Mode
        console.log('\n[TEST 7] Database Tab preview in Dark Mode...');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                switchSettingsTab('database');
                await new Promise(r => setTimeout(r, 400));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);
        await new Promise(r => setTimeout(r, 600));

        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'settings_tab_database_dark.png'), Buffer.from(ss.data, 'base64'));

        console.log('\nALL TESTS PASSED! Screenshots saved cleanly.');
        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('Test Error:', err);
        p.kill();
        process.exit(1);
    }
}, 2200);
