const fs = require('fs');

const filePath = 'public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

const targetTableHead = `<table class="table" id="billPaymentsTable" style="width: 100%; border-collapse: collapse; min-width: 1050px;">
                        <thead>
                            <tr
                                style="background: var(--bg-secondary); border-bottom: 2px solid var(--border); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-secondary);">
                                <th style="padding: 10px 10px; text-align: left; width: 140px;">Tariqh & Samay / SN</th>
                                <th style="padding: 10px 10px; text-align: left; width: 150px;">Category & Board</th>
                                <th style="padding: 10px 10px; text-align: left; width: 150px;">Khata / Loan No</th>
                                <th style="padding: 10px 10px; text-align: left; width: 160px;">Grahak (Customer)</th>
                                <th style="padding: 10px 10px; text-align: right; width: 120px;">Bill Rashi (₹)</th>
                                <th style="padding: 10px 8px; text-align: right; width: 80px;">Shulk (₹)</th>
                                <th style="padding: 10px 10px; text-align: right; width: 140px;">Kul Jama / Udhaar</th>
                                <th style="padding: 10px 10px; text-align: center; width: 160px;">Action</th>
                            </tr>`;

const fullWidthTableHead = `<table class="table" id="billPaymentsTable" style="width: 100%; border-collapse: collapse; table-layout: auto;">
                        <thead>
                            <tr
                                style="background: var(--bg-secondary); border-bottom: 2px solid var(--border); font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; color: var(--text-secondary);">
                                <th style="padding: 9px 8px; text-align: left; white-space: nowrap;">Tariqh / SN</th>
                                <th style="padding: 9px 8px; text-align: left; white-space: nowrap;">Category & Board</th>
                                <th style="padding: 9px 8px; text-align: left; white-space: nowrap;">Khata / Loan No</th>
                                <th style="padding: 9px 8px; text-align: left; white-space: nowrap;">Grahak (Customer)</th>
                                <th style="padding: 9px 8px; text-align: right; white-space: nowrap;">Bill Rashi</th>
                                <th style="padding: 9px 6px; text-align: right; white-space: nowrap;">Shulk</th>
                                <th style="padding: 9px 8px; text-align: right; white-space: nowrap;">Kul Jama / Udhaar</th>
                                <th style="padding: 9px 8px; text-align: center; white-space: nowrap;">Action</th>
                            </tr>`;

if (!html.includes(targetTableHead)) {
    console.error('targetTableHead not matched!');
    process.exit(1);
}

html = html.replace(targetTableHead, fullWidthTableHead);
fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully set 100% full-width auto layout on billPaymentsTable!');
