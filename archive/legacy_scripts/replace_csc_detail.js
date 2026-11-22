const fs = require('fs');

const file = 'public/app.js';
let content = fs.readFileSync(file, 'utf8');

const startMarker = "body.innerHTML = `\n        <!-- Dedicated Universal Tracking Bar -->";
const endMarker = "refreshIcons(document.getElementById('cscDetailModal'));\n    openModal('cscDetailModal');";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found!', { startIdx, endIdx });
    process.exit(1);
}

const newBodyAndFooter = `body.innerHTML = \`
        <!-- Top Unified Hero & Tracking Banner -->
        <div class="csc-detail-hero" style="background: var(--bg-card-sub, #f8fafc); border: 1.5px solid var(--border, #e2e8f0); border-radius: 12px; padding: 12px 18px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <div>
                    <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Acknowledgment / Token Number</div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px;">
                        <span class="font-mono" style="font-size: 17px; font-weight: 800; color: #0284c7;">\${escapeHtml(app.AckNumber || 'PENDING')}</span>
                        \${app.AckNumber ? \`
                            <button type="button" class="btn-ghost btn-sm" onclick="copyTextToClipboard('\${escapeInlineArg(app.AckNumber)}', 'Token Number')" title="Copy Token Number" style="padding: 2px 8px; font-size: 11.5px; height: 26px; border-radius: 6px;">
                                <i data-lucide="copy" style="width: 12px; height: 12px;"></i> Copy
                            </button>
                        \` : ''}
                        <span style="font-size: 12px; color: var(--text-secondary); background: var(--bg-hover, #e2e8f0); padding: 3px 8px; border-radius: 6px; font-weight: 600;">
                            📅 \${formatIndianDate(app.ApplyDate)}\${app.CreatedAt ? \` ⏰ \${formatTime(app.CreatedAt)}\` : ''}
                        </span>
                    </div>
                </div>
            </div>
            \${(app.SNCode || app.GlobalSerialNo) ? \`
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.25); border-radius: 8px; padding: 6px 12px;">
                    <i data-lucide="globe" style="width: 16px; height: 16px; color: #0284c7;"></i>
                    <span style="font-size: 12.5px; font-weight: 800; color: #0284c7; font-family: var(--font-mono, monospace);">\${escapeHtml(app.SNCode || ('SN-' + app.GlobalSerialNo))}</span>
                    <span style="font-size: 11.5px; color: var(--text-muted);">• \${escapeHtml(app.ModuleCode || ('CSC-' + app.AppID))}</span>
                </div>
            \` : ''}
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <span class="csc-service-badge \${theme.cls}" style="font-size: 13.5px; padding: 6px 14px; font-weight: 800; border-radius: 8px;">
                    \${theme.label}
                </span>
                <button type="button" class="csc-status-pill \${statusCls}" onclick="openCSCStatusModal(\${app.AppID})" title="Status badalne ke liye click karein" style="cursor: pointer; font-size: 13.5px; padding: 6px 14px; font-weight: 800; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; border: none;">
                    <span class="dot"></span>
                    <span>\${escapeHtml(app.Status || 'Pending')}</span>
                    <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        </div>

        <!-- 2-Column Balanced Details Grid -->
        <div class="csc-detail-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <!-- Column 1: Customer Details -->
            <div class="csc-detail-col" style="background: var(--bg-card, #ffffff); border: 1.5px solid var(--border, #e2e8f0); border-radius: 12px; padding: 16px;">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid var(--border, #e2e8f0); padding-bottom: 8px; margin-bottom: 12px;">
                    <div style="font-size: 12.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="user" style="width: 16px; height: 16px;"></i> Grahak (Customer) Jankari
                    </div>
                    <div style="display: flex; gap: 6px;">
                        \${app.CustomerID ? \`
                            <button type="button" class="btn-ghost btn-sm" onclick="openCustomer360Modal(\${app.CustomerID}, true)" title="Customer 360 Profile Dekhein" style="padding: 2px 8px; font-size: 11.5px; height: 26px; border-radius: 6px; color: #0284c7; font-weight: 700;">
                                <i data-lucide="external-link" style="width: 11px; height: 11px;"></i> #\${app.CustomerID} 360°
                            </button>
                            <button type="button" class="btn-primary btn-sm" id="cscDetailCustomerDocsBtn" onclick="openCustomerDocsModal(\${app.CustomerID}, '\${escapeInlineArg(app.CustomerName)}')" title="\${escapeHtml(app.CustomerName)} ke dastavej dekhein" style="padding: 2px 10px; font-size: 11.5px; height: 26px; border-radius: 6px; background: #0284c7; color: white; display: inline-flex; align-items: center; gap: 4px; font-weight: 700;">
                                <i data-lucide="paperclip" style="width: 12px; height: 12px;"></i> <span id="cscDetailCustDocsBtnLabel">Docs</span>
                            </button>
                        \` : ''}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <span class="csc-detail-lbl">Grahak Ka Naam:</span>
                        <b class="csc-detail-val" style="font-size: 16px; color: var(--text-primary);">\${escapeHtml(app.CustomerName)}</b>
                    </div>
                    <div>
                        <span class="csc-detail-lbl">Mobile Number:</span>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                            <span class="font-mono" style="font-weight: 800; font-size: 15px; color: var(--text-primary);">\${app.CustomerPhone ? escapeHtml(app.CustomerPhone) : '-'}</span>
                            \${app.CustomerPhone ? \`
                                <button type="button" class="btn-ghost btn-sm" data-copy-phone="\${escapeHtml(app.CustomerPhone)}" title="Mobile number copy karein" style="padding: 2px 7px; font-size: 11px; height: 24px; border-radius: 5px;">
                                    <i data-lucide="copy" style="width: 11px; height: 11px;"></i> Copy
                                </button>
                                <button type="button" class="btn-ghost btn-sm" onclick="openWhatsAppChat('\${escapeInlineArg(app.CustomerPhone)}', 'Namaste \${escapeInlineArg(app.CustomerName)}, aapke \${escapeInlineArg(app.ServiceType)} (Token: \${escapeInlineArg(app.AckNumber || '-')}) ka status: \${escapeInlineArg(app.Status || 'Pending')} hai.')" title="Direct WhatsApp Chat" style="padding: 2px 8px; font-size: 11px; height: 24px; border-radius: 5px; color: #16a34a; font-weight: 700;">
                                    <i data-lucide="message-circle" style="width: 12px; height: 12px;"></i> WhatsApp
                                </button>
                            \` : ''}
                        </div>
                    </div>
                    <div>
                        <span class="csc-detail-lbl">Aadhaar Number:</span>
                        <div class="font-mono" style="font-weight: 700; margin-top: 2px; font-size: 14.5px;">
                            \${aadhaarDisplay}
                        </div>
                    </div>
                    <div>
                        <span class="csc-detail-lbl">Janam Tarikh (Date of Birth):</span>
                        <div class="font-mono" style="font-weight: 700; margin-top: 2px; font-size: 14px;">
                            \${renderDOBWithEye(app.CustomerDOB || app.DateOfBirth || app.LinkedCustomerDOB, { fontSize: '14.5px', color: '#0284c7' })}
                        </div>
                    </div>
                    <div id="cscDetailKhataBalanceRow" style="padding-top: 8px; border-top: 1px dashed var(--border, #cbd5e1);">
                        <span class="csc-detail-lbl">Khata Book Status:</span>
                        <div id="cscDetailKhataBalanceVal" style="margin-top: 2px; font-size: 13.5px; font-weight: 700;">
                            \${app.CustomerID ? 'Checking live balance...' : '<span style="color:#64748b;">Khata link nahi hai</span>'}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Column 2: Seva, Delivery & Payment Details -->
            <div class="csc-detail-col" style="background: var(--bg-card, #ffffff); border: 1.5px solid var(--border, #e2e8f0); border-radius: 12px; padding: 16px;">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid var(--border, #e2e8f0); padding-bottom: 8px; margin-bottom: 12px;">
                    <div style="font-size: 12.5px; font-weight: 800; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="briefcase" style="width: 16px; height: 16px;"></i> Seva & Praman Patra
                    </div>
                    <span class="badge \${app.PaymentStatus === 'Paid' ? 'badge-success' : (app.PaymentStatus === 'Partial' ? 'badge-warning' : 'badge-danger')}" style="font-size: 12px; font-weight: 800; padding: 3px 8px; border-radius: 6px;">
                        \${escapeHtml(app.PaymentStatus || 'Unpaid')} • \${escapeHtml(app.PaymentMode || 'Cash')}
                    </span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <span class="csc-detail-lbl">Seva Ka Naam (Service):</span>
                        <div class="csc-detail-val" style="font-size: 15px; font-weight: 800; color: var(--text-primary);">\${escapeHtml(app.ServiceType)}</div>
                    </div>
                    <div>
                        <span class="csc-detail-lbl">Expected Delivery Date:</span>
                        <div style="margin-top: 2px; display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 800; font-size: 14.5px; \${isOverdue ? 'color: #ef4444 !important;' : 'color: var(--text-primary);'}">
                                📅 \${app.ExpectedDate ? formatIndianDate(app.ExpectedDate) : '-'}
                            </span>
                            \${isOverdue ? \`<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-size: 11.5px; font-weight: 800; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 7px;">⚠️ Overdue (Late)</span>\` : ''}
                        </div>
                    </div>
                    <div>
                        <span class="csc-detail-lbl">Certificate / Final Document No:</span>
                        <div style="margin-top: 3px;">
                            \${app.CertificateDocNo ? \`
                                <div style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 6px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3);">
                                    <span class="font-mono" style="font-size: 14px; font-weight: 800; color: #059669;">\${escapeHtml(app.CertificateDocNo)}</span>
                                    <button type="button" class="btn-ghost btn-sm" onclick="copyTextToClipboard('\${escapeInlineArg(app.CertificateDocNo)}', 'Certificate No')" title="Copy Certificate No" style="padding: 1px 4px; border: none;">
                                        <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                                    </button>
                                </div>
                            \` : \`
                                <span style="font-size: 13px; color: #64748b; font-style: italic;">Abhi ban kar nahi aaya (Pending)</span>
                            \`}
                        </div>
                    </div>

                    <!-- Integrated Compact Fee Matrix -->
                    <div style="background: var(--bg-card-sub, #f8fafc); border: 1.5px solid var(--border, #e2e8f0); border-radius: 10px; padding: 10px 12px; margin-top: 4px;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center;">
                            <div>
                                <div style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Portal Fee</div>
                                <div class="font-mono" style="font-size: 13.5px; font-weight: 700; color: var(--text-secondary);">₹\${govtFee.toFixed(2)}</div>
                            </div>
                            <div>
                                <div style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Operator Shulk</div>
                                <div class="font-mono" style="font-size: 13.5px; font-weight: 700; color: var(--text-secondary);">₹\${opCharge.toFixed(2)}</div>
                            </div>
                            <div>
                                <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase;">Kul Shulk</div>
                                <div class="font-mono" style="font-size: 14.5px; font-weight: 900; color: #0284c7;">₹\${totalFee.toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border, #cbd5e1); margin-top: 8px; padding-top: 6px; font-size: 12.5px;">
                            <div>Paid: <b style="color: #059669; font-family: var(--font-mono, monospace);">₹\${paidFee.toFixed(2)}</b></div>
                            <div>
                                \${dueFee > 0 ? \`<b style="color: #dc2626; font-family: var(--font-mono, monospace);">Due: ₹\${dueFee.toFixed(2)} ⚠️</b>\` : \`<b style="color: #059669;">Poora Chukta ✅</b>\`}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Remarks / Note if present -->
        \${(() => {
            if (!app.StatusRemarks || !app.StatusRemarks.trim()) return '';
            const lines = app.StatusRemarks.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);
            return \`
                <div style="background: rgba(2, 132, 199, 0.08); border: 1.5px solid rgba(2, 132, 199, 0.25); border-left: 4px solid #0284c7; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px;">
                    <div style="font-size: 11.5px; text-transform: uppercase; color: #0284c7; font-weight: 800; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>
                        <span>Status Remarks / Vivran:</span>
                    </div>
                    <div style="font-size: 13.5px; margin-top: 3px; font-weight: 600; color: var(--text-primary); line-height: 1.4;">\${escapeHtml(lines.join(' • '))}</div>
                </div>
            \`;
        })()}

        <!-- Compact Customer & Application Documents Strip -->
        <div style="background: var(--bg-card-sub, #f8fafc); border: 1.5px solid var(--border, #e2e8f0); border-radius: 10px; padding: 10px 14px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="paperclip" style="width: 16px; height: 16px; color: #0284c7;"></i>
                <b style="font-size: 13px; color: var(--text-primary);">Dastavej (Attached Documents):</b>
                <span class="badge" id="cscDetailDocsBadge" style="background: rgba(2, 132, 199, 0.15); color: #0284c7; font-size: 11px; padding: 2px 7px;">Checking...</span>
            </div>
            <div id="cscDetailDocsContainer" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="color: #94a3b8; font-size: 12px;">⏳ Documents check ho rahe hain...</span>
            </div>
            \${app.CustomerID ? \`
                <button type="button" class="btn-ghost btn-sm" onclick="openCustomerDocsModal(\${app.CustomerID}, '\${escapeInlineArg(app.CustomerName)}')" style="padding: 3px 10px; font-size: 11.5px; height: 26px; border-radius: 6px; color: #0284c7; font-weight: 700; border: 1px solid rgba(2, 132, 199, 0.35);">
                    <i data-lucide="folder-open" style="width: 12px; height: 12px;"></i> Upload / View
                </button>
            \` : ''}
        </div>
    \`;

    // Populate footer action buttons with uniform standard
    if (footer) {
        footer.innerHTML = \`
            \${app.CustomerID ? \`
                <button type="button" class="btn-primary" onclick="openCustomerDocsModal(\${app.CustomerID}, '\${escapeInlineArg(app.CustomerName)}')" title="Grahak ke sabhi dastavej dekhein" style="height: 38px; padding: 0 16px; font-weight: 700; border-radius: 8px; background: #0284c7; color: white; display: inline-flex; align-items: center; gap: 6px; border: none; cursor: pointer;">
                    <i data-lucide="paperclip" style="width: 15px; height: 15px;"></i> Documents
                </button>
            \` : ''}
            <button type="button" class="btn-secondary" onclick="openCSCReceiptModal(\${app.AppID})" title="Print Grahak Pawati Slip" style="height: 38px; padding: 0 16px; font-weight: 700; border-radius: 8px; background: #2563eb; color: white; border: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                <i data-lucide="printer" style="width: 15px; height: 15px;"></i> Print Slip
            </button>
            <button type="button" class="btn-whatsapp" onclick="sendCSCWhatsApp(\${app.AppID})" title="WhatsApp Par Alert Bhejein" style="height: 38px; padding: 0 16px; font-weight: 700; border-radius: 8px; background: #16a34a; color: white; border: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                <i data-lucide="message-circle" style="width: 15px; height: 15px;"></i> WhatsApp
            </button>
            <button type="button" class="btn-ghost" onclick="openCSCStatusModal(\${app.AppID})" title="Status Update Karein" style="height: 38px; padding: 0 16px; font-weight: 700; border-radius: 8px; color: #d97706; border: 1.5px solid rgba(217, 119, 6, 0.4); display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                <i data-lucide="rotate-ccw" style="width: 15px; height: 15px;"></i> Status Badlein
            </button>
            <button type="button" class="btn-ghost" onclick="openEditCSCModal(\${app.AppID})" title="Edit Details" style="height: 38px; padding: 0 16px; font-weight: 700; border-radius: 8px; color: #059669; border: 1.5px solid rgba(5, 150, 105, 0.4); display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                <i data-lucide="edit-2" style="width: 15px; height: 15px;"></i> Edit
            </button>
        \`;
    }

    `;

content = content.slice(0, startIdx) + newBodyAndFooter + content.slice(endIdx);
fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated openCSCDetailModal in public/app.js!');

