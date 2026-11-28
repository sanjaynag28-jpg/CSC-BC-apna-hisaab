const { query, withTransaction } = require('./db');

// ---------------------------------------------------------------------------
// RECURRING TRANSACTIONS ENGINE
// Jab koi recurring item due ho (NextDueDate <= aaj), to uska Transaction
// auto-generate karta hai, NextDueDate ko Frequency ke hisaab se aage badhata
// hai, aur affected account ka balance dobara calculate karta hai.
//
// Idempotent: har transaction ki Reference 'RECUR-<id>-<date>' hoti hai aur
// Transactions.Reference pe UNIQUE filtered index hai — dobara process karne
// par duplicate nahi banta (server restart + interval dono safe).
// ---------------------------------------------------------------------------

function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return toISO(d);
}

// Month add karo with day-clamp (Jan 31 → Feb 28/29).
// NOTE: anchor day ko original me se nikaal kar carry karte hain, warna
// Jan 31 ke baad har mahine 28th hi anchor ban jata tha.
function addMonths(dateStr, n, anchorDay) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = anchorDay || d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return toISO(d);
}

function nextDueDate(current, frequency, anchorDay) {
    switch ((frequency || '').toLowerCase()) {
        case 'daily': return addDays(current, 1);
        case 'weekly': return addDays(current, 7);
        case 'monthly': return addMonths(current, 1, anchorDay);
        case 'yearly': return addMonths(current, 12, anchorDay);
        default: return addDays(current, 1);
    }
}

// mssql DATE columns ko JS Date object deta hai (string nahi).
// Ise hamesha YYYY-MM-DD string me badlo — String(dateObj).slice(0,10)
// "Sat Sep 12" dega jo galat hai!
function toDateStr(val) {
    if (!val) return null;
    if (val instanceof Date) return toISO(val);
    const s = String(val);
    // Agar ISO datetime string aaya to sirf date part lo
    return s.length >= 10 ? s.slice(0, 10) : s;
}

async function processRecurringTransactions(filterUserId = null) {
    const today = toISO(new Date());

    let sql = `
        SELECT RecurringID, UserID, TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID,
               Description, Frequency, StartDate, NextDueDate, EndDate
        FROM RecurringTransactions
        WHERE IsActive = 1 AND NextDueDate <= @today
          AND (EndDate IS NULL OR NextDueDate <= EndDate)
    `;
    const params = { today };
    if (filterUserId) {
        sql += ` AND UserID = @filterUserId`;
        params.filterUserId = filterUserId;
    }
    sql += ` ORDER BY RecurringID ASC`;

    const due = await query(sql, params);

    const rows = due.recordset || [];
    if (rows.length === 0) return { processed: 0, generated: 0, date: today };

    let generated = 0;
    for (const r of rows) {
        if (!r.AccountID) { console.warn(`⚠️ Recurring #${r.RecurringID} ka AccountID nahi hai — skip (Transaction banane ke liye account zaroori hai).`); continue; }

        let current = toDateStr(r.NextDueDate);
        const endDate = toDateStr(r.EndDate);
        const desc = r.Description || `${r.TransType} (Recurring)`;
        // Anchor day = schedule ki original start date ka din (month-end drift fix)
        const anchorDay = new Date((toDateStr(r.StartDate) || current) + 'T00:00:00').getDate();
        let guard = 0;

        // Poora catch-up batch ek transaction me - crash beech me hua to
        // half-generated state na chhode
        const batchGenerated = await withTransaction(async (tQuery) => {
            let created = 0;
            // Har due occurrence ek Transaction banaye — aaj (or EndDate) tak catch-up
            while (current <= today && (!endDate || current <= endDate) && guard < 600) {
                guard++;
                const ref = `RECUR-${r.RecurringID}-${current}`;
                // UPDLOCK/HOLDLOCK se check-then-insert atomic ho jata hai -
                // concurrent runs duplicate transaction nahi bana sakte
                const res = await tQuery(`
                    INSERT INTO Transactions
                        (UserID, TransDate, TransType, Amount, AccountID, ToAccountID, CategoryID, PartyID, Description, Reference, IsRecurring, RecurringID)
                    SELECT @userId, @date, @type, @amount, @acc, @toAcc, @cat, @party, @desc, @ref, 1, @rid
                    WHERE NOT EXISTS (
                        SELECT 1 FROM Transactions WITH (UPDLOCK, HOLDLOCK) WHERE Reference = @ref AND UserID = @userId
                    );
                `, {
                    userId: r.UserID || 1,
                    date: current, type: r.TransType, amount: r.Amount,
                    acc: r.AccountID, toAcc: r.TransType === 'Transfer' ? (r.ToAccountID || null) : null,
                    cat: r.CategoryID || null, party: r.PartyID || null,
                    desc, ref, rid: r.RecurringID
                });
                if (res.rowsAffected && res.rowsAffected[0] > 0) created++;
                current = nextDueDate(current, r.Frequency, anchorDay);
            }

            // NextDueDate ko pehli future date pe le jao; EndDate cross ho gaya to deactivate
            const stillActive = !(endDate && current > endDate);
            await tQuery(`
                UPDATE RecurringTransactions
                SET NextDueDate = @next, LastRunDate = @last, IsActive = @active
                WHERE RecurringID = @rid
            `, { next: current, last: today, active: stillActive, rid: r.RecurringID });

            // Affected account balances isi transaction me update karo (sirf is user ke owned accounts)
            const accIds = [...new Set([r.AccountID, r.ToAccountID].filter(Boolean))];
            for (const a of accIds) {
                const owned = await tQuery('SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @uid', { id: a, uid: r.UserID || 1 });
                if (owned.recordset?.length) {
                    await tQuery('EXEC sp_UpdateAccountBalance @id', { id: a });
                }
            }

            return created;
        });

        generated += batchGenerated;
    }

    console.log(`🔁 Recurring: ${rows.length} due item(s) processed, ${generated} transaction(s) generated (${today})`);
    return { processed: rows.length, generated, date: today };
}

module.exports = { processRecurringTransactions, nextDueDate, toISO, toDateStr };
