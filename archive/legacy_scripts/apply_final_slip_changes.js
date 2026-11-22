const fs = require('fs');

// 1. Update public/index.html
let html = fs.readFileSync('public/index.html', 'utf8');

const targetBlockOld = `            <div class="modal-header" style="padding: 16px 22px; border-bottom: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button class="btn-ghost btn-sm" id="bcReceiptBackBtn" onclick="closeModal('bcReceiptModal')"
                        style="display: none; font-weight: 700; padding: 4px 10px;">
                        <i data-lucide="arrow-left"></i> Wapas
                    </button>
                    <div
                        style="background: rgba(16, 185, 129, 0.12); color: #10b981; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i data-lucide="printer" style="width: 22px; height: 22px;"></i>
                    </div>
                    <div>
                        <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-primary);">Customer
                            Transaction Slip (ग्राहक पावती पर्ची)</h2>
                        <p style="margin: 2px 0 0 0; font-size: 12.5px; color: var(--text-muted);">AEPS Cash Nikasi,
                            Jama ya DMT len-den ki verified computer slip</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" class="btn-zoom-hdr" id="bcSlipZoomToggleBtn" onclick="toggleSlipZoomMode()"
                        title="Register me likhne ke liye bade akshar me dekhein (Shortcut: Z)"
                        style="background: linear-gradient(135deg, #d97706, #b45309); color: white; border: none; border-radius: 8px; padding: 6px 13px; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.35);">
                        <i data-lucide="zoom-in" style="width: 15px; height: 15px;"></i> 🔍 Zoom Mode [Z]
                    </button>
                    <button class="modal-close" onclick="closeModal('bcReceiptModal')"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="modal-body" style="padding: 10px 18px 6px;">
                <div class="print-format-bar" style="margin-bottom: 8px; padding: 6px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="pfb-label"><i data-lucide="printer"></i> Print Format:</span>
                        <div class="pfb-pills">
                            <button class="pfb-btn active" data-format="a4" onclick="setPrintFormat('a4', 'receipt')">📄
                                Print A4</button>
                            <button class="pfb-btn" data-format="a4_half" onclick="setPrintFormat('a4_half', 'receipt')">📑
                                Print A4/2</button>
                            <button class="pfb-btn" data-format="current" onclick="setPrintFormat('current', 'receipt')">🧾
                                Slip (Thermal 80mm)</button>
                        </div>
                    </div>
                    <div style="font-size: 11.5px; color: #b45309; font-weight: 700; background: #fef3c7; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 6px; cursor: pointer;" onclick="toggleSlipZoomMode()" title="Zoom toggle karein">
                        🔍 'Z' dabakar Zoom On/Off karein
                    </div>
                </div>
                <div class="receipt-slip" id="printableReceipt">`;

const targetBlockNew = `            <div class="modal-header" style="padding: 10px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="btn-ghost btn-sm" id="bcReceiptBackBtn" onclick="closeModal('bcReceiptModal')"
                        style="display: none; font-weight: 700; padding: 4px 10px;">
                        <i data-lucide="arrow-left"></i> Wapas
                    </button>
                    <div
                        style="background: rgba(16, 185, 129, 0.12); color: #10b981; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i data-lucide="printer" style="width: 18px; height: 18px;"></i>
                    </div>
                    <div>
                        <h2 style="margin: 0; font-size: 16.5px; font-weight: 800; color: var(--text-primary);">Customer
                            Transaction Slip (ग्राहक पावती पर्ची)</h2>
                        <p style="margin: 1px 0 0 0; font-size: 11.5px; color: var(--text-muted);">AEPS Cash Nikasi,
                            Jama ya DMT len-den ki verified computer slip</p>
                    </div>
                </div>
                <button class="modal-close" onclick="closeModal('bcReceiptModal')"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body" style="padding: 10px 18px 6px;">
                <div class="receipt-slip" id="printableReceipt">`;

if (html.includes(targetBlockOld)) {
    html = html.replace(targetBlockOld, targetBlockNew);
    console.log('Replaced header & removed print-format-bar successfully!');
} else {
    console.error('Target header block not found!');
}

// Replace amount font-mono with plain-text-amount
const amountOld = `<div class="hero-val font-mono" id="slipAmount">₹0.00</div>`;
const amountNew = `<div class="hero-val plain-text-amount" id="slipAmount">₹0.00</div>`;

if (html.includes(amountOld)) {
    html = html.replace(amountOld, amountNew);
    console.log('Replaced hero amount with plain-text-amount successfully!');
} else {
    console.error('Amount block not found!');
}

// Replace footer: Remove Band Karein, put Zoom button on left, compact print buttons
const footerOld = `            <div class="modal-footer"
                style="padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--border);">
                <button class="btn-ghost" onclick="closeModal('bcReceiptModal')"
                    style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; font-weight: 700; border-radius: 8px; border: 1.5px solid var(--border-row, #cbd5e1); color: var(--text-secondary); background: transparent; cursor: pointer;">
                    <i data-lucide="x" style="width: 15px; height: 15px;"></i> Band Karein
                </button>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;">
                    <button class="btn-success btn-sm" id="slipWhatsAppBtn" onclick="shareReceiptWhatsApp()"
                        style="background: linear-gradient(135deg, #16a34a, #15803d); color: white; font-weight: 700; padding: 7px 13px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; border: none; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="message-circle" style="width: 15px; height: 15px;"></i> WhatsApp Share
                    </button>
                    <button class="btn-primary btn-sm" onclick="printReceipt('a4')" title="Poora A4 Page Print"
                        style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; font-weight: 700; padding: 7px 13px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; border: none; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="file-text" style="width: 15px; height: 15px;"></i> Print A4
                    </button>
                    <button class="btn-info btn-sm" onclick="printReceipt('a4_half')" title="1/2 Page (A4/2) Print"
                        style="background: linear-gradient(135deg, #0284c7, #0369a1); color: white; padding: 7px 13px; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; border: none; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="scissors" style="width: 15px; height: 15px;"></i> Print A4/2 (1/2)
                    </button>
                    <button class="btn-warning btn-sm" onclick="printReceipt('current')"
                        title="Current Print (Thermal 80mm Slip)"
                        style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 7px 13px; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; border: none; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="printer" style="width: 15px; height: 15px;"></i> Thermal Slip (80mm)
                    </button>
                </div>
            </div>`;

const footerNew = `            <div class="modal-footer"
                style="padding: 10px 18px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--border);">
                <div>
                    <!-- Zoom Button directly on the left where Band Karein was! -->
                    <button type="button" class="btn-zoom-footer-main" id="bcSlipZoomToggleBtn" onclick="toggleSlipZoomMode()"
                        title="Register me likhne ke liye bade akshar me dekhein (Shortcut: Z)"
                        style="background: linear-gradient(135deg, #d97706, #b45309); color: white; border: none; border-radius: 8px; padding: 6px 13px; font-size: 12.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.35); white-space: nowrap;">
                        <i data-lucide="zoom-in" style="width: 15px; height: 15px;"></i> 🔍 Zoom Mode [Z]
                    </button>
                </div>
                <div style="display: flex; align-items: center; gap: 7px; flex-wrap: nowrap;">
                    <button class="btn-success btn-sm" id="slipWhatsAppBtn" onclick="shareReceiptWhatsApp()"
                        style="background: linear-gradient(135deg, #16a34a, #15803d); color: white; font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; border: none; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="message-circle" style="width: 14px; height: 14px;"></i> WhatsApp Share
                    </button>
                    <button class="btn-primary btn-sm" onclick="printReceipt('a4')" title="Poora A4 Page Print"
                        style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; border: none; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> Print A4
                    </button>
                    <button class="btn-info btn-sm" onclick="printReceipt('a4_half')" title="1/2 Page (A4/2) Print"
                        style="background: linear-gradient(135deg, #0284c7, #0369a1); color: white; padding: 6px 12px; font-weight: 700; font-size: 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; border: none; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="scissors" style="width: 14px; height: 14px;"></i> Print A4/2 (1/2)
                    </button>
                    <button class="btn-warning btn-sm" onclick="printReceipt('current')"
                        title="Current Print (Thermal 80mm Slip)"
                        style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 6px 12px; font-weight: 700; font-size: 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; border: none; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.25); white-space: nowrap; cursor: pointer;">
                        <i data-lucide="printer" style="width: 14px; height: 14px;"></i> Thermal Slip (80mm)
                    </button>
                </div>
            </div>`;

if (html.includes(footerOld)) {
    html = html.replace(footerOld, footerNew);
    console.log('Replaced footer with Zoom button on left & removed Band Karein successfully!');
} else {
    console.error('Footer block not found!');
}

fs.writeFileSync('public/index.html', html);
console.log('Saved public/index.html successfully, size:', html.length);
