const fs = require('fs');

const path = 'public/index.html';
const content = fs.readFileSync(path, 'utf8');

const startMarker = '<div class="modal-overlay" id="accountPassbookModal">';
const endMarker = '<!-- Searchable Select Engine -->';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found! start:', startIdx, 'end:', endIdx);
    process.exit(1);
}

const cleanMarkup = `<div class="modal-overlay" id="accountPassbookModal">
        <div class="modal passbook-modal-container" onclick="event.stopPropagation()">
            <!-- Passbook Header Bar -->
            <div class="pb-modal-header">
                <div class="pb-header-left">
                    <div class="pb-bank-emblem" id="pbEmblem"><i data-lucide="book-open"></i></div>
                    <div>
                        <div class="pb-title-row">
                            <h2 id="pbModalAccountName">Cash in Hand (Galla)</h2>
                            <span class="pb-type-pill" id="pbModalAccountType">PHYSICAL CASH</span>
                        </div>
                        <p class="pb-subtitle">Official Statement & Passbook Ledger (Khate ka live running balance hisaab-kitaab)</p>
                    </div>
                </div>
                <div class="pb-header-right">
                    <button type="button" class="pb-btn pb-btn-print" onclick="printPassbookStatement()" title="Passbook Print Karein">
                        <i data-lucide="printer"></i> <span>Print</span>
                    </button>
                    <button type="button" class="pb-btn pb-btn-excel" onclick="exportPassbookCSV()" title="CSV / Excel Export">
                        <i data-lucide="download"></i> <span>Excel</span>
                    </button>
                    <button type="button" class="modal-close" onclick="closeAccountPassbookModal()" title="Band Karein"><i data-lucide="x"></i></button>
                </div>
            </div>

            <!-- Authentic Passbook Cover / Account Details Banner -->
            <div class="pb-account-banner">
                <div class="pb-meta-grid">
                    <div class="pb-meta-item">
                        <span class="pb-meta-label">Khata Dharak / Malik</span>
                        <b class="pb-meta-val">BC Banking Counter (Grahak Seva)</b>
                    </div>
                    <div class="pb-meta-item">
                        <span class="pb-meta-label">Bank / Sanstha Name</span>
                        <b class="pb-meta-val" id="pbModalBankName">-</b>
                    </div>
                    <div class="pb-meta-item">
                        <span class="pb-meta-label">Khata Number / Ref</span>
                        <b class="pb-meta-val" id="pbModalAccNumber">-</b>
                    </div>
                    <div class="pb-meta-item">
                        <span class="pb-meta-label">Statement Ki Tarikh</span>
                        <b class="pb-meta-val" id="pbStatementDate">Today</b>
                    </div>
                </div>

                <!-- 4 Financial Summary KPI Badges -->
                <div class="pb-kpi-grid">
                    <div class="pb-kpi-card opening">
                        <span class="pb-kpi-label">Shuruati Balance (Opening Bal)</span>
                        <div class="pb-kpi-val" id="pbKpiOpening">₹0.00</div>
                    </div>
                    <div class="pb-kpi-card credit">
                        <span class="pb-kpi-label">Kul Jama (Total Credit / Aaya)</span>
                        <div class="pb-kpi-val text-income" id="pbKpiCredit">+₹0.00</div>
                    </div>
                    <div class="pb-kpi-card debit">
                        <span class="pb-kpi-label">Kul Nikasi (Total Debit / Gaya)</span>
                        <div class="pb-kpi-val text-expense" id="pbKpiDebit">-₹0.00</div>
                    </div>
                    <div class="pb-kpi-card balance">
                        <span class="pb-kpi-label">Antim Bacha Balance (Net Running Bal)</span>
                        <div class="pb-kpi-val text-net" id="pbKpiClosing">₹0.00</div>
                    </div>
                </div>
            </div>

            <!-- Passbook Filter & Search Toolbar -->
            <div class="pb-toolbar">
                <div class="pb-search-wrap">
                    <i data-lucide="search"></i>
                    <input type="text" id="pbSearchInput" placeholder="🔍 Vivran, Party, Category, RRN/UTR khojein..." oninput="filterPassbookClientSide()">
                </div>
                <div class="pb-filter-group">
                    <div class="pb-quick-dates">
                        <button type="button" class="pb-quick-date-btn active" id="pbDateAll" onclick="setPassbookDateRange('all')">Sabhi</button>
                        <button type="button" class="pb-quick-date-btn" id="pbDateToday" onclick="setPassbookDateRange('today')">Aaj</button>
                        <button type="button" class="pb-quick-date-btn" id="pbDateMonth" onclick="setPassbookDateRange('month')">Is Mahine</button>
                    </div>
                    <div class="pb-date-inputs">
                        <input type="date" id="pbStartDate" onchange="fetchPassbookData()">
                        <span>se</span>
                        <input type="date" id="pbEndDate" onchange="fetchPassbookData()">
                    </div>
                    <div class="pb-sort-toggle" onclick="togglePassbookSort()" title="Sort order badlein">
                        <i data-lucide="arrow-down-up"></i>
                        <span id="pbSortLabel">Naya Pehle</span>
                    </div>
                </div>
            </div>

            <!-- Passbook Ledger Table Area -->
            <div class="pb-table-scroll" id="pbPrintableArea">
                <table class="pb-passbook-table" id="pbPassbookTable">
                    <thead>
                        <tr>
                            <th style="width: 130px;">Tarikh / Samay</th>
                            <th>Vivran (Particulars)</th>
                            <th style="width: 140px;">Ref / RRN</th>
                            <th style="width: 140px;">Kism (Type)</th>
                            <th class="cell-right" style="width: 125px;">Nikasi (Debit Dr ₹)</th>
                            <th class="cell-right" style="width: 125px;">Jama (Credit Cr ₹)</th>
                            <th class="cell-right" style="width: 160px; background: rgba(16, 185, 129, 0.08);">Bacha Balance (Net Balance ₹)</th>
                        </tr>
                    </thead>
                    <tbody id="pbPassbookTableBody">
                        <tr><td colspan="7" class="text-center" style="padding: 40px;">Passbook load ho rahi hai...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Passbook Footer Bar -->
            <div class="pb-footer-bar">
                <div class="pb-footer-info" id="pbFooterInfo">
                    Showing 0 transactions
                </div>
                <div class="pb-footer-note">
                    * Har transaction ke baad bacha hua balance dikhaya gaya hai (Bank Passbook Standard)
                </div>
            </div>
        </div>
    </div>

    `;

const newContent = content.substring(0, startIdx) + cleanMarkup + content.substring(endIdx);
fs.writeFileSync(path, newContent, 'utf8');
console.log('Successfully replaced accountPassbookModal in public/index.html');

