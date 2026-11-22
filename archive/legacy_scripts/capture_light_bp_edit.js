const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function capture() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9296',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1500,900'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9296/json/list');
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

    // Toggle to Light Theme
    await sendCommand('Runtime.evaluate', {
      expression: `
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        if (typeof setTheme === 'function') setTheme('light');
        const nav = document.getElementById('nav-billpayments');
        if (nav) nav.click();
      `
    });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Capture table with Edit buttons in Light Theme
    const shot1 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(artifactDir, 'bp_table_edit_btn_light.png');
    fs.writeFileSync(p1, Buffer.from(shot1.data, 'base64'));
    console.log('Saved:', p1);

    ws.close();
  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    chromeProc.kill();
  }
}

capture();
