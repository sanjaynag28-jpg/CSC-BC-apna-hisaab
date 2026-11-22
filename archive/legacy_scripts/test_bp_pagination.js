const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const previewDir = "C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69";

async function testBPPagination() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9296',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1360,950'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9296/json/list');
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
    await new Promise(r => setTimeout(r, 2500));

    // Navigate to Bill Payments page
    await send('Runtime.evaluate', {
      expression: `
        showPage('billpayments');
        loadBillPaymentsPage(1);
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    // Scroll down to table bottom to see pagination clearly
    await send('Runtime.evaluate', {
      expression: `
        const el = document.getElementById('bpTableFooter');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'end' });
      `
    });
    await new Promise(r => setTimeout(r, 500));

    // Capture Dark Theme Bill Payments Page with Pagination
    const darkShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/bp_pagination_live_dark.png', Buffer.from(darkShot.data, 'base64'));
    console.log('Saved bp_pagination_live_dark.png');

    // Switch to Light Theme
    await send('Runtime.evaluate', {
      expression: `
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.remove('dark', 'dark-theme');
        document.body.classList.add('light-theme');
      `
    });
    await new Promise(r => setTimeout(r, 800));

    // Capture Light Theme Bill Payments Page with Pagination
    const lightShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/bp_pagination_live_light.png', Buffer.from(lightShot.data, 'base64'));
    console.log('Saved bp_pagination_live_light.png');

    // Also get the pagination text for verification
    const pageState = await send('Runtime.evaluate', {
      expression: `({
        info: document.getElementById('bpPaginationInfo')?.textContent?.trim(),
        btnsCount: document.getElementById('bpPaginationBtns')?.children?.length,
        btnsHtml: document.getElementById('bpPaginationBtns')?.innerHTML
      })`,
      returnByValue: true
    });
    console.log('Pagination state:', pageState.result.value);

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProc.kill();
  }
}

testBPPagination();
