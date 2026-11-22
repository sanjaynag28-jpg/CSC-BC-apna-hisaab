const fs = require('fs');

const filePath = 'public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

const oldThead = `<tr
                                style="background: var(--bg-secondary); border-bottom: 2px solid var(--border); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-secondary);">
                                <th style="padding: 12px 14px; text-align: left;">SN / Code</th>
                                <th style="padding: 12px 14px; text-align: left;">Tariqh & Samay</th>
                                <th style="padding: 12px 14px; text-align: left;">Grahak (Customer)</th>
                                <th style="padding: 12px 14px; text-align: left;">Category & Board</th>
                                <th style="padding: 12px 14px; text-align: left;">Khata / Loan No</th>
                                <th style="padding: 12px 14px; text-align: right;">Bill Rashi (₹)</th>
                                <th style="padding: 12px 14px; text-align: right;">Shulk (₹)</th>
                                <th style="padding: 12px 14px; text-align: right;">Prapt Cash (₹)</th>
                                <th style="padding: 12px 14px; text-align: right;">Munafa (₹)</th>
                                <th style="padding: 12px 14px; text-align: right;">Bakiya Shesh (₹)</th>
                                <th style="padding: 12px 14px; text-align: center;">Parchi / Action</th>
                            </tr>`;

const newThead = `<tr
                                style="background: var(--bg-secondary); border-bottom: 2px solid var(--border); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-secondary);">
                                <th style="padding: 12px 14px; text-align: left;">Tariqh & Samay / SN</th>
                                <th style="padding: 12px 14px; text-align: left;">Category & Board</th>
                                <th style="padding: 12px 14px; text-align: left;">Khata / Loan No</th>
                                <th style="padding: 12px 14px; text-align: left;">Grahak (Customer)</th>
                                <th style="padding: 12px 14px; text-align: right;">Bill Rashi (₹)</th>
                                <th style="padding: 12px 14px; text-align: right;">Shulk (₹)</th>
                                <th style="padding: 12px 14px; text-align: right;">Kul Jama / Udhaar</th>
                                <th style="padding: 12px 14px; text-align: center;">Action</th>
                            </tr>`;

if (!html.includes(oldThead)) {
    console.error('oldThead not matched in index.html!');
    process.exit(1);
}

html = html.replace(oldThead, newThead);
html = html.replace('colspan="11"', 'colspan="8"');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully aligned table headers in public/index.html!');
