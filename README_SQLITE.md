# 🚀 CSC & BC Apna Hisaab - SQLite Edition (Zero-Install)

> **100% Embedded Zero-Install Edition**  
> Naye PC ya purane laptop par sirf **15 se 20 second** me 1-Click install!  
> **Koi Microsoft SQL Server install karne ki zaroorat nahi!**

---

## ⚡ Is Edition Ki Khaasiyat (Features)

1. **Zero Database Setup:**  
   Microsoft SQL Server 2022 Express (~250 MB download + 5-10 minute install) ki bilkul zaroorat nahi hai. Database project folder me hi embedded rahta hai (`database/data/cash_management.db`).
2. **Instant 15-Second Install:**  
   Node.js runtime verify karta hai, lightweight dependencies download karta hai aur turant start ho jata hai.
3. **100% Accounting Invariants Preserved:**  
   BC Cash Withdrawal, Cash Deposit, DMT, CSC Applications, Bill Payments, Khatabook, Party Ledger, aur Account Balances sab kuch 100% exact calculate hota hai.
4. **Localhost Auto-Login & Wi-Fi Access:**  
   Apne PC par direct open hota hai bina password ke. Same Wi-Fi se doosre phone ya laptop par chalane ke liye password `.admin-login.txt` me save hota hai.
5. **Completely Independent Branch:**  
   Yeh project GitHub ke `sqlite` branch par surakshit hai. Main SQL Server edition `main` branch par as-is chal raha hai.

---

## 📥 Naye PC Par Install Karne Ka Tareeka (1-Click)

### Option 1: Direct Batch File (Fastest)
1. GitHub se **`INSTALL_SQLITE.bat`** download karein:
   - Link: `https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/INSTALL_SQLITE.bat`
2. Downloaded file par **Right Click -> Run as Administrator** karein.
3. 15-20 second me installation poora ho jayega aur app browser me open ho jayega!

Installer har installation ke liye alag random JWT secret banata hai. Manual setup me `.env.example` copy karne par server start karne se pehle `JWT_SECRET` ko ek unique, cryptographically random value se set karein. Localhost auto-login sirf trusted PC par rakhein; ise band karne ke liye `.env` me `ALLOW_LOCAL_AUTO_LOGIN=false` set karein.

---

## 🔄 Fresh Clean Reset (Agar Kabhi Naye Sire Se Install Karna Ho)
- Run as Administrator: **`CLEAN_INSTALL_SQLITE.bat`**
- Yeh tool purane adhoore cache aur data ko clean karke fresh install kar dega.

---

## 🖥️ App Start Kaise Karein
- Desktop par bane shortcut **`CSC & BC Apna Hisaab (SQLite)`** par double click karein, ya
- Project folder me **`START.bat`** par double click karein.

## 🛡️ Existing Database Integrity Migration
Existing installations ko restrictive foreign keys aur natural-key unique indexes dene ke liye pehle migration ka dry-run karein:

```powershell
npm run migrate:sqlite:integrity -- --dry-run
```

Dry-run temporary verified copy par complete migration test karta hai aur live database ko nahi badalta. Test pass hone ke baad migration apply karein:

```powershell
npm run migrate:sqlite:integrity -- --apply
```

Apply se pehle app/server band karein aur migration khatam hone tak use na karein. SQLite online backup banata aur verify karta hai, phir transaction ke andar schema rebuild karke row data, IDs, hidden rowids, sequences aur integrity check verify karta hai. Unexpected references, duplicate unique keys, ya data mismatch par migration rollback ho jata hai. Existing soft-deleted `BillPayments` orphan ko unchanged preserve kiya jata hai; delete cascades enable nahi kiye gaye hain. Migration ke baad app ko dobara start karein.
