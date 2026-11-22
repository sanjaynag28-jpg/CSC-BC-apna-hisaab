const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9248',
    '--window-size=1440,900',
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
        const res = await fetch('http://127.0.0.1:9248/json');
        const tabs = await res.json();
        const pageTab = tabs.find(t => t.url.includes('localhost:3000'));
        if (!pageTab) throw new Error('Tab not found');

        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r));

        let msgId = 1;
        await cdpSend(ws, 'Page.enable', {}, msgId++);
        await cdpSend(ws, 'Runtime.enable', {}, msgId++);

        // Test handlers
        const testRes = await cdpSend(ws, 'Runtime.evaluate', {
            expression: `(async () => {
                const results = [];
                // Test 1: IDs presence
                const requiredIds = [
                    'pipeCashBal', 'pipeDigipayBal', 'pipeLiteBal', 'pipeBankBal',
                    'bcTodayWithdrawal', 'bcCountWithdrawal', 'bcTodayDeposit', 'bcCountDeposit',
                    'bcTodayTransfer', 'bcCountTransfer', 'bcTodayQR', 'bcCountQR',
                    'bcTodayProfit', 'bcProfitBreakdown', 'bcGallaCash', 'bcGallaSub'
                ];
                const missing = requiredIds.filter(id => !document.getElementById(id));
                results.push({ test: 'Required IDs Present', passed: missing.length === 0, missing });

                // Test 2: Dashboard data populated
                if (typeof loadBCDashboard === 'function') await loadBCDashboard();
                const cashText = document.getElementById('pipeCashBal')?.textContent;
                results.push({ test: 'Cash Balance Populated', passed: !!cashText && cashText !== '₹0.00', value: cashText });

                // Test 3: Passbook open function works
                let passbookModalOpened = false;
                if (typeof openPipelinePassbook === 'function') {
                    openPipelinePassbook('cash');
                    const modal = document.getElementById('accountPassbookModal');
                    passbookModalOpened = modal && (modal.classList.contains('show') || modal.style.display !== 'none');
                    if (typeof closeModal === 'function') closeModal('accountPassbookModal');
                }
                results.push({ test: 'openPipelinePassbook triggers', passed: passbookModalOpened });

                // Test 4: Settlement modal open works
                let settlementModalOpened = false;
                if (typeof openSettlementModal === 'function') {
                    await openSettlementModal('ATM Cash Refill');
                    const modal = document.getElementById('bcSettlementModal');
                    settlementModalOpened = !!(modal && (modal.classList.contains('show') || modal.style.display !== 'none'));
                    if (typeof closeModal === 'function') closeModal('bcSettlementModal');
                }
                results.push({ test: 'openSettlementModal triggers', passed: settlementModalOpened });

                return results;
            })()`,
            awaitPromise: true,
            returnByValue: true
        }, msgId++);

        console.log('Interaction Test Results:', JSON.stringify(testRes.result.value, null, 2));

        ws.close();
        p.kill();
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        p.kill();
        process.exit(1);
    }
}, 3000);
