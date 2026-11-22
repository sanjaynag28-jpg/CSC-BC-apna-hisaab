const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function capture() {
  console.log('Testing wide modal & instant edit opening...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9299',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9299/json/list');
    const list = await listRes.json();
    const pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

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

    await sendCommand('Page.enable');
    await sendCommand('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 3000));

    // 1. Switch to billpayments tab
    console.log('Switching to bill payments tab...');
    await sendCommand('Runtime.evaluate', {
      expression: `
        const nav = document.getElementById('nav-billpayments');
        if (nav) nav.click();
      `
    });
    await new Promise(r => setTimeout(r, 2000));

    // 2. Click Edit on the first bill payment record (or PaymentID 28)
    console.log('Opening edit modal for payment 28...');
    const editEval = await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          const t0 = performance.now();
          await openEditBillPaymentModal(28);
          const t1 = performance.now();
          const loader = document.getElementById('universalLoader');
          return {
            openTimeMs: (t1 - t0).toFixed(1),
            loaderActive: loader ? loader.classList.contains('active') : false,
            modalActive: document.getElementById('billPaymentModal').classList.contains('active'),
            modalWidth: document.querySelector('#billPaymentModal .modal').offsetWidth,
            providerVal: document.getElementById('bpModalProvider').value,
            consumerVal: document.getElementById('bpModalConsumerNo').value,
            billNoVal: document.getElementById('bpModalBillNo').value
          };
        })()
      `,
      awaitPromise: true
    });

    console.log('Edit Modal Diagnostic:', editEval.result ? editEval.result.value : editEval);
    await new Promise(r => setTimeout(r, 1000));

    // Capture: Extra Wide Modal without any clipping
    const shot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(artifactDir, 'bp_modal_extra_wide_1320px.png');
    fs.writeFileSync(p1, Buffer.from(shot.data, 'base64'));
    console.log('Saved Screenshot:', p1);

    ws.close();
    console.log('Wide Modal & Edit Speed Test Complete!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProc.kill();
  }
}

capture();
