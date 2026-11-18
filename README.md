# CSC & BC Apna Hisaab (Cash Management System)

Complete local-first **Cash Management, BC/AEPS Banking, CSC Services, Bill Payments, Khatabook, Customer 360 & Invoicing** software built with Node.js, Express, and SQL Server.

---

## ⚡ 1-Click Direct Download & Complete Auto-Install (Sab Kuch Automatic!)

### Option A — Direct ZIP Download (Sabse Aasan — Bina Coding)
1. **Direct ZIP Download Karein:**  
   👉 **[Download Complete Project ZIP](https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip)**
2. ZIP ko extract (unzip) karein.
3. Folder ke andar **`ONE_CLICK_SETUP.bat`** par double-click karein!

### Option B — Single-File Installer (WhatsApp/Share ke liye)
- Bas **`INSTALL_FROM_GITHUB.bat`** download karein aur double-click karein - wo khud GitHub se poora project `%USERPROFILE%\CSC-BC-Apna-Hisaab` (jaise `C:\Users\AapkaNaam\CSC-BC-Apna-Hisaab`) mein download karke complete setup chala dega!

### `ONE_CLICK_SETUP.bat` Automatically Kya-Kya Karta Hai?
- ✅ **Node.js LTS** nahi hai toh automatically install karta hai
- ✅ **Microsoft SQL Server Express** nahi hai toh automatically download & install karta hai
- ✅ **SQL Server Mixed Mode & TCP/IP** automatically enable karta hai
- ✅ **`.env` file + secure database login + JWT secret** automatically generate karta hai (kuch manually type nahi karna!)
- ✅ **Fresh `CashManagement` Database, 24 Tables, 5 Stored Procedures, Starter Admin with Random Password + Localhost Auto-Login (no typing; remote/LAN credentials `.admin-login.txt` me), Starter Cash/Bank Accounts, Categories & CSC Services** sab automatically banata hai
- ✅ Desktop par **`CSC BC Apna Hisaab`** shortcut banata hai
- ✅ PC on hote hi server **silently auto-start** hota hai (Windows Task Scheduler) aur background me hamesha chalta rehta hai — crash hone par khud restart
- ✅ Install ke baad **koi cmd/console window nahi** khulti — sab silent
- ✅ **Self-Healing:** internet slow/fail ho to download **auto-retry** (backoff ke saath), adhoora/corrupt download detect hoke **fresh copy**, missing/corrupt project file mile to **auto-repair**, `npm install` aur database step fail ho to **khud dobara** try
- ✅ Server start hone ke baad **health-check** — na chale to khud restart, phir bhi na chale to log path batata hai
- ✅ Server start karke browser mein **`http://localhost:3000`** khol deta hai — **Project turant Ready!**

---

## 🔄 Automatic Silent Updates (Lifetime Auto-Update)
- Jab bhi aap Desktop shortcut (`START.bat`) ya server open karte hain, app silently GitHub se latest `version.json` check karta hai. Uske baad **har raat 2:30 AM** par bhi check hota hai — restart sirf tab jab app idle ho (koi transaction na chal rahi ho).
- Naya update milte hi:
  1. Pehle aapke SQL Server database ka **automatic backup** hota hai (`backups/`).
  2. Sirf code files update hoti hain — **aapka database, `.env`, `public/uploads/`, aur `backups/` 100% safe rehta hai** (Git ho ya ZIP install — dono mein kaam karta hai!).
  3. Safe DB migration chalti hai aur server gracefully restart hota hai.
- Offline hone par update silently skip ho jata hai aur app bina ruke chalta hai.
- Manual force-update ke liye **`UPDATE_APP.bat`** double-click karein.

---

## ✨ Key Features
- **BC / AEPS Counter Banking:** Cash Withdrawal, Deposit, Money Transfer, QR Pay, Customer Slip Printing (A4, A4/2, 80mm Thermal) & WhatsApp Share.
- **CSC Services & Applications:** Fee collection, government fee ledger, status tracking, customer document storage.
- **Bill Payments & EMI:** Electricity, Recharge, Loan EMI, automated receipt OCR & customer due tracking.
- **Customer Khatabook & 360° Profile:** Unified customer ledger, udhaar/advance tracking, family linking, universal serial numbers (`SN-XXXX`).
- **Multi-Tenant Shop Isolation:** Strict account & data separation across shops.

---

## 🔒 Data Privacy
- `.env`, `database/data/`, `public/uploads/`, `backups/`, aur `logs/` sabhi `.gitignore` mein strictly excluded hain.
- Har shop ka data uske apne local SQL Server database mein 100% private rehta hai.
