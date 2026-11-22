const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const previewDir = "C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69";

// Full original slip content with original text size (12px, 13.5px, 24px)
const mockSlipContent = `
  <div class="receipt-slip" id="printableReceipt">
    <div class="slip-header">
      <div class="slip-title" style="font-size: 17px; font-weight: 800;">SANJAY COMPUTER CENTER</div>
      <div class="slip-sub" style="font-size: 12px; font-weight: 700;">Grahak Seva Kendra, CSC Center , AADHAAR Sewa Kendra</div>
      <div class="slip-contact" style="font-size: 11.5px; color: #64748b; margin-top: 3px;">
        Phone: +91 9616928635 • Indra nagar Tambour Khas Sitapur UP 261208
      </div>

      <div class="slip-numbers-strip" style="display: flex; justify-content: space-between; align-items: center; background: rgba(2, 132, 199, 0.08); border: 1.5px solid rgba(2, 132, 199, 0.35); border-radius: 8px; padding: 6px 12px; margin-top: 8px; margin-bottom: 4px; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Universal SN:</span>
          <b class="font-mono" style="font-size: 13.5px; color: #0284c7; font-weight: 800;">CM-20261114-0830</b>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Bank Ref / RRN:</span>
          <b class="font-mono" style="font-size: 13.5px; color: #7c3aed; font-weight: 800;">631713182593</b>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Kaam / Sewa:</span>
          <b style="font-size: 12.5px; color: #059669; font-weight: 800;">CASH WITHDRAWAL</b>
        </div>
      </div>
    </div>

    <!-- 2-Column Grid -->
    <div class="slip-grid-2col" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0;">
      <!-- Left Column: Transaction Details -->
      <div class="slip-card card-blue" style="background: rgba(2, 132, 199, 0.04); border: 1.5px solid rgba(2, 132, 199, 0.25); border-radius: 10px; padding: 8px 12px;">
        <div class="slip-card-head" style="font-size: 11.5px; font-weight: 800; color: #0284c7; margin-bottom: 6px;">
          LEN-DEN VIVRAN (TXN DETAILS)
        </div>
        <div class="slip-card-rows" style="font-size: 12px; line-height: 1.8;">
          <div style="display:flex; justify-content:space-between;"><span>Universal SN:</span> <b class="font-mono" style="color:#0284c7; font-weight:800;">CM-20261114-0830</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Receipt No:</span> <b>BC-2026-0NEW</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Tarikh & Samay:</span> <b>14/11/2026 12:48:38</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Kis Kaam Ka:</span> <b style="color:#059669; font-weight:800;">CASH WITHDRAWAL</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Portal:</span> <b>Digipay Lite</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Bank Ref / RRN:</span> <b class="font-mono" style="color:#7c3aed; font-weight:800;">631713182593</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Portal Txn ID:</span> <b class="font-mono" style="color:#64748b;">TXN-998822</b></div>
        </div>
      </div>

      <!-- Right Column: Customer & Bank Details -->
      <div class="slip-card card-purple" style="background: rgba(124, 58, 237, 0.04); border: 1.5px solid rgba(124, 58, 237, 0.25); border-radius: 10px; padding: 8px 12px;">
        <div class="slip-card-head" style="font-size: 11.5px; font-weight: 800; color: #7c3aed; margin-bottom: 6px;">
          GRAHAK EVAM BANK VIVRAN
        </div>
        <div class="slip-card-rows" style="font-size: 12px; line-height: 1.8;">
          <div style="display:flex; justify-content:space-between;"><span>Grahak (Name):</span> <b>Surendra Kumar</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Mobile:</span> <b class="font-mono">7317274003</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Bank:</span> <b>State Bank of India</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Aadhaar:</span> <b class="font-mono">**** **** 8979</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Account No:</span> <b>-</b></div>
          <div style="display:flex; justify-content:space-between;"><span>Khata Balance:</span> <b class="font-mono" style="color:#10b981; font-weight:800;">₹12,274.03</b></div>
        </div>
      </div>
    </div>

    <!-- Amount Hero Box -->
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(16, 185, 129, 0.08); border: 2px solid #10b981; border-radius: 10px; padding: 10px 16px; margin: 8px 0;">
      <div>
        <div style="font-size: 11px; font-weight: 800; color: #047857; letter-spacing: 0.5px;">LEN-DEN RASHI (AMOUNT WITHDRAWN)</div>
        <div style="font-size: 12px; color: #065f46; font-style: italic;">Two Thousand Rupees Only</div>
      </div>
      <div style="font-size: 24px; font-weight: 900; color: #047857;" class="font-mono">₹2,000.00</div>
    </div>

    <!-- Footer Strip -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b;">
      <span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:12px; font-weight:800;">✓ SUCCESSFUL</span>
      <span>Thank you for visiting! Phir Padhaarein.</span>
      <span style="font-style:italic;">* Authorized Computer Slip</span>
    </div>
  </div>
`;

const zoomOverlayHtml = `
  <div class="zoom-backdrop" id="slipZoomOverlay" style="display:none;" onclick="if(event.target===this) toggleDemoZoom(false)">
    <div class="zoom-light-card" onclick="event.stopPropagation()">
      <div class="zcard-head">
        <div style="font-size: 13.5px; font-weight: 900; color: #0f172a; display: flex; align-items: center; gap: 8px;">
          <span>📖 REGISTER WRITING MODE (42px ULTRA-GIANT)</span>
          <span style="font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 2px 7px; border-radius: 4px; border: 1px solid #e2e8f0;">Shortcut: 'Z' ya 'Esc'</span>
        </div>
        <button type="button" class="btn-compact" onclick="toggleDemoZoom(false)" style="background: #fee2e2; color: #dc2626; border-color: #fca5a5;">
          ✕ Band Karein (Esc)
        </button>
      </div>

      <div>
        <div class="patti-light pl-mobile">
          <div class="p-tag" style="color: #1e40af;">📱 1. MOBILE NO:</div>
          <div class="p-num font-mono">7317274003</div>
          <button type="button" class="btn-compact">📋 Copy</button>
        </div>

        <div class="patti-light pl-aadhaar">
          <div class="p-tag" style="color: #065f46;">🪪 2. AADHAAR NO:</div>
          <div class="p-num font-mono">2310 7418 8979</div>
          <button type="button" class="btn-compact">📋 Copy</button>
        </div>

        <div class="patti-light pl-utr">
          <div class="p-tag" style="color: #5b21b6;">🔢 3. BANK UTR:</div>
          <div class="p-num font-mono">6317  1318  2593</div>
          <button type="button" class="btn-compact">📋 Copy</button>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
        <span>💡 Maximum 42px font size — door se dekh kar likhne ke liye.</span>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn-compact" style="background: #f1f5f9; color: #334155;">📋 Teeno Copy</button>
          <button type="button" class="btn-compact" onclick="toggleDemoZoom(false)" style="background: #0284c7; color: #fff; border: none;">✓ Wapas Slip Par Jayein</button>
        </div>
      </div>
    </div>
  </div>
`;

const commonStyles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: #0b1120;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }
  .modal-dialog {
    width: 760px;
    background: #ffffff;
    border-radius: 14px;
    box-shadow: 0 25px 60px rgba(0,0,0,0.45);
    overflow: hidden;
    position: relative;
    border: 1px solid #cbd5e1;
  }
  .receipt-slip {
    padding: 12px 18px 8px;
    background: #ffffff;
    color: #0f172a;
  }
  .slip-header {
    text-align: center;
    padding-bottom: 8px;
    border-bottom: 1.5px dashed #cbd5e1;
    margin-bottom: 8px;
  }
  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  /* ZOOM OVERLAY */
  .zoom-backdrop {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 14px;
  }
  .zoom-light-card {
    width: 100%;
    max-width: 720px;
    background: #ffffff;
    border: 2.5px solid #2563eb;
    border-radius: 14px;
    padding: 13px 18px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.35);
  }
  .zcard-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    margin-bottom: 10px;
    border-bottom: 1.5px solid #e2e8f0;
  }
  .patti-light {
    border-radius: 9px;
    padding: 8px 16px;
    margin-bottom: 9px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .patti-light:last-child { margin-bottom: 0; }
  .pl-mobile { background: #eff6ff; border: 2px solid #3b82f6; }
  .pl-mobile .p-num { color: #1d4ed8; }
  .pl-aadhaar { background: #ecfdf5; border: 2px solid #10b981; }
  .pl-aadhaar .p-num { color: #047857; }
  .pl-utr { background: #f5f3ff; border: 2px solid #8b5cf6; }
  .pl-utr .p-num { color: #6d28d9; }
  .p-tag {
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    width: 150px;
    flex-shrink: 0;
  }
  .p-num {
    font-size: 42px;
    font-weight: 900;
    letter-spacing: 2.5px;
    text-align: center;
    flex-grow: 1;
    line-height: 1;
  }
  .btn-compact {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
  .modal-close-x {
    background: transparent;
    border: none;
    font-size: 18px;
    color: #64748b;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
  }
  .modal-close-x:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
`;

// ==============================================================
// DEMO 1A-V2: Original Big Text (12.5px - 13px) + Compact Height Buttons
// ==============================================================
function getDemo1AV2Html() {
  return `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Demo 1A-V2: Original Big Text + Compact Button Size</title>
  <style>
    ${commonStyles}
    .modal-header-v2 {
      padding: 10px 18px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
    }
    .modal-footer-v2 {
      padding: 9px 18px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
    }

    /* COMPACT BUTTONS WITH FULL ORIGINAL TEXT SIZE (12.5px - 13px bold) */
    .btn-v2-zoom {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #ffffff;
      border: none;
      border-radius: 7px;
      padding: 6px 13px;
      font-size: 12.5px; /* ORIGINAL BIG TEXT */
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      box-shadow: 0 1.5px 4px rgba(217, 119, 6, 0.28);
      white-space: nowrap;
    }
    .btn-v2-zoom:hover { filter: brightness(1.08); }

    .btn-v2-print {
      color: #ffffff;
      font-weight: 700;
      font-size: 12.5px; /* ORIGINAL BIG TEXT */
      padding: 6px 12px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 1.5px 4px rgba(0,0,0,0.12);
    }
    .btn-v2-whatsapp { background: linear-gradient(135deg, #16a34a, #15803d); }
    .btn-v2-a4 { background: linear-gradient(135deg, #2563eb, #1d4ed8); }
    .btn-v2-half { background: linear-gradient(135deg, #0284c7, #0369a1); }
    .btn-v2-thermal { background: linear-gradient(135deg, #7c3aed, #6d28d9); }
  </style>
</head>
<body>
  <div class="modal-dialog">
    ${zoomOverlayHtml}

    <!-- COMPACT HEADER WITH FULL ORIGINAL BIG TEXT -->
    <div class="modal-header-v2">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="background: rgba(16, 185, 129, 0.12); color: #10b981; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">
          🖨️
        </div>
        <div>
          <h2 style="margin: 0; font-size: 17px; font-weight: 800; color: #0f172a;">Customer Transaction Slip (ग्राहक पावती पर्ची)</h2>
          <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">AEPS Cash Nikasi, Jama ya DMT len-den ki verified computer slip</p>
        </div>
      </div>
      <button class="modal-close-x" onclick="alert('Close clicked')">✕</button>
    </div>

    <!-- BODY -->
    <div style="padding: 6px 14px 4px;">
      ${mockSlipContent}
    </div>

    <!-- FOOTER: ORIGINAL BIG TEXT + COMPACT BUTTON SIZE -->
    <div class="modal-footer-v2">
      <div>
        <button type="button" class="btn-v2-zoom" onclick="toggleDemoZoom(true)">
          🔍 Zoom Mode [Z]
        </button>
      </div>
      <div style="display: flex; align-items: center; gap: 7px;">
        <button class="btn-v2-print btn-v2-whatsapp">💬 WhatsApp Share</button>
        <button class="btn-v2-print btn-v2-a4">📄 Print A4</button>
        <button class="btn-v2-print btn-v2-half">📑 Print A4/2</button>
        <button class="btn-v2-print btn-v2-thermal">🧾 Thermal Slip</button>
      </div>
    </div>
  </div>

  <script>
    function toggleDemoZoom(show) {
      document.getElementById('slipZoomOverlay').style.display = show ? 'flex' : 'none';
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'z' || e.key === 'Z') toggleDemoZoom(true);
      if (e.key === 'Escape') toggleDemoZoom(false);
    });
  </script>
</body>
</html>`;
}

// Write files
fs.writeFileSync('public/demos/slip_demo1a_v2_big_text.html', getDemo1AV2Html());
console.log('Saved slip_demo1a_v2_big_text.html !');

async function captureScreenshots() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9293',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,880'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9293/json/list');
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
    console.log('Capturing slip_demo1a_v2_big_text.png...');
    await send('Page.navigate', { url: 'http://localhost:3000/demos/slip_demo1a_v2_big_text.html' });
    await new Promise(r => setTimeout(r, 1200));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/slip_demo1a_v2_big_text.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved slip_demo1a_v2_big_text.png');

    ws.close();
  } catch (e) {
    console.error('Screenshot error:', e);
  } finally {
    chromeProc.kill();
  }
}

captureScreenshots();
