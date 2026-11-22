const fs = require('fs');

const filePath = 'public/app.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update renderBillPaymentsTable action column to include ✏️ Edit
const oldActionButtons = `<button class="btn-ghost" onclick="openBillReceiptModal('\${r.PaymentID}')" title="Grahak Parchi Kholein" style="padding: 4px 8px; color: #059669; font-weight: 700;">
                        🧾 Parchi
                    </button>
                    <button class="btn-ghost" onclick="deleteBillPayment('\${r.PaymentID}')" title="Delete Karein" style="padding: 4px 7px; color: #ef4444;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>`;

const newActionButtons = `<button class="btn-ghost" onclick="openBillReceiptModal('\${r.PaymentID}')" title="Grahak Parchi Kholein" style="padding: 4px 8px; color: #059669; font-weight: 700;">
                        🧾 Parchi
                    </button>
                    <button class="btn-ghost" onclick="openEditBillPaymentModal('\${r.PaymentID}')" title="Bill Edit Karein" style="padding: 4px 8px; color: #d97706; font-weight: 700;">
                        ✏️ Edit
                    </button>
                    <button class="btn-ghost" onclick="deleteBillPayment('\${r.PaymentID}')" title="Delete Karein" style="padding: 4px 7px; color: #ef4444;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>`;

if (!content.includes(oldActionButtons)) {
    console.error('Old action buttons not found!');
    process.exit(1);
}
content = content.replace(oldActionButtons, newActionButtons);
console.log('1. Updated table action buttons with ✏️ Edit.');

// 2. Update openNewBillPaymentModal to support prefill edit mode and reset
const oldOpenNewStart = `function openNewBillPaymentModal(prefill = null) {
    const form = document.getElementById('billPaymentForm');
    if (form) form.reset();
    clearBPReceiptUpload();
    clearBPCustomFields();

    const titleEl = document.getElementById('bpModalTitle');
    if (titleEl) titleEl.innerHTML = \`⚡ <span>Naya Bill / EMI Bhugtan (बिल व किश्त काउंटर)</span>\`;

    const paymentIdInp = document.getElementById('bpPaymentId');
    if (paymentIdInp) paymentIdInp.value = '';`;

const newOpenNewStart = `function openNewBillPaymentModal(prefill = null) {
    const form = document.getElementById('billPaymentForm');
    if (form) form.reset();
    clearBPReceiptUpload();
    clearBPCustomFields();

    const titleEl = document.getElementById('bpModalTitle');
    if (titleEl) titleEl.innerHTML = \`⚡ <span>Naya Bill / EMI Bhugtan (बिल व किश्त काउंटर)</span>\`;

    const saveBtnText = document.getElementById('bpSaveBtnText');
    if (saveBtnText) saveBtnText.textContent = 'Bill Jama Karein & Print';

    const paymentIdInp = document.getElementById('bpPaymentId');
    if (paymentIdInp) paymentIdInp.value = '';`;

if (!content.includes(oldOpenNewStart)) {
    console.error('oldOpenNewStart not found!');
    process.exit(1);
}
content = content.replace(oldOpenNewStart, newOpenNewStart);
console.log('2. Updated openNewBillPaymentModal start.');

// 3. Update prefill block in openNewBillPaymentModal to handle PaymentID, Accounts, CashReceived
const oldPrefillEnd = `        if (prefill.ExtraFieldsJson) {
            try {
                const ef = typeof prefill.ExtraFieldsJson === 'string' ? JSON.parse(prefill.ExtraFieldsJson) : prefill.ExtraFieldsJson;
                if (ef && typeof ef === 'object') {
                    for (const [k, v] of Object.entries(ef)) {
                        addBPCustomFieldRow(k, v);
                    }
                }
            } catch (_) {}
        }
    }

    calculateBPProfitInModal();`;

const newPrefillEnd = `        if (prefill.ExtraFieldsJson) {
            try {
                const ef = typeof prefill.ExtraFieldsJson === 'string' ? JSON.parse(prefill.ExtraFieldsJson) : prefill.ExtraFieldsJson;
                if (ef && typeof ef === 'object') {
                    for (const [k, v] of Object.entries(ef)) {
                        addBPCustomFieldRow(k, v);
                    }
                }
            } catch (_) {}
        }

        // Edit Mode specific prefill
        if (prefill.PaymentID) {
            if (paymentIdInp) paymentIdInp.value = prefill.PaymentID;
            if (titleEl) {
                const snLabel = prefill.GlobalSerialNo ? \`#\${prefill.GlobalSerialNo}\` : \`ID: \${prefill.PaymentID}\`;
                titleEl.innerHTML = \`✏️ <span>Bill / EMI Sanshodhan (एडिट करें \${snLabel})</span>\`;
            }
            if (saveBtnText) saveBtnText.textContent = 'Badlaav Save Karein (Update)';

            if (prefill.PaymentDate && dateInp) {
                const dStr = typeof prefill.PaymentDate === 'string' ? prefill.PaymentDate.split('T')[0] : new Date(prefill.PaymentDate).toISOString().split('T')[0];
                dateInp.value = dStr;
            }
            if (prefill.WalletAccountID && document.getElementById('bpModalWalletAcc')) {
                document.getElementById('bpModalWalletAcc').value = String(prefill.WalletAccountID);
            }
            if (prefill.CashAccountID && document.getElementById('bpModalCashAcc')) {
                document.getElementById('bpModalCashAcc').value = String(prefill.CashAccountID);
            }
            if (prefill.TotalCollected !== undefined && cashRecInp) {
                cashRecInp.value = prefill.TotalCollected;
                cashRecInp.dataset.userEdited = 'true';
            }
            if (prefill.CustomerDue !== undefined && document.getElementById('bpModalCustomerDue')) {
                document.getElementById('bpModalCustomerDue').value = prefill.CustomerDue;
            }
        }
    }

    calculateBPProfitInModal();`;

if (!content.includes(oldPrefillEnd)) {
    console.error('oldPrefillEnd not found!');
    process.exit(1);
}
content = content.replace(oldPrefillEnd, newPrefillEnd);
console.log('3. Updated prefill block for Edit Mode.');

// 4. Add openEditBillPaymentModal function and update handleBillPaymentFormSubmit
const oldSubmitFetch = `        const res = await nativeFetch('/api/bill-payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const json = await res.json();

        if (json.success) {
            if (typeof closeModal === 'function') closeModal('billPaymentModal');
            const toastMsg = body.CustomerDue > 0
                ? \`✅ Bill Payment save ho gaya! (Galle me Cash: ₹\${body.TotalCollected} | 🔴 Grahak Udhaar: ₹\${body.CustomerDue})\`
                : \`✅ Bill/EMI bhugtan safalta-purvak save ho gaya! (₹\${body.TotalCollected})\`;
            if (typeof showToast === 'function') showToast(toastMsg, 'success');
            loadBillPaymentsPage(1);

            // Auto-open printable receipt modal if checked
            const autoSlip = document.getElementById('bpAutoPrintSlip')?.checked !== false;
            if (autoSlip && json.data && json.data.paymentId) {
                openBillReceiptModal(json.data.paymentId);
            }
        } else {
            if (typeof showToast === 'function') showToast(\`❌ Error: \${json.error || 'Save failed'}\`, 'error');
        }`;

const newSubmitFetch = `        const isEdit = !!body.PaymentID;
        const url = isEdit ? \`/api/bill-payments/\${body.PaymentID}\` : '/api/bill-payments';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await nativeFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const json = await res.json();

        if (json.success) {
            if (typeof closeModal === 'function') closeModal('billPaymentModal');
            const toastMsg = isEdit
                ? \`✅ Bill Payment update ho gaya! (Galla, Wallet aur Khata teeno recalculate ho gaye)\`
                : (body.CustomerDue > 0
                    ? \`✅ Bill Payment save ho gaya! (Galle me Cash: ₹\${body.TotalCollected} | 🔴 Grahak Udhaar: ₹\${body.CustomerDue})\`
                    : \`✅ Bill/EMI bhugtan safalta-purvak save ho gaya! (₹\${body.TotalCollected})\`);
            if (typeof showToast === 'function') showToast(toastMsg, 'success');

            loadBillPaymentsPage(currentBPPage || 1);
            if (typeof loadAccountsOverview === 'function') loadAccountsOverview();
            if (typeof loadDashboardStats === 'function') loadDashboardStats();
            if (typeof refreshAccounts === 'function') refreshAccounts();

            // Auto-open printable receipt modal if checked and not in edit mode
            const autoSlip = document.getElementById('bpAutoPrintSlip')?.checked !== false;
            const pid = isEdit ? body.PaymentID : (json.paymentId || (json.data && json.data.paymentId));
            if (!isEdit && autoSlip && pid) {
                openBillReceiptModal(pid);
            }
        } else {
            if (typeof showToast === 'function') showToast(\`❌ Error: \${json.error || 'Save failed'}\`, 'error');
        }`;

if (!content.includes(oldSubmitFetch)) {
    console.error('oldSubmitFetch not found!');
    process.exit(1);
}
content = content.replace(oldSubmitFetch, newSubmitFetch);
console.log('4. Updated handleBillPaymentFormSubmit to handle PUT and POST.');

// 5. Add openEditBillPaymentModal before handleBillPaymentFormSubmit
const editFnCode = `async function openEditBillPaymentModal(paymentId) {
    if (!paymentId) return;
    try {
        if (typeof startTopLoading === 'function') startTopLoading();
        const res = await nativeFetch(\`/api/bill-payments/\${paymentId}\`);
        const json = await res.json();
        if (!json.success || !json.data) {
            if (typeof showToast === 'function') showToast('❌ Bill payment record nahi mila: ' + (json.error || ''), 'error');
            return;
        }
        openNewBillPaymentModal(json.data);
    } catch (err) {
        console.error('Error opening edit modal:', err);
        if (typeof showToast === 'function') showToast('❌ Edit form kholne me error: ' + err.message, 'error');
    } finally {
        if (typeof stopTopLoading === 'function') stopTopLoading();
    }
}
window.openEditBillPaymentModal = openEditBillPaymentModal;

`;

content = content.replace('async function handleBillPaymentFormSubmit(event) {', editFnCode + 'async function handleBillPaymentFormSubmit(event) {');
console.log('5. Injected openEditBillPaymentModal function.');

// 6. Update finally block in handleBillPaymentFormSubmit to restore button text cleanly
const oldFinally = `    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i data-lucide="check-circle-2"></i> <span>Bhugtan Save Karein</span>';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    }`;

const newFinally = `    } finally {
        const bpBtn = document.getElementById('bpSaveBtn') || document.getElementById('btn-bp-save');
        const bpBtnText = document.getElementById('bpSaveBtnText');
        const isEdit = !!document.getElementById('bpPaymentId')?.value;
        if (bpBtn) bpBtn.disabled = false;
        if (bpBtnText) {
            bpBtnText.textContent = isEdit ? 'Badlaav Save Karein (Update)' : 'Bill Jama Karein & Print';
        }
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }`;

if (content.includes(oldFinally)) {
    content = content.replace(oldFinally, newFinally);
    console.log('6. Updated finally block in handleBillPaymentFormSubmit.');
} else {
    console.log('Note: oldFinally not matched directly, checking if already modified.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated public/app.js!');
