const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const previewDir = "C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69";

function buildDemoHtml() {
  return `<!DOCTYPE html>
<html lang="hi" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Customer Slip — Official Compact Demo</title>
  <link rel="stylesheet" href="/style.css">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #0f172a;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    /* Modal dialog overrides for compact header & footer */
    .modal-overlay.demo-active {
      display: flex !important;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    #bcReceiptModal .modal {
      width: min(740px, calc(100vw - 36px)) !important;
      max-width: 740px !important;
      position: relative !important;
      background: var(--bg-card, #1e293b);
      border: 1px solid var(--border, #334155);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
    }

    /* 1. COMPACT HEADER (Only Title + Close X) */
    .modal-header-compact {
      padding: 10px 18px !important;
      border-bottom: 1px solid var(--border, #334155) !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    }

    /* 2. PLAIN TEXT AMOUNT (Zeroes look like 0, never 8) */
    .slip-hero-amount .hero-val.plain-text-amount {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      font-variant-numeric: normal !important;
      font-weight: 800 !important;
      letter-spacing: 0px !important;
    }

    /* 3. COMPACT FOOTER BUTTONS WITH BIG 12.5px TEXT */
    .modal-footer-compact {
      padding: 10px 18px !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      gap: 8px !important;
      border-top: 1px solid var(--border, #334155) !important;
    }

    .btn-zoom-footer-main {
      background: linear-gradient(135deg, #d97706, #b45309) !important;
      color: white !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 6px 13px !important;
      font-size: 12.5px !important;
      font-weight: 700 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      cursor: pointer !important;
      box-shadow: 0 2px 6px rgba(217, 119, 6, 0.35) !important;
      white-space: nowrap !important;
    }
    .btn-zoom-footer-main:hover {
      filter: brightness(1.08);
    }

    .btn-print-compact {
      font-size: 12px !important;
      font-weight: 700 !important;
      padding: 6px 12px !important;
      border-radius: 8px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      border: none !important;
      white-space: nowrap !important;
      cursor: pointer !important;
    }
  </style>
</head>
<body class="dark dark-theme">
  <div class="modal-overlay demo-active" id="bcReceiptModal">
    <div class="modal" onclick="event.stopPropagation()">

      <!-- Option 2A-V3 42px Ultra-Giant Zoom Overlay -->
      <div class="zoom-backdrop" id="bcSlipZoomOverlay" style="display: none;" onclick="if(event.target===this) toggleSlipZoom(false)">
        <div class="zoom-light-card" onclick="event.stopPropagation()">
          <div class="zcard-head">
            <div style="font-size: 13.5px; font-weight: 900; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <span>📖 REGISTER WRITING MODE (42px ULTRA-GIANT)</span>
              <span style="font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 2px 7px; border-radius: 4px; border: 1px solid #e2e8f0;">Shortcut: 'Z' ya 'Esc'</span>
            </div>
            <button type="button" class="btn-compact" onclick="toggleSlipZoom(false)" style="background: #fee2e2; color: #dc2626; border-color: #fca5a5;">
              ✕ Band Karein (Esc)
            </button>
          </div>

          <div>
            <div class="patti-light pl-mobile">
              <div class="p-tag" style="color: #1e40af;">📱 1. MOBILE NO:</div>
              <div class="p-num font-mono" id="slipZoomPhone">7317274003</div>
              <button type="button" class="btn-compact">📋 Copy</button>
            </div>

            <div class="patti-light pl-aadhaar">
              <div class="p-tag" style="color: #065f46;">🪪 2. AADHAAR NO:</div>
              <div class="p-num font-mono" id="slipZoomAadhaar">2310 7418 8979</div>
              <button type="button" class="btn-compact">📋 Copy</button>
            </div>

            <div class="patti-light pl-utr">
              <div class="p-tag" style="color: #5b21b6;">🔢 3. BANK UTR:</div>
              <div class="p-num font-mono" id="slipZoomUTR">6317  1318  2593</div>
              <button type="button" class="btn-compact">📋 Copy</button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
            <span>💡 Maximum 42px font size — door se dekh kar likhne ke liye.</span>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-compact" style="background: #f1f5f9; color: #334155;">📋 Teeno Copy</button>
              <button type="button" class="btn-compact" onclick="toggleSlipZoom(false)" style="background: #0284c7; color: #fff; border: none;">✓ Wapas Slip Par Jayein</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 1. COMPACT HEADER (No Zoom button here! Only Title + Close X) -->
      <div class="modal-header modal-header-compact">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="background: rgba(16, 185, 129, 0.12); color: #10b981; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i data-lucide="printer" style="width: 18px; height: 18px;"></i>
          </div>
          <div>
            <h2 style="margin: 0; font-size: 16.5px; font-weight: 800; color: var(--text-primary, #f8fafc);">Customer Transaction Slip (ग्राहक पावती पर्ची)</h2>
            <p style="margin: 1px 0 0 0; font-size: 11.5px; color: var(--text-muted, #94a3b8);">AEPS Cash Nikasi, Jama ya DMT len-den ki verified computer slip</p>
          </div>
        </div>
        <button class="modal-close" onclick="alert('Close clicked')"><i data-lucide="x"></i></button>
      </div>

      <!-- 2. MODAL BODY (NO print-format-bar, starts directly with the slip) -->
      <div class="modal-body" style="padding: 10px 18px 6px;">
        <div class="receipt-slip" id="printableReceipt">
          <div class="slip-header">
            <div class="slip-title" id="slipShopTitle">SANJAY COMPUTER CENTER</div>
            <div class="slip-sub" id="slipShopSub">Grahak Seva Kendra, CSC Center , AADHAAR Sewa Kendra</div>
            <div class="slip-contact" id="slipShopContact" style="font-size: 11px; color: var(--text-secondary, #94a3b8); margin-top: 3px;">
              Phone: +91 9616928635 • Indra nagar Tambour Khas Sitapur UP 261208
            </div>

            <!-- Top Dual-Number & Service Banner -->
            <div class="slip-numbers-strip" style="display: flex; justify-content: space-between; align-items: center; background: rgba(2, 132, 199, 0.08); border: 1.5px solid rgba(2, 132, 199, 0.35); border-radius: 8px; padding: 6px 12px; margin-top: 8px; margin-bottom: 4px; gap: 8px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary, #94a3b8); text-transform: uppercase;">Universal SN:</span>
                <b id="slipHeaderSN" class="font-mono" style="font-size: 13.5px; color: #0284c7; font-weight: 800;">-</b>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary, #94a3b8); text-transform: uppercase;">Bank Ref / RRN:</span>
                <b id="slipHeaderRRN" class="font-mono" style="font-size: 13.5px; color: #7c3aed; font-weight: 800;">631713182593</b>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary, #94a3b8); text-transform: uppercase;">Kaam / Sewa:</span>
                <b id="slipHeaderService" style="font-size: 12.5px; color: #059669; font-weight: 800;">CASH WITHDRAWAL</b>
              </div>
            </div>
          </div>

          <!-- 2-Column Grid (Original Modern Dual-Card Grid) -->
          <div class="slip-grid-2col">
            <!-- Left Column: Transaction Details -->
            <div class="slip-card card-blue">
              <div class="slip-card-head">
                <i data-lucide="receipt" style="width: 13px; height: 13px;"></i>
                <span>LEN-DEN VIVRAN (TXN DETAILS)</span>
              </div>
              <div class="slip-card-rows">
                <div class="slip-row" id="slipUniversalSNRow"><span>Universal SN (यूनिवर्सल नंबर):</span> <b id="slipUniversalSN" class="font-mono" style="color: #0284c7; font-weight: 800;">-</b></div>
                <div class="slip-row" id="slipReceiptNoRow"><span>Receipt No (रसीद क्रमांक):</span> <b id="slipReceiptNo">BC-2026-0NEW</b></div>
                <div class="slip-row" id="slipDateTimeRow"><span>Tarikh & Samay (दिनांक/समय):</span> <b id="slipDateTime">14/11/2026 12:48:38</b></div>
                <div class="slip-row" id="slipServiceRow"><span>Kis Kaam Ka (सेवा/काम):</span> <b id="slipService" class="text-success" style="font-weight: 800; color: #059669;">CASH WITHDRAWAL</b></div>
                <div class="slip-row" id="slipPortalRow"><span>Portal (पोर्टल):</span> <b id="slipPortal" style="font-weight: 800;">Digipay Lite</b></div>
                <div class="slip-row" id="slipRRNRow"><span>Bank Ref / RRN (लेन-देन नंबर):</span> <b id="slipRRN" class="font-mono" style="color: #7c3aed; font-weight: 800;">631713182593</b></div>
                <div class="slip-row" id="slipTxnIdRow"><span>Portal Txn ID (गेटवे आईडी):</span> <b id="slipTxnId" class="font-mono" style="color: #64748b; font-size: 11px;">TXN-998822</b></div>
              </div>
            </div>

            <!-- Right Column: Customer & Bank Details -->
            <div class="slip-card card-purple">
              <div class="slip-card-head">
                <i data-lucide="user-check" style="width: 13px; height: 13px;"></i>
                <span>GRAHAK EVAM BANK VIVRAN</span>
              </div>
              <div class="slip-card-rows">
                <div class="slip-row" id="slipCustomerRow"><span>Grahak (Name):</span> <b id="slipCustomer">Surendra Kumar</b></div>
                <div class="slip-row" id="slipPhoneRow"><span>Mobile:</span> <b id="slipPhone" class="font-mono">7317274003</b></div>
                <div class="slip-row" id="slipBankRow"><span>Bank:</span> <b id="slipBank">State Bank of India</b></div>
                <div class="slip-row" id="slipAadhaarRow"><span>Aadhaar:</span> <b id="slipAadhaar" class="font-mono">**** **** 8979</b></div>
                <div class="slip-row" id="slipAccRow" style="display: none;"><span>Account No:</span> <b id="slipAcc" class="font-mono">-</b></div>
                <div class="slip-row" id="slipBalanceRow" style="display: none;"><span>Khata Balance (Bacha):</span> <b id="slipBalance" class="font-mono" style="color: #10b981; font-weight: 800;">-</b></div>
              </div>
            </div>
          </div>

          <!-- Full-Width Single Row Hero Amount Box (PLAIN TEXT AMOUNT - NO SLASHED MONO ZEROES) -->
          <div class="slip-hero-amount">
            <div class="hero-left">
              <div class="hero-lbl" id="slipAmountLabel">LEN-DEN RASHI (AMOUNT WITHDRAWN)</div>
              <div class="hero-words" id="slipWords">Two Thousand Rupees Only</div>
            </div>
            <!-- PLAIN TEXT CLASS ADDED: zero is clear round circle 0, NEVER looks like 8 -->
            <div class="hero-val plain-text-amount" id="slipAmount">₹2,000.00</div>
          </div>

          <!-- Footer Strip -->
          <div class="slip-footer-strip">
            <div class="slip-status-pill">
              <i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i>
              <span class="slip-status">SUCCESSFUL</span>
            </div>
            <div class="slip-footer-note" id="slipFooterNote">Thank you for visiting! Phir Padhaarein.</div>
            <div class="slip-footer-auth">* Authorized Computer Slip</div>
          </div>
        </div>
      </div>

      <!-- 3. COMPACT FOOTER ('Band Karein' Removed! Zoom Button on Left! 4 Print buttons on Right!) -->
      <div class="modal-footer modal-footer-compact">
        <div>
          <!-- Zoom Button directly on the left where Band Karein was! -->
          <button type="button" class="btn-zoom-footer-main" onclick="toggleSlipZoom(true)" title="Register me likhne ke liye bade akshar me dekhein (Shortcut: Z)">
            <i data-lucide="zoom-in" style="width: 15px; height: 15px;"></i> 🔍 Zoom Mode [Z]
          </button>
        </div>
        <div style="display: flex; align-items: center; gap: 7px; flex-wrap: nowrap;">
          <button class="btn-success btn-sm btn-print-compact" id="slipWhatsAppBtn" style="background: linear-gradient(135deg, #16a34a, #15803d); color: white; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.25);">
            <i data-lucide="message-circle" style="width: 14px; height: 14px;"></i> WhatsApp Share
          </button>
          <button class="btn-primary btn-sm btn-print-compact" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);">
            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> Print A4
          </button>
          <button class="btn-info btn-sm btn-print-compact" style="background: linear-gradient(135deg, #0284c7, #0369a1); color: white; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);">
            <i data-lucide="scissors" style="width: 14px; height: 14px;"></i> Print A4/2 (1/2)
          </button>
          <button class="btn-warning btn-sm btn-print-compact" style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.25);">
            <i data-lucide="printer" style="width: 14px; height: 14px;"></i> Thermal Slip (80mm)
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    if (typeof lucide !== 'undefined') lucide.createIcons();
    function toggleSlipZoom(show) {
      document.getElementById('bcSlipZoomOverlay').style.display = show ? 'flex' : 'none';
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'z' || e.key === 'Z') toggleSlipZoom(true);
      if (e.key === 'Escape') toggleSlipZoom(false);
    });
  </script>
</body>
</html>`;
}

fs.writeFileSync('public/demos/official_slip_demo.html', buildDemoHtml());
console.log('Saved official_slip_demo.html !');

async function capture() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9294',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,880'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9294/json/list');
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

    console.log('Capturing official_slip_demo.png...');
    await send('Page.navigate', { url: 'http://localhost:3000/demos/official_slip_demo.html' });
    await new Promise(r => setTimeout(r, 1500));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/official_slip_demo.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved official_slip_demo.png');

    // Also capture with Zoom Mode active
    await send('Runtime.evaluate', { expression: 'toggleSlipZoom(true)' });
    await new Promise(r => setTimeout(r, 800));
    const shotZoom = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(previewDir + '/official_slip_demo_zoom_active.png', Buffer.from(shotZoom.data, 'base64'));
    console.log('Saved official_slip_demo_zoom_active.png');

    ws.close();
  } catch (e) {
    console.error('Capture error:', e);
  } finally {
    chromeProc.kill();
  }
}

capture();
