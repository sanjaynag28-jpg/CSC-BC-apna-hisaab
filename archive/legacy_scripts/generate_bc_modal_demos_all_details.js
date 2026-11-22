const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

const tempDir = path.join(__dirname, '../public/demos');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// REAL DATA MATCHING USER'S EXACT SCREENSHOTS:
// Sajid Husain (#830), Phone: 8400974496, Aadhaar: 5650 3895 3680, DOB: 23 / 04 / 1974
const data = {
  customerSelect: "[#830] Sajid Husain - 8400974496 [UID: 3680]",
  name: "Sajid Husain",
  phone: "8400974496",
  phoneBadge: "🪪 Aadhaar Priority (Phone: Parivar)",
  aadhaar: "5650 3895 3680",
  aadhaarBadge: "✅ Auto-Fill: Sajid Husain (#830)",
  dobDay: "23",
  dobMonth: "04",
  dobYear: "1974",
  bank: "State Bank of India",
  balance: "8450.50",
  portal: "Digipay Lite",
  rrn: "631713182593",
  date: "2026-11-13",
  displayDate: "13-Nov-2026",
  amount: "2000.00",
  charge: "20.00",
  commission: "7.92",
  profit: "27.92",
  cashAccount: "PHYSICAL CASH (Cash) - ₹1,12,286.60",
  bankAccount: "APNA BANK (Bank) - ₹96,359.04",
  notes: "Digipay Lite | TxnID: 628321157287782241"
};

// PLAIN CLEAN SANS-SERIF TYPOGRAPHY (NO MONOSPACE SLASHED ZEROES)
const commonCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
    background: #0f172a;
    padding: 16px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    color: #1e293b;
    -webkit-font-smoothing: antialiased;
  }
  .modal-window {
    width: 100%;
    max-width: 1140px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 25px 60px -15px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  /* Top Return Banner */
  .return-banner {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    padding: 7px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
  }
  .return-btn {
    background: rgba(0, 0, 0, 0.28);
    color: #ffffff !important;
    border: 1px solid rgba(255,255,255,0.45);
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  /* Header */
  .modal-header-bar {
    padding: 10px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
  }
  .hdr-left { display: flex; align-items: center; gap: 10px; }
  .hdr-icon {
    width: 34px; height: 34px; border-radius: 8px;
    background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 16px;
  }
  .hdr-title { font-size: 15.5px; font-weight: 800; color: #0f172a; margin: 0; }
  .hdr-sub { font-size: 11px; color: #64748b; margin-top: 1px; }
  .hdr-close {
    width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0;
    background: #fff; color: #64748b; font-size: 14px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  /* Service Tabs */
  .service-tabs-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 8px 18px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
  }
  .tab-btn {
    padding: 6px 10px;
    border-radius: 7px;
    border: 1.5px solid #e2e8f0;
    background: #f8fafc;
    color: #475569;
    font-size: 11.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }
  .tab-btn.active {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    border-color: #2563eb;
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(37,99,235,0.3);
  }
  /* Form Field Styles */
  .f-group { display: flex; flex-direction: column; gap: 3px; }
  .f-label {
    font-size: 11px;
    font-weight: 700;
    color: #334155;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 17px;
  }
  .f-label .req { color: #ef4444; margin-left: 2px; }
  .f-input {
    height: 35px;
    border: 1.5px solid #cbd5e1;
    border-radius: 7px;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    background: #ffffff;
    outline: none;
    width: 100%;
    font-family: 'Inter', -apple-system, 'Segoe UI', Arial, sans-serif !important;
    transition: all 0.15s ease;
  }
  .f-input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
  
  /* PLAIN TEXT NUMERIC (NO MONOSPACE 0 SLASHES) */
  .f-plain-num {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif !important;
    font-variant-numeric: normal !important;
    letter-spacing: 0.3px;
  }
  .btn-mini-copy {
    background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569;
    border-radius: 4px; font-size: 9.5px; font-weight: 700; padding: 1px 6px;
    cursor: pointer; display: inline-flex; align-items: center; gap: 3px;
  }

  /* ========================================================================== */
  /* EXACT GLOBAL DOB CONTROL (ALAG-ALAG KHAANE: DD / MM / YYYY + CALENDAR ICON) */
  /* Using Plain Clean Numbers (No slashed zeroes) */
  /* ========================================================================== */
  .global-dob-control {
    display: inline-flex !important;
    align-items: center !important;
    position: relative !important;
    width: 100% !important;
    height: 35px !important;
    background: #ffffff !important;
    border: 1.5px solid #cbd5e1 !important;
    border-radius: 7px !important;
    padding: 2px 8px !important;
    box-sizing: border-box !important;
  }
  .global-dob-control:focus-within {
    border-color: #2563eb !important;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15) !important;
  }
  .global-dob-fields {
    display: inline-flex !important;
    align-items: center !important;
    flex: 1 1 auto !important;
    gap: 4px !important;
  }
  .global-dob-fields .dob-seg {
    background: #f1f5f9 !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 5px !important;
    outline: none !important;
    text-align: center !important;
    font-family: 'Inter', -apple-system, 'Segoe UI', Arial, sans-serif !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    color: #0f172a !important;
    padding: 2px 2px !important;
    height: 26px !important;
    line-height: 22px !important;
    box-sizing: border-box !important;
  }
  .global-dob-fields .dob-seg.dob-day,
  .global-dob-fields .dob-seg.dob-month {
    width: 36px !important;
  }
  .global-dob-fields .dob-seg.dob-year {
    width: 56px !important;
  }
  .global-dob-fields .dob-slash {
    color: #64748b !important;
    font-weight: 800 !important;
    padding: 0 1px !important;
    font-size: 13px !important;
  }
  .global-dob-cal-btn {
    background: transparent !important;
    border: none !important;
    color: #475569 !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 2px !important;
    margin-left: 4px !important;
  }

  /* Badges */
  .badge-parivar {
    background: rgba(245, 158, 11, 0.12); color: #b45309; font-size: 10px; font-weight: 700;
    padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3);
    white-space: nowrap;
  }
  .badge-autofill {
    background: rgba(16, 185, 129, 0.12); color: #047857; font-size: 10px; font-weight: 700;
    padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3);
    white-space: nowrap;
  }
  .badge-dob {
    background: rgba(16, 185, 129, 0.1); color: #059669; font-size: 10px; font-weight: 700;
    padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.25);
    white-space: nowrap;
  }

  /* Live Hisaab Summary Box (As shown in user's image) */
  .live-hisaab-box {
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 9px;
    padding: 8px 11px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .live-hisaab-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10.5px;
    font-weight: 800;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 2px;
  }
  .live-hisaab-row {
    display: flex;
    align-items: center;
    font-size: 11.5px;
    font-weight: 700;
    gap: 6px;
    font-family: 'Inter', -apple-system, 'Segoe UI', Arial, sans-serif !important;
  }
  .tag-pill {
    font-size: 9.5px;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 4px;
  }
  .tag-pill.red { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
  .tag-pill.green { background: #dcfce7; color: #16a34a; border: 1px solid #86efac; }

  /* Panels */
  .panel-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 11px;
    padding: 10px 13px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .panel-hdr {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 5px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f1f5f9;
  }

  /* Footer */
  .modal-ftr {
    padding: 9px 18px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn-cancel {
    padding: 8px 16px; border-radius: 7px; border: 1.5px solid #cbd5e1;
    background: #fff; color: #475569; font-weight: 700; font-size: 12px; cursor: pointer;
  }
  .btn-print {
    padding: 8px 16px; border-radius: 7px; border: none;
    background: #0284c7; color: #fff; font-weight: 700; font-size: 12px; cursor: pointer;
    box-shadow: 0 2px 6px rgba(2,132,199,0.25);
  }
  .btn-save {
    padding: 8px 22px; border-radius: 7px; border: none;
    background: #059669; color: #fff; font-weight: 800; font-size: 12.5px; cursor: pointer;
    box-shadow: 0 3px 8px rgba(5,150,105,0.3);
  }
`;

function getDobControlHtml() {
  return `
    <div class="global-dob-control">
      <div class="global-dob-fields">
        <input class="dob-seg dob-day" placeholder="DD" value="${data.dobDay}" readonly>
        <span class="dob-slash">/</span>
        <input class="dob-seg dob-month" placeholder="MM" value="${data.dobMonth}" readonly>
        <span class="dob-slash">/</span>
        <input class="dob-seg dob-year" placeholder="YYYY" value="${data.dobYear}" readonly>
      </div>
      <button type="button" class="global-dob-cal-btn dob-cal-btn" title="Calendar se chunein">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>
    </div>
  `;
}

// ============================================================================
// DEMO 1A: Executive Split with Plain Text 2000.00 & Exact 3-Box DOB Control
// ============================================================================
function getHtmlDemo1A() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Option 1A - Plain Text Numbers & 3-Box DOB</title>
  <style>
    ${commonCss}
    .body-2col {
      padding: 10px 16px;
      display: grid;
      grid-template-columns: 1.25fr 1.05fr;
      gap: 12px;
      background: #f1f5f9;
    }
    /* PLAIN SANS-SERIF HERO AMOUNT (Wide open circular zeroes, NO slash) */
    .amount-input-plain {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif !important;
      font-size: 24px !important;
      font-weight: 800 !important;
      color: #059669 !important;
      height: 42px !important;
      letter-spacing: 0.5px !important;
    }
  </style>
</head>
<body>
<div class="modal-window">
  <!-- Extension Banner -->
  <div class="return-banner">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="background:#2563eb; color:#fff; font-size:10px; padding:2px 7px; border-radius:4px; font-weight:800;">OPTION 1A: PLAIN TEXT (CLEAN 2000.00)</span>
      <span>⚡ Extension Grabber Active (Entry loaded from portal)</span>
    </div>
    <button class="return-btn">🔙 Wapas Portal Tab Par Jayein (Ctrl+Alt+P)</button>
  </div>

  <!-- Header -->
  <div class="modal-header-bar">
    <div class="hdr-left">
      <div class="hdr-icon">🏛️</div>
      <div>
        <h2 class="hdr-title">Cash Withdrawal (AEPS / Micro-ATM)</h2>
        <div class="hdr-sub">Grahak Seva Counter • Real-Time Banking & DMT Entry</div>
      </div>
    </div>
    <div class="hdr-close">✕</div>
  </div>

  <!-- Tabs -->
  <div class="service-tabs-row">
    <div class="tab-btn active"><span>💸 Cash Nikasi (AEPS)</span></div>
    <div class="tab-btn"><span>📥 Cash Jama</span></div>
    <div class="tab-btn"><span>↗️ Money Transfer (DMT)</span></div>
    <div class="tab-btn"><span>📲 QR Code Payment</span></div>
  </div>

  <!-- Main Body: 2 Columns, ALL details included -->
  <div class="body-2col">
    <!-- LEFT COLUMN: Customer + Banking + Notes (60%) -->
    <div style="display:flex; flex-direction:column; gap:8px;">
      <!-- Section 1: Customer Card -->
      <div class="panel-card">
        <div class="panel-hdr">
          <span>👤 1. Grahak Jankari (Customer Information)</span>
          <span style="margin-left:auto; font-size:10.5px; color:#2563eb; cursor:pointer; font-weight:700;">+ Naya Grahak</span>
        </div>

        <!-- Customer Select Dropdown -->
        <div style="background:#f8fafc; border:1.5px solid #94a3b8; border-radius:7px; padding:5px 10px; font-size:12px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
          <span>🔍 ${data.customerSelect}</span>
          <span style="color:#64748b; font-size:11px;">✕ ▼</span>
        </div>

        <!-- Row 1: Name (Huge room, 55% width) + Mobile (45%) -->
        <div style="display:grid; grid-template-columns: 1.25fr 1fr; gap:8px;">
          <div class="f-group">
            <div class="f-label"><span>Grahak ka Naam (Customer Name) <span class="req">*</span></span></div>
            <input type="text" class="f-input" value="${data.name}" style="font-weight:700; font-size:13.5px;">
            <div style="font-size:10px; color:#059669; font-weight:700; margin-top:2px;">
              👤 Registered Customer (#830)
            </div>
          </div>

          <div class="f-group">
            <div class="f-label">
              <span>Mobile Number</span>
              <span class="btn-mini-copy">📋 Copy</span>
            </div>
            <input type="text" class="f-input f-plain-num" value="${data.phone}">
            <div style="margin-top:2px;">
              <span class="badge-parivar">${data.phoneBadge}</span>
            </div>
          </div>
        </div>

        <!-- Row 2: Aadhaar + EXACT 3-BOX DOB -->
        <div style="display:grid; grid-template-columns: 1.25fr 1fr; gap:8px;">
          <div class="f-group">
            <div class="f-label">
              <span>Aadhaar Number</span>
              <span class="btn-mini-copy">📋 Copy</span>
            </div>
            <input type="text" class="f-input f-plain-num" value="${data.aadhaar}" style="font-weight:700;">
            <div style="margin-top:2px;">
              <span class="badge-autofill">${data.aadhaarBadge}</span>
            </div>
          </div>

          <!-- EXACT GLOBAL DOB 3-BOX CONTROL AS SHOWN IN USER SCREENSHOT -->
          <div class="f-group">
            <div class="f-label">
              <span>🎂 Janm Tithi (DOB)</span>
              <span class="btn-mini-copy">📋 Copy</span>
            </div>
            ${getDobControlHtml()}
            <div style="margin-top:2px;">
              <span class="badge-dob">🎂 1974-04-23</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Banking & Portal Card -->
      <div class="panel-card">
        <div class="panel-hdr"><span>🏦 2. Banking & Portal Vivaran</span></div>
        <div style="display:grid; grid-template-columns: 1.25fr 1fr; gap:8px;">
          <div class="f-group">
            <div class="f-label"><span>Bank Name (Grahak Ka Bank)</span></div>
            <input type="text" class="f-input" value="${data.bank}" style="font-weight:700;">
          </div>
          <div class="f-group">
            <div class="f-label">
              <span>Bacha Balance (Account Bal ₹)</span>
              <span class="btn-mini-copy">📋 Copy</span>
            </div>
            <input type="text" class="f-input f-plain-num" value="₹ 8,450.50" style="font-weight:800; color:#059669;">
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1.25fr 0.95fr; gap:8px;">
          <div class="f-group">
            <div class="f-label"><span>AEPS Portal</span></div>
            <select class="f-input" style="font-weight:700;">
              <option selected>${data.portal}</option>
              <option>Digipay</option>
            </select>
          </div>
          <div class="f-group">
            <div class="f-label"><span>RRN / UTR Number</span></div>
            <input type="text" class="f-input f-plain-num" value="${data.rrn}">
          </div>
          <div class="f-group">
            <div class="f-label"><span>Tarikh (Date)</span></div>
            <input type="date" class="f-input f-plain-num" value="${data.date}">
          </div>
        </div>
      </div>

      <!-- Section 4 Part A: Notes / Remarks -->
      <div class="panel-card" style="padding:7px 11px;">
        <div class="f-label" style="font-size:10.5px;"><span>Notes / Remarks (Optional)</span></div>
        <input type="text" class="f-input" value="${data.notes}" style="font-size:11.5px; height:31px; background:#f8fafc;">
      </div>
    </div>

    <!-- RIGHT COLUMN: Financials + Live Accounts & Hisaab (40%) -->
    <div style="display:flex; flex-direction:column; gap:8px;">
      <!-- Section 3: Amount & Munafa Card (CLEAN PLAIN TEXT 2000.00) -->
      <div class="panel-card" style="border: 2px solid #059669; background: linear-gradient(135deg, rgba(37,99,235,0.04), rgba(5,150,105,0.06));">
        <div class="panel-hdr" style="color:#065f46; border-color:rgba(5,150,105,0.2);">
          <span>💰 3. Dhanrashi & Munafa</span>
          <span style="margin-left:auto; background:#059669; color:#fff; font-size:9.5px; padding:1px 6px; border-radius:10px; font-weight:800;">AUTO-FETCH</span>
        </div>

        <!-- PLAIN TEXT AMOUNT: Pure, clean, open circular zeroes, NO ambiguity with 8! -->
        <div class="f-group">
          <div class="f-label"><span>Transaction Amount (₹) <span class="req">*</span></span></div>
          <input type="text" class="f-input amount-input-plain" value="₹ 2000.00">
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div class="f-group">
            <div class="f-label"><span>Grahak Shulk (₹)</span></div>
            <input type="text" class="f-input f-plain-num" value="₹ 20.00" style="font-weight:800; color:#2563eb; font-size:14px;">
          </div>
          <div class="f-group">
            <div class="f-label"><span>Commission (₹)</span></div>
            <input type="text" class="f-input f-plain-num" value="₹ 7.92" style="font-weight:800; color:#059669; font-size:14px;">
          </div>
        </div>

        <!-- Net Munafa Pill -->
        <div style="background:#0f172a; border-radius:8px; padding:7px 11px; display:flex; justify-content:space-between; align-items:center; color:#fff;">
          <div>
            <div style="font-size:9px; opacity:0.8; text-transform:uppercase;">KUL MUNAFA (NET PROFIT)</div>
            <div style="font-size:17px; font-weight:800; color:#34d399; font-family:'Inter', sans-serif;">+₹ 27.92</div>
          </div>
          <div style="font-size:10.5px; text-align:right; opacity:0.85; line-height:1.3; font-family:'Inter', sans-serif;">
            Shulk: ₹20.00<br>Comm: ₹7.92
          </div>
        </div>

        <div style="font-size:10px; color:#475569; display:flex; align-items:center; gap:5px;">
          <input type="checkbox" id="khatachk1">
          <label for="khatachk1">💳 Shulk udhaar karein (Khatabook me darz)</label>
        </div>
      </div>

      <!-- Section 4 Part B: DUKAAN KE KHATE EVAM LIVE HISAAB -->
      <div class="panel-card">
        <div class="panel-hdr"><span>💼 4. Dukaan Ke Khate evam Settlement</span></div>

        <div class="f-group">
          <div class="f-label">
            <span>💵 Cash Galla (Customer ko Cash Diya 🔻)</span>
            <span class="tag-pill green">Auto-Selected</span>
          </div>
          <select class="f-input" style="font-weight:700; font-size:11.5px;">
            <option selected>${data.cashAccount}</option>
          </select>
        </div>

        <div class="f-group">
          <div class="f-label">
            <span>🏛️ CSP / Portal Account (Bank se Paisa Aaya 🔺) <span class="req">*</span></span>
          </div>
          <select class="f-input" style="font-weight:700; font-size:11.5px;">
            <option selected>${data.bankAccount}</option>
          </select>
        </div>

        <!-- EXACT LIVE HISAAB SUMMARY CARD FROM USER SCREENSHOT -->
        <div class="live-hisaab-box">
          <div class="live-hisaab-hdr">
            <span>📈 LIVE HISAAB SUMMARY (ACCOUNTS ME YE BADLAV HOGA):</span>
            <span style="background:#dbeafe; color:#1e40af; font-size:9.5px; padding:1px 6px; border-radius:4px; font-weight:800;">Cash Withdrawal</span>
          </div>

          <div class="live-hisaab-row" style="color:#b91c1c;">
            <span>💵</span>
            <span>PHYSICAL CASH (Cash): <b>-₹ 2000.00</b></span>
            <span class="tag-pill red">Customer ko Cash Diya 🔻</span>
          </div>

          <div class="live-hisaab-row" style="color:#15803d;">
            <span>🏛️</span>
            <span>APNA BANK (Bank): <b>+₹ 2000.00</b></span>
            <span class="tag-pill green">Portal/Bank me Paisa Aaya 🔺</span>
          </div>

          <div class="live-hisaab-row" style="color:#047857;">
            <span>💰</span>
            <span>Customer Shulk (Aapki Kamai): <b>+₹ 20.00</b></span>
            <span class="tag-pill green">Galle me Cash shulk jama hoga 🔺</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="modal-ftr">
    <button class="btn-cancel">Band Karein (Esc)</button>
    <div style="display:flex; gap:8px;">
      <button class="btn-print">🖨️ Save & Print Slip</button>
      <button class="btn-save">💾 Save Entry</button>
    </div>
  </div>
</div>
</body></html>`;
}

// Generate the updated HTML file
fs.writeFileSync(path.join(tempDir, 'modal_demo1a_all_details.html'), getHtmlDemo1A(), 'utf8');

console.log('Regenerated modal_demo1a_all_details.html with plain text 2000.00 font!');

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
    '--remote-debugging-port=9276',
    '--window-size=1240,940'
]);

setTimeout(async () => {
    try {
        const tabs = await (await fetch('http://127.0.0.1:9276/json')).json();
        const pageTab = tabs.find(t => t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');

        console.log('Capturing updated Option 1A with plain text font...');
        await send('Page.navigate', { url: 'http://localhost:3000/demos/modal_demo1a_all_details.html' });
        await new Promise(r => setTimeout(r, 1200));
        const ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(previewDir, 'bc_modal_demo1a_all_details.png'), Buffer.from(ss.data, 'base64'));
        console.log('Saved screenshot: bc_modal_demo1a_all_details.png');

        ws.close();
        p.kill();
        console.log('Option 1A screenshot updated with clean plain text numbers!');
        process.exit(0);
    } catch (err) {
        console.error('Error during screenshot capture:', err);
        p.kill();
        process.exit(1);
    }
}, 2500);
