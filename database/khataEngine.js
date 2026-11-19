const { todayLocal } = require('../utils/helpers');
const { registerGlobalTransaction, deactivateGlobalTransaction } = require('./globalTxnRegistry');
const { randomUUID } = require('crypto');
// ==========================================================================
// KHATA AUTO-LINK & ADVANCE SETTLEMENT ENGINE
// --------------------------------------------------------------------------
// Customer ka Khatabook uska MASTER account hai. Is engine ka kaam:
//   1. CSC / Billing / BC charges ko KhataEntries me auto-record karna
//      (idempotent - dobara save par double entry nahi banegi).
//   2. Jab customer ke paas ADVANCE ho (CurrentBalance < 0) ya usne extra
//      jama kiya ho, to kahin bhi baaki dues (CSC due / Bill due) automatically
//      settle kar dena - sabse purana due pehle.
//
// Balance model (single source of truth):
//   CurrentBalance = OpeningBalance + SUM(Gave) - SUM(Got)
//   CurrentBalance > 0  -> customer se lena hai (ToReceive)
//   CurrentBalance < 0  -> customer ka advance (ToPay)
//
// NOTE: Settlements only allocate payments to CSC/Invoice dues. The advance
// and charges already affect the net balance through Got/Gave; posting again
// would count the same payment twice.
// ==========================================================================

// Insert ek Khata entry (charge = 'Gave', payment = 'Got')
async function addKhataEntry(tQuery, {
    CustomerID, EntryType, Amount, EntryDate, CSCAppID = null, BCID = null,
    InvoiceID = null, PaymentID = null, AccountID = null, PaymentMode = 'Cash',
    Description = null, ReferenceNo = null, UserID = null,
    GlobalSerialNo = null, SNCode = null, ModuleCode = null
}) {
    let uid = UserID ? parseInt(UserID) : null;
    if (!uid && CustomerID) {
        try {
            const uRes = await tQuery('SELECT UserID FROM Customers WHERE CustomerID = @id', { id: parseInt(CustomerID) });
            uid = uRes.recordset[0]?.UserID || 1;
        } catch (e) { uid = 1; }
    }
    if (!CustomerID || !Amount || parseFloat(Amount) <= 0) {
        console.warn('⚠️ addKhataEntry: invalid entry skipped -', { CustomerID, EntryType, Amount });
        return null;
    }
    const res = await tQuery(`
        INSERT INTO KhataEntries (
            CustomerID, EntryDate, EntryTime, EntryType, Amount,
            CSCAppID, BCID, InvoiceID, PaymentID, AccountID, PaymentMode, Description, ReferenceNo, UserID,
            GlobalSerialNo, SNCode, ModuleCode
        )
        OUTPUT INSERTED.KhataID
        VALUES (
            @custId, @date, CONVERT(VARCHAR(5), GETDATE(), 108), @type, @amt,
            @cscId, @bcId, @invId, @payId, @accId, @mode, @desc, @ref, @uid,
            @GlobalSerialNo, @SNCode, @ModuleCode
        )
    `, {
        custId: parseInt(CustomerID),
        date: EntryDate || todayLocal(),
        type: EntryType,
        amt: parseFloat(Amount),
        cscId: CSCAppID ? parseInt(CSCAppID) : null,
        bcId: BCID ? parseInt(BCID) : null,
        invId: InvoiceID ? parseInt(InvoiceID) : null,
        payId: PaymentID ? parseInt(PaymentID) : null,
        accId: AccountID ? parseInt(AccountID) : null,
        mode: PaymentMode,
        desc: Description,
        ref: ReferenceNo,
        uid: uid || 1,
        GlobalSerialNo: GlobalSerialNo || null,
        SNCode: SNCode || null,
        ModuleCode: ModuleCode || null
    });
    return res.recordset[0] ? res.recordset[0].KhataID : null;
}

// Recalculate customer balance from Khata ledger (same logic as sp_UpdateCustomerBalance)
async function refreshCustomerBalance(tQuery, CustomerID) {
    await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: parseInt(CustomerID) });
}

// --------------------------------------------------------------------------
// Sync ek CSC application ke charges/payments to Khata (idempotent).
//   - TotalFee  -> 'Gave' entry (customer ko dena hai) [sirf ek baar]
//   - PaidAmount-> 'Got' entry (jama hua)              [sirf ek baar]
// Pehle se linked entries hata kar reconcile karta hai, taaki edit par
// purani entries dupicate na hon.
// --------------------------------------------------------------------------
async function syncCSCToKhata(tQuery, { CustomerID, CSCAppID, TotalFee, PaidAmount, EntryDate, PaymentMode, ServiceType, UserID }) {
    if (!CustomerID || !CSCAppID) return;
    const userId = parseInt(UserID) || 1;

    // Purani auto-linked CSC entries ki registry deactivate karo, phir delete karo (N4 Fix: No orphan registry entries)
    const oldKhataRes = await tQuery(`
        SELECT KhataID FROM KhataEntries
        WHERE CSCAppID = @cscId AND CustomerID = @custId AND UserID = @userId
          AND EntryType <> 'Settlement'
          AND (ReferenceNo IS NULL OR ReferenceNo NOT LIKE 'CSC-AUTOSETTLE-%')
    `, { cscId: parseInt(CSCAppID), custId: parseInt(CustomerID), userId });
    for (const row of oldKhataRes.recordset) {
        await deactivateGlobalTransaction('Khata', row.KhataID, tQuery);
    }

    // Purani auto-linked CSC entries hatao (hum inhe dobara bana denge).
    // 'Settlement' entries ko mat delete karo - wahan ka record (PaidAmount)
    // already reduce ho chuka hai, history delete karne se mismatch hota hai.
    await tQuery(`
        DELETE FROM KhataEntries
        WHERE CSCAppID = @cscId AND CustomerID = @custId AND UserID = @userId
          AND EntryType <> 'Settlement'
          AND (ReferenceNo IS NULL OR ReferenceNo NOT LIKE 'CSC-AUTOSETTLE-%')
    `, { cscId: parseInt(CSCAppID), custId: parseInt(CustomerID), userId });

    const svc = ServiceType ? ` (${ServiceType})` : '';
    const date = EntryDate || todayLocal();

    // Charge (Gave) = total fee
    if (parseFloat(TotalFee) > 0) {
        const gaveId = await addKhataEntry(tQuery, {
            CustomerID, EntryType: 'Gave', Amount: TotalFee, EntryDate: date,
            CSCAppID, PaymentMode: PaymentMode || 'Cash',
            Description: `CSC Shulk${svc}`, ReferenceNo: `CSC-${CSCAppID}`,
            UserID: userId
        });
        if (gaveId) {
            try {
                await registerGlobalTransaction({
                    sourceModule: 'Khata',
                    recordId: gaveId,
                    entityName: `CSC${svc}`,
                    amount: TotalFee,
                    transDate: date,
                    createdAt: new Date(),
                    userId
                }, tQuery);
            } catch (e) {
                console.error('CSC Gave SN reg error:', e);
            }
        }
    }

    // Check if any portion of PaidAmount came from auto-settlement of past advance
    const settleRes = await tQuery(`
        SELECT ISNULL(SUM(Amount), 0) as AutoSettled
        FROM KhataEntries
        WHERE CSCAppID = @cscId AND CustomerID = @custId AND UserID = @userId
          AND ReferenceNo LIKE 'CSC-AUTOSETTLE-%'
          AND EntryType IN ('Gave', 'Settlement')
    `, { cscId: parseInt(CSCAppID), custId: parseInt(CustomerID), userId });
    const autoSettled = parseFloat(settleRes.recordset[0]?.AutoSettled || 0);

    // Payment received (Got) = sirf direct/cash jama (advance se settled hissa pehle se Got me darj hai)
    const directCashPaid = Math.max(0, parseFloat(PaidAmount || 0) - autoSettled);
    if (directCashPaid > 0) {
        const gotId = await addKhataEntry(tQuery, {
            CustomerID, EntryType: 'Got', Amount: directCashPaid, EntryDate: date,
            CSCAppID, PaymentMode: PaymentMode || 'Cash',
            Description: `CSC Jama${svc}`, ReferenceNo: `CSC-PAY-${CSCAppID}`,
            UserID: userId
        });
        if (gotId) {
            try {
                await registerGlobalTransaction({
                    sourceModule: 'Khata',
                    recordId: gotId,
                    entityName: `CSC${svc}`,
                    amount: directCashPaid,
                    transDate: date,
                    createdAt: new Date(),
                    userId
                }, tQuery);
            } catch (e) {
                console.error('CSC Got SN reg error:', e);
            }
        }
    }

    await refreshCustomerBalance(tQuery, CustomerID);
}

// --------------------------------------------------------------------------
// Sync ek Bill Payment ke charges/payments to Khatabook (idempotent).
//   - TotalPayable  -> 'Gave' entry (customer ka bill + dukan charge)
//   - TotalCollected-> 'Got' entry (customer se prapt cash/payment)
// Pehle se linked entries hata kar reconcile karta hai, taaki edit par
// purani entries duplicate na hon.
// --------------------------------------------------------------------------
async function syncBillPaymentToKhata(tQuery, {
    CustomerID, PaymentID, BillCategory, ProviderName, ConsumerNumber,
    TotalPayable, TotalCollected, EntryDate, EntryTime, PaymentMode, UserID, TxnReference
}) {
    if (!CustomerID || !PaymentID) return [];
    const userId = parseInt(UserID) || 1;
    const numPayable = parseFloat(TotalPayable) || 0;
    const numCollected = parseFloat(TotalCollected) || 0;
    const date = EntryDate || todayLocal();
    const time = EntryTime ? EntryTime.slice(0, 5) : '12:00';
    const bpRef = `BP-${PaymentID}`;
    const payRef = `BP-${PaymentID}-PAY`;

    // 1. Purani auto-linked BP entries ki registry deactivate karo, phir delete karo
    const oldKhataRes = await tQuery(`
        SELECT KhataID FROM KhataEntries
        WHERE UserID = @userId 
          AND (PaymentID = @pid OR ReferenceNo = @ref1 OR ReferenceNo = @ref2)
    `, { userId, pid: parseInt(PaymentID), ref1: bpRef, ref2: payRef });

    for (const row of oldKhataRes.recordset) {
        await deactivateGlobalTransaction('Khata', row.KhataID, tQuery);
    }

    await tQuery(`
        DELETE FROM KhataEntries
        WHERE UserID = @userId 
          AND (PaymentID = @pid OR ReferenceNo = @ref1 OR ReferenceNo = @ref2)
    `, { userId, pid: parseInt(PaymentID), ref1: bpRef, ref2: payRef });

    const createdEntries = [];

    // 2. Entry 1: Bill Payable ('Gave' - Shop ne customer ka bill bhara + fee)
    if (numPayable > 0) {
        const desc = `⚡ Bill Bhugtan — ${BillCategory || 'Bill'} (${ProviderName || ''}) [Consumer: ${ConsumerNumber || ''}]`;
        const gaveRes = await tQuery(`
            INSERT INTO KhataEntries (
                CustomerID, EntryDate, EntryTime, EntryType, Amount,
                PaymentID, PaymentMode, Description, ReferenceNo, UserID
            )
            OUTPUT INSERTED.KhataID
            VALUES (
                @custId, @date, @time, 'Gave', @amt,
                @pid, @mode, @desc, @ref, @userId
            )
        `, {
            custId: parseInt(CustomerID),
            date,
            time,
            amt: numPayable,
            pid: parseInt(PaymentID),
            mode: PaymentMode || 'Bill',
            desc,
            ref: bpRef,
            userId
        });
        const gaveId = gaveRes.recordset[0]?.KhataID;
        if (gaveId) {
            createdEntries.push({ id: gaveId, amount: numPayable, type: 'Gave' });
            try {
                await registerGlobalTransaction({
                    sourceModule: 'Khata',
                    recordId: gaveId,
                    entityName: `${BillCategory || 'Bill'} #${PaymentID}`,
                    amount: numPayable,
                    transDate: date,
                    createdAt: new Date(),
                    userId
                }, tQuery);
            } catch (e) {
                console.error('Bill Gave SN reg error:', e);
            }
        }
    }

    // 3. Entry 2: Payment Received ('Got' - Customer se cash/payment mila)
    if (numCollected > 0) {
        const desc = `💵 Bill Bhugtan Prapt (${PaymentMode || 'Cash'}) — ${BillCategory || 'Bill'} [Consumer: ${ConsumerNumber || ''}]`;
        const gotRes = await tQuery(`
            INSERT INTO KhataEntries (
                CustomerID, EntryDate, EntryTime, EntryType, Amount,
                PaymentID, PaymentMode, Description, ReferenceNo, UserID
            )
            OUTPUT INSERTED.KhataID
            VALUES (
                @custId, @date, @time, 'Got', @amt,
                @pid, @mode, @desc, @ref, @userId
            )
        `, {
            custId: parseInt(CustomerID),
            date,
            time,
            amt: numCollected,
            pid: parseInt(PaymentID),
            mode: PaymentMode || 'Cash',
            desc,
            ref: payRef,
            userId
        });
        const gotId = gotRes.recordset[0]?.KhataID;
        if (gotId) {
            createdEntries.push({ id: gotId, amount: numCollected, type: 'Got' });
            try {
                await registerGlobalTransaction({
                    sourceModule: 'Khata',
                    recordId: gotId,
                    entityName: `${BillCategory || 'Bill'} #${PaymentID}`,
                    amount: numCollected,
                    transDate: date,
                    createdAt: new Date(),
                    userId
                }, tQuery);
            } catch (e) {
                console.error('Bill Got SN reg error:', e);
            }
        }
    }

    // 4. Update customer balance in real time
    await refreshCustomerBalance(tQuery, CustomerID);

    return createdEntries;
}

// --------------------------------------------------------------------------
// BC CASH-FLOW REGISTER (balance-neutral, 2 lines per transaction)
// Har BC transaction ke paise ki 2 dhal (legs) Khatabook me darj hoti hain:
//   Line 1 (Cash In)  -> paisa counter/customer se kis taraf AAYA
//   Line 2 (Cash Out) -> paisa counter se kis taraf GAYA (cash diya / bank bheja)
// DONO balance-neutral hain (EntryType='BC-Flow') -> udhaar balance bilkul
// na bade. Sirf audit/passbook ke liye. Asli qarz sirf CustomerCharge (udhaar
// par) ka hota hai, jo alag se 'Gave' entry banata hai.
// --------------------------------------------------------------------------
function getBCFlowLines(ServiceType, QROperation) {
    const st = (ServiceType || '').toLowerCase();
    const cashGiven = (QROperation === 'Cash Given to Customer');

    if (st.includes('withdrawal') || st.includes('aeps')) {
        // Customer ka bank se paisa nikala, counter ne cash diya
        return {
            in: { mode: 'Cash In', desc: 'Bank se aaya' },
            out: { mode: 'Cash Out', desc: 'Cash Diya (customer ko)' }
        };
    }
    if (st.includes('deposit')) {
        // Customer ne cash diya, bank mein jama
        return {
            in: { mode: 'Cash In', desc: 'Cash Liya (customer se)' },
            out: { mode: 'Cash Out', desc: 'Bank mein jama' }
        };
    }
    if (st.includes('transfer') || st.includes('dmt') || st.includes('send')) {
        return {
            in: { mode: 'Cash In', desc: 'Cash Liya (customer se)' },
            out: { mode: 'Cash Out', desc: 'Beneficiary ko transfer' }
        };
    }
    if (st.includes('qr') || st.includes('upi')) {
        if (cashGiven) {
            return {
                in: { mode: 'Cash In', desc: 'QR/UPI se aaya' },
                out: { mode: 'Cash Out', desc: 'Cash Diya (customer ko)' }
            };
        }
        if (QROperation === 'Send - Cash Taken from Customer') {
            return {
                in: { mode: 'Cash In', desc: 'Cash Liya (customer se)' },
                out: { mode: 'Cash Out', desc: 'Customer ke QR/UPI par bheja' }
            };
        }
        if (QROperation === 'Send - Direct Transfer') {
            return {
                in: { mode: 'Cash In', desc: 'Direct UPI/QR transfer' },
                out: { mode: 'Cash Out', desc: 'Customer ke QR/UPI par bheja' }
            };
        }
        return {
            in: { mode: 'Cash In', desc: 'QR/UPI payment aaya' },
            out: { mode: 'Cash Out', desc: 'Counter account mein credit' }
        };
    }
    // Default / any other service
    return {
        in: { mode: 'Cash In', desc: 'Counter mein aaya' },
        out: { mode: 'Cash Out', desc: 'Customer/Beneficiary ko diya' }
    };
}

async function syncBCFlowToKhata(tQuery, {
    CustomerID, BCID, ServiceType, QROperation, Amount, EntryDate, BankName, RRN_UTR,
    GlobalSerialNo = null, SNCode = null, ModuleCode = null
}) {
    if (!CustomerID || !BCID || parseFloat(Amount) <= 0) return;

    let effGlobSN = GlobalSerialNo;
    let effSNCode = SNCode;
    let effModCode = ModuleCode;
    if (!effGlobSN && BCID) {
        try {
            const bcRes = await tQuery(`SELECT GlobalSerialNo, SNCode, ModuleCode FROM BCTransactions WHERE BCID = @bcId`, { bcId: parseInt(BCID) });
            if (bcRes.recordset.length > 0) {
                effGlobSN = bcRes.recordset[0].GlobalSerialNo;
                effSNCode = bcRes.recordset[0].SNCode;
                effModCode = bcRes.recordset[0].ModuleCode;
            }
        } catch (_) { }
    }

    // Idempotency: deactivate any registry records and delete old BC-Flow entries
    await tQuery(`
        UPDATE UniversalTxnRegistry
        SET IsActive = 0
        WHERE SourceModule = 'Khata'
          AND RecordID IN (SELECT KhataID FROM KhataEntries WHERE BCID = @bcId AND EntryType = 'BC-Flow')
    `, { bcId: parseInt(BCID) });
    await tQuery(`DELETE FROM KhataEntries WHERE BCID = @bcId AND EntryType = 'BC-Flow'`, { bcId: parseInt(BCID) });

    const amt = parseFloat(Amount);
    const date = EntryDate || todayLocal();
    const flow = getBCFlowLines(ServiceType, QROperation);

    // Detail suffix (bank / RRN agar maujood ho)
    let detail = '';
    if (BankName) detail += ` — ${BankName}`;
    if (RRN_UTR) detail += ` (RRN: ${RRN_UTR})`;

    // Line 1: Cash In (paisa counter mein aaya) - balance-neutral
    await addKhataEntry(tQuery, {
        CustomerID, EntryType: 'BC-Flow', Amount: amt, EntryDate: date,
        BCID, PaymentMode: flow.in.mode,
        Description: `🔄 BC ${ServiceType} — ➡️ ${flow.in.desc}${detail}`,
        ReferenceNo: `BC-${BCID}-IN`,
        GlobalSerialNo: effGlobSN, SNCode: effSNCode, ModuleCode: effModCode
    });

    // Line 2: Cash Out (paisa counter se gaya / cash diya) - balance-neutral
    await addKhataEntry(tQuery, {
        CustomerID, EntryType: 'BC-Flow', Amount: amt, EntryDate: date,
        BCID, PaymentMode: flow.out.mode,
        Description: `🔄 BC ${ServiceType} — ⬅️ ${flow.out.desc}${detail}`,
        ReferenceNo: `BC-${BCID}-OUT`,
        GlobalSerialNo: effGlobSN, SNCode: effSNCode, ModuleCode: effModCode
    });
}


// Jab customer ke paas extra paisa (advance) ho, to uske pending dues
// (CSC + Bills) automatically settle karo - oldest first.
// CSC/Invoice paid/due/status and a neutral Settlement note are updated
// together; the underlying advance and charge are already in the Khata ledger.
// IMPORTANT: Idempotent — ek hi source par dobara call pe duplicate nahi banega.
// --------------------------------------------------------------------------
async function autoSettleCustomerDues(tQuery, CustomerID) {
    if (!CustomerID) return { settled: [], advanceUsed: 0 };

    // Recompute and lock the owner row before trusting the available advance.
    await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: parseInt(CustomerID) });
    const balRes = await tQuery(`
        SELECT CurrentBalance, UserID
        FROM Customers WITH (UPDLOCK, HOLDLOCK)
        WHERE CustomerID = @id
    `, { id: parseInt(CustomerID) });
    if (!balRes.recordset.length) return { settled: [], advanceUsed: 0 };
    const currentBalance = parseFloat(balRes.recordset[0].CurrentBalance) || 0;
    const userId = balRes.recordset[0].UserID || 1;

    // Saare pending dues lao (CSC + Bills), oldest first.
    // TotalFee / TotalAmount bhi la rahe hain taaki Due/Balance hamesha TOTAL se derive ho.
    const duesRes = await tQuery(`
        SELECT 'CSC' AS Source, AppID AS SourceID, DueAmount AS Amount, ApplyDate AS DueDate,
               TotalFee AS TotalAmount, PaidAmount AS AlreadyPaid,
               ('CSC: ' + ServiceType) AS Label
        FROM CSCApplications WITH (UPDLOCK, HOLDLOCK)
        WHERE CustomerID = @id AND UserID = @userId AND IsActive = 1 AND DueAmount > 0
        UNION ALL
        SELECT 'BILL' AS Source, InvoiceID AS SourceID, BalanceAmount AS Amount, InvoiceDate AS DueDate,
               TotalAmount AS TotalAmount, PaidAmount AS AlreadyPaid,
               ('Bill #' + InvoiceNumber) AS Label
        FROM Invoices WITH (UPDLOCK, HOLDLOCK)
        WHERE CustomerID = @id AND UserID = @userId AND Status != 'Cancelled' AND BalanceAmount > 0
        ORDER BY DueDate ASC, SourceID ASC
    `, { id: parseInt(CustomerID), userId });

    const dues = duesRes.recordset;
    if (dues.length === 0) return { settled: [], advanceUsed: 0 };

    // Pending dues are already part of the net balance through Gave/Got.
    // Allocate only the credit in excess of any positive amount still owed.
    const totalDueCents = dues.reduce((sum, d) => sum + Math.max(0, Math.round((parseFloat(d.Amount) || 0) * 100)), 0);
    const netOwedCents = Math.max(0, Math.round(currentBalance * 100));
    let budgetCents = Math.min(totalDueCents, Math.max(0, totalDueCents - netOwedCents));
    if (budgetCents <= 0) return { settled: [], advanceUsed: 0 };

    const settled = [];
    let advanceUsed = 0;
    const today = todayLocal();

    for (const due of dues) {
        if (budgetCents <= 0) break;
        const dueCents = Math.max(0, Math.round((parseFloat(due.Amount) || 0) * 100));
        if (dueCents <= 0) continue;

        const payNowCents = Math.min(budgetCents, dueCents);
        const payNow = payNowCents / 100;
        const ref = due.Source === 'CSC'
            ? `CSC-AUTOSETTLE-${due.SourceID}`
            : `BILL-AUTOSETTLE-${due.SourceID}`;
        const settlementRef = `${ref}-${randomUUID()}`;

        if (due.Source === 'CSC') {
            // CSC record update - Due hamesha TotalFee - PaidAmount se derive
            const totalFee = parseFloat(due.TotalAmount) || 0;
            const newPaid = parseFloat(((parseFloat(due.AlreadyPaid) || 0) + payNow).toFixed(2));
            const newDue = parseFloat(Math.max(0, totalFee - newPaid).toFixed(2));
            const newPayStatus = newDue <= 0 ? 'Paid' : 'Partial';
            await tQuery(`
                UPDATE CSCApplications
                SET PaidAmount = PaidAmount + @pay,
                    DueAmount = @newDue,
                    PaymentStatus = @payStatus,
                    UpdatedAt = GETDATE()
                WHERE AppID = @sid AND CustomerID = @custId AND UserID = @userId
            `, { pay: payNow, newDue, payStatus: newPayStatus, sid: parseInt(due.SourceID), custId: parseInt(CustomerID), userId });

            // Fetch parent CSC GlobalSerialNo
            let cscGlobSN = null, cscSNCode = null, cscModCode = null;
            try {
                const cRes = await tQuery(`
                    SELECT GlobalSerialNo, SNCode, ModuleCode FROM CSCApplications
                    WHERE AppID = @sid AND CustomerID = @custId AND UserID = @userId
                `, { sid: parseInt(due.SourceID), custId: parseInt(CustomerID), userId });
                if (cRes.recordset.length > 0) {
                    cscGlobSN = cRes.recordset[0].GlobalSerialNo;
                    cscSNCode = cRes.recordset[0].SNCode;
                    cscModCode = cRes.recordset[0].ModuleCode;
                }
            } catch (_) { }

            await tQuery(`
                INSERT INTO KhataEntries (
                    CustomerID, EntryDate, EntryTime, EntryType, Amount, CSCAppID, PaymentMode, Description, ReferenceNo, UserID,
                    GlobalSerialNo, SNCode, ModuleCode
                )
                VALUES (
                    @custId, @date, CONVERT(VARCHAR(5), GETDATE(), 108), 'Settlement', @amt, @cscId, 'Advance', @desc, @ref, @userId,
                    @GlobalSerialNo, @SNCode, @ModuleCode
                )
            `, {
                custId: parseInt(CustomerID), date: today, amt: payNow,
                cscId: parseInt(due.SourceID),
                desc: `Advance se Paid Rs.${payNow.toFixed(2)}: ${due.Label}`,
                ref: settlementRef,
                userId,
                GlobalSerialNo: cscGlobSN,
                SNCode: cscSNCode,
                ModuleCode: cscModCode
            });
        } else {
            // Invoice record update - BalanceAmount hamesha TotalAmount - PaidAmount se
            const totalAmount = parseFloat(due.TotalAmount) || 0;
            const newPaid = parseFloat(((parseFloat(due.AlreadyPaid) || 0) + payNow).toFixed(2));
            const newBal = parseFloat(Math.max(0, totalAmount - newPaid).toFixed(2));
            const newPayStatus = newBal <= 0 ? 'Paid' : 'Partial';
            await tQuery(`
                UPDATE Invoices
                SET PaidAmount = PaidAmount + @pay,
                    BalanceAmount = @newBal,
                    PaymentStatus = @payStatus,
                    UpdatedAt = GETDATE()
                WHERE InvoiceID = @sid AND CustomerID = @custId AND UserID = @userId
            `, { pay: payNow, newBal, payStatus: newPayStatus, sid: parseInt(due.SourceID), custId: parseInt(CustomerID), userId });

            // Fetch parent Invoice GlobalSerialNo
            let invGlobSN = null, invSNCode = null, invModCode = null;
            try {
                const iRes = await tQuery(`
                    SELECT GlobalSerialNo, SNCode, ModuleCode FROM Invoices
                    WHERE InvoiceID = @sid AND CustomerID = @custId AND UserID = @userId
                `, { sid: parseInt(due.SourceID), custId: parseInt(CustomerID), userId });
                if (iRes.recordset.length > 0) {
                    invGlobSN = iRes.recordset[0].GlobalSerialNo;
                    invSNCode = iRes.recordset[0].SNCode;
                    invModCode = iRes.recordset[0].ModuleCode;
                }
            } catch (_) { }

            await tQuery(`
                INSERT INTO KhataEntries (
                    CustomerID, EntryDate, EntryTime, EntryType, Amount, InvoiceID, PaymentMode, Description, ReferenceNo, UserID,
                    GlobalSerialNo, SNCode, ModuleCode
                )
                VALUES (
                    @custId, @date, CONVERT(VARCHAR(5), GETDATE(), 108), 'Settlement', @amt, @invId, 'Advance', @desc, @ref, @userId,
                    @GlobalSerialNo, @SNCode, @ModuleCode
                )
            `, {
                custId: parseInt(CustomerID), date: today, amt: payNow,
                invId: parseInt(due.SourceID),
                desc: `Advance se Paid Rs.${payNow.toFixed(2)}: ${due.Label}`,
                ref: settlementRef,
                userId,
                GlobalSerialNo: invGlobSN,
                SNCode: invSNCode,
                ModuleCode: invModCode
            });
        }

        budgetCents -= payNowCents;
        advanceUsed += payNow;
        settled.push({ source: due.Source, id: due.SourceID, label: due.Label, amount: payNow });
    }

    return { settled, advanceUsed };
}

// Wrapper: kisi bhi module ke charge/payment ke baad call karo.
// 1) Customer balance refresh
// 2) Advance se pending dues auto-settle
async function processKhataAfterChange(tQuery, CustomerID) {
    if (!CustomerID) return { settled: [], advanceUsed: 0 };
    await refreshCustomerBalance(tQuery, CustomerID);
    const result = await autoSettleCustomerDues(tQuery, CustomerID);
    // Recalculate after source dues are updated; settlement notes do not alter balance.
    await refreshCustomerBalance(tQuery, CustomerID);
    return result;
}

/**
 * Safely delete a Khata entry with complete Universal SN deactivation
 * and linked transaction cleanup.
 * @param {Function} tQuery - SQL transaction query runner
 * @param {Object} options - { khataId, userId, customerId, entryType }
 */
async function deleteKhataWithSN(tQuery, { khataId, userId = 1, customerId = null, entryType = null }) {
    if (!khataId) return;

    // 1. Deactivate Khata entry in UniversalTxnRegistry
    await tQuery(`
        UPDATE UniversalTxnRegistry 
        SET IsActive = 0 
        WHERE SourceModule = 'Khata' AND RecordID = @khataId
    `, { khataId });

    // 2. Check and clean up linked Cashbook transactions (e.g. KHATA-ENTRY-<khataId>)
    const linkedRef = `KHATA-ENTRY-${khataId}`;
    const linkedTrans = await tQuery(`
        SELECT TransactionID, AccountID 
        FROM Transactions 
        WHERE Reference = @ref AND UserID = @userId
    `, { ref: linkedRef, userId });

    if (linkedTrans.recordset.length > 0) {
        for (const lt of linkedTrans.recordset) {
            await tQuery(`
                UPDATE UniversalTxnRegistry 
                SET IsActive = 0 
                WHERE SourceModule = 'Cashbook' AND RecordID = @txId
            `, { txId: lt.TransactionID });

            await tQuery('DELETE FROM Transactions WHERE TransactionID = @txId', { txId: lt.TransactionID });

            if (lt.AccountID) {
                await tQuery('EXEC sp_UpdateAccountBalance @id', { id: lt.AccountID });
            }
        }
    }

    // 3. Delete from KhataEntries
    await tQuery('DELETE FROM KhataEntries WHERE KhataID = @id AND UserID = @userId', { id: khataId, userId });

    // 4. Update customer balance and re-process settlement if customerId provided
    if (customerId) {
        await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: customerId });
        if (['Gave', 'Got'].includes(entryType)) {
            await processKhataAfterChange(tQuery, customerId);
        }
    }
}

module.exports = {
    addKhataEntry,
    refreshCustomerBalance,
    syncCSCToKhata,
    syncBillPaymentToKhata,
    syncBCFlowToKhata,
    getBCFlowLines,
    autoSettleCustomerDues,
    processKhataAfterChange,
    deleteKhataWithSN
};
