const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function checkComputed() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9296',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9296/json/list');
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

    const res = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          openEditBillPaymentModal(28);
          const modal = document.querySelector('#billPaymentModal .modal');
          const cs = window.getComputedStyle(modal);
          return JSON.stringify({
            inlineStyle: modal.getAttribute('style'),
            computedWidth: cs.width,
            computedMaxWidth: cs.maxWidth,
            computedBoxSizing: cs.boxSizing,
            parentWidth: modal.parentElement.offsetWidth,
            windowInnerWidth: window.innerWidth
          });
        })()
      `,
      returnByValue: true
    });

    console.log('Computed:', JSON.parse(res.result.value));
    ws.close();
  } finally {
    chromeProc.kill();
  }
}

checkComputed();
