# CSC & BC Apna Hisaab (Cash Management System)

Complete local-first **Cash Management, BC/AEPS Banking, CSC Services, Bill Payments, Khatabook, Customer 360 & Invoicing** software built with Node.js, Express, and SQL Server.

---

## ✨ Key Features
- **BC / AEPS Counter Banking:** Cash Withdrawal, Deposit, Money Transfer, QR Pay, Customer Slip Printing (A4, A4/2, 80mm Thermal) & WhatsApp Share.
- **CSC Services & Applications:** Fee collection, government fee ledger, status tracking, customer document storage.
- **Bill Payments & EMI:** Electricity, Recharge, Loan EMI, automated receipt OCR & customer due tracking.
- **Customer Khatabook & 360° Profile:** Unified customer ledger, udhaar/advance tracking, family linking, universal serial numbers (`SN-XXXX`).
- **Multi-Tenant Shop Isolation:** Strict account & data separation across shops.
- **Automatic Silent Updates:** App automatically checks GitHub on launch and updates code silently in the background without touching your SQL Server database, `.env`, or customer uploads.

---

## 🚀 Installation (New PC Setup)

### Prerequisites
1. **Node.js (LTS)** — [Download](https://nodejs.org/)
2. **Microsoft SQL Server Express** — Running locally (`localhost\SQLEXPRESS`)

### 3-Step Setup
1. **Download / Clone:**
   ```bash
   git clone https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab.git
   cd CSC-BC-apna-hisaab
   ```
   *(Ya GitHub se **Code → Download ZIP** karke extract kar lein.)*
2. **Run One-Click Setup:**
   - Double-click **`ONE_CLICK_SETUP.bat`**
   - First run par `.env` file automatically create hokar Notepad mein khul jayegi — usmein apna `DB_SERVER` aur `DB_PASSWORD` enter karke save karein.
3. **Daily Launch:**
   - Rozana chalane ke liye **`START.bat`** ya **`START_SILENT.bat`** (PM2 background mode) par double-click karein.
   - Browser automatically `http://localhost:3000` par khul jayega!

---

## 🔄 Automatic Silent Updates
- Jab bhi aap software open karte hain (`START.bat`, `RUN.bat`, `START_SILENT.bat`, ya `node server.js`), background mein automatically GitHub se latest `version.json` check hota hai.
- Naya version milne par:
  1. Pehle aapke SQL Server database ka **automatic backup** hota hai.
  2. Sirf naye code files download/update hote hain (aapka `.env`, database, `backups/`, aur `public/uploads/` 100% surakshit rehta hai).
  3. Safe DB migration chalti hai aur server restart hokar browser automatically refresh ho jata hai.
- Manual force-update ke liye **`UPDATE_APP.bat`** double-click karein.
- Offline hone par update silently skip ho jata hai aur app bina ruke chalta hai.

---

## 🔒 Data Privacy
- `.env`, `database/data/`, `public/uploads/`, `backups/`, aur `logs/` sabhi `.gitignore` mein strictly excluded hain.
- Har shop ka data uske apne local SQL Server database mein rehta hai.
