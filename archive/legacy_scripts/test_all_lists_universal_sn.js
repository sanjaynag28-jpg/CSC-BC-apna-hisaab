const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9292',
    '--window-size=1380,980',
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
        const res = await fetch('http://127.0.0.1:9292/json');
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

        // -------------------------------------------------------------
        // TEST 1: BC COUNTER (#bcTable)
        // -------------------------------------------------------------
        console.log('\n--- Testing BC Counter Table ---');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                if (typeof showPage === 'function') showPage('bc');
                if (typeof loadBCTransactions === 'function') await loadBCTransactions(1);
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));

        const bcCheck = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const th1 = document.querySelector('#bcTable thead th:first-child')?.innerText.trim();
                const btn1 = document.querySelector('#bcTable tbody tr:first-child .uni-sn-pill, #bcTable tbody tr:first-child .csc-sn-pill');
                return {
                    th1,
                    hasBtn: !!btn1,
                    snText: btn1 ? btn1.innerText.trim() : null,
                    totalRows: document.querySelectorAll('#bcTable tbody tr').length
                };
            })()`,
            returnByValue: true
        }, msgId++);
        console.log('BC Table Check:', bcCheck.result.value);

        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_table_sn_col1.png'), Buffer.from(ss.data, 'base64'));

        // Click BC Universal SN button!
        const bcClick = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const btn = document.querySelector('#bcTable tbody tr:first-child .uni-sn-pill, #bcTable tbody tr:first-child .csc-sn-pill');
                if (btn) btn.click();
                await new Promise(r => setTimeout(r, 600));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                const modal = document.getElementById('bcReceiptModal');
                const isVis = modal && (modal.classList.contains('active') || modal.style.display === 'flex' || modal.style.display === 'block');
                const title = modal ? modal.querySelector('.modal-title, h3, h2, div[style*=\"font-weight: 700\"]')?.innerText : '';
                return { clicked: !!btn, modalVisible: isVis, title };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);
        console.log('BC SN Click Result:', bcClick.result.value);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_sn_click_modal.png'), Buffer.from(ss.data, 'base64'));

        // Close BC modal
        await cdpSend(ws, 'Runtime.evaluate', { expression: `if (typeof closeModal === 'function') closeModal('bcReceiptModal');` }, msgId++);
        await new Promise(r => setTimeout(r, 400));

        // -------------------------------------------------------------
        // TEST 2: ALL TRANSACTIONS (#transMainTable)
        // -------------------------------------------------------------
        console.log('\n--- Testing Transactions Table ---');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof showPage === 'function') showPage('transactions');
                if (typeof loadTransactions === 'function') await loadTransactions(1);
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));

        const transCheck = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const th1 = document.querySelector('#transMainTable thead th:first-child')?.innerText.trim();
                const btn1 = document.querySelector('#transMainTable tbody tr:first-child .uni-sn-pill, #transMainTable tbody tr:first-child .csc-sn-pill');
                return {
                    th1,
                    hasBtn: !!btn1,
                    snText: btn1 ? btn1.innerText.trim() : null,
                    totalRows: document.querySelectorAll('#transMainTable tbody tr').length
                };
            })()`,
            returnByValue: true
        }, msgId++);
        console.log('Transactions Table Check:', transCheck.result.value);

        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'trans_table_sn_col1.png'), Buffer.from(ss.data, 'base64'));

        // Click Transaction Universal SN button!
        const transClick = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const btn = document.querySelector('#transMainTable tbody tr:first-child .uni-sn-pill, #transMainTable tbody tr:first-child .csc-sn-pill');
                if (btn) btn.click();
                await new Promise(r => setTimeout(r, 600));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                const modal = document.getElementById('transReceiptModal');
                const isVis = modal && (modal.classList.contains('active') || modal.style.display === 'flex' || modal.style.display === 'block');
                const title = modal ? modal.querySelector('.modal-title, h3, h2, div[style*=\"font-weight: 700\"]')?.innerText : '';
                return { clicked: !!btn, modalVisible: isVis, title };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);
        console.log('Trans SN Click Result:', transClick.result.value);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'trans_sn_click_modal.png'), Buffer.from(ss.data, 'base64'));

        // Close Trans modal
        await cdpSend(ws, 'Runtime.evaluate', { expression: `if (typeof closeModal === 'function') closeModal('transReceiptModal');` }, msgId++);
        await new Promise(r => setTimeout(r, 400));

        // -------------------------------------------------------------
        // TEST 3: INVOICES & BILLING (#invoicesTable)
        // -------------------------------------------------------------
        console.log('\n--- Testing Invoices Table ---');
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof showPage === 'function') showPage('billing');
                if (typeof loadInvoices === 'function') await loadInvoices();
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 800));

        const invCheck = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(() => {
                const th1 = document.querySelector('#invoicesTable thead th:first-child')?.innerText.trim();
                const btn1 = document.querySelector('#invoicesTable tbody tr:first-child .uni-sn-pill, #invoicesTable tbody tr:first-child .csc-sn-pill');
                return {
                    th1,
                    hasBtn: !!btn1,
                    snText: btn1 ? btn1.innerText.trim() : null,
                    totalRows: document.querySelectorAll('#invoicesTable tbody tr').length
                };
            })()`,
            returnByValue: true
        }, msgId++);
        console.log('Invoices Table Check:', invCheck.result.value);

        // Click Invoice Universal SN button!
        const invClick = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const btn = document.querySelector('#invoicesTable tbody tr:first-child .uni-sn-pill, #invoicesTable tbody tr:first-child .csc-sn-pill');
                if (btn) btn.click();
                await new Promise(r => setTimeout(r, 600));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                const modal = document.getElementById('invoiceViewModal');
                const isVis = modal && (modal.classList.contains('active') || modal.style.display === 'flex' || modal.style.display === 'block');
                const title = modal ? modal.querySelector('.modal-title, h3, h2')?.innerText : '';
                return { clicked: !!btn, modalVisible: isVis, title };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);
        console.log('Invoice SN Click Result:', invClick.result.value);

        // Close Invoice modal
        await cdpSend(ws, 'Runtime.evaluate', { expression: `if (typeof closeModal === 'function') closeModal('invoiceViewModal');` }, msgId++);
        await new Promise(r => setTimeout(r, 400));

        // -------------------------------------------------------------
        // TEST 4: CUSTOMER 360 PROFILE SUB-TABLES
        // -------------------------------------------------------------
        console.log('\n--- Testing Customer 360 Sub-tables ---');
        const c360Check = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                openCustomer360Modal(779, true);
                await new Promise(r => setTimeout(r, 900));
                if (typeof hideUniversalLoader === 'function') hideUniversalLoader();
                return {
                    khataTh1: document.querySelector('#c360KhataTable thead th:first-child')?.innerText.trim(),
                    bcTh1: document.querySelector('#c360BCTable thead th:first-child')?.innerText.trim(),
                    invTh1: document.querySelector('#c360InvoicesTable thead th:first-child')?.innerText.trim(),
                    cscTh1: document.querySelector('#c360CSCTable thead th:first-child')?.innerText.trim()
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);
        console.log('C360 Sub-tables Headers Check:', c360Check.result.value);

        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'c360_sn_subtables.png'), Buffer.from(ss.data, 'base64'));

        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 1500);
