const { query } = require('../database/db');

// Let's test the passbook entries for Account 1 with current logic vs fixed logic
async function testInversions() {
    const toDateOnly = (d) => {
        if (!d) return null;
        if (typeof d === 'string') return d.slice(0, 10);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // Load account 1 transactions
    const txns = await query("SELECT TransactionID as rawId, TransDate as date, TransTime as time, CreatedAt as createdAt, Amount, TransType FROM Transactions WHERE AccountID = 1 AND IsDeleted = 0");
    const list = txns.recordset;
    console.log(`Loaded ${list.length} transactions for Account 1`);

    // Old sorting logic
    function getOldTimestamp(e) {
        if (e.createdAt) {
            const cTs = new Date(e.createdAt).getTime();
            if (!isNaN(cTs) && cTs > 0) return { ts: cTs, tieBreaker: e.rawId || 0 };
        }
        const dateStr = toDateOnly(e.date) || '1970-01-01';
        let hh = 0, mm = 0, ss = 0;
        if (e.time) {
            const str = String(e.time).trim().toLowerCase();
            const m = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (m) {
                hh = parseInt(m[1], 10);
                mm = parseInt(m[2], 10);
                ss = m[3] ? parseInt(m[3], 10) : 0;
                if (str.includes('pm') && hh < 12) hh += 12;
                if (str.includes('am') && hh === 12) hh = 0;
            }
        }
        const dt = new Date(dateStr);
        dt.setHours(hh, mm, ss, 0);
        const ts = !isNaN(dt.getTime()) ? dt.getTime() : 0;
        return { ts, tieBreaker: e.rawId || 0 };
    }

    // New sorting logic (Primary: Actual Business Date & Time)
    function getNewTimestamp(e) {
        const dateStr = toDateOnly(e.date) || (e.createdAt ? toDateOnly(e.createdAt) : '1970-01-01');
        let hh = 0, mm = 0, ss = 0;
        if (e.time) {
            const str = String(e.time).trim().toLowerCase();
            const m = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (m) {
                hh = parseInt(m[1], 10);
                mm = parseInt(m[2], 10);
                ss = m[3] ? parseInt(m[3], 10) : 0;
                if (str.includes('pm') && hh < 12) hh += 12;
                if (str.includes('am') && hh === 12) hh = 0;
            }
        } else if (e.createdAt) {
            const cDt = new Date(e.createdAt);
            hh = cDt.getHours();
            mm = cDt.getMinutes();
            ss = cDt.getSeconds();
        }
        const dt = new Date(dateStr);
        dt.setHours(hh, mm, ss, 0);
        const ts = !isNaN(dt.getTime()) ? dt.getTime() : 0;
        const cTs = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        return { ts, tieBreaker: cTs || 0, rawId: e.rawId || 0 };
    }

    // Check old inversions (where earlier entry in sorted list has date > next entry date)
    const oldSorted = [...list].sort((a, b) => {
        const tA = getOldTimestamp(a);
        const tB = getOldTimestamp(b);
        if (tA.ts !== tB.ts) return tA.ts - tB.ts;
        return tA.tieBreaker - tB.tieBreaker;
    });

    let oldInversions = 0;
    for (let i = 0; i < oldSorted.length - 1; i++) {
        const d1 = toDateOnly(oldSorted[i].date);
        const d2 = toDateOnly(oldSorted[i + 1].date);
        if (d1 > d2) oldInversions++;
    }
    console.log('Old sorting logic date inversions:', oldInversions);

    // Check new inversions
    const newSorted = [...list].sort((a, b) => {
        const tA = getNewTimestamp(a);
        const tB = getNewTimestamp(b);
        if (tA.ts !== tB.ts) return tA.ts - tB.ts;
        if (tA.tieBreaker !== tB.tieBreaker) return tA.tieBreaker - tB.tieBreaker;
        return tA.rawId - tB.rawId;
    });

    let newInversions = 0;
    for (let i = 0; i < newSorted.length - 1; i++) {
        const d1 = toDateOnly(newSorted[i].date);
        const d2 = toDateOnly(newSorted[i + 1].date);
        if (d1 > d2) newInversions++;
    }
    console.log('New sorting logic date inversions:', newInversions);

    process.exit(0);
}

testInversions();
