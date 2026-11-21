# CSC & BC Apna Hisaab (Cash Management System)

Complete local-first **Cash Management, BC/AEPS Banking, CSC Services, Bill Payments, Khatabook, Customer 360 & Invoicing** software built with Node.js, Express, and SQL Server.

---

## ⚡ 1-Click Master Installer & High-Tech Setup Wizard (Sab Kuch 100% Automatic!)

### Option A — Ek Click me Install (Sabse Aasan — Single-File Download)
1. GitHub se sirf ek file download karein:  
   👉 **`INSTALL_NOW.bat`** (ya pura ZIP download karke extract karein).
2. Double-click karke chalayein — **Khoobsoorat High-Tech Dark Mode Window (GUI)** khulegi!
3. Yeh tool step-by-step sab check aur verify karega:
   - File Integrity Check (Corrupt ya missing files GitHub se turant fresh download)
   - Node.js LTS Runtime Verify/Auto-Install
   - NPM Packages & Dependencies Auto-Install
   - Microsoft SQL Server Express Auto-Detect / Silent Setup
   - TCP/IP Protocols & Mixed Mode Registry Settings
   - Database Tables, Stored Procedures & Starter Data Seeding
   - Windows Firewall Port 3000 Access Rule
   - Desktop Shortcut & Windows Boot Auto-Start
   - Live Server Health Verification & Browser Auto-Launch (`http://localhost:3000`)
4. **100% Data Safe:** Aapka `.env`, database, aur uploaded documents kabhi overwrite ya delete nahi hote.

### `ONE_CLICK_SETUP.bat` Automatically Kya-Kya Karta Hai?
- ✅ **Node.js LTS** nahi hai toh automatically install karta hai
- ✅ **Microsoft SQL Server Express** nahi hai toh automatically download & install karta hai
- ✅ **SQL Server Mixed Mode & TCP/IP** automatically enable karta hai
- ✅ **`.env` file + secure database login + JWT secret** automatically generate karta hai (kuch manually type nahi karna!)
- ✅ **Fresh `CashManagement` Database, 24 Tables, 5 Stored Procedures, Starter Admin with Random Password + Localhost Auto-Login (no typing; remote/LAN credentials `.admin-login.txt` me), Starter Cash/Bank Accounts, Categories & CSC Services** sab automatically banata hai
- ✅ Desktop par **`CSC BC Apna Hisaab`** shortcut banata hai
- ✅ PC on hote hi server **silently auto-start** hota hai (Windows Task Scheduler) aur background me hamesha chalta rehta hai — crash hone par khud restart
- ✅ Install ke baad **koi cmd/console window nahi** khulti — sab silent
- ✅ SQL Server connect hone tak **animated wait screen** server, database connection, retries aur schema preparation ka live status dikhati hai; ready hote hi app khud khul jata hai
- ✅ **Self-Healing:** internet slow/fail ho to download **auto-retry** (backoff ke saath), adhoora/corrupt download detect hoke **fresh copy**, missing/corrupt project file mile to **auto-repair**, `npm install` aur database step fail ho to **khud dobara** try
- ✅ Server start hone ke baad **health-check** — na chale to khud restart, phir bhi na chale to log path batata hai
- ✅ Server start karke browser mein **`http://localhost:3000`** khol deta hai — **Project turant Ready!**

### Project Uninstall
- **`UNINSTALL_PROJECT.bat`** ko Run as administrator karein. Yeh exact project folder aur app ke startup entries, scheduled tasks, shortcuts, firewall rule, aur diagnostic files ko hi target karta hai.
- Project folder (including uploads, backups, `.env`, and `node_modules`) permanently delete karne se pehle exact confirmation maangta hai. `.env` se pehchane gaye local `CashManagement` database ke liye alag confirmation hoti hai.
- Global Node.js aur default SQL Server (`MSSQLSERVER`) ko nahi hatata. `CMBCSQL` instance ko sirf tab uninstall karne ka option deta hai jab usmein koi user database na ho, aur alag confirmation di jaye.
- Unrelated databases, services, shortcuts, and firewall rules preserve kiye jaate hain. Fresh install ke liye existing `INSTALL_FROM_GITHUB.bat` ya `ONE_CLICK_SETUP.bat` use karein.

---

## 🔄 Automatic Silent Updates (Lifetime Auto-Update)
- Server start hote hi, phir **har 4 ghante** aur **har raat 2:30 AM**, app silently GitHub se latest `version.json` check karta hai — restart sirf tab jab app idle ho (koi transaction na chal rahi ho).
- Naya update milte hi:
  1. Pehle aapke SQL Server database ka **automatic backup** hota hai (`backups/`).
  2. Sirf code files update hoti hain — **aapka database, `.env`, `public/uploads/`, aur `backups/` 100% safe rehta hai** (Git ho ya ZIP install — dono mein kaam karta hai!).
  3. Safe DB migration chalti hai aur server gracefully restart hota hai.
- Offline hone par update silently skip ho jata hai aur app bina ruke chalta hai.
- Missing npm package (jaise `sharp`) detect hone par updater package ko repair karta hai, chahe `package.json` badla na ho.
- Windows par npm install ko `cmd.exe` ke through chalaya jata hai, isliye `spawnSync npm.cmd EINVAL` se update rukta nahi.
- Manual update/repair ke liye **`UPDATE_APP.bat`** double-click karein; yeh update ke baad hidden server launcher bhi chalata hai.
- Purane Windows install par updater npm install error de to project folder me **`REPAIR_DEPENDENCIES.vbs`** download karke double-click karein; yeh packages ko silently repair karke app start karta hai.

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
