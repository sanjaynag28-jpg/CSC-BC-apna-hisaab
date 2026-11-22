const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function capture() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9295',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1500,900'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9295/json/list');
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

    await sendCommand('Page.enable');
    await sendCommand('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 3000));

    // Switch to billpayments page
    await sendCommand('Runtime.evaluate', {
      expression: `
        const nav = document.getElementById('nav-billpayments');
        if (nav) nav.click();
      `
    });
    await new Promise(r => setTimeout(r, 2500));

    // 1. Capture table with Edit buttons
    const shot1 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(artifactDir, 'bp_table_edit_btn_final.png');
    fs.writeFileSync(p1, Buffer.from(shot1.data, 'base64'));
    console.log('Saved:', p1);

    // 2. Open Edit modal for payment ID 28 and force hide universal loader
    await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          await openEditBillPaymentModal(28);
          if (typeof hideUniversalLoader === 'function') hideUniversalLoader(true);
          const loader = document.getElementById('universalLoader');
          if (loader) loader.classList.remove('active');
        })()
      `,
      awaitPromise: true
    });
    await new Promise(r => setTimeout(r, 1000));

    // 2. Capture edit modal
    const shot2 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p2 = path.join(artifactDir, 'bp_modal_edit_mode_final.png');
    fs.writeFileSync(p2, Buffer.from(shot2.data, 'base64'));
    console.log('Saved:', p2);

    ws.close();
  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    chromeProc.kill();
  }
}

capture();
