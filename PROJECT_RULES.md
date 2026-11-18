# 📌 CASH MANAGEMENT SYSTEM - PROJECT CODING & UI RULES

## 1. 🔤 TYPOGRAPHY / FONT MANDATE (STRICT RULE - DO NOT CHANGE)
* **PRIMARY & DEFAULT FONT:** **`Segoe UI`**
* **MANDATE:**
  - Pure project me sirf aur sirf **`Segoe UI`** font hi use hoga.
  - Kisi bhi component, modal, table, card, button, receipt ya print document me **koi aur font (jaise Inter, Roboto, Arial, Poppins etc.) primary nahi lagana hai**.
  - Font Stack definition:
    ```css
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    ```
  - User strictly instructed: *"ha yahi font sab jagah use karo isko defolt rakho iske alawa koi aur use nahi hoga ye kahi par likh kar rakh lo , aap baar baar kahi na kahi badal dete ho"*.
  - Any future AI agent or developer MUST respect this rule and NEVER change the default font from `Segoe UI`.

## 2. 🧾 RECEIPT & PRINT INTEGRITY
* Screen preview receipt size can be large for visual readability (`zoom: 1.25` on screen).
* Print templates in `universalPrint` MUST maintain standard paper geometry:
  - Thermal: 72mm width on 80mm roll, zero page margin, `zoom: 1 !important`.
  - A4 / A4 Half: Standard page formatting with exact borders.

## 3. 🎯 MODAL & AUTO-FILL INTEGRITY
* Auto-fill chip (`#bcPhoneChip`, `#cscPhoneChip`, `#bpPhoneChip`) must ALWAYS sit on its own dedicated line (`.autofill-chip-banner`) ABOVE the input fields.
* Never place auto-fill chips inside label headers where they could push inputs down or break horizontal column alignment.
