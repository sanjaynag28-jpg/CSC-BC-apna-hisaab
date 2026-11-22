const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const previewDir = "C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews";

const demoData = {
  shopTitle: "SHIVAM ONLINE SERVICES (CSP)",
  shopSub: "DIGITAL BANKING & GRAHAK SEVA KENDRA",
  shopContact: "Vill - Raipur, Mob: 9616928635",
  sn: "CM-20261114-0830",
  receiptNo: "REC-88412",
  dateTime: "14-Nov-2026, 11:45 AM",
  service: "Cash Withdrawal (AEPS)",
  portal: "Digipay Lite",
  rrn: "631713182593",
  rrnFormatted: "6317  1318  2593",
  customer: "Surendra Kumar",
  phone: "7317274003",
  phoneFormatted: "73172 74003",
  bank: "State Bank of India",
  aadhaar: "2310 7418 8979",
  balance: "₹12,274.03",
  amount: "₹2,000.00",
  amountWords: "Rupees Two Thousand Only"
};

const baseSlipHtml = `
  <div class="modal-header">
    <div style="display:flex; align-items:center; gap:12px;">
      <div class="hdr-icon">🖨️</div>
      <div>
        <h2 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">Customer Transaction Slip (ग्राहक पावती पर्ची)</h2>
        <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">AEPS Cash Nikasi, Jama ya DMT len-den ki verified computer slip</p>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:10px;">
      <button class="btn-zoom-hdr">🔍 Zoom Mode [Z]</button>
      <button class="modal-close">✕</button>
    </div>
  </div>

  <div class="print-bar">
    <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#475569;">
      <span>🖨️ Print Format:</span>
      <button class="pfb-btn active">📄 Print A4</button>
      <button class="pfb-btn">📑 Print A4/2</button>
      <button class="pfb-btn">🧾 Slip (Thermal 80mm)</button>
    </div>
    <div style="font-size:11px; font-weight:700; color:#0284c7; background:#e0f2fe; padding:3px 8px; border-radius:5px;">
      ⌨️ Shortcut: 'Z' dabakar Zoom On/Off karein
    </div>
  </div>

  <div class="receipt-slip">
    <div class="slip-header">
      <div class="slip-title">${demoData.shopTitle}</div>
      <div class="slip-sub">${demoData.shopSub}</div>
      <div class="slip-contact">${demoData.shopContact}</div>

      <div class="slip-numbers-strip">
        <div><span class="sn-lbl">Universal SN:</span> <b class="sn-val">${demoData.sn}</b></div>
        <div><span class="sn-lbl">Bank Ref / RRN:</span> <b class="rrn-val">${demoData.rrn}</b></div>
        <div><span class="sn-lbl">Kaam / Sewa:</span> <b class="sewa-val">${demoData.service}</b></div>
      </div>
    </div>

    <div class="slip-grid-2col">
      <div class="slip-card blue">
        <div class="slip-card-head">🧾 Len-Den Vivran (Txn Details)</div>
        <div class="slip-card-rows">
          <div class="slip-row"><span>Universal SN:</span> <b>${demoData.sn}</b></div>
          <div class="slip-row"><span>Receipt No:</span> <b>${demoData.receiptNo}</b></div>
          <div class="slip-row"><span>Tarikh & Samay:</span> <b>${demoData.dateTime}</b></div>
          <div class="slip-row"><span>Kis Kaam Ka:</span> <b style="color:#059669;">${demoData.service}</b></div>
          <div class="slip-row"><span>Portal (पोर्टल):</span> <b>${demoData.portal}</b></div>
          <div class="slip-row"><span>Bank Ref / RRN:</span> <b style="color:#7c3aed;">${demoData.rrn}</b></div>
        </div>
      </div>

      <div class="slip-card purple">
        <div class="slip-card-head">👤 Grahak evam Bank Vivran</div>
        <div class="slip-card-rows">
          <div class="slip-row"><span>Grahak (Name):</span> <b>${demoData.customer}</b></div>
          <div class="slip-row"><span>Mobile:</span> <b>${demoData.phone}</b></div>
          <div class="slip-row"><span>Bank:</span> <b>${demoData.bank}</b></div>
          <div class="slip-row"><span>Aadhaar:</span> <b>${demoData.aadhaar}</b></div>
          <div class="slip-row"><span>Khata Balance (Bacha):</span> <b style="color:#10b981;">${demoData.balance}</b></div>
        </div>
      </div>
    </div>

    <div class="slip-hero-amount">
      <div>
        <div class="hero-lbl">LEN-DEN RASHI (AMOUNT WITHDRAWN)</div>
        <div class="hero-words">${demoData.amountWords}</div>
      </div>
      <div class="hero-val">${demoData.amount}</div>
    </div>

    <div class="slip-footer-strip">
      <div class="slip-status-pill">✅ SUCCESSFUL</div>
      <div style="font-size:11px; color:#64748b;">Thank you for visiting! Phir Padhaarein.</div>
      <div style="font-size:10px; color:#94a3b8;">* Authorized Computer Slip</div>
    </div>
  </div>

  <div class="modal-footer">
    <button class="btn-cancel">Band Karein (Esc)</button>
    <div style="display:flex; gap:8px;">
      <button class="btn-whatsapp">💬 WhatsApp Share</button>
      <button class="btn-print">📄 Print A4</button>
      <button class="btn-half">📑 Print A4/2</button>
      <button class="btn-thermal">🧾 Thermal Slip (80mm)</button>
    </div>
  </div>
`;

const commonStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f172a;
    padding: 20px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
  }
  .modal-dialog {
    width: 780px;
    max-width: 100%;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 25px 60px rgba(0,0,0,0.45);
    overflow: hidden;
    position: relative;
  }
  .modal-header {
    padding: 14px 20px;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #e2e8f0; background: #ffffff;
  }
  .hdr-icon {
    width: 40px; height: 40px; border-radius: 10px;
    background: rgba(16,185,129,0.12); color: #10b981;
    display: flex; align-items: center; justify-content: center; font-size: 20px;
  }
  .btn-zoom-hdr {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #fff; font-size: 12px; font-weight: 800;
    padding: 6px 14px; border-radius: 8px; border: none; cursor: pointer;
  }
  .modal-close {
    width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0;
    background: #f8fafc; font-size: 15px; cursor: pointer; color: #64748b;
  }
  .print-bar {
    padding: 8px 18px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    display: flex; justify-content: space-between; align-items: center;
  }
  .pfb-btn {
    padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1;
    background: #fff; font-size: 11.5px; font-weight: 700; color: #475569;
  }
  .pfb-btn.active { background: #0284c7; color: #fff; border-color: #0284c7; }
  .receipt-slip {
    margin: 12px 18px; background: #ffffff; border: 1.5px solid #cbd5e1;
    border-radius: 12px; padding: 14px 18px;
  }
  .slip-header {
    text-align: center; border-bottom: 1.5px dashed #cbd5e1;
    padding-bottom: 10px; margin-bottom: 10px;
  }
  .slip-title { font-size: 15px; font-weight: 900; color: #0f172a; }
  .slip-sub { font-size: 11px; font-weight: 700; color: #0284c7; margin-top: 2px; }
  .slip-contact { font-size: 10.5px; color: #64748b; margin-top: 2px; }
  .slip-numbers-strip {
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(2,132,199,0.08); border: 1.5px solid rgba(2,132,199,0.35);
    border-radius: 7px; padding: 5px 12px; margin-top: 8px; font-size: 11px;
  }
  .sn-lbl { color: #64748b; font-weight: 700; }
  .sn-val { color: #0284c7; font-weight: 800; font-size: 12.5px; }
  .rrn-val { color: #7c3aed; font-weight: 800; font-size: 12.5px; }
  .sewa-val { color: #059669; font-weight: 800; font-size: 12px; }
  .slip-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .slip-card { border-radius: 9px; padding: 9px 12px; }
  .slip-card.blue { background: rgba(2,132,199,0.04); border: 1px solid rgba(2,132,199,0.25); }
  .slip-card.purple { background: rgba(124,58,237,0.04); border: 1px solid rgba(124,58,237,0.25); }
  .slip-card-head { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 6px; }
  .slip-card-rows { display: flex; flex-direction: column; gap: 4px; }
  .slip-row { display: flex; justify-content: space-between; font-size: 11.5px; color: #334155; }
  .slip-row b { color: #0f172a; font-weight: 700; }
  .slip-hero-amount {
    background: #0f172a; border-radius: 9px; padding: 10px 14px;
    display: flex; justify-content: space-between; align-items: center; color: #fff; margin-bottom: 10px;
  }
  .hero-lbl { font-size: 10px; font-weight: 800; opacity: 0.8; }
  .hero-words { font-size: 11px; color: #cbd5e1; margin-top: 2px; }
  .hero-val { font-size: 22px; font-weight: 900; color: #34d399; }
  .slip-footer-strip {
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10.5px;
  }
  .slip-status-pill { background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; }
  .modal-footer {
    padding: 10px 18px; border-top: 1px solid #e2e8f0;
    display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
  }
  .btn-cancel { padding: 7px 14px; border-radius: 7px; border: 1.5px solid #cbd5e1; background: #fff; font-size: 12px; font-weight: 700; color: #475569; }
  .btn-whatsapp { background: #16a34a; color: #fff; padding: 7px 12px; border-radius: 7px; border: none; font-size: 12px; font-weight: 700; }
  .btn-print { background: #2563eb; color: #fff; padding: 7px 12px; border-radius: 7px; border: none; font-size: 12px; font-weight: 700; }
  .btn-half { background: #0284c7; color: #fff; padding: 7px 12px; border-radius: 7px; border: none; font-size: 12px; font-weight: 700; }
  .btn-thermal { background: #7c3aed; color: #fff; padding: 7px 12px; border-radius: 7px; border: none; font-size: 12px; font-weight: 700; }
`;

// ============================================================================
// OPTION 2A-V2: BIGGER 38px NUMBERS + COMPACT SLEEK BUTTONS
// ============================================================================
const htmlDemo2A_V2 = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Option 2A (Updated) - Bigger Numbers & Compact Buttons</title>
  <style>
    ${commonStyles}

    /* Translucent Backdrop: Peeche wali slip frameless dikhti rahegi! */
    .zoom-backdrop {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.40);
      backdrop-filter: blur(2px);
      z-index: 50;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }

    /* Light Theme Floating Card (Larger width for huge numbers) */
    .zoom-light-card {
      width: 100%;
      max-width: 710px;
      background: #ffffff;
      border: 2px solid #2563eb;
      border-radius: 14px;
      padding: 14px 18px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
      animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes popIn {
      from { transform: scale(0.97); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    /* Compact Header Bar */
    .zcard-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 9px;
      margin-bottom: 12px;
      border-bottom: 1.5px solid #e2e8f0;
    }
    .zcard-title {
      font-size: 14.5px;
      font-weight: 900;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .badge-shortcut {
      background: #dbeafe;
      color: #1e40af;
      font-size: 10.5px;
      padding: 2px 7px;
      border-radius: 5px;
      font-weight: 800;
    }

    /* COMPACT BUTTONS */
    .btn-compact-close {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      padding: 4px 11px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .btn-compact-close:hover {
      background: #fee2e2;
      border-color: #fca5a5;
      color: #dc2626;
    }

    /* 3 PATTI CARDS WITH HUGE 38px FONT */
    .patti-light {
      border-radius: 10px;
      padding: 10px 16px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: transform 0.15s;
    }
    .patti-light:last-child { margin-bottom: 0; }

    /* Patti 1: Mobile (Clean Bright Blue) */
    .pl-mobile {
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border: 2px solid #3b82f6;
    }
    .pl-mobile .p-num { color: #1d4ed8; }

    /* Patti 2: Aadhaar (Clean Bright Green) */
    .pl-aadhaar {
      background: linear-gradient(135deg, #ecfdf5, #d1fae5);
      border: 2px solid #10b981;
    }
    .pl-aadhaar .p-num { color: #047857; }

    /* Patti 3: UTR / RRN (Clean Bright Violet) */
    .pl-utr {
      background: linear-gradient(135deg, #f5f3ff, #ede9fe);
      border: 2px solid #8b5cf6;
    }
    .pl-utr .p-num { color: #6d28d9; }

    .p-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 175px;
      flex-shrink: 0;
    }
    .p-tag {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .p-sub {
      font-size: 10.5px;
      color: #64748b;
      font-weight: 600;
    }

    /* HUGE 38px PLAIN TEXT NUMBERS (CRYSTAL CLEAR FOR REGISTER WRITING) */
    .p-num {
      font-size: 38px;
      font-weight: 900;
      letter-spacing: 2px;
      font-family: 'Inter', -apple-system, sans-serif;
      flex-grow: 1;
      text-align: center;
      line-height: 1.1;
    }

    /* COMPACT MINI COPY BUTTON */
    .btn-compact-copy {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 10.5px;
      font-weight: 800;
      color: #334155;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      flex-shrink: 0;
      transition: all 0.15s;
    }
    .btn-compact-copy:hover {
      background: #f8fafc;
      border-color: #2563eb;
      color: #2563eb;
      transform: translateY(-1px);
    }

    /* Compact Footer */
    .zcard-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 11px;
      padding-top: 9px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
    }
    .btn-compact-done {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 5px 14px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-compact-done:hover {
      background: #0369a1;
    }
  </style>
</head>
<body>
  <div class="modal-dialog">
    <!-- 🌟 ZOOM LIGHT FLOATING POPUP OVER SLIP (OPTION 2A - UPDATED) 🌟 -->
    <div class="zoom-backdrop">
      <div class="zoom-light-card">
        <!-- Compact Header -->
        <div class="zcard-head">
          <div class="zcard-title">
            <span>📖 REGISTER ENTRY FOCUS MODE (BADE AKSHAR)</span>
            <span class="badge-shortcut">⌨️ Shortcut: 'Z' ya 'Esc'</span>
          </div>
          <button class="btn-compact-close">✕ Band Karein (Esc)</button>
        </div>

        <!-- 3 PATTI CARDS (EXTRA LARGE 38px FONT + COMPACT BUTTONS) -->
        <div>
          <!-- 1. Mobile Number (38px Bold) -->
          <div class="patti-light pl-mobile">
            <div class="p-meta">
              <div class="p-tag" style="color: #1e40af;">📱 1. MOBILE NUMBER</div>
              <div class="p-sub">Grahak phone number</div>
            </div>
            <div class="p-num">${demoData.phone}</div>
            <button class="btn-compact-copy">📋 Copy</button>
          </div>

          <!-- 2. Aadhaar Number (38px Bold, 4-4-4 Spacing) -->
          <div class="patti-light pl-aadhaar">
            <div class="p-meta">
              <div class="p-tag" style="color: #065f46;">🪪 2. AADHAAR NUMBER</div>
              <div class="p-sub">12-Ank (4-4-4 format)</div>
            </div>
            <div class="p-num">${demoData.aadhaar}</div>
            <button class="btn-compact-copy">📋 Copy</button>
          </div>

          <!-- 3. Bank Ref / UTR (38px Bold) -->
          <div class="patti-light pl-utr">
            <div class="p-meta">
              <div class="p-tag" style="color: #5b21b6;">🔢 3. BANK REF / UTR</div>
              <div class="p-sub">12-Digit RRN / UTR</div>
            </div>
            <div class="p-num">${demoData.rrnFormatted}</div>
            <button class="btn-compact-copy">📋 Copy</button>
          </div>
        </div>

        <!-- Compact Footer -->
        <div class="zcard-footer">
          <div>💡 <b>Tip:</b> Teeno numbers <b>38px super-large</b> font me hain taaki register me likhna aasan ho.</div>
          <div style="display:flex; gap:6px;">
            <button class="btn-compact-copy" style="background:#f8fafc; border-color:#cbd5e1;">📋 Teeno Copy</button>
            <button class="btn-compact-done">✓ Wapas Slip Par Jayein</button>
          </div>
        </div>
      </div>
    </div>

    <!-- PEECHE WALI SLIP 100% UNCHANGED & VISIBLE UNDERNEATH -->
    ${baseSlipHtml}
  </div>
</body>
</html>
`;

// ============================================================================
// OPTION 2A-V3: ULTRA-GIANT (42px) WITH CLEAN ROW STACK
// ============================================================================
const htmlDemo2A_V3 = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Option 2A (Ultra-Giant 42px) - Maximum Number Size</title>
  <style>
    ${commonStyles}

    .zoom-backdrop {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.42);
      backdrop-filter: blur(2px);
      z-index: 50;
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
      padding: 12px 18px;
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
      letter-spacing: 0.5px;
      width: 160px;
      flex-shrink: 0;
    }

    /* 42px ULTRA-GIANT NUMBERS */
    .p-num {
      font-size: 42px;
      font-weight: 900;
      letter-spacing: 2.5px;
      font-family: 'Inter', -apple-system, sans-serif;
      flex-grow: 1;
      text-align: center;
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
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="modal-dialog">
    <div class="zoom-backdrop">
      <div class="zoom-light-card">
        <div class="zcard-head">
          <div style="font-size:14px; font-weight:900; color:#0f172a;">
            📖 REGISTER WRITING MODE (42px ULTRA-GIANT)
          </div>
          <button class="btn-compact" style="background:#fee2e2; color:#dc2626; border-color:#fca5a5;">✕ Band Karein (Esc)</button>
        </div>

        <div>
          <!-- 1. Mobile (42px) -->
          <div class="patti-light pl-mobile">
            <div class="p-tag" style="color: #1e40af;">📱 1. MOBILE NO:</div>
            <div class="p-num">${demoData.phone}</div>
            <button class="btn-compact">📋 Copy</button>
          </div>

          <!-- 2. Aadhaar (42px) -->
          <div class="patti-light pl-aadhaar">
            <div class="p-tag" style="color: #065f46;">🪪 2. AADHAAR NO:</div>
            <div class="p-num">${demoData.aadhaar}</div>
            <button class="btn-compact">📋 Copy</button>
          </div>

          <!-- 3. UTR (42px) -->
          <div class="patti-light pl-utr">
            <div class="p-tag" style="color: #5b21b6;">🔢 3. BANK UTR:</div>
            <div class="p-num">${demoData.rrnFormatted}</div>
            <button class="btn-compact">📋 Copy</button>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b;">
          <span>💡 Maximum 42px font size — door se dekh kar likhne ke liye.</span>
          <button class="btn-compact" style="background:#0284c7; color:#fff; border:none;">✓ Wapas Slip Par Jayein</button>
        </div>
      </div>
    </div>

    ${baseSlipHtml}
  </div>
</body>
</html>
`;

// Save files
const demosDir = path.join(__dirname, '../public/demos');
fs.writeFileSync(path.join(demosDir, 'slip_demo2a_v2_bigger.html'), htmlDemo2A_V2, 'utf8');
fs.writeFileSync(path.join(demosDir, 'slip_demo2a_v3_giant.html'), htmlDemo2A_V3, 'utf8');
console.log('Saved Demo 2A-V2 and 2A-V3 HTML files in public/demos/ !');

// Comparison Selector File
const selectorHtml = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Option 2A (Updated) - Bigger Numbers & Compact Buttons</title>
  <style>
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #fff; margin:0; padding:20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 20px; justify-content: center; }
    .btn { padding: 10px 20px; border-radius: 8px; border:none; cursor:pointer; font-weight:800; font-size:14px; background:#1e293b; color:#fff; }
    .btn.active { background: #2563eb; color:#fff; }
    iframe { width: 100%; height: 920px; border: none; border-radius: 12px; background: #0b1329; }
  </style>
</head>
<body>
  <div style="text-align:center; margin-bottom:15px;">
    <h2>🔍 Option 2A (Updated) — Bigger Numbers + Compact Buttons</h2>
    <p style="color:#94a3b8; font-size:13px;">Peeche wali slip intact hai, aur 3 patti ke numbers aur bade kar diye gaye hain:</p>
  </div>
  <div class="nav">
    <button class="btn active" onclick="load('slip_demo2a_v2_bigger.html', this)">🌟 Option 2A (Recommended: 38px Font + Compact Buttons)</button>
    <button class="btn" onclick="load('slip_demo2a_v3_giant.html', this)">🌟 Option 2A (Ultra-Giant: 42px Font)</button>
  </div>
  <iframe id="viewFrame" src="slip_demo2a_v2_bigger.html"></iframe>
  <script>
    function load(url, btn) {
      document.getElementById('viewFrame').src = url;
      document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(demosDir, 'slip_zoom_2a_selector.html'), selectorHtml, 'utf8');

// Function to capture screenshots
function cdpSend(ws, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const res = JSON.parse(event.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const p = spawn(CHROME_PATH, [
  '--headless',
  '--remote-debugging-port=9282',
  '--window-size=1200,1050'
]);

setTimeout(async () => {
  try {
    const tabs = await (await fetch('http://127.0.0.1:9282/json')).json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let reqId = 1;
    const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);
    await send('Page.enable');

    const demos = [
      { name: 'slip_zoom_demo2a_v2_bigger.png', url: 'http://localhost:3000/demos/slip_demo2a_v2_bigger.html' },
      { name: 'slip_zoom_demo2a_v3_giant.png', url: 'http://localhost:3000/demos/slip_demo2a_v3_giant.html' }
    ];

    for (const demo of demos) {
      console.log(`Capturing ${demo.name} from ${demo.url}...`);
      await send('Page.navigate', { url: demo.url });
      await new Promise(r => setTimeout(r, 1200));
      const ss = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(previewDir, demo.name), Buffer.from(ss.data, 'base64'));
      console.log(`Saved screenshot: ${demo.name}`);
    }

    ws.close();
    p.kill();
    console.log('All Updated Option 2A screenshots captured successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error during capture:', err);
    p.kill();
    process.exit(1);
  }
}, 2500);
