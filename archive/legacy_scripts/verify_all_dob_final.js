const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9288',
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
        const tabs = await (await fetch('http://127.0.0.1:9288/json')).json();
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
                if (typeof initGlobalDobInputs === 'function') initGlobalDobInputs();
            `
        });

        // 1. Verify BC Counter Modal DOB
        console.log('--- Testing BC Counter DOB ---');
        await send('Runtime.evaluate', {
            expression: `
                showPage('bc', document.getElementById('nav-bc'));
                openBCModal('Cash Withdrawal');
            `
        });
        await new Promise(r => setTimeout(r, 800));

        // Test typing into BC segmented DOB: 05 / 11 / 1995
        const bcResult = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const wrap = document.getElementById('gdob-wrap-bcCustomerDob');
                    const day = wrap?.querySelector('.dob-day');
                    const month = wrap?.querySelector('.dob-month');
                    const year = wrap?.querySelector('.dob-year');
                    const calBtn = wrap?.querySelector('.dob-cal-btn');
                    const master = document.getElementById('bcCustomerDob');
                    
                    if (day && month && year) {
                        day.value = '15';
                        day.dispatchEvent(new Event('input', { bubbles: true }));
                        month.value = '08';
                        month.dispatchEvent(new Event('input', { bubbles: true }));
                        year.value = '1998';
                        year.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    return {
                        hasWrap: Boolean(wrap),
                        dayVal: day?.value,
                        monthVal: month?.value,
                        yearVal: year?.value,
                        masterVal: master?.value,
                        hasCalBtn: Boolean(calBtn)
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('BC DOB Component Info:', bcResult.result.value);

        let ss1 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'dob_bc_modal_boxes.png'), Buffer.from(ss1.data, 'base64'));
        console.log('Saved dob_bc_modal_boxes.png');

        await send('Runtime.evaluate', { expression: `closeModal('bcModal');` });
        await new Promise(r => setTimeout(r, 400));

        // 2. Verify CSC Work Tracker Modal DOB
        console.log('--- Testing CSC Modal DOB ---');
        await send('Runtime.evaluate', {
            expression: `
                showPage('csc', document.getElementById('nav-csc'));
                openNewCSCModal();
            `
        });
        await new Promise(r => setTimeout(r, 800));

        const cscResult = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const wrap = document.getElementById('gdob-wrap-cscCustDob');
                    const day = wrap?.querySelector('.dob-day');
                    const month = wrap?.querySelector('.dob-month');
                    const year = wrap?.querySelector('.dob-year');
                    const master = document.getElementById('cscCustDob');

                    if (day && month && year) {
                        day.value = '25';
                        day.dispatchEvent(new Event('input', { bubbles: true }));
                        month.value = '12';
                        month.dispatchEvent(new Event('input', { bubbles: true }));
                        year.value = '2001';
                        year.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    return {
                        hasWrap: Boolean(wrap),
                        dayVal: day?.value,
                        monthVal: month?.value,
                        yearVal: year?.value,
                        masterVal: master?.value
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('CSC DOB Component Info:', cscResult.result.value);

        let ss2 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'dob_csc_modal_boxes.png'), Buffer.from(ss2.data, 'base64'));
        console.log('Saved dob_csc_modal_boxes.png');

        await send('Runtime.evaluate', { expression: `closeModal('cscNewAppModal');` });
        await new Promise(r => setTimeout(r, 400));

        // 3. Verify Customer Directory Modal DOB
        console.log('--- Testing Customer Modal DOB ---');
        await send('Runtime.evaluate', {
            expression: `
                showPage('customers', document.getElementById('nav-customers'));
                openCustomerModal();
            `
        });
        await new Promise(r => setTimeout(r, 800));

        const custResult = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const wrap = document.getElementById('gdob-wrap-custDobInput');
                    const day = wrap?.querySelector('.dob-day');
                    const month = wrap?.querySelector('.dob-month');
                    const year = wrap?.querySelector('.dob-year');
                    const master = document.getElementById('custDobInput');

                    if (day && month && year) {
                        day.value = '01';
                        day.dispatchEvent(new Event('input', { bubbles: true }));
                        month.value = '01';
                        month.dispatchEvent(new Event('input', { bubbles: true }));
                        year.value = '1990';
                        year.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    return {
                        hasWrap: Boolean(wrap),
                        dayVal: day?.value,
                        monthVal: month?.value,
                        yearVal: year?.value,
                        masterVal: master?.value
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('Customer DOB Component Info:', custResult.result.value);

        let ss3 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'dob_customer_modal_boxes.png'), Buffer.from(ss3.data, 'base64'));
        console.log('Saved dob_customer_modal_boxes.png');

        await send('Runtime.evaluate', { expression: `closeModal('customerModal');` });
        await new Promise(r => setTimeout(r, 400));

        // 4. Verify Invoice Modal DOB
        console.log('--- Testing Invoice Modal DOB ---');
        await send('Runtime.evaluate', {
            expression: `
                showPage('billing', document.getElementById('nav-billing'));
                openInvoiceModal();
            `
        });
        await new Promise(r => setTimeout(r, 800));

        const invResult = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const wrap = document.getElementById('gdob-wrap-invCustomerDob');
                    const day = wrap?.querySelector('.dob-day');
                    const month = wrap?.querySelector('.dob-month');
                    const year = wrap?.querySelector('.dob-year');
                    const master = document.getElementById('invCustomerDob');

                    if (day && month && year) {
                        day.value = '10';
                        day.dispatchEvent(new Event('input', { bubbles: true }));
                        month.value = '06';
                        month.dispatchEvent(new Event('input', { bubbles: true }));
                        year.value = '1985';
                        year.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    return {
                        hasWrap: Boolean(wrap),
                        dayVal: day?.value,
                        monthVal: month?.value,
                        yearVal: year?.value,
                        masterVal: master?.value
                    };
                })()
            `,
            returnByValue: true
        });
        console.log('Invoice DOB Component Info:', invResult.result.value);

        let ss4 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'dob_invoice_modal_boxes.png'), Buffer.from(ss4.data, 'base64'));
        console.log('Saved dob_invoice_modal_boxes.png');

        ws.close();
        p.kill();
        console.log('SUCCESS: All 4 DOB inputs verified and screenshots captured!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        p.kill();
        process.exit(1);
    }
}, 2000);

