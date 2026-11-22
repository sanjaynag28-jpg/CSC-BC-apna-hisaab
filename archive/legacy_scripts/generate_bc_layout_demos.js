const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const previewDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sampleData = [
  {
    sn: "SN-1424",
    time: "11:38",
    date: "07 Nov 2026",
    name: "Sumit",
    custId: 653,
    phone: "8505984435",
    aadhaar: "3452 0623 9911",
    dob: "16/12/2011",
    service: "AEPS Nikasi",
    bank: "Punjab & Sind Bank",
    portal: "Digipay",
    amount: "-₹2,000.00",
    balance: "₹2,158.02",
    charge: "₹10",
    comm: "₹7.92",
    profit: "+₹17.92",
    rrn: "631111370336"
  },
  {
    sn: "SN-1423",
    time: "11:32",
    date: "07 Nov 2026",
    name: "akhilesh",
    custId: 806,
    phone: "8127192242",
    aadhaar: "9478 9112 6974",
    dob: "01/01/1992",
    service: "AEPS Nikasi",
    bank: "State Bank of India",
    portal: "Digipay Lite",
    amount: "-₹10,000.00",
    balance: "-",
    charge: "₹10",
    comm: "₹11.92",
    profit: "+₹21.92",
    rrn: "631111233413"
  },
  {
    sn: "SN-1416",
    time: "11:00",
    date: "07 Nov 2026",
    name: "Salama",
    custId: 803,
    phone: "",
    aadhaar: "4999 5583 2348",
    dob: "25/02/1994",
    service: "AEPS Nikasi",
    bank: "India Post Payment Bank",
    portal: "Digipay Lite",
    amount: "-₹1,000.00",
    balance: "₹22.05",
    charge: "₹10",
    comm: "₹3.92",
    profit: "+₹13.92",
    rrn: "631111209501"
  },
  {
    sn: "SN-1413",
    time: "10:13",
    date: "07 Nov 2026",
    name: "Rasool Ahamad",
    custId: 745,
    phone: "8960804559",
    aadhaar: "5822 7003 0929",
    dob: "27/06/1970",
    service: "AEPS Nikasi",
    bank: "Indian Bank",
    portal: "Digipay Lite",
    amount: "-₹10,000.00",
    balance: "₹2,476.00",
    charge: "₹10",
    comm: "₹11.92",
    profit: "+₹21.92",
    rrn: "631110174250"
  },
  {
    sn: "SN-1410",
    time: "20:18",
    date: "06 Nov 2026",
    name: "Om Prakash",
    custId: 755,
    phone: "9839863720",
    aadhaar: "7366 8863 7255",
    dob: "",
    service: "AEPS Nikasi",
    bank: "Uttar Pradesh Gramin Bank",
    portal: "Digipay Lite",
    amount: "-₹10,000.00",
    balance: "₹32,750.24",
    charge: "₹10",
    comm: "₹11.92",
    profit: "+₹21.92",
    rrn: "631020103645"
  },
  {
    sn: "SN-1409",
    time: "20:03",
    date: "06 Nov 2026",
    name: "Banke Lal",
    custId: 802,
    phone: "9580172748",
    aadhaar: "6922 7594 7481",
    dob: "",
    service: "AEPS Nikasi",
    bank: "Indian Bank",
    portal: "Digipay Lite",
    amount: "-₹2,000.00",
    balance: "₹727.05",
    charge: "₹10",
    comm: "₹7.92",
    profit: "+₹17.92",
    rrn: "631020101510"
  }
];

const sharedStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  body { background: #f8fafc; color: #0f172a; padding: 18px 24px; }
  .demo-header { background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 16px 20px; margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); display: flex; justify-content: space-between; align-items: center; }
  .demo-title { font-size: 17px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }
  .demo-badge { background: #e0f2fe; color: #0284c7; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; border: 1px solid #bae6fd; }
  .table-card { background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
  table { width: 100%; border-collapse: collapse; text-align: left; table-layout: fixed; }
  th { background: #f1f5f9; padding: 11px 12px; font-size: 11.5px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1.5px solid #cbd5e1; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:hover { background: #f8fafc; }
  .sn-pill { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-family: monospace; font-size: 11.5px; font-weight: 800; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; }
  .badge-service { background: rgba(220, 38, 38, 0.1); color: #dc2626; border: 1px solid rgba(220, 38, 38, 0.25); font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; }
  .badge-portal { background: rgba(8,145,178,0.12); color: #0891b2; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
  .badge-portal-digipay { background: rgba(5,150,105,0.10); color: #059669; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
  .btn-slip { background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700; font-size: 11.5px; padding: 4px 9px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .btn-more { background: transparent; border: 1px solid #cbd5e1; color: #64748b; padding: 4px 6px; border-radius: 6px; font-size: 13px; cursor: pointer; }
  .profit-badge { background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3); font-family: monospace; font-weight: 800; font-size: 12px; padding: 2px 7px; border-radius: 6px; }
  .amount-out { color: #dc2626; font-weight: 800; font-size: 14px; font-family: monospace; }
  .cust-link { background: rgba(59, 130, 246, 0.12); color: #2563eb; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-left: 4px; }
  .docs-btn { background: rgba(2, 132, 199, 0.12); color: #0284c7; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(2, 132, 199, 0.25); margin-left: 3px; }
`;

// HTML for DEMO 1: Smart Merged 7 Columns (Fits 100% width, No Horizontal Scroll)
function getHtmlDemo1() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demo 1</title><style>${sharedStyles}</style></head><body>
  <div class="demo-header">
    <div class="demo-title">
      <span>✨ DEMO 1: Smart Merged 7 Columns (100% Screen Par Fit — 0 Scroll)</span>
    </div>
    <div class="demo-badge">Option 1: Sub-lines me Saari Details Ek Nazar Me</div>
  </div>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th style="width: 14%;">Universal SN & Kaam</th>
          <th style="width: 11%;">Samay / Tarikh</th>
          <th style="width: 25%;">Grahak Vivran (Customer)</th>
          <th style="width: 19%;">Bank & Portal</th>
          <th style="width: 12%; text-align: right;">Len-Den Rashi</th>
          <th style="width: 10%; text-align: right;">Munafa (Profit)</th>
          <th style="width: 9%; text-align: center;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${sampleData.map(r => `
          <tr>
            <td>
              <div><span class="sn-pill">📄 ${r.sn}</span></div>
              <div style="margin-top: 4px;"><span class="badge-service">⚡ ${r.service}</span></div>
            </td>
            <td>
              <div style="font-weight: 700; font-size: 13px;">${r.time}</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${r.date}</div>
            </td>
            <td>
              <div style="display: flex; align-items: center;">
                <b style="font-size: 13px; color: #0f172a;">${r.name}</b>
                <span class="cust-link">#${r.custId} 🔗</span>
                <span class="docs-btn">📎 Docs</span>
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 3px; display: flex; gap: 8px; flex-wrap: wrap;">
                ${r.phone ? `<span>📞 ${r.phone}</span>` : ''}
                <span>🪪 ****${r.aadhaar.slice(-4)}</span>
                ${r.dob ? `<span>🎂 ${r.dob}</span>` : ''}
              </div>
            </td>
            <td>
              <div style="font-weight: 700; font-size: 12.5px;">${r.bank}</div>
              <div style="margin-top: 3px; display: flex; align-items: center; gap: 6px;">
                <span class="${r.portal === 'Digipay' ? 'badge-portal-digipay' : 'badge-portal'}">${r.portal}</span>
                <span style="font-size: 10.5px; color: #64748b; font-family: monospace;">RRN: ${r.rrn}</span>
              </div>
            </td>
            <td style="text-align: right;">
              <div class="amount-out">${r.amount}</div>
              <div style="font-size: 11px; color: #059669; font-weight: 600; margin-top: 2px;">Bacha: ${r.balance}</div>
            </td>
            <td style="text-align: right;">
              <div><span class="profit-badge">${r.profit}</span></div>
              <div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">Shulk: ${r.charge}</div>
            </td>
            <td style="text-align: center;">
              <div style="display: flex; gap: 4px; justify-content: center;">
                <button class="btn-slip">🖨️ Slip</button>
                <button class="btn-more">⋮</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  </body></html>`;
}

// HTML for DEMO 2: Modern 2-Tier Card Row (Fintech Style)
function getHtmlDemo2() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demo 2</title><style>
    ${sharedStyles}
    .tier-main-row td { padding: 9px 12px 3px 12px; border-bottom: none; }
    .tier-sub-row td { padding: 2px 12px 10px 12px; border-bottom: 1.5px solid #e2e8f0; background: #fafcff; }
    .tag-bubble { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px; padding: 1px 6px; font-size: 10.5px; color: #475569; font-family: monospace; display: inline-flex; align-items: center; gap: 3px; }
  </style></head><body>
  <div class="demo-header">
    <div class="demo-title">
      <span>💎 DEMO 2: Two-Tier Modern Banking Row (Har Transaction 2 Rows Me)</span>
    </div>
    <div class="demo-badge">Option 2: Top Row Me Main Data, Neeche Saari Extra Details</div>
  </div>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th style="width: 12%;">Universal SN</th>
          <th style="width: 14%;">Tarikh / Samay</th>
          <th style="width: 20%;">Grahak (Customer)</th>
          <th style="width: 14%;">Service (Kaam)</th>
          <th style="width: 18%;">Bank & Portal</th>
          <th style="width: 12%; text-align: right;">Len-Den Rashi</th>
          <th style="width: 10%; text-align: center;">Kriya (Action)</th>
        </tr>
      </thead>
      <tbody>
        ${sampleData.map(r => `
          <tr class="tier-main-row">
            <td><span class="sn-pill">📄 ${r.sn}</span></td>
            <td><span style="font-weight: 700; font-size: 12.5px;">${r.time}</span> <span style="font-size: 11px; color: #64748b;">• ${r.date}</span></td>
            <td><b style="font-size: 13.5px; color: #0f172a;">${r.name}</b> <span class="cust-link">#${r.custId}</span></td>
            <td><span class="badge-service">⚡ ${r.service}</span></td>
            <td><b style="font-size: 12.5px;">${r.bank}</b> <span class="${r.portal === 'Digipay' ? 'badge-portal-digipay' : 'badge-portal'}" style="margin-left: 4px;">${r.portal}</span></td>
            <td style="text-align: right;"><span class="amount-out">${r.amount}</span></td>
            <td style="text-align: center;">
              <button class="btn-slip" style="padding: 3px 8px;">🖨️ Slip</button>
              <button class="btn-more">⋮</button>
            </td>
          </tr>
          <tr class="tier-sub-row">
            <td colspan="4">
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                ${r.phone ? `<span class="tag-bubble">📞 ${r.phone}</span>` : ''}
                <span class="tag-bubble">🪪 Aadhaar: ${r.aadhaar}</span>
                ${r.dob ? `<span class="tag-bubble">🎂 DOB: ${r.dob}</span>` : ''}
                <span class="tag-bubble" style="color: #7c3aed;">RRN: ${r.rrn}</span>
              </div>
            </td>
            <td colspan="3" style="text-align: right;">
              <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                <span class="tag-bubble" style="color: #059669;">Bacha Khata Bal: <b>${r.balance}</b></span>
                <span class="tag-bubble">Comm: <b>${r.comm}</b></span>
                <span class="tag-bubble">Shulk: <b>${r.charge}</b></span>
                <span class="profit-badge" style="font-size: 11px;">Munafa: ${r.profit}</span>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  </body></html>`;
}

// HTML for DEMO 3: High-Density 100% Fit Table (Ultra-Compact Counter Mode)
function getHtmlDemo3() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demo 3</title><style>
    ${sharedStyles}
    th { padding: 8px 8px; font-size: 11px; }
    td { padding: 7px 8px; font-size: 12px; }
    .sn-pill { font-size: 10.5px; padding: 2px 6px; }
    .badge-service { font-size: 10.5px; padding: 2px 6px; }
    .amount-out { font-size: 13px; }
    .profit-badge { font-size: 11px; padding: 1px 5px; }
  </style></head><body>
  <div class="demo-header">
    <div class="demo-title">
      <span>⚡ DEMO 3: High-Density Counter Mode (Tighter Grid — Saari 10 Columns Fit)</span>
    </div>
    <div class="demo-badge">Option 3: Ekdum Compact Fintech Table (Saari Columns Ek Line Me)</div>
  </div>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th style="width: 9%;">SN</th>
          <th style="width: 10%;">Samay</th>
          <th style="width: 18%;">Grahak (Customer)</th>
          <th style="width: 11%;">Service</th>
          <th style="width: 16%;">Bank</th>
          <th style="width: 9%;">Portal</th>
          <th style="width: 10%; text-align: right;">Amount</th>
          <th style="width: 9%; text-align: right;">Bacha Bal</th>
          <th style="width: 9%; text-align: right;">Munafa</th>
          <th style="width: 8%; text-align: center;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${sampleData.map(r => `
          <tr>
            <td><span class="sn-pill">${r.sn}</span></td>
            <td>
              <div style="font-weight: 700;">${r.time}</div>
              <div style="font-size: 10px; color: #64748b;">${r.date.slice(0, 6)}</div>
            </td>
            <td>
              <div style="font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${r.name} <span class="cust-link">#${r.custId}</span>
              </div>
              <div style="font-size: 10px; color: #64748b;">
                ${r.phone ? r.phone + ' • ' : ''}****${r.aadhaar.slice(-4)}
              </div>
            </td>
            <td><span class="badge-service" style="white-space: nowrap;">⚡ ${r.service}</span></td>
            <td>
              <div style="font-weight: 700; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${r.bank}</div>
              <div style="font-size: 9.5px; color: #7c3aed; font-family: monospace;">${r.rrn.slice(-6)}</div>
            </td>
            <td><span class="${r.portal === 'Digipay' ? 'badge-portal-digipay' : 'badge-portal'}">${r.portal === 'Digipay Lite' ? 'Lite' : 'Digipay'}</span></td>
            <td style="text-align: right;"><span class="amount-out">${r.amount}</span></td>
            <td style="text-align: right;"><span style="font-size: 11px; font-weight: 600; color: #059669;">${r.balance}</span></td>
            <td style="text-align: right;"><span class="profit-badge">${r.profit}</span></td>
            <td style="text-align: center;">
              <button class="btn-slip" style="padding: 3px 6px; font-size: 10.5px;">Slip</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  </body></html>`;
}

// HTML for DEMO 4: Financial Card Split (Neat Balance & Profit Block)
function getHtmlDemo4() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Demo 4</title><style>
    ${sharedStyles}
    .fin-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 8px; text-align: right; }
    .cust-card-box { display: flex; flex-direction: column; gap: 2px; }
  </style></head><body>
  <div class="demo-header">
    <div class="demo-title">
      <span>📊 DEMO 4: Financial Card Block (Amount + Balance + Profit Ek Hi Box Me)</span>
    </div>
    <div class="demo-badge">Option 4: Clear Financial Split & Zero Horizontal Scroll</div>
  </div>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th style="width: 12%;">Universal SN</th>
          <th style="width: 11%;">Samay / Tarikh</th>
          <th style="width: 24%;">Grahak (Customer)</th>
          <th style="width: 20%;">Bank, Portal & Sewa</th>
          <th style="width: 23%; text-align: right;">Hisaab Kitab (Amount, Bal & Profit)</th>
          <th style="width: 10%; text-align: center;">Parchi (Slip)</th>
        </tr>
      </thead>
      <tbody>
        ${sampleData.map(r => `
          <tr>
            <td>
              <div><span class="sn-pill">📄 ${r.sn}</span></div>
              <div style="font-size: 10px; color: #7c3aed; font-family: monospace; margin-top: 3px;">RRN: ${r.rrn}</div>
            </td>
            <td>
              <div style="font-weight: 700; font-size: 13px;">${r.time}</div>
              <div style="font-size: 11px; color: #64748b;">${r.date}</div>
            </td>
            <td>
              <div class="cust-card-box">
                <div style="display: flex; align-items: center;">
                  <b style="font-size: 13.5px; color: #0f172a;">${r.name}</b>
                  <span class="cust-link">#${r.custId}</span>
                  <span class="docs-btn">📎 Docs</span>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                  ${r.phone ? `<span>📞 ${r.phone}</span> • ` : ''}
                  <span>🪪 ${r.aadhaar}</span>
                </div>
                ${r.dob ? `<div style="font-size: 10.5px; color: #64748b;">🎂 DOB: ${r.dob}</div>` : ''}
              </div>
            </td>
            <td>
              <div style="font-weight: 700; font-size: 13px;">${r.bank}</div>
              <div style="margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                <span class="badge-service" style="font-size: 11px; padding: 2px 6px;">⚡ ${r.service}</span>
                <span class="${r.portal === 'Digipay' ? 'badge-portal-digipay' : 'badge-portal'}">${r.portal}</span>
              </div>
            </td>
            <td>
              <div class="fin-box">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 11px; color: #64748b; font-weight: 600;">Len-Den:</span>
                  <span class="amount-out">${r.amount}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                  <span style="font-size: 10.5px; color: #64748b;">A/C Bacha:</span>
                  <span style="font-size: 11px; color: #059669; font-weight: 700;">${r.balance}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px; border-top: 1px dashed #e2e8f0; padding-top: 2px;">
                  <span style="font-size: 10.5px; color: #64748b;">Net Munafa:</span>
                  <span class="profit-badge" style="font-size: 11px;">${r.profit}</span>
                </div>
              </div>
            </td>
            <td style="text-align: center;">
              <div style="display: flex; gap: 4px; justify-content: center;">
                <button class="btn-slip">🖨️ Slip</button>
                <button class="btn-more">⋮</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  </body></html>`;
}

// Generate the 4 HTML files
const demoFiles = [
  { name: 'demo1.html', html: getHtmlDemo1(), outPng: 'bc_layout_demo1_smart_7col.png' },
  { name: 'demo2.html', html: getHtmlDemo2(), outPng: 'bc_layout_demo2_two_tier.png' },
  { name: 'demo3.html', html: getHtmlDemo3(), outPng: 'bc_layout_demo3_dense_grid.png' },
  { name: 'demo4.html', html: getHtmlDemo4(), outPng: 'bc_layout_demo4_financial_card.png' }
];

const tempDir = path.join(__dirname, '../public/demos');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

demoFiles.forEach(d => {
  fs.writeFileSync(path.join(tempDir, d.name), d.html, 'utf8');
});

console.log('Generated 4 demo HTML files in public/demos/');

// Now capture each using headless Chrome CDP
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
    '--remote-debugging-port=9271',
    '--window-size=1280,820' // Standard 1280px screen where horizontal scrolling happens currently!
]);

setTimeout(async () => {
    try {
        const tabs = await (await fetch('http://127.0.0.1:9271/json')).json();
        const pageTab = tabs.find(t => t.type === 'page');
        const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise(r => ws.onopen = r);

        let reqId = 1;
        const send = (method, params = {}) => cdpSend(ws, method, params, reqId++);

        await send('Page.enable');

        for (const d of demoFiles) {
            console.log('Capturing:', d.name);
            await send('Page.navigate', { url: `http://localhost:3000/demos/${d.name}` });
            await new Promise(r => setTimeout(r, 900));
            const ss = await send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(previewDir, d.outPng), Buffer.from(ss.data, 'base64'));
            console.log('Saved:', d.outPng);
        }

        ws.close();
        p.kill();
        console.log('All 4 Demo screenshots captured successfully!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        p.kill();
        process.exit(1);
    }
}, 2500);

