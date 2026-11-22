const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function checkDOM() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9297',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9297/json/list');
    const list = await listRes.json();
    const pageTarget = list.find(t => t.type === 'page');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    function sendCommand(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCommand('Page.enable');
    await sendCommand('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 3000));

    await sendCommand('Runtime.evaluate', {
      expression: `
        const nav = document.getElementById('nav-billpayments');
        if (nav) nav.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    const res = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          openEditBillPaymentModal(28);
          const modal = document.querySelector('#billPaymentModal .modal');
          const loader = document.getElementById('universalLoader');
          return JSON.stringify({
            modalWidth: modal ? modal.offsetWidth : 0,
            modalActive: document.getElementById('billPaymentModal').classList.contains('active'),
            loaderActive: loader ? loader.classList.contains('active') : false,
            providerWidth: document.getElementById('bpModalProvider').offsetWidth,
            consumerWidth: document.getElementById('bpModalConsumerNo').offsetWidth,
            payableWidth: document.getElementById('bpModalCustomerPayable').offsetWidth,
            cashRecWidth: document.getElementById('bpModalCashReceived').offsetWidth,
            dueWidth: document.getElementById('bpModalCustomerDue').offsetWidth,
            providerValue: document.getElementById('bpModalProvider').value,
            consumerValue: document.getElementById('bpModalConsumerNo').value
          });
        })()
      `,
      returnByValue: true
    });

    console.log('Result:', JSON.parse(res.result.value));
    ws.close();
  } finally {
    chromeProc.kill();
  }
}

checkDOM();
