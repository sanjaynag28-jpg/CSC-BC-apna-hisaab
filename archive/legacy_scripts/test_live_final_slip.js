const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const previewDir = "C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69";

async function testBothThemes() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9295',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9295/json/list');
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

    // 1. Open slip in Dark Theme (default)
    await send('Runtime.evaluate', {
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
    await new Promise(r => setTimeout(r, 1000));

    // Capture Dark Theme Slip
    const darkShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/live_slip_final_dark.png', Buffer.from(darkShot.data, 'base64'));
    console.log('Saved live_slip_final_dark.png');

    // Open Zoom Mode in Dark Theme
    await send('Runtime.evaluate', { expression: 'toggleSlipZoomMode(true)' });
    await new Promise(r => setTimeout(r, 800));
    const darkZoomShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/live_slip_final_dark_zoom.png', Buffer.from(darkZoomShot.data, 'base64'));
    console.log('Saved live_slip_final_dark_zoom.png');

    // Close Zoom Mode
    await send('Runtime.evaluate', { expression: 'toggleSlipZoomMode(false)' });
    await new Promise(r => setTimeout(r, 600));

    // 2. Switch to Light Theme
    await send('Runtime.evaluate', {
      expression: `
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.remove('dark', 'dark-theme');
        document.body.classList.add('light-theme');
      `
    });
    await new Promise(r => setTimeout(r, 1000));

    // Capture Light Theme Slip
    const lightShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/live_slip_final_light.png', Buffer.from(lightShot.data, 'base64'));
    console.log('Saved live_slip_final_light.png');

    // Open Zoom Mode in Light Theme
    await send('Runtime.evaluate', { expression: 'toggleSlipZoomMode(true)' });
    await new Promise(r => setTimeout(r, 800));
    const lightZoomShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/live_slip_final_light_zoom.png', Buffer.from(lightZoomShot.data, 'base64'));
    console.log('Saved live_slip_final_light_zoom.png');

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProc.kill();
  }
}

testBothThemes();
