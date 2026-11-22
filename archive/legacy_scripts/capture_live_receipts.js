const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9288',
    '--window-size=1280,1050',
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

        // 1. Open bcReceiptModal (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                const sampleBC = {
                    BCID: 167,
                    SNCode: 'SN-1294',
                    TransDate: new Date().toISOString(),
                    TransTime: '11:56:59',
                    ServiceType: 'Cash Withdrawal',
                    CustomerName: 'Geeta Devi',
                    CustomerID: 781,
                    CustomerPhone: '9616928635',
                    BankName: 'State Bank of India',
                    CustomerAadhaarLast4: '6431',
                    RRN_UTR: '630815487472',
                    AccountBalance: 261.78,
                    Amount: 2000
                };
                openSlipFromData(encodeURIComponent(JSON.stringify(sampleBC)));
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        let ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'live_bc_receipt_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('1. Saved live_bc_receipt_light.png');

        // 2. Open bcReceiptModal (Dark Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('dark');
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 400));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'live_bc_receipt_dark.png'), Buffer.from(ss.data, 'base64'));
        console.log('2. Saved live_bc_receipt_dark.png');

        // 3. Open khataReceiptModal (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof applyTheme === 'function') applyTheme('light');
                closeModal('bcReceiptModal');
                const sampleKhata = {
                    KhataID: 42,
                    SNCode: 'SN-1302',
                    CustomerName: 'Ram Charan',
                    CustomerID: 780,
                    CustomerPhone: '7897043288',
                    EntryType: 'Got',
                    Amount: 1500,
                    EntryDate: new Date().toISOString(),
                    PaymentMode: 'Cash',
                    ReferenceNo: 'REC-2026-0042',
                    Description: 'Udhaar Chhota Hisaab Jama Kiya',
                    RunningBalance: 500
                };
                openKhataSlipFromData(sampleKhata);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'live_khata_receipt_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('3. Saved live_khata_receipt_light.png');

        // 4. Open transReceiptModal (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                closeModal('khataReceiptModal');
                const sampleTrans = {
                    TransactionID: 55,
                    SNCode: 'SN-1288',
                    TransType: 'Expense',
                    Amount: 450,
                    TransDate: new Date().toISOString(),
                    AccountName: 'Cash in Hand (Galla)',
                    CategoryName: 'Shop Maintenance / Stationary',
                    PartyName: 'Verma Printing Press',
                    Reference: 'BILL-492',
                    Description: 'Receipt book & A4 Paper Rim purchase'
                };
                openTransVoucherFromData(sampleTrans);
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'live_trans_voucher_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('4. Saved live_trans_voucher_light.png');

        // 5. Open cscReceiptModal (Light Mode)
        await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                closeModal('transReceiptModal');
                const sampleCSC = {
                    AppID: 99,
                    SNCode: 'SN-1310',
                    AckNumber: 'CSC-UP-2026-8841',
                    ApplyDate: new Date().toISOString(),
                    CreatedAt: new Date().toISOString(),
                    CustomerName: 'Kanti Devi',
                    CustomerPhone: '9616928635',
                    CustomerAadhaar: '914288889142',
                    DateOfBirth: '1985-01-01',
                    ServiceType: 'Ayushman Bharat Golden Card',
                    ExpectedDate: new Date(Date.now() + 7*86400000).toISOString(),
                    Status: 'Under Process',
                    Department: 'Health & Family Welfare UP',
                    GovtFee: 0,
                    OperatorFee: 50,
                    TotalFee: 50,
                    PaidAmount: 50,
                    DueAmount: 0
                };
                renderCSCReceipt(sampleCSC);
                openModal('cscReceiptModal');
            })()`,
            awaitPromise: true
        }, msgId++);

        await new Promise(r => setTimeout(r, 600));
        ss = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'live_csc_receipt_light.png'), Buffer.from(ss.data, 'base64'));
        console.log('5. Saved live_csc_receipt_light.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (err) {
        console.error('CDP Error:', err);
        p.kill();
        process.exit(1);
    }
}, 1500);
