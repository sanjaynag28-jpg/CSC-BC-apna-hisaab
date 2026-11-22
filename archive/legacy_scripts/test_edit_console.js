const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testConsole() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9293',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1550,920'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9293/json/list');
    const list = await listRes.json();
    const pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No target');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

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

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('Console:', data.params.type, data.params.args.map(a => a.value || a.description).join(' '));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        console.log('EXCEPTION:', JSON.stringify(data.params.exceptionDetails));
      }
    });

    await sendCommand('Runtime.enable');
    await sendCommand('Page.enable');
    await sendCommand('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 3000));

    await sendCommand('Runtime.evaluate', {
      expression: `
        document.getElementById('nav-billpayments').click();
      `
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Calling openEditBillPaymentModal(28)...');
    const evalRes = await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            await openEditBillPaymentModal(28);
            return 'SUCCESS';
          } catch(e) {
            return 'ERROR: ' + e.message + ' ' + e.stack;
          }
        })()
      `,
      awaitPromise: true
    });
    console.log('Eval result:', evalRes);

    await new Promise(r => setTimeout(r, 2000));

    // Check modal visibility
    const modalCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const m = document.getElementById('billPaymentModal');
          const title = document.getElementById('bpModalTitle')?.innerText;
          const pid = document.getElementById('bpPaymentId')?.value;
          const cust = document.getElementById('bpModalCustName')?.value;
          const amt = document.getElementById('bpModalBillAmount')?.value;
          const display = m ? window.getComputedStyle(m).display : 'none';
          const zIndex = m ? window.getComputedStyle(m).zIndex : '0';
          const loader = document.getElementById('universalApiLoaderModal') || document.querySelector('.universal-loader-modal');
          const loaderDisplay = loader ? window.getComputedStyle(loader).display : 'none';
          return { display, zIndex, title, pid, cust, amt, loaderDisplay };
        })()
      `,
      returnByValue: true
    });
    console.log('Modal check:', modalCheck.result.value);

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    chromeProc.kill();
  }
}

testConsole();
