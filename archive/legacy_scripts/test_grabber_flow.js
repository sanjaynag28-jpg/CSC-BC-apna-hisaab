const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';

const sampleReceipt = `Transaction Receipt

Payment Status: SUCCESS

Transaction ID: CZUCW17937850055120593N8RFW45487472
Balance: ₹261.78
Date: November 04, 2026 03:06:48 PM
Amount: ₹2,000
Agent ID: 411632300012
Location: Sanjay Nag Sitapur, 183 UPIN
Agent Name: Sanjay Nag
Terminal ID: 411632300012
Authorize Code: 723c970595bf4e2aadfaab82d4781e03
Customer ID: XXXX XXXX 6431
Bank Ref. No.: 630815487472
RRN: 630815487472
Bank Name: Indian Bank
Transaction Type: Cash Withdrawal (AEPS)
Device Type: WEB
CSC Logo
CSC E-Governance
Services India Limited
Indus Bank Logo`;

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9247',
    '--window-size=1400,950',
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
        const res = await fetch('http://127.0.0.1:9247/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Trigger handleExtensionGrabbedEntry with sample receipt data
        const grabData = {
            ServiceType: 'Cash Withdrawal',
            CustomerName: '',
            Mobile: '',
            Aadhaar: 'XXXX XXXX 6431',
            CustomerAadhaarLast4: '6431',
            BankName: 'Indian Bank',
            AccountNumber: '',
            AccountBalance: 261.78,
            RRN_UTR: '630815487472',
            TransactionID: 'CZUCW17937850055120593N8RFW45487472',
            BankRefNo: '630815487472',
            Amount: 2000,
            CustomerCharge: 10,
            CommissionEarned: 11.92,
            TransDate: '2026-11-04',
            TransTime: '03:06:48 PM',
            Status: 'Success',
            AgentID: '411632300012',
            AgentName: 'Sanjay Nag',
            TerminalID: '411632300012',
            AuthorizeCode: '723c970595bf4e2aadfaab82d4781e03',
            PortalName: 'CSC Digipay (IndusInd Bank AEPS)'
        };

        const result = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                if (typeof window.handleExtensionGrabbedEntry === 'function') {
                    window.handleExtensionGrabbedEntry({
                        type: 'AEPS',
                        data: ${JSON.stringify(grabData)},
                        returnTabId: 101
                    });
                }
                return {
                    serviceVal: document.getElementById('bcServiceTypeVal')?.value,
                    bank: document.getElementById('bcBankName')?.value,
                    balance: document.getElementById('bcAccountBalance')?.value,
                    rrn: document.getElementById('bcRRN')?.value,
                    amount: document.getElementById('bcAmount')?.value,
                    aadhaar: document.getElementById('bcAadhaar')?.value,
                    date: document.getElementById('bcTransDate')?.value,
                    notes: document.getElementById('bcNotes')?.value
                };
            })()`,
            returnByValue: true
        }, msgId++);

        console.log('DOM populated values in #bcModal:', result.result.value);

        await new Promise(r => setTimeout(r, 600));

        // Screenshot
        const shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
        fs.writeFileSync(path.join(previewDir, 'bc_modal_extension_grabbed_live.png'), Buffer.from(shot.data, 'base64'));
        console.log('Saved bc_modal_extension_grabbed_live.png');

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error in test_grabber_flow:', e);
        p.kill();
        process.exit(1);
    }
}, 2500);

