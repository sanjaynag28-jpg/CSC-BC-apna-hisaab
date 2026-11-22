const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9288',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  const listRes = await fetch('http://127.0.0.1:9288/json/list');
  const list = await listRes.json();
  const pageTarget = list.find(t => t.type === 'page');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(res => { ws.onopen = res; });

  let msgId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      const handler = (evt) => {
        const d = JSON.parse(evt.data);
        if (d.id === id) {
          ws.removeEventListener('message', handler);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 3000));

  const evalRes = await send('Runtime.evaluate', {
    expression: 'typeof showReceiptModal'
  });
  console.log('typeof showReceiptModal:', evalRes);

  const evalCall = await send('Runtime.evaluate', {
    expression: `
      (function() {
        try {
          showReceiptModal({
            TransactionID: 'TXN-123456',
            RRN: '631713182593',
            CustomerName: 'Surendra Kumar',
            CustomerPhone: '7317274003',
            LinkedCustomerAadhaar: '231074188979',
            Amount: 2000,
            TransDate: new Date().toISOString()
          });
          return 'MODAL_OPEN_SUCCESS';
        } catch(e) {
          return 'ERROR: ' + e.stack;
        }
      })()
    `
  });
  console.log('evalCall result:', evalCall);

  // Check active modals
  const activeModals = await send('Runtime.evaluate', {
    expression: 'activeModalStack'
  });
  console.log('activeModalStack:', activeModals);

  ws.close();
  chromeProc.kill();
}
run();
