const fs = require('fs');

// 1. Update public/index.html
const htmlPath = 'public/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(
    '<span class="rtt-sum-chip" id="repTableSumChip">Kul Rashi: ₹0.00</span>',
    '<span class="rtt-sum-chip" id="repTableSumChip" title="Sabhi modules ka milakar kul len-den volume (Turnover)">Kul Karobar (Gross Volume): ₹0.00</span>'
);
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Updated index.html repTableSumChip.');

// 2. Update public/app.js
const appPath = 'public/app.js';
let appJs = fs.readFileSync(appPath, 'utf8');

const oldChipCode = `    const sumChip = document.getElementById('repTableSumChip');
    if (sumChip) {
        sumChip.textContent = \`Kul Rashi: \${formatMoney(sumAmount || 0)}\`;
    }`;

const newChipCode = `    const sumChip = document.getElementById('repTableSumChip');
    if (sumChip) {
        const curModule = document.getElementById('reportModuleFilter')?.value || 'all';
        const label = curModule === 'all' 
            ? 'Kul Karobar (Gross Volume)' 
            : (curModule === 'transactions' ? 'Kul Len-Den' :
               curModule === 'bc' ? 'Kul BC Turnover' :
               curModule === 'csc' ? 'Kul CSC Shulk' :
               curModule === 'khata' ? 'Kul Khata Rashi' :
               curModule === 'invoices' ? 'Kul Bill Rashi' :
               curModule === 'billpay' ? 'Kul Bill Bhugtan' : 'Kul Rashi');
        sumChip.textContent = \`\${label}: \${formatMoney(sumAmount || 0)}\`;
        sumChip.title = curModule === 'all' 
            ? 'Sabhi modules ka milakar kul len-den volume (Turnover)' 
            : label;
    }`;

if (!appJs.includes(oldChipCode)) {
    console.error('oldChipCode not found in app.js!');
    process.exit(1);
}

appJs = appJs.replace(oldChipCode, newChipCode);
fs.writeFileSync(appPath, appJs, 'utf8');
console.log('Updated app.js repTableSumChip with dynamic module-specific label!');
