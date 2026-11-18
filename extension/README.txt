============================================================================
💰 CASH MANAGEMENT BC - CHROME EXTENSION (AEPS & CSC GRABBER)
============================================================================

Is extension ka kaam hai CSC AEPS, Digipay, Digipay Lite, SBI Kiosk Banking,
Spice Money, PayNearby, aur CSC Digital Seva / eDistrict portals se receipt
aur aavedan data ko ek click me Cash Management BC me grab & sync karna.

----------------------------------------------------------------------------
INSTALLATION / SETUP GUIDE (Zero Trouble)
----------------------------------------------------------------------------
1. Google Chrome ya koi bhi Chromium browser (Edge, Brave) kholein.
2. Address bar me type karein: chrome://extensions/
3. Top-right corner me "Developer mode" toggle ON karein.
4. Top-left corner me "Load unpacked" button par click karein.
5. Is folder ko select karein:
   D:\Cash Managment BC\extension
6. Extension Chrome me load ho jayegi!

----------------------------------------------------------------------------
KEYBOARD SHORTCUTS & USAGE MODES
----------------------------------------------------------------------------
1. Tarika B: Auto-Grab & Switch to Project (Recommended)
   - Shortcut: [Alt + C] (ya extension icon par click)
   - Kaam: Portal par receipt khuli hone par Alt+C dabate hi receipt se RRN,
     Amount, Bank, Customer, Mobile auto-extract hota hai aur turant Cash
     Management project tab par switch ho kar BC / CSC modal fill ho jata hai.

2. Tarika C: In-Page Overlay Modal
   - Shortcut: [Alt + Shift + C]
   - Kaam: Portal page ke upar hi floating modal khul jata hai. Wahan par
     aap fields verify kar sakte hain, manual receipt text paste kar sakte
     hain, aur Direct Database Save ya Open in Project kar sakte hain.

3. Auto Hot-Reload:
   - Jaise hi aap server ya extension file update karte hain, extension
     background me server buildId detect karke bina kisi manual reload ke
     khud ko update kar leta hai.

----------------------------------------------------------------------------
TESTING
----------------------------------------------------------------------------
- Self-test run karne ke liye browser me kholein:
  http://localhost:3000/api/extension/test
- Mock receipts par test karne ke liye:
  http://localhost:3000/test_grabber.html
============================================================================
