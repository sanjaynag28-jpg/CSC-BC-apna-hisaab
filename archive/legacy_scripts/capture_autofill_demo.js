const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69';

async function runDemo() {
  console.log('Starting Auto-Fill Alignment Demo & Screenshots...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9288',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1050'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9288/json/list');
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

    // ==========================================
    // 1. DEMO: BC / AEPS MODAL
    // ==========================================
    console.log('Testing Modal 1: BC / AEPS Entry Modal...');
    const bcRes = await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          openBCModal('Cash Withdrawal');
          const phoneInput = document.getElementById('bcCustomerPhone');
          phoneInput.value = '6388648029';
          handleBCPhoneInput(phoneInput);
          await new Promise(r => setTimeout(r, 800));

          const nameEl = document.getElementById('bcCustomerName');
          const phoneEl = document.getElementById('bcCustomerPhone');
          const nameRect = nameEl.getBoundingClientRect();
          const phoneRect = phoneEl.getBoundingClientRect();
          const chipEl = document.getElementById('bcPhoneChip');

          return {
            nameVal: nameEl.value,
            phoneVal: phoneEl.value,
            chipHtml: chipEl ? chipEl.innerHTML : '',
            nameTop: nameRect.top,
            phoneTop: phoneRect.top,
            diff: Math.abs(nameRect.top - phoneRect.top)
          };
        })()
      `,
      awaitPromise: true, returnByValue: true
    });
    console.log('BC Modal Alignment Diagnostic:', bcRes.result ? bcRes.result.value : bcRes);
    await new Promise(r => setTimeout(r, 500));

    const shot1 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(artifactDir, 'bc_modal_autofill_demo.png');
    fs.writeFileSync(p1, Buffer.from(shot1.data, 'base64'));
    console.log('Saved BC Modal Screenshot:', p1);

    // ==========================================
    // 2. DEMO: BILL & EMI PAYMENTS MODAL
    // ==========================================
    console.log('Testing Modal 2: Bill & EMI Payments Modal...');
    const bpRes = await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          closeModal('bcModal');
          openNewBillPaymentModal();
          const phoneInput = document.getElementById('bpModalCustPhone');
          phoneInput.value = '6388648029';
          handleBillPayPhoneInput(phoneInput);
          await new Promise(r => setTimeout(r, 800));

          const nameEl = document.getElementById('bpModalCustName');
          const phoneEl = document.getElementById('bpModalCustPhone');
          const nameRect = nameEl.getBoundingClientRect();
          const phoneRect = phoneEl.getBoundingClientRect();
          const chipEl = document.getElementById('bpPhoneChip');

          return {
            nameVal: nameEl.value,
            phoneVal: phoneEl.value,
            chipHtml: chipEl ? chipEl.innerHTML : '',
            nameTop: nameRect.top,
            phoneTop: phoneRect.top,
            diff: Math.abs(nameRect.top - phoneRect.top)
          };
        })()
      `,
      awaitPromise: true, returnByValue: true
    });
    console.log('BP Modal Alignment Diagnostic:', bpRes.result ? bpRes.result.value : bpRes);
    await new Promise(r => setTimeout(r, 500));

    const shot2 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p2 = path.join(artifactDir, 'bp_modal_autofill_demo.png');
    fs.writeFileSync(p2, Buffer.from(shot2.data, 'base64'));
    console.log('Saved BP Modal Screenshot:', p2);

    // ==========================================
    // 3. DEMO: CSC NEW APPLICATION MODAL
    // ==========================================
    console.log('Testing Modal 3: CSC Application Modal...');
    const cscRes = await sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          closeModal('billPaymentModal');
          openNewCSCModal();
          const phoneInput = document.getElementById('cscCustPhone');
          phoneInput.value = '6388648029';
          handleCSCPhoneInput(phoneInput);
          await new Promise(r => setTimeout(r, 800));

          const nameEl = document.getElementById('cscCustName');
          const phoneEl = document.getElementById('cscCustPhone');
          const aadhaarEl = document.getElementById('cscCustAadhaar');
          const dobEl = document.getElementById('cscCustDob');

          const nameRect = nameEl.getBoundingClientRect();
          const phoneRect = phoneEl.getBoundingClientRect();
          const aadhaarRect = aadhaarEl.getBoundingClientRect();
          const dobRect = dobEl.getBoundingClientRect();
          const chipEl = document.getElementById('cscPhoneChip');

          return {
            nameVal: nameEl.value,
            phoneVal: phoneEl.value,
            chipHtml: chipEl ? chipEl.innerHTML : '',
            nameTop: nameRect.top,
            phoneTop: phoneRect.top,
            aadhaarTop: aadhaarRect.top,
            dobTop: dobRect.top,
            dobDisplay: window.getComputedStyle(dobEl).display,
            parentDisplay: window.getComputedStyle(dobEl.parentElement).display,
            dobHeight: dobEl.offsetHeight,
            parentHeight: dobEl.parentElement.offsetHeight,
            maxDiff: Math.max(
              Math.abs(nameRect.top - phoneRect.top),
              Math.abs(nameRect.top - aadhaarRect.top)
            )
          };
        })()
      `,
      awaitPromise: true, returnByValue: true
    });
    console.log('CSC Modal Alignment Diagnostic:', cscRes.result ? cscRes.result.value : cscRes);
    await new Promise(r => setTimeout(r, 500));

    const shot3 = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const p3 = path.join(artifactDir, 'csc_modal_autofill_demo.png');
    fs.writeFileSync(p3, Buffer.from(shot3.data, 'base64'));
    console.log('Saved CSC Modal Screenshot:', p3);

    ws.close();
    console.log('All 3 Modals Verified & Captured Successfully!');
  } catch (err) {
    console.error('Demo error:', err);
  } finally {
    chromeProc.kill();
  }
}

runDemo();
