const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function testReceiptSize() {
  console.log('Testing Screen Receipt Size & Rendering...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9255',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1050'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9255/json/list');
    const list = await listRes.json();
    const ws = new WebSocket(list[0].webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

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

    // Open Bill Receipt Modal for Payment 28 (or the first available bill payment)
    const evalRes = await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          // Open bill payments tab first
          const nav = document.getElementById('nav-billpayments');
          if (nav) nav.click();
          await new Promise(r => setTimeout(r, 1000));

          // Call openBillReceiptModal(28) or find first payment id
          let pid = 28;
          if (typeof allBillPayments !== 'undefined' && allBillPayments.length > 0) {
            pid = allBillPayments[0].PaymentID;
          }
          await openBillReceiptModal(pid);
          await new Promise(r => setTimeout(r, 1200));

          const modal = document.querySelector('#billReceiptModal .modal');
          const slip = document.getElementById('billReceiptPrintArea');
          const slipRect = slip.getBoundingClientRect();
          const modalRect = modal.getBoundingClientRect();

          return {
            pid,
            modalWidth: modalRect.width,
            modalHeight: modalRect.height,
            slipWidth: slipRect.width,
            slipHeight: slipRect.height,
            slipZoom: window.getComputedStyle(slip).zoom
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Receipt Evaluation Result:', evalRes.result ? evalRes.result.value : evalRes);
    await new Promise(r => setTimeout(r, 500));

    const shot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p = path.join(artifactDir, 'bill_receipt_screen_large_preview.png');
    fs.writeFileSync(p, Buffer.from(shot.data, 'base64'));
    console.log('Saved Large Receipt Screenshot:', p);

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProc.kill();
  }
}

testReceiptSize();
