const fs = require('fs');

const filePath = 'public/app.js';
let appJs = fs.readFileSync(filePath, 'utf8');

// Replace the action TD in renderBillPaymentsTable with clean compact buttons
const targetActionTd = `<td style="white-space: nowrap; text-align: right;">
                    <button class="btn-ghost" onclick="openBillReceiptModal('\${r.PaymentID}')" title="Grahak Parchi Kholein" style="padding: 4px 8px; color: #059669; font-weight: 700;">
                        🧾 Parchi
                    </button>
                    <button class="btn-ghost" onclick="openEditBillPaymentModal('\${r.PaymentID}')" title="Bill Edit Karein" style="padding: 4px 8px; color: #d97706; font-weight: 700;">
                        ✏️ Edit
                    </button>
                    <button class="btn-ghost" onclick="deleteBillPayment('\${r.PaymentID}')" title="Delete Karein" style="padding: 4px 7px; color: #ef4444;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>`;

const newActionTd = `<td style="white-space: nowrap; text-align: center; padding: 6px 8px;">
                    <div style="display: inline-flex; align-items: center; gap: 4px;">
                        <button class="btn-ghost" onclick="openBillReceiptModal('\${r.PaymentID}')" title="Grahak Parchi Kholein" style="padding: 3px 7px; color: #059669; font-weight: 700; font-size: 11.5px; border: 1px solid rgba(5,150,105,0.25); border-radius: 6px; background: rgba(5,150,105,0.06);">
                            🧾 Parchi
                        </button>
                        <button class="btn-ghost" onclick="openEditBillPaymentModal('\${r.PaymentID}')" title="Bill Edit Karein" style="padding: 3px 7px; color: #d97706; font-weight: 700; font-size: 11.5px; border: 1px solid rgba(217,119,6,0.3); border-radius: 6px; background: rgba(217,119,6,0.08);">
                            ✏️ Edit
                        </button>
                        <button class="btn-ghost" onclick="deleteBillPayment('\${r.PaymentID}')" title="Delete Karein" style="padding: 3px 6px; color: #ef4444; font-size: 11.5px; border: 1px solid rgba(239,68,68,0.25); border-radius: 6px; background: rgba(239,68,68,0.06);">
                            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                        </button>
                    </div>
                </td>`;

if (!appJs.includes(targetActionTd)) {
    console.error('Target action TD not found!');
    process.exit(1);
}

appJs = appJs.replace(targetActionTd, newActionTd);
fs.writeFileSync(filePath, appJs, 'utf8');
console.log('Action buttons styled cleanly with distinct badges!');
