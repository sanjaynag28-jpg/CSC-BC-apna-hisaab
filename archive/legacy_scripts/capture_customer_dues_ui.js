const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function capture() {
  console.log('Launching headless Chrome for visual testing...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9298',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1560,980'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9298/json/list');
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

    // 1. Switch to billpayments page and open modal
    console.log('Opening Bill Payments tab and modal...');
    await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const nav = document.getElementById('nav-billpayments');
          if (nav) nav.click();
          openNewBillPaymentModal();
          
          // Select customer 729 (Ramesh Kumar - who has dues)
          const sel = document.getElementById('bpCustomerSelect');
          if (sel) {
            sel.value = '729';
            if (sel._ssInstance) sel._ssInstance.syncFromNative();
            onBPCustomerSelectChange();
          }

          // Enter Bill Amount = 100
          const bInp = document.getElementById('bpModalBillAmount');
          if (bInp) {
            bInp.value = '100';
            calculateBPProfitInModal();
          }
        })()
      `
    });
    await new Promise(r => setTimeout(r, 1200));

    // Capture 1: Wide Modal with Universal Due Alert banner
    const shot1 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(artifactDir, 'bp_modal_wide_due_alert.png');
    fs.writeFileSync(p1, Buffer.from(shot1.data, 'base64'));
    console.log('Saved Screenshot 1:', p1);

    // 2. Click "👁️ हिसाब देखें" to open the customer dues detail popup
    console.log('Opening Customer Due Detail Modal...');
    await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          await openCustomerDueDetailModal(729);
        })()
      `,
      awaitPromise: true
    });
    await new Promise(r => setTimeout(r, 1200));

    // Capture 2: Customer Due Breakdown Popup
    const shot2 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p2 = path.join(artifactDir, 'customer_due_detail_popup.png');
    fs.writeFileSync(p2, Buffer.from(shot2.data, 'base64'));
    console.log('Saved Screenshot 2:', p2);

    // 3. Close due detail popup and test typing Partial Cash (₹105 instead of ₹110)
    console.log('Simulating cash shortfall: ₹105 received against ₹110 payable...');
    await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          closeModal('customerDueDetailModal');
          const cashRecInp = document.getElementById('bpModalCashReceived');
          if (cashRecInp) {
            cashRecInp.value = '105';
            onBPCashReceivedInput();
          }
        })()
      `
    });
    await new Promise(r => setTimeout(r, 1000));

    // Capture 3: Partial Cash short-fall showing ₹5 Dukan Ka Udhaar
    const shot3 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p3 = path.join(artifactDir, 'bp_modal_partial_cash_shortfall.png');
    fs.writeFileSync(p3, Buffer.from(shot3.data, 'base64'));
    console.log('Saved Screenshot 3:', p3);

    ws.close();
    console.log('Visual Testing Completed Successfully!');
  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    chromeProc.kill();
  }
}

capture();
