const fs = require('fs');

const filePath = 'public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

const targetTableHead = `<table class="table" id="billPaymentsTable" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr
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

const compactTableHead = `<table class="table" id="billPaymentsTable" style="width: 100%; border-collapse: collapse; min-width: 1050px;">
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

if (!html.includes(targetTableHead)) {
    console.error('targetTableHead not matched!');
    process.exit(1);
}

html = html.replace(targetTableHead, compactTableHead);
fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully set clean compact column widths on billPaymentsTable!');
