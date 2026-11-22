const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const previewDir = "C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews";
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

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

// Common Slip HTML Generator
function getSlipHtml(extraHeaderBtn = '') {
  return `
    <div class="modal-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="hdr-icon">🖨️</div>
        <div>
          <h2 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">Customer Transaction Slip (ग्राहक पावती पर्ची)</h2>
          <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">AEPS Cash Nikasi, Jama ya DMT len-den ki verified computer slip</p>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        ${extraHeaderBtn}
        <button class="modal-close">✕</button>
      </div>
    </div>

    <!-- Print Format Bar -->
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

    <!-- Slip Container -->
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
        <!-- Left: Txn Details -->
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

        <!-- Right: Customer & Bank -->
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

      <!-- Hero Amount -->
      <div class="slip-hero-amount">
        <div>
          <div class="hero-lbl">LEN-DEN RASHI (AMOUNT WITHDRAWN)</div>
          <div class="hero-words">${demoData.amountWords}</div>
        </div>
        <div class="hero-val">${demoData.amount}</div>
      </div>

      <!-- Footer Strip -->
      <div class="slip-footer-strip">
        <div class="slip-status-pill">✅ SUCCESSFUL</div>
        <div style="font-size:11px; color:#64748b;">Thank you for visiting! Phir Padhaarein.</div>
        <div style="font-size:10px; color:#94a3b8;">* Authorized Computer Slip</div>
      </div>
    </div>

    <!-- Modal Footer -->
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
}

// Common CSS
const baseCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0b1329;
    padding: 20px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
  }
  .modal-dialog {
    width: 760px;
    max-width: 100%;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 25px 60px rgba(0,0,0,0.45);
    overflow: hidden;
    position: relative;
  }
  .modal-header {
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }
  .hdr-icon {
    width: 40px; height: 40px; border-radius: 10px;
    background: rgba(16,185,129,0.12); color: #10b981;
    display: flex; align-items: center; justify-content: center; font-size: 20px;
  }
  .modal-close {
    width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0;
    background: #f8fafc; font-size: 15px; cursor: pointer; color: #64748b;
  }
  .print-bar {
    padding: 8px 18px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pfb-btn {
    padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1;
    background: #fff; font-size: 11.5px; font-weight: 700; color: #475569; cursor: pointer;
  }
  .pfb-btn.active {
    background: #0284c7; color: #fff; border-color: #0284c7;
  }
  .receipt-slip {
    margin: 12px 18px;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 12px;
    padding: 14px 18px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.04);
  }
  .slip-header {
    text-align: center;
    border-bottom: 1.5px dashed #cbd5e1;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  .slip-title { font-size: 15px; font-weight: 900; color: #0f172a; letter-spacing: 0.5px; }
  .slip-sub { font-size: 11px; font-weight: 700; color: #0284c7; margin-top: 2px; }
  .slip-contact { font-size: 10.5px; color: #64748b; margin-top: 2px; }
  .slip-numbers-strip {
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(2,132,199,0.08); border: 1.5px solid rgba(2,132,199,0.35);
    border-radius: 7px; padding: 5px 12px; margin-top: 8px; font-size: 11px;
  }
  .sn-lbl { color: #64748b; font-weight: 700; text-transform: uppercase; }
  .sn-val { color: #0284c7; font-weight: 800; font-size: 12.5px; }
  .rrn-val { color: #7c3aed; font-weight: 800; font-size: 12.5px; }
  .sewa-val { color: #059669; font-weight: 800; font-size: 12px; }
  .slip-grid-2col {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;
  }
  .slip-card {
    border-radius: 9px; padding: 9px 12px;
  }
  .slip-card.blue {
    background: rgba(2,132,199,0.04); border: 1px solid rgba(2,132,199,0.25);
  }
  .slip-card.purple {
    background: rgba(124,58,237,0.04); border: 1px solid rgba(124,58,237,0.25);
  }
  .slip-card-head {
    font-size: 11px; font-weight: 800; text-transform: uppercase;
    color: #475569; padding-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.06);
    margin-bottom: 6px;
  }
  .slip-card-rows { display: flex; flex-direction: column; gap: 4px; }
  .slip-row {
    display: flex; justify-content: space-between; font-size: 11.5px; color: #334155;
  }
  .slip-row b { color: #0f172a; font-weight: 700; }
  .slip-hero-amount {
    background: #0f172a; border-radius: 9px; padding: 10px 14px;
    display: flex; justify-content: space-between; align-items: center; color: #fff;
    margin-bottom: 10px;
  }
  .hero-lbl { font-size: 10px; font-weight: 800; opacity: 0.8; letter-spacing: 0.5px; }
  .hero-words { font-size: 11px; color: #cbd5e1; margin-top: 2px; }
  .hero-val { font-size: 22px; font-weight: 900; color: #34d399; }
  .slip-footer-strip {
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10.5px;
  }
  .slip-status-pill {
    background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 800;
    padding: 2px 7px; border-radius: 4px;
  }
  .modal-footer {
    padding: 10px 18px; border-top: 1px solid #e2e8f0;
    display: flex; justify-content: space-between; align-items: center;
    background: #f8fafc;
  }
  .btn-cancel {
    padding: 7px 14px; border-radius: 7px; border: 1.5px solid #cbd5e1;
    background: #fff; font-size: 12px; font-weight: 700; color: #475569; cursor: pointer;
  }
  .btn-whatsapp {
    background: #16a34a; color: #fff; padding: 7px 12px; border-radius: 7px;
    border: none; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .btn-print {
    background: #2563eb; color: #fff; padding: 7px 12px; border-radius: 7px;
    border: none; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .btn-half {
    background: #0284c7; color: #fff; padding: 7px 12px; border-radius: 7px;
    border: none; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .btn-thermal {
    background: #7c3aed; color: #fff; padding: 7px 12px; border-radius: 7px;
    border: none; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .copy-chip {
    background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.4);
    color: inherit; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 5px;
    cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  }
`;

// ============================================================================
// DEMO 1: TOP EXPANDABLE 3-PATTI RIBBON (Directly between format bar & slip)
// ============================================================================
const htmlDemo1 = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Demo 1 - Top 3-Patti Ribbon (Accordion Mode)</title>
  <style>
    ${baseCss}
    .btn-zoom-toggle {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      padding: 6px 14px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 3px 10px rgba(217, 119, 6, 0.35);
      animation: pulseBtn 2s infinite;
    }
    @keyframes pulseBtn {
      0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
      50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
    }
    
    /* 3-Patti Container (Demo 1) */
    .register-strips-box {
      margin: 12px 18px 0 18px;
      background: #0f172a;
      border: 2px solid #3b82f6;
      border-radius: 12px;
      padding: 12px 14px;
      box-shadow: 0 8px 24px rgba(2, 132, 199, 0.2);
    }
    .rs-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .rs-title {
      font-size: 12px;
      font-weight: 800;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rs-badge {
      background: #2563eb;
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 4px;
    }
    
    /* Patti 1, 2, 3 */
    .patti-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      border-radius: 8px;
      margin-bottom: 7px;
      transition: all 0.15s ease;
    }
    .patti-card:last-child { margin-bottom: 0; }
    
    /* Patti 1: Mobile (Bright Amber / Gold) */
    .patti-mobile {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.28));
      border: 1.5px solid #f59e0b;
      color: #fef3c7;
    }
    /* Patti 2: Aadhaar (Bright Emerald) */
    .patti-aadhaar {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(5, 150, 105, 0.28));
      border: 1.5px solid #10b981;
      color: #d1fae5;
    }
    /* Patti 3: UTR (Bright Electric Violet) */
    .patti-utr {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(109, 40, 217, 0.28));
      border: 1.5px solid #8b5cf6;
      color: #ede9fe;
    }
    
    .patti-lbl {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 6px;
      width: 170px;
    }
    .patti-val {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 2px;
      font-family: 'Inter', sans-serif;
      color: #ffffff;
      text-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
  </style>
</head>
<body>
  <div class="modal-dialog">
    <!-- Header with Zoom Button -->
    <div class="modal-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="hdr-icon">🖨️</div>
        <div>
          <h2 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">Customer Transaction Slip (ग्राहक पावती पर्ची)</h2>
          <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">AEPS Cash Nikasi, Jama ya DMT len-den ki verified computer slip</p>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <!-- ZOOM BUTTON -->
        <button class="btn-zoom-toggle" title="Shortcut: Z">
          <span>🔍</span> <span>Zoom Mode (Bada Dekhein) [Z]</span>
        </button>
        <button class="modal-close">✕</button>
      </div>
    </div>

    <!-- Print Format Bar -->
    <div class="print-bar">
      <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#475569;">
        <span>🖨️ Print Format:</span>
        <button class="pfb-btn active">📄 Print A4</button>
        <button class="pfb-btn">📑 Print A4/2</button>
        <button class="pfb-btn">🧾 Slip (Thermal 80mm)</button>
      </div>
      <div style="font-size:11px; font-weight:700; color:#d97706; background:#fef3c7; border:1px solid #fde68a; padding:3px 9px; border-radius:5px;">
        📖 Register likhne ke liye Zoom Mode ON hai
      </div>
    </div>

    <!-- 🌟 DEMO 1: TOP 3-PATTI RIBBON 🌟 -->
    <div class="register-strips-box">
      <div class="rs-head">
        <div class="rs-title">
          <span>📖 REGISTER WRITING ASSISTANT (BADE AKSHARON ME 3 PATTI)</span>
        </div>
        <span class="rs-badge">ZOOM ACTIVE</span>
      </div>

      <!-- Patti 1: Mobile -->
      <div class="patti-card patti-mobile">
        <div class="patti-lbl">
          <span>📱</span> <span>Mobile Number:</span>
        </div>
        <div class="patti-val">${demoData.phone}</div>
        <button class="copy-chip">📋 Copy</button>
      </div>

      <!-- Patti 2: Aadhaar -->
      <div class="patti-card patti-aadhaar">
        <div class="patti-lbl">
          <span>🪪</span> <span>Aadhaar Number:</span>
        </div>
        <div class="patti-val">${demoData.aadhaar}</div>
        <button class="copy-chip">📋 Copy</button>
      </div>

      <!-- Patti 3: UTR -->
      <div class="patti-card patti-utr">
        <div class="patti-lbl">
          <span>🔢</span> <span>Bank Ref / UTR:</span>
        </div>
        <div class="patti-val">${demoData.rrnFormatted}</div>
        <button class="copy-chip">📋 Copy</button>
      </div>
    </div>

    <!-- Slip Container (Unchanged) -->
    <div class="receipt-slip" style="margin-top: 10px;">
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

    <!-- Modal Footer -->
    <div class="modal-footer">
      <button class="btn-cancel">Band Karein (Esc)</button>
      <div style="display:flex; gap:8px;">
        <button class="btn-whatsapp">💬 WhatsApp Share</button>
        <button class="btn-print">📄 Print A4</button>
        <button class="btn-half">📑 Print A4/2</button>
        <button class="btn-thermal">🧾 Thermal Slip (80mm)</button>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ============================================================================
// DEMO 2: FULL-SCREEN OLED FOCUS MODAL (Dedicated High-Focus Writing Screen)
// ============================================================================
const htmlDemo2 = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Demo 2 - OLED Focus Screen (Ultra-Big 3 Patti Modal)</title>
  <style>
    ${baseCss}
    /* Backdrop dim */
    .oled-focus-card {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #020617;
      border-radius: 16px;
      z-index: 50;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: inset 0 0 50px rgba(0,0,0,0.8);
    }
    .oled-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1.5px solid #1e293b;
    }
    .oled-title {
      font-size: 16px;
      font-weight: 900;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: 0.5px;
    }
    .btn-oled-close {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .oled-strips-stack {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin: 16px 0;
    }
    .oled-patti {
      border-radius: 12px;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .oled-patti-mobile {
      background: linear-gradient(135deg, #0f172a, #1e1b4b);
      border: 2px solid #3b82f6;
    }
    .oled-patti-aadhaar {
      background: linear-gradient(135deg, #0f172a, #064e3b);
      border: 2px solid #10b981;
    }
    .oled-patti-utr {
      background: linear-gradient(135deg, #0f172a, #3b0764);
      border: 2px solid #a855f7;
    }
    
    .oled-patti-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .oled-patti-tag {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .oled-patti-sub {
      font-size: 11px;
      color: #94a3b8;
    }
    .oled-patti-num {
      font-size: 32px;
      font-weight: 900;
      letter-spacing: 3px;
      font-family: 'Inter', -apple-system, sans-serif;
    }
    .oled-bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 14px;
      border-top: 1.5px solid #1e293b;
    }
  </style>
</head>
<body>
  <div class="modal-dialog">
    <!-- OLED FOCUS MODAL OVERLAY (DEMO 2) -->
    <div class="oled-focus-card">
      <div class="oled-top-bar">
        <div class="oled-title">
          <span>🔍</span>
          <span>REGISTER WRITING FOCUS MODE (रजिस्टर में लिखने के लिए)</span>
        </div>
        <button class="btn-oled-close">✕ Wapas Slip Par Jayein (Esc / Z)</button>
      </div>

      <!-- 3 HUGE PATTI BARS -->
      <div class="oled-strips-stack">
        <!-- Patti 1: Mobile -->
        <div class="oled-patti oled-patti-mobile">
          <div class="oled-patti-info">
            <div class="oled-patti-tag" style="color:#60a5fa;">📱 1. GRAHAK MOBILE NUMBER</div>
            <div class="oled-patti-sub">Customer contact number</div>
          </div>
          <div class="oled-patti-num" style="color:#ffffff;">${demoData.phone}</div>
          <button class="copy-chip" style="background:#2563eb; color:#fff; border:none; padding:6px 12px; font-size:11px;">📋 Copy</button>
        </div>

        <!-- Patti 2: Aadhaar -->
        <div class="oled-patti oled-patti-aadhaar">
          <div class="oled-patti-info">
            <div class="oled-patti-tag" style="color:#34d399;">🪪 2. AADHAAR CARD NUMBER</div>
            <div class="oled-patti-sub">12-Ank Aadhaar Number (4-4-4 format)</div>
          </div>
          <div class="oled-patti-num" style="color:#34d399;">${demoData.aadhaar}</div>
          <button class="copy-chip" style="background:#059669; color:#fff; border:none; padding:6px 12px; font-size:11px;">📋 Copy</button>
        </div>

        <!-- Patti 3: UTR -->
        <div class="oled-patti oled-patti-utr">
          <div class="oled-patti-info">
            <div class="oled-patti-tag" style="color:#c084fc;">🔢 3. BANK REF / UTR (RRN NUMBER)</div>
            <div class="oled-patti-sub">12-Digit Banking Transaction Reference</div>
          </div>
          <div class="oled-patti-num" style="color:#e9d5ff;">${demoData.rrnFormatted}</div>
          <button class="copy-chip" style="background:#7c3aed; color:#fff; border:none; padding:6px 12px; font-size:11px;">📋 Copy</button>
        </div>
      </div>

      <!-- Quick Hint Bar -->
      <div class="oled-bottom-bar">
        <div style="font-size:12px; color:#94a3b8;">
          💡 <b>Tip:</b> Teeno numbers bade font me hain taaki dairy/register me likhte samay aakhon par zor na pade.
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn-oled-close" style="background:#0284c7; color:#fff; border:none; font-weight:800;">📋 Teeno Number Copy Karein</button>
          <button class="btn-oled-close">✕ Band Karein</button>
        </div>
      </div>
    </div>

    <!-- Background Slip underneath (dimmed) -->
    ${getSlipHtml()}
  </div>
</body>
</html>
`;

// ============================================================================
// DEMO 3: DOCKED BOTTOM/TOP FLOATING CARDS (Always visible without covering slip)
// ============================================================================
const htmlDemo3 = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Demo 3 - High-Contrast 3-Patti Cards (Docked Strip)</title>
  <style>
    ${baseCss}
    .btn-zoom-toggle-cyan {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      padding: 6px 14px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 3px 10px rgba(2, 132, 199, 0.35);
    }
    
    /* 3 Separate Floating Horizontal Cards */
    .strips-grid-3 {
      display: grid;
      grid-template-columns: 1fr 1.1fr 1.15fr;
      gap: 8px;
      margin: 10px 18px 0 18px;
    }
    .strip-box {
      border-radius: 10px;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      position: relative;
    }
    .strip-box-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .strip-box-val {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1.5px;
      font-family: 'Inter', sans-serif;
    }
    
    /* Box 1: Mobile */
    .s-blue {
      background: #eff6ff;
      border: 2px solid #3b82f6;
      color: #1e40af;
    }
    .s-blue .strip-box-val { color: #1d4ed8; }

    /* Box 2: Aadhaar */
    .s-green {
      background: #ecfdf5;
      border: 2px solid #10b981;
      color: #065f46;
    }
    .s-green .strip-box-val { color: #047857; }

    /* Box 3: UTR */
    .s-purple {
      background: #f5f3ff;
      border: 2px solid #8b5cf6;
      color: #5b21b6;
    }
    .s-purple .strip-box-val { color: #6d28d9; }
  </style>
</head>
<body>
  <div class="modal-dialog">
    <!-- Header with Zoom Button -->
    <div class="modal-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="hdr-icon">🖨️</div>
        <div>
          <h2 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">Customer Transaction Slip (ग्राहक पावती पर्ची)</h2>
          <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">AEPS Cash Nikasi, Jama ya DMT len-den ki verified computer slip</p>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="btn-zoom-toggle-cyan">
          <span>🔍</span> <span>Zoom Mode: Active [Z]</span>
        </button>
        <button class="modal-close">✕</button>
      </div>
    </div>

    <!-- Print Format Bar -->
    <div class="print-bar">
      <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#475569;">
        <span>🖨️ Print Format:</span>
        <button class="pfb-btn active">📄 Print A4</button>
        <button class="pfb-btn">📑 Print A4/2</button>
        <button class="pfb-btn">🧾 Slip (Thermal 80mm)</button>
      </div>
      <div style="font-size:11px; font-weight:700; color:#0284c7; background:#e0f2fe; padding:3px 8px; border-radius:5px;">
        🔍 3-Patti Side-by-Side View
      </div>
    </div>

    <!-- 🌟 DEMO 3: 3 SEPARATE DOCKED CARDS 🌟 -->
    <div class="strips-grid-3">
      <!-- Card 1: Mobile -->
      <div class="strip-box s-blue">
        <div class="strip-box-top">
          <span>📱 Mobile Number</span>
          <span style="font-size:9.5px; opacity:0.8;">[📋 Copy]</span>
        </div>
        <div class="strip-box-val">${demoData.phone}</div>
      </div>

      <!-- Card 2: Aadhaar -->
      <div class="strip-box s-green">
        <div class="strip-box-top">
          <span>🪪 Aadhaar Number</span>
          <span style="font-size:9.5px; opacity:0.8;">[📋 Copy]</span>
        </div>
        <div class="strip-box-val">${demoData.aadhaar}</div>
      </div>

      <!-- Card 3: UTR -->
      <div class="strip-box s-purple">
        <div class="strip-box-top">
          <span>🔢 Bank Ref / UTR</span>
          <span style="font-size:9.5px; opacity:0.8;">[📋 Copy]</span>
        </div>
        <div class="strip-box-val">${demoData.rrn}</div>
      </div>
    </div>

    <!-- Slip Container (Unchanged) -->
    <div class="receipt-slip" style="margin-top: 10px;">
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

    <!-- Modal Footer -->
    <div class="modal-footer">
      <button class="btn-cancel">Band Karein (Esc)</button>
      <div style="display:flex; gap:8px;">
        <button class="btn-whatsapp">💬 WhatsApp Share</button>
        <button class="btn-print">📄 Print A4</button>
        <button class="btn-half">📑 Print A4/2</button>
        <button class="btn-thermal">🧾 Thermal Slip (80mm)</button>
      </div>
    </div>
  </div>
</body>
</html>
`;

// Write demo HTML files to public/demos/
const demosDir = path.join(__dirname, '../public/demos');
if (!fs.existsSync(demosDir)) fs.mkdirSync(demosDir, { recursive: true });

fs.writeFileSync(path.join(demosDir, 'slip_demo1_top_ribbon.html'), htmlDemo1, 'utf8');
fs.writeFileSync(path.join(demosDir, 'slip_demo2_focus_modal.html'), htmlDemo2, 'utf8');
fs.writeFileSync(path.join(demosDir, 'slip_demo3_floating_hud.html'), htmlDemo3, 'utf8');
console.log('Generated 3 HTML demo files in public/demos/ !');

// Comparison Page
const selectorHtml = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>Customer Slip Zoom Mode - 3 Design Demos</title>
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
    <h2>🔍 Customer Slip Zoom Shortcut — 3 Design Demos</h2>
    <p style="color:#94a3b8; font-size:13px;">Mobile, Aadhaar aur UTR ko bada dekhne ke liye 3 vikalp:</p>
  </div>
  <div class="nav">
    <button class="btn active" onclick="load('slip_demo1_top_ribbon.html', this)">🌟 Option 1: Top 3-Patti Ribbon (Accordion Banner)</button>
    <button class="btn" onclick="load('slip_demo2_focus_modal.html', this)">🌟 Option 2: Full-Screen OLED Focus Mode (Ultra Big)</button>
    <button class="btn" onclick="load('slip_demo3_floating_hud.html', this)">🌟 Option 3: 3-Patti Docked Cards (Side-by-Side)</button>
  </div>
  <iframe id="viewFrame" src="slip_demo1_top_ribbon.html"></iframe>
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
fs.writeFileSync(path.join(demosDir, 'slip_zoom_selector.html'), selectorHtml, 'utf8');

// Function to capture screenshots with headless chrome
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
  '--remote-debugging-port=9280',
  '--window-size=1200,1050'
]);

setTimeout(async () => {
  try {
    const tabs = await (await fetch('http://127.0.0.1:9280/json')).json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let reqId = 1;
    const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);
    await send('Page.enable');

    const demos = [
      { name: 'slip_zoom_demo1.png', url: 'http://localhost:3000/demos/slip_demo1_top_ribbon.html' },
      { name: 'slip_zoom_demo2.png', url: 'http://localhost:3000/demos/slip_demo2_focus_modal.html' },
      { name: 'slip_zoom_demo3.png', url: 'http://localhost:3000/demos/slip_demo3_floating_hud.html' }
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
    console.log('All 3 slip zoom demo screenshots captured successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error in capture:', err);
    p.kill();
    process.exit(1);
  }
}, 2500);
