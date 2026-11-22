const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function capture() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9294',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9294/json/list');
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
        (() => {
          const nav = document.getElementById('nav-billpayments');
          if (nav) nav.click();
          openNewBillPaymentModal();
          
          const sel = document.getElementById('bpCustomerSelect');
          if (sel) {
            sel.value = '729';
            if (sel._ssInstance) sel._ssInstance.syncFromNative();
            onBPCustomerSelectChange();
          }

          const bInp = document.getElementById('bpModalBillAmount');
          if (bInp) {
            bInp.value = '100';
            calculateBPProfitInModal();
          }

          const cashRecInp = document.getElementById('bpModalCashReceived');
          if (cashRecInp) {
            cashRecInp.value = '105';
            onBPCashReceivedInput();
          }
        })()
      `
    });
    await new Promise(r => setTimeout(r, 1200));

    const shot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(artifactDir, 'bp_modal_wide_1240px_live.png');
    fs.writeFileSync(p1, Buffer.from(shot.data, 'base64'));
    console.log('Saved Screenshot:', p1);

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

capture();
