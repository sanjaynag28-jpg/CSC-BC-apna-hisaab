const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function testLiveZoom() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9286',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9286/json/list');
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

    // Open receipt modal with mock trans
    await sendCommand('Runtime.evaluate', {
      expression: `
        openSlipFromData({
          TransactionID: 'TXN-998822',
          RRN: '631713182593',
          RRN_UTR: '631713182593',
          CustomerName: 'Surendra Kumar',
          CustomerPhone: '7317274003',
          LinkedCustomerAadhaar: '231074188979',
          BankName: 'State Bank of India',
          Amount: 2000,
          ServiceType: 'Cash Withdrawal',
          PortalName: 'Digipay Lite',
          TransDate: new Date().toISOString()
        });
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    // Capture slip with Zoom button in header
    const slipShot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/bc_receipt_with_zoom_btn.png', Buffer.from(slipShot.data, 'base64'));
    console.log('Saved bc_receipt_with_zoom_btn.png');

    // Click Zoom button
    await sendCommand('Runtime.evaluate', {
      expression: `toggleSlipZoomMode(true);`
    });
    await new Promise(r => setTimeout(r, 1000));

    // Capture Zoom Mode Active (42px)
    const zoomShot = await sendCommand('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/bc_receipt_zoom_42px_active.png', Buffer.from(zoomShot.data, 'base64'));
    console.log('Saved bc_receipt_zoom_42px_active.png');

    // Close Zoom Mode via toggleSlipZoomMode(false)
    await sendCommand('Runtime.evaluate', {
      expression: `toggleSlipZoomMode(false);`
    });
    await new Promise(r => setTimeout(r, 600));

    // Verify slip is still active and visible
    const afterClose = await sendCommand('Runtime.evaluate', {
      expression: `({
        slipActive: document.getElementById('bcReceiptModal').classList.contains('active'),
        zoomVisible: document.getElementById('bcSlipZoomOverlay').style.display !== 'none'
      })`,
      returnByValue: true
    });
    console.log('After close test state:', afterClose.result.value);

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProc.kill();
  }
}

testLiveZoom();
