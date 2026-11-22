const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

const tempDir = path.join(__dirname, '../public/demos');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Realistic sample data matching USER'S EXACT SCREENSHOTS:
// Sajid Husain (#830), Phone: 8400974496, Aadhaar: 5650 3895 3680, DOB: 1974-04-23
const sample = {
  customerSelect: "[#830] Sajid Husain - 8400974496 [UID: 3680]",
  name: "Sajid Husain",
  phone: "8400974496",
  phoneBadge: "🪪 Aadhaar Priority (Phone: Parivar)",
  aadhaar: "5650 3895 3680",
  aadhaarBadge: "✅ Auto-Fill: Sajid Husain (#830)",
  dob: "23/04/1974",
  dobBadge: "🎂 1974-04-23",
  bank: "State Bank of India",
  balance: "8450.50",
  portal: "Digipay Lite",
  rrn: "631713182593",
  date: "2026-11-13",
  displayDate: "13-Nov-2026",
  amount: "2000.00",
  charge: "20.00",
  commission: "7.92",
  profit: "27.92"
};

const baseCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #0f172a;
    padding: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    color: #1e293b;
    -webkit-font-smoothing: antialiased;
  }
  .demo-container {
    width: 100%;
    max-width: 1080px;
    background: #ffffff;
    border-radius: 18px;
    box-shadow: 0 25px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  /* Top Banner */
  .cm-return-banner {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    padding: 8px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
  }
  .cm-return-btn {
    background: rgba(0, 0, 0, 0.28);
    color: #ffffff !important;
    border: 1px solid rgba(255,255,255,0.45);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }
  /* Header */
  .modal-hdr {
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
  }
  .hdr-left { display: flex; align-items: center; gap: 10px; }
  .hdr-icon {
    width: 36px; height: 36px; border-radius: 9px;
    background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 17px;
  }
  .hdr-title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0; }
  .hdr-sub { font-size: 11.5px; color: #64748b; margin-top: 1px; }
  .hdr-close {
    width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e2e8f0;
    background: #fff; color: #64748b; font-size: 15px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  /* Service Tabs */
  .srv-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 10px 20px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
  }
  .srv-tab {
    padding: 7px 12px;
    border-radius: 8px;
    border: 1.5px solid #e2e8f0;
    background: #f8fafc;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }
  .srv-tab.active {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    border-color: #2563eb;
    color: #ffffff;
    box-shadow: 0 3px 10px rgba(37,99,235,0.3);
  }
  /* Form Controls */
  .f-group { display: flex; flex-direction: column; gap: 4px; }
  .f-label {
    font-size: 11.5px;
    font-weight: 700;
    color: #334155;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 19px;
  }
  .f-label .req { color: #ef4444; margin-left: 2px; }
  .f-input {
    height: 38px;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    background: #ffffff;
    outline: none;
    width: 100%;
    transition: all 0.15s ease;
  }
  .f-mono { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; }
  .btn-mini-copy {
    background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569;
    border-radius: 4px; font-size: 10px; font-weight: 700; padding: 2px 7px;
    cursor: pointer; display: inline-flex; align-items: center; gap: 3px;
  }
  /* Badges */
  .badge-parivar {
    background: rgba(245, 158, 11, 0.12); color: #b45309; font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(245, 158, 11, 0.3);
    white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;
  }
  .badge-autofill {
    background: rgba(16, 185, 129, 0.12); color: #047857; font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(16, 185, 129, 0.3);
    white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;
  }
  .badge-dob {
    background: rgba(16, 185, 129, 0.1); color: #059669; font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(16, 185, 129, 0.25);
    white-space: nowrap;
  }
  /* Footer */
  .modal-ftr {
    padding: 12px 20px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn-cancel {
    padding: 9px 18px; border-radius: 8px; border: 1.5px solid #cbd5e1;
    background: #fff; color: #475569; font-weight: 700; font-size: 13px; cursor: pointer;
  }
  .btn-print {
    padding: 9px 18px; border-radius: 8px; border: none;
    background: #0284c7; color: #fff; font-weight: 700; font-size: 13px; cursor: pointer;
    box-shadow: 0 2px 6px rgba(2,132,199,0.3);
  }
  .btn-save {
    padding: 9px 24px; border-radius: 8px; border: none;
    background: #059669; color: #fff; font-weight: 800; font-size: 13.5px; cursor: pointer;
    box-shadow: 0 3px 10px rgba(5,150,105,0.35);
  }
`;

// ============================================================================
// DEMO 1: "Sub-Row Badges & Clean Two-Column Layout" (Zero Clipping)
// Badges are placed directly under the input or in a dedicated sub-strip
// ============================================================================
function getHtmlDemo1() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Demo 1 - Clean Sub-Row Badges</title>
  <style>
    ${baseCss}
    .d1-body {
      padding: 16px 20px;
      display: grid;
      grid-template-columns: 1.25fr 0.95fr;
      gap: 16px;
      background: #f1f5f9;
    }
    .card-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card-title {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 6px;
      padding-bottom: 6px;
      border-bottom: 1px solid #f1f5f9;
    }
    .field-hint-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 3px;
      font-size: 10.5px;
    }
    .amount-hero {
      background: linear-gradient(135deg, rgba(37,99,235,0.06), rgba(5,150,105,0.08));
      border: 2px solid #059669;
      border-radius: 12px;
      padding: 12px 14px;
    }
  </style>
</head>
<body>
<div class="demo-container">
  <!-- Banner -->
  <div class="cm-return-banner">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="background:#2563eb; color:#fff; font-size:10.5px; padding:2px 8px; border-radius:4px; font-weight:800;">OPTION 1: DEDICATED SUB-BADGES</span>
      <span>⚡ Extension Grabber Active (Entry loaded from portal)</span>
    </div>
    <button class="cm-return-btn">🔙 Wapas Portal Tab Par Jayein (Ctrl+Alt+P)</button>
  </div>

  <!-- Header -->
  <div class="modal-hdr">
    <div class="hdr-left">
      <div class="hdr-icon">🏛️</div>
      <div>
        <h2 class="hdr-title">Cash Withdrawal (AEPS / Micro-ATM)</h2>
        <div class="hdr-sub">Grahak Seva Counter • Real-Time Banking & DMT Entry</div>
      </div>
    </div>
    <div class="hdr-close">✕</div>
  </div>

  <!-- Service Tabs -->
  <div class="srv-tabs">
    <div class="srv-tab active"><span>💸 Cash Nikasi (AEPS)</span></div>
    <div class="srv-tab"><span>📥 Cash Jama</span></div>
    <div class="srv-tab"><span>↗️ Money Transfer (DMT)</span></div>
    <div class="srv-tab"><span>📲 QR Code Payment</span></div>
  </div>

  <!-- Main Body: 2 Columns -->
  <div class="d1-body">
    <!-- LEFT: Customer & Bank -->
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="card-box">
        <div class="card-title">
          <span>👤 1. Grahak Jankari (Customer Information)</span>
          <span style="margin-left:auto; font-size:11px; color:#2563eb; cursor:pointer;">+ Naya Grahak</span>
        </div>

        <!-- Search Bar -->
        <div style="background:#f8fafc; border:1.5px solid #94a3b8; border-radius:8px; padding:7px 12px; font-size:12.5px; font-weight:700; display:flex; justify-content:space-between;">
          <span>🔍 ${sample.customerSelect}</span>
          <span style="color:#64748b;">✕ ▼</span>
        </div>

        <!-- Row 1: Customer Name (Full 55% width - NEVER clips!) + Mobile -->
        <div style="display:grid; grid-template-columns: 1.25fr 1fr; gap:10px;">
          <div class="f-group">
            <div class="f-label"><span>Grahak ka Naam (Customer Name) <span class="req">*</span></span></div>
            <input type="text" class="f-input" value="${sample.name}" style="font-weight:700; font-size:14px;">
            <div class="field-hint-strip">
              <span style="color:#059669; font-weight:700;">👤 Registered Customer (#830)</span>
            </div>
          </div>

          <div class="f-group">
            <div class="f-label">
              <span>Mobile Number</span>
              <span class="btn-mini-copy">📋 Copy</span>
            </div>
            <input type="text" class="f-input f-mono" value="${sample.phone}">
            <div class="field-hint-strip">
              <span class="badge-parivar">${sample.phoneBadge}</span>
            </div>
          </div>
        </div>

        <!-- Row 2: Aadhaar + DOB -->
        <div style="display:grid; grid-template-columns: 1.25fr 1fr; gap:10px;">
          <div class="f-group">
            <div class="f-label">
              <span>Aadhaar Number</span>
              <span class="btn-mini-copy">📋 Copy</span>
            </div>
            <input type="text" class="f-input f-mono" value="${sample.aadhaar}" style="font-weight:700;">
            <div class="field-hint-strip">
              <span class="badge-autofill">${sample.aadhaarBadge}</span>
            </div>
          </div>

          <div class="f-group">
            <div class="f-label">
              <span>🎂 Janm Tithi (DOB)</span>
              <span class="btn-mini-copy">📋 Copy</span>
            </div>
            <input type="text" class="f-input f-mono" value="${sample.dob}">
            <div class="field-hint-strip">
              <span class="badge-dob">${sample.dobBadge}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Banking Card -->
      <div class="card-box">
        <div class="card-title"><span>🏦 2. Banking & Portal Vivaran</span></div>
        <div style="display:grid; grid-template-columns: 1.25fr 1fr; gap:10px;">
          <div class="f-group">
            <div class="f-label"><span>Bank Name (Grahak Ka Bank)</span></div>
            <input type="text" class="f-input" value="${sample.bank}" style="font-weight:700;">
          </div>
          <div class="f-group">
            <div class="f-label"><span>Bacha Balance (₹)</span><span class="btn-mini-copy">📋 Copy</span></div>
            <input type="text" class="f-input f-mono" value="₹${sample.balance}" style="font-weight:800; color:#059669;">
          </div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1.2fr 0.9fr; gap:8px;">
          <div class="f-group">
            <div class="f-label"><span>AEPS Portal</span></div>
            <select class="f-input" style="font-weight:700;">
              <option selected>${sample.portal}</option>
              <option>Digipay</option>
            </select>
          </div>
          <div class="f-group">
            <div class="f-label"><span>RRN / UTR Number</span></div>
            <input type="text" class="f-input f-mono" value="${sample.rrn}">
          </div>
          <div class="f-group">
            <div class="f-label"><span>Tarikh (Date)</span></div>
            <input type="date" class="f-input f-mono" value="${sample.date}">
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: Finance & Accounts -->
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="card-box amount-hero">
        <div class="f-label" style="font-size:12.5px; color:#065f46;">
          <span>💵 TRANSACTION AMOUNT (लेन-देन राशि) *</span>
        </div>
        <input type="text" class="f-input" value="₹ ${sample.amount}" style="font-size:26px; font-weight:900; color:#059669; height:46px;">

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
          <div class="f-group">
            <div class="f-label"><span>Grahak Shulk (₹)</span></div>
            <input type="text" class="f-input f-mono" value="₹${sample.charge}" style="font-weight:800; color:#2563eb;">
          </div>
          <div class="f-group">
            <div class="f-label"><span>Commission (₹)</span></div>
            <input type="text" class="f-input f-mono" value="₹${sample.commission}" style="font-weight:800; color:#059669;">
          </div>
        </div>

        <div style="background:#0f172a; border-radius:10px; padding:10px 14px; margin-top:10px; display:flex; justify-content:space-between; align-items:center; color:#fff;">
          <div>
            <div style="font-size:10px; opacity:0.8; text-transform:uppercase;">KUL MUNAFA (NET PROFIT)</div>
            <div style="font-size:18px; font-weight:900; color:#34d399;">+₹ ${sample.profit}</div>
          </div>
          <div style="font-size:11px; text-align:right; opacity:0.85;">
            Shulk: ₹${sample.charge} | Comm: ₹${sample.commission}
          </div>
        </div>
      </div>

      <div class="card-box">
        <div class="card-title"><span>💼 3. Khate evam Galla Settlement</span></div>
        <div class="f-group">
          <div class="f-label"><span>💵 Cash Galla (Cash Diya)</span></div>
          <input type="text" class="f-input" value="Physical Cash (Galla)" readonly style="background:#f8fafc; font-size:12px;">
        </div>
        <div class="f-group" style="margin-top:4px;">
          <div class="f-label"><span>🏛️ Portal Khata (Jahan Balance Aaya)</span></div>
          <input type="text" class="f-input" value="Digipay Lite Wallet [Apna Bank]" readonly style="background:#f8fafc; font-size:12px;">
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="modal-ftr">
    <button class="btn-cancel">Band Karein (Esc)</button>
    <div style="display:flex; gap:10px;">
      <button class="btn-print">🖨️ Save & Print Slip</button>
      <button class="btn-save">💾 Save Entry</button>
    </div>
  </div>
</div>
</body></html>`;
}

// ============================================================================
// DEMO 2: "Dedicated Smart Status Strip" (Recommended for Cleanliness)
// All badges sit in a single high-visibility alert banner across the card
// ============================================================================
function getHtmlDemo2() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Demo 2 - Dedicated Smart Status Strip</title>
  <style>
    ${baseCss}
    .d2-body {
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f1f5f9;
    }
    .section-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 16px;
    }
    .smart-status-banner {
      background: #f0fdf4;
      border: 1.5px solid #86efac;
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11.5px;
    }
    .grid-3-col {
      display: grid;
      grid-template-columns: 1.35fr 1fr 1fr;
      gap: 10px;
    }
  </style>
</head>
<body>
<div class="demo-container">
  <!-- Banner -->
  <div class="cm-return-banner">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="background:#059669; color:#fff; font-size:10.5px; padding:2px 8px; border-radius:4px; font-weight:800;">OPTION 2: SMART STATUS BANNER (SABSE SAAF)</span>
      <span>⚡ Extension Grabber Active (Entry loaded from portal)</span>
    </div>
    <button class="cm-return-btn">🔙 Wapas Portal Tab Par Jayein (Ctrl+Alt+P)</button>
  </div>

  <!-- Header -->
  <div class="modal-hdr">
    <div class="hdr-left">
      <div class="hdr-icon">🏛️</div>
      <div>
        <h2 class="hdr-title">Cash Withdrawal (AEPS / Micro-ATM)</h2>
        <div class="hdr-sub">Grahak Seva Counter • Real-Time Banking & DMT Entry</div>
      </div>
    </div>
    <div class="hdr-close">✕</div>
  </div>

  <!-- Service Tabs -->
  <div class="srv-tabs">
    <div class="srv-tab active"><span>💸 Cash Nikasi (AEPS)</span></div>
    <div class="srv-tab"><span>📥 Cash Jama</span></div>
    <div class="srv-tab"><span>↗️ Money Transfer (DMT)</span></div>
    <div class="srv-tab"><span>📲 QR Code Payment</span></div>
  </div>

  <!-- Main Body -->
  <div class="d2-body">
    <!-- Section 1: Customer Card -->
    <div class="section-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:12px; font-weight:800; color:#475569; text-transform:uppercase;">👤 1. Grahak Jankari (Customer Information)</span>
        <span style="font-size:11px; color:#2563eb; font-weight:700; cursor:pointer;">+ Naya Grahak</span>
      </div>

      <!-- Customer Dropdown -->
      <div style="background:#f8fafc; border:1.5px solid #94a3b8; border-radius:8px; padding:7px 12px; font-size:12.5px; font-weight:700; display:flex; justify-content:space-between; margin-bottom:8px;">
        <span>🔍 ${sample.customerSelect}</span>
        <span style="color:#64748b;">✕ ▼</span>
      </div>

      <!-- SMART STATUS BANNER: Saare badges ek jagah saaf-saaf dikhte hain! -->
      <div class="smart-status-banner">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge-autofill"><b>${sample.aadhaarBadge}</b></span>
          <span class="badge-parivar"><b>${sample.phoneBadge}</b></span>
          <span class="badge-dob"><b>${sample.dobBadge}</b></span>
        </div>
        <button type="button" style="background:#2563eb; color:#fff; border:none; padding:3px 10px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;" title="Parivar sadasya badlein">
          👨‍👩‍👧 Parivar Sadasya (2) ▾
        </button>
      </div>

      <!-- Clean 3-Column Inputs with 100% Equal Height -->
      <div class="grid-3-col">
        <div class="f-group">
          <div class="f-label"><span>Grahak ka Naam (Customer Name) <span class="req">*</span></span></div>
          <input type="text" class="f-input" value="${sample.name}" style="font-weight:700; font-size:14px;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Mobile Number</span><span class="btn-mini-copy">📋 Copy</span></div>
          <input type="text" class="f-input f-mono" value="${sample.phone}">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Aadhaar Number</span><span class="btn-mini-copy">📋 Copy</span></div>
          <input type="text" class="f-input f-mono" value="${sample.aadhaar}" style="font-weight:700;">
        </div>
      </div>
    </div>

    <!-- Section 2: Banking & Portal (3 Columns) -->
    <div class="section-card">
      <div style="font-size:12px; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:8px;">
        🏦 2. Banking & Portal Vivaran (Transaction Details)
      </div>
      <div class="grid-3-col">
        <div class="f-group">
          <div class="f-label"><span>Bank Name (Grahak Ka Bank)</span></div>
          <input type="text" class="f-input" value="${sample.bank}" style="font-weight:700;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Bacha Balance (₹)</span><span class="btn-mini-copy">📋 Copy</span></div>
          <input type="text" class="f-input f-mono" value="₹${sample.balance}" style="font-weight:800; color:#059669;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>AEPS Portal</span></div>
          <select class="f-input" style="font-weight:700;">
            <option selected>${sample.portal}</option>
            <option>Digipay</option>
          </select>
        </div>
      </div>
      <div class="grid-3-col" style="margin-top:8px;">
        <div class="f-group">
          <div class="f-label"><span>RRN / UTR Number</span></div>
          <input type="text" class="f-input f-mono" value="${sample.rrn}">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Tarikh (Date)</span></div>
          <input type="date" class="f-input f-mono" value="${sample.date}">
        </div>
        <div class="f-group">
          <div class="f-label"><span>🎂 Janm Tithi (DOB)</span></div>
          <input type="text" class="f-input f-mono" value="${sample.dob}">
        </div>
      </div>
    </div>

    <!-- Section 3: Financials in 1 Horizontal Line -->
    <div class="section-card" style="background:#f0fdf4; border-color:#86efac;">
      <div style="font-size:12px; font-weight:800; color:#166534; text-transform:uppercase; margin-bottom:8px;">
        💰 3. Dhanrashi, Shulk evam Munafa
      </div>
      <div style="display:grid; grid-template-columns: 1.35fr 1fr 1fr 1fr; gap:10px; align-items:center;">
        <div class="f-group">
          <div class="f-label"><span>Len-Den Amount (₹) *</span></div>
          <input type="text" class="f-input f-mono" value="₹ ${sample.amount}" style="font-size:18px; font-weight:900; color:#059669;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Grahak Shulk (₹)</span></div>
          <input type="text" class="f-input f-mono" value="₹${sample.charge}" style="font-weight:800; color:#2563eb;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Commission (₹)</span></div>
          <input type="text" class="f-input f-mono" value="₹${sample.commission}" style="font-weight:800; color:#059669;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Kul Munafa</span></div>
          <div style="height:38px; background:#0f172a; color:#34d399; font-weight:900; font-size:16px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
            +₹${sample.profit}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="modal-ftr">
    <button class="btn-cancel">Band Karein (Esc)</button>
    <div style="display:flex; gap:10px;">
      <button class="btn-print">🖨️ Save & Print Slip</button>
      <button class="btn-save">💾 Save Entry</button>
    </div>
  </div>
</div>
</body></html>`;
}

// ============================================================================
// DEMO 3: "Card Header Badges & Parivar Switcher Pill"
// Badges are placed directly in the Card Header & Right Edge of Inputs
// ============================================================================
function getHtmlDemo3() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Demo 3 - Header Badges & Parivar Button</title>
  <style>
    ${baseCss}
    .d3-body {
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8fafc;
    }
    .hero-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 14px 18px;
    }
    .parivar-picker-box {
      background: #eff6ff;
      border: 1.5px dashed #3b82f6;
      border-radius: 8px;
      padding: 8px 12px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }
  </style>
</head>
<body>
<div class="demo-container">
  <!-- Banner -->
  <div class="cm-return-banner">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="background:#7c3aed; color:#fff; font-size:10.5px; padding:2px 8px; border-radius:4px; font-weight:800;">OPTION 3: HEADER INTEGRATED BADGES</span>
      <span>⚡ Extension Grabber Active (Entry loaded from portal)</span>
    </div>
    <button class="cm-return-btn">🔙 Wapas Portal Tab Par Jayein (Ctrl+Alt+P)</button>
  </div>

  <!-- Header -->
  <div class="modal-hdr">
    <div class="hdr-left">
      <div class="hdr-icon" style="background:#7c3aed;">🏛️</div>
      <div>
        <h2 class="hdr-title">Cash Withdrawal (AEPS / Micro-ATM)</h2>
        <div class="hdr-sub">Grahak Seva Counter • Real-Time Banking & DMT Entry</div>
      </div>
    </div>
    <div class="hdr-close">✕</div>
  </div>

  <!-- Service Tabs -->
  <div class="srv-tabs">
    <div class="srv-tab active" style="background:linear-gradient(135deg, #7c3aed, #6d28d9); border-color:#7c3aed;"><span>💸 Cash Nikasi (AEPS)</span></div>
    <div class="srv-tab"><span>📥 Cash Jama</span></div>
    <div class="srv-tab"><span>↗️ Money Transfer (DMT)</span></div>
    <div class="srv-tab"><span>📲 QR Code Payment</span></div>
  </div>

  <!-- Main Body -->
  <div class="d3-body">
    <!-- Card 1: Grahak Info with Badges in Header -->
    <div class="hero-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <b style="font-size:13px; color:#0f172a;">👤 GRAHAK PROFILE: Sajid Husain (#830)</b>
          <span class="badge-autofill">${sample.aadhaarBadge}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge-parivar">${sample.phoneBadge}</span>
          <span class="badge-dob">${sample.dobBadge}</span>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1.3fr 1fr 1fr; gap:10px;">
        <div class="f-group">
          <div class="f-label"><span>Customer Name</span></div>
          <input type="text" class="f-input" value="${sample.name}" style="font-weight:700; font-size:14px;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Mobile Number</span><span class="btn-mini-copy">📋 Copy</span></div>
          <input type="text" class="f-input f-mono" value="${sample.phone}">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Aadhaar Number</span><span class="btn-mini-copy">📋 Copy</span></div>
          <input type="text" class="f-input f-mono" value="${sample.aadhaar}" style="font-weight:700;">
        </div>
      </div>

      <!-- Parivar Popup Link directly inside form -->
      <div class="parivar-picker-box">
        <div style="display:flex; align-items:center; gap:8px; color:#1e40af;">
          <span>👨‍👩‍👧 <b>Is Mobile Number par 2 Grahak Darz Hain</b> (Sajid Husain, Parivar Member)</span>
        </div>
        <button type="button" style="background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">
          👥 Parivar Sadasya Badlein
        </button>
      </div>
    </div>

    <!-- Card 2: Banking & Portal Details -->
    <div class="hero-card">
      <div style="font-size:12px; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:8px;">
        🏦 2. Banking & Portal Vivaran
      </div>
      <div style="display:grid; grid-template-columns: 1.3fr 1fr 1fr; gap:10px;">
        <div class="f-group">
          <div class="f-label"><span>Bank Name</span></div>
          <input type="text" class="f-input" value="${sample.bank}" style="font-weight:700;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Bacha Balance</span><span class="btn-mini-copy">📋 Copy</span></div>
          <input type="text" class="f-input f-mono" value="₹${sample.balance}" style="font-weight:800; color:#059669;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Portal / RRN</span></div>
          <input type="text" class="f-input f-mono" value="${sample.portal} • ${sample.rrn.slice(-6)}" readonly style="background:#f8fafc;">
        </div>
      </div>
    </div>

    <!-- Card 3: Financials & Cash Flow Strip -->
    <div class="hero-card" style="border:1.5px solid #a78bfa;">
      <div style="display:grid; grid-template-columns: 1.2fr 1fr 1fr; gap:12px; margin-bottom:10px;">
        <div class="f-group">
          <div class="f-label"><span style="color:#6d28d9; font-weight:800;">LEN-DEN RASHI (AMOUNT ₹) *</span></div>
          <input type="text" class="f-input f-mono" value="₹ ${sample.amount}" style="font-size:20px; font-weight:900; color:#6d28d9; height:42px;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Grahak Shulk (₹)</span></div>
          <input type="text" class="f-input f-mono" value="₹${sample.charge}" style="font-size:16px; font-weight:800; color:#2563eb; height:42px;">
        </div>
        <div class="f-group">
          <div class="f-label"><span>Commission (₹)</span></div>
          <input type="text" class="f-input f-mono" value="₹${sample.commission}" style="font-size:16px; font-weight:800; color:#059669; height:42px;">
        </div>
      </div>

      <div style="background:#0f172a; border-radius:10px; padding:10px 14px; display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; color:#fff;">
        <div>
          <div style="font-size:10px; opacity:0.75; text-transform:uppercase;">🔴 Galle se Cash Diya</div>
          <div style="font-size:16px; font-weight:900; color:#f87171; font-family:'JetBrains Mono';">-₹${sample.amount}</div>
        </div>
        <div>
          <div style="font-size:10px; opacity:0.75; text-transform:uppercase;">🟢 Grahak se Shulk</div>
          <div style="font-size:16px; font-weight:900; color:#34d399; font-family:'JetBrains Mono';">+₹${sample.charge}</div>
        </div>
        <div>
          <div style="font-size:10px; opacity:0.75; text-transform:uppercase;">🟣 Portal Wallet Aaya</div>
          <div style="font-size:16px; font-weight:900; color:#a78bfa; font-family:'JetBrains Mono';">+₹2,007.92</div>
        </div>
        <div style="border-left:1px dashed rgba(255,255,255,0.25); padding-left:12px;">
          <div style="font-size:10px; opacity:0.75; text-transform:uppercase;">💰 Asli Munafa</div>
          <div style="font-size:16px; font-weight:900; color:#fbbf24; font-family:'JetBrains Mono';">+₹${sample.profit}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="modal-ftr">
    <button class="btn-cancel">Band Karein (Esc)</button>
    <div style="display:flex; gap:10px;">
      <button class="btn-print">🖨️ Save & Print Slip</button>
      <button class="btn-save" style="background:#7c3aed;">💾 Save Entry</button>
    </div>
  </div>
</div>
</body></html>`;
}

const demoFiles = [
  { name: 'modal_demo1_split_dashboard.html', html: getHtmlDemo1(), outPng: 'bc_modal_demo1_split_dashboard.png' },
  { name: 'modal_demo2_aligned_3col.html', html: getHtmlDemo2(), outPng: 'bc_modal_demo2_aligned_3col.png' },
  { name: 'modal_demo3_fintech_cards.html', html: getHtmlDemo3(), outPng: 'bc_modal_demo3_fintech_cards.png' }
];

demoFiles.forEach(d => {
  fs.writeFileSync(path.join(tempDir, d.name), d.html, 'utf8');
});

console.log('Regenerated 3 modal demo HTML files with exact badges in public/demos/');

function cdpSend(ws, method, params = {}, id = 1) {
    return new Promise((resolve, reject) => {
        const msg = JSON.stringify({ id, method, params });
        ws.send(msg);
        const handler = (event) => {
            const res = JSON.parse(event.data);
            if (res.id === id) {
                ws.removeEventListener('message', handler);
                if (res.error) reject(res.error);
                else resolve(res.result);
            }
        };
        ws.addEventListener('message', handler);
    });
}

const p = spawn(CHROME_PATH, [
    '--headless',
    '--remote-debugging-port=9273',
    '--window-size=1220,940'
]);

setTimeout(async () => {
    try {
        const tabs = await (await fetch('http://127.0.0.1:9273/json')).json();
        const pageTab = tabs.find(t => t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');

        for (const d of demoFiles) {
            console.log('Capturing:', d.name);
            await send('Page.navigate', { url: `http://localhost:3000/demos/${d.name}` });
            await new Promise(r => setTimeout(r, 1200));
            const ss = await send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(previewDir, d.outPng), Buffer.from(ss.data, 'base64'));
            console.log('Saved screenshot:', d.outPng);
        }

        ws.close();
        p.kill();
        console.log('All 3 updated demo screenshots captured successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error during screenshot capture:', err);
        p.kill();
        process.exit(1);
    }
}, 2500);
