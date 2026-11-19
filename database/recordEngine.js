/**
 * database/recordEngine.js
 * ---------------------------------------------------------------------------
 * Universal Service Record Engine.
 *
 * Ek hi engine se koi bhi naya module (Insurance, Fastag, Gas Booking, Loan...)
 * chal sakta hai — bina naya table ya column banaye. Har record ke saath
 * automatically:
 *
 *   1. ServiceRecords row            (generic storage)
 *   2. UniversalTxnRegistry entry     (SN-XXXX + module code)
 *   3. Transactions ledger            (GOVT_OUT / FEE_IN, SourceModule+SourceID)
 *   4. KhataEntries                   (Gave = charge, Got = payment)
 *   5. Customer balance refresh + advance auto-settle
 *   6. AuditLogs entry
 *
 * Money rules:
 *   - Paisa hamesha typed DECIMAL column me (JSON me nahi).
 *   - GovtFee  -> wallet se bahar (GOVT_OUT)
 *   - PaidAmount -> galla me andar (FEE_IN)
 *   - TotalFee - PaidAmount -> customer udhaar (Gave/Got net)
 */

const { withTransaction } = require('./db');
const { registerGlobalTransaction, deactivateGlobalTransaction } = require('./globalTxnRegistry');
const { addKhataEntry, refreshCustomerBalance, processKhataAfterChange } = require('./khataEngine');
const { resolveModule } = require('./moduleRegistry');

const MODULE_SERVICE_TABLE = 'ServiceRecords';
const MODULE_SERVICE_PK = 'RecordID';

function money(v, fallback = 0) {
    const n = parseFloat(v);
    if (!isFinite(n)) return fallback;
    return Math.round(n * 100) / 100;
}

function clampPaid(paid, total) {
    const p = money(paid);
    if (p < 0) return 0;
    // Service record me overpayment allowed nahi: PaidAmount <= TotalFee
    return total > 0 ? Math.min(p, total) : p;
}

function safeJson(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string') {
        try { JSON.parse(value); return value; } catch (_) { return JSON.stringify({ note: value }); }
    }
    try { return JSON.stringify(value); } catch (_) { return null; }
}

/**
 * Sacred Accounting Guard: Paisa, Date, aur Balance kabhi JSON me nahi.
 * Strips any monetary/accounting keys from ExtraFieldsJson.
 */
function sanitizeExtraFields(extra) {
    if (!extra) return null;
    let obj = extra;
    if (typeof extra === 'string') {
        try { obj = JSON.parse(extra); } catch (_) { return JSON.stringify({ note: extra }); }
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return safeJson(obj);

    const FORBIDDEN_MONEY_KEYS = new Set([
        'amount', 'charge', 'charges', 'total', 'totalamount', 'totalfee',
        'paid', 'paidamount', 'due', 'dueamount', 'balance', 'balanceamount',
        'govtfee', 'operatorfee', 'fee', 'price', 'cost', 'netamount'
    ]);

    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
        const normalizedKey = k.toLowerCase().replace(/[^a-z]/g, '');
        if (!FORBIDDEN_MONEY_KEYS.has(normalizedKey)) {
            clean[k] = v;
        }
    }
    return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
}

/**
 * Purane mirror rows (ledger + khata) hatao — sirf is record ke.
 * Registry entries pehle deactivate hoti hain, phir khata delete.
 */
async function removeMirrors(tQuery, { moduleCode, recordId }) {
    await tQuery(`
        UPDATE UniversalTxnRegistry
        SET IsActive = 0
        WHERE SourceModule = 'Khata'
          AND RecordID IN (
              SELECT KhataID FROM KhataEntries
              WHERE SourceModule = @moduleCode AND SourceID = @recordId
          )
    `, { moduleCode, recordId });

    await tQuery(`
        DELETE FROM KhataEntries
        WHERE SourceModule = @moduleCode AND SourceID = @recordId
    `, { moduleCode, recordId });

    const txnRows = await tQuery(`
        SELECT DISTINCT AccountID FROM Transactions
        WHERE SourceModule = @moduleCode AND SourceID = @recordId AND AccountID IS NOT NULL
    `, { moduleCode, recordId });

    await tQuery(`
        DELETE FROM Transactions
        WHERE SourceModule = @moduleCode AND SourceID = @recordId
    `, { moduleCode, recordId });

    for (const row of txnRows.recordset || []) {
        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: row.AccountID });
    }
}

/**
 * Ledger + Khata mirrors dobara likho.
 */
async function writeMirrors(tQuery, rec) {
    const {
        recordId, moduleCode, modulePrefix, customerId, userId,
        recordDate, govtFee, operatorFee, totalFee, paidAmount, balanceAmount,
        paymentMode, referenceNo, walletAccountId, cashAccountId, customerName,
        sn = {}, serviceName
    } = rec;

    const ref = `${modulePrefix}-${recordId}`;

    // 1. Government / actual cost outflow (wallet se)
    if (walletAccountId && govtFee > 0) {
        await tQuery(`
            INSERT INTO Transactions (
                AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt,
                SourceModule, SourceID, LineType, GlobalSerialNo, SNCode, ModuleCode
            ) VALUES (
                @accId, 'Expense', @amt, @desc, @ref, @date, @userId, GETDATE(),
                @moduleCode, @recordId, 'GOVT_OUT', @sn, @snCode, @modCode
            )
        `, {
            accId: walletAccountId, amt: govtFee,
            desc: `${serviceName || moduleCode} - Govt/Actual cost [${referenceNo || ref}]`,
            ref, date: recordDate, userId, moduleCode, recordId,
            sn: sn.globalSerialNo || null, snCode: sn.snCode || null, modCode: sn.moduleCode || null
        });
        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: walletAccountId });
    }

    // 2. Fee / cash collection (galla me)
    if (cashAccountId && paidAmount > 0) {
        await tQuery(`
            INSERT INTO Transactions (
                AccountID, TransType, Amount, Description, Reference, TransDate, UserID, CreatedAt,
                SourceModule, SourceID, LineType, GlobalSerialNo, SNCode, ModuleCode
            ) VALUES (
                @accId, 'Income', @amt, @desc, @ref, @date, @userId, GETDATE(),
                @moduleCode, @recordId, 'FEE_IN', @sn, @snCode, @modCode
            )
        `, {
            accId: cashAccountId, amt: paidAmount,
            desc: `${serviceName || moduleCode} - Payment received (${paymentMode}) [${referenceNo || ref}]`,
            ref, date: recordDate, userId, moduleCode, recordId,
            sn: sn.globalSerialNo || null, snCode: sn.snCode || null, modCode: sn.moduleCode || null
        });
        await tQuery('EXEC sp_UpdateAccountBalance @AccountID = @id', { id: cashAccountId });
    }

    // 3. Khata: charge (Gave) + payment (Got) — passbook me dono side dikhte hain
    if (customerId) {
        if (totalFee > 0) {
            await addKhataEntry(tQuery, {
                CustomerID: customerId,
                EntryType: 'Gave',
                Amount: totalFee,
                EntryDate: recordDate,
                PaymentMode: paymentMode || 'Cash',
                Description: `${modulePrefix} ${serviceName || moduleCode} charge [${referenceNo || ref}] (${customerName || 'Customer'})`,
                ReferenceNo: ref,
                UserID: userId,
                GlobalSerialNo: sn.globalSerialNo || null,
                SNCode: sn.snCode || null,
                ModuleCode: sn.moduleCode || null,
                SourceModule: moduleCode,
                SourceID: recordId
            });
        }
        if (paidAmount > 0) {
            await addKhataEntry(tQuery, {
                CustomerID: customerId,
                EntryType: 'Got',
                Amount: paidAmount,
                EntryDate: recordDate,
                PaymentMode: paymentMode || 'Cash',
                Description: `${modulePrefix} payment received (${paymentMode || 'Cash'}) [${referenceNo || ref}]`,
                ReferenceNo: `${ref}-PAY`,
                UserID: userId,
                GlobalSerialNo: sn.globalSerialNo || null,
                SNCode: sn.snCode || null,
                ModuleCode: sn.moduleCode || null,
                SourceModule: moduleCode,
                SourceID: recordId
            });
        }
        await refreshCustomerBalance(tQuery, customerId);
        // Advance ho to baaki purane dues auto-settle
        if (balanceAmount <= 0) {
            await processKhataAfterChange(tQuery, customerId);
        }
    }

    return ref;
}

/**
 * Naya service record banao.
 */
async function createServiceRecord(input, userId) {
    const moduleCode = (input.moduleCode || input.ModuleCode || 'Service').toString().trim();
    const mod = await resolveModule(moduleCode);
    const modulePrefix = mod?.prefix || moduleCode.substring(0, 4).toUpperCase();

    const serviceId = parseInt(input.serviceID || input.ServiceID, 10) || null;
    const customerId = parseInt(input.customerID || input.CustomerID, 10) || null;
    if (!serviceId) throw new Error('ServiceID zaroori hai');
    if (!customerId) throw new Error('CustomerID zaroori hai');

    const recordDate = input.recordDate || input.RecordDate || new Date().toISOString().slice(0, 10);
    const paymentMode = input.paymentMode || input.PaymentMode || 'Cash';
    const referenceNo = input.referenceNo || input.ReferenceNo || null;

    return await withTransaction(async (tQuery) => {
        // Service + defaults
        const svcRes = await tQuery(`
            SELECT ServiceID, ServiceName, GovtFee, OperatorFee, ModuleCode, Category
            FROM dbo.CSCServices
            WHERE ServiceID = @sid AND IsActive = 1
        `, { sid: serviceId });
        if (!svcRes.recordset.length) throw new Error('Service nahi mila ya inactive hai');
        const svc = svcRes.recordset[0];

        // Customer user-scope check
        const custRes = await tQuery(`
            SELECT CustomerID, UserID, CustomerName, Phone FROM dbo.Customers
            WHERE CustomerID = @cid AND UserID = @uid AND IsActive = 1
        `, { cid: customerId, uid: userId });
        if (!custRes.recordset.length) throw new Error('Customer nahi mila ya doosre user ka hai');
        const cust = custRes.recordset[0];

        const govtFee = money(input.govtFee !== undefined ? input.govtFee : svc.GovtFee);
        const operatorFee = money(input.operatorFee !== undefined ? input.operatorFee : svc.OperatorFee);
        const totalFee = money(govtFee + operatorFee);
        const paidAmount = clampPaid(input.paidAmount !== undefined ? input.paidAmount : totalFee, totalFee);
        const balanceAmount = money(Math.max(0, totalFee - paidAmount));

        const status = input.status || input.Status || (balanceAmount <= 0 ? 'Completed' : 'Pending');
        const paymentStatus = balanceAmount <= 0 ? 'Paid' : (paidAmount > 0 ? 'Partial' : 'Unpaid');

        const walletAccountId = parseInt(input.walletAccountID || input.WalletAccountID, 10) || null;
        const cashAccountId = parseInt(input.cashAccountID || input.CashAccountID, 10) || null;
        const customerName = input.customerName || cust.CustomerName || null;
        const customerPhone = input.customerPhone || cust.Phone || null;

        const ins = await tQuery(`
            INSERT INTO dbo.ServiceRecords (
                ModuleCode, ServiceID, CustomerID, UserID,
                CustomerName, CustomerPhone, ReferenceNo,
                AccountID, CashAccountID,
                GovtFee, OperatorFee, TotalFee, PaidAmount, BalanceAmount,
                Amount, Charge, TotalAmount, DueAmount,
                RecordDate, Status, PaymentStatus, PaymentMode, Remarks,
                ExtraFieldsJson
            )
            OUTPUT INSERTED.RecordID
            VALUES (
                @moduleCode, @serviceId, @customerId, @userId,
                @customerName, @customerPhone, @referenceNo,
                @walletAccountId, @cashAccountId,
                @govtFee, @operatorFee, @totalFee, @paidAmount, @balanceAmount,
                @govtFee, @operatorFee, @totalFee, @balanceAmount,
                @recordDate, @status, @paymentStatus, @paymentMode, @remarks,
                @extra
            )
        `, {
            moduleCode, serviceId, customerId, userId,
            customerName, customerPhone, referenceNo,
            walletAccountId, cashAccountId,
            govtFee, operatorFee, totalFee, paidAmount, balanceAmount,
            recordDate, status, paymentStatus, paymentMode,
            remarks: input.remarks || input.Remarks || null,
            extra: sanitizeExtraFields(input.extraFields || input.ExtraFieldsJson)
        });

        const recordId = ins.recordset[0].RecordID;

        // Universal SN (registry ServiceRecords row bhi update karega)
        const sn = await registerGlobalTransaction({
            sourceModule: moduleCode,
            recordId,
            entityName: customerName || 'Customer',
            amount: totalFee,
            transDate: recordDate,
            userId
        }, tQuery);

        if (sn?.moduleCode) {
            await tQuery(`
                UPDATE dbo.ServiceRecords
                SET DocCode = @docCode, ModuleCodeSerial = @docCode
                WHERE RecordID = @recordId
            `, { docCode: sn.moduleCode, recordId });
        }

        await writeMirrors(tQuery, {
            recordId, moduleCode, modulePrefix,
            customerId, userId, recordDate,
            govtFee, operatorFee, totalFee, paidAmount, balanceAmount,
            paymentMode, referenceNo, customerName: cust.CustomerName,
            walletAccountId: parseInt(input.walletAccountID || input.WalletAccountID, 10) || null,
            cashAccountId: parseInt(input.cashAccountID || input.CashAccountID, 10) || null,
            sn, serviceName: svc.ServiceName
        });

        return {
            recordID: recordId,
            moduleCode,
            snCode: sn?.snCode || null,
            globalSerialNo: sn?.globalSerialNo || null,
            moduleSerialCode: sn?.moduleCode || null,
            totalFee, paidAmount, balanceAmount
        };
    });
}

/**
 * Record update (amount/payment/status). Mirrors safely rewrites.
 */
async function updateServiceRecord(recordId, input, userId) {
    const id = parseInt(recordId, 10);
    if (!id) throw new Error('RecordID galat hai');

    return await withTransaction(async (tQuery) => {
        const curRes = await tQuery(`
            SELECT * FROM dbo.ServiceRecords WHERE RecordID = @id AND UserID = @uid AND IsActive = 1
        `, { id, uid: userId });
        if (!curRes.recordset.length) throw new Error('Record nahi mila');
        const cur = curRes.recordset[0];

        const moduleCode = input.moduleCode || cur.ModuleCode;
        const mod = await resolveModule(moduleCode);
        const modulePrefix = mod?.prefix || String(moduleCode).substring(0, 4).toUpperCase();

        const govtFee = money(input.govtFee !== undefined ? input.govtFee : cur.GovtFee);
        const operatorFee = money(input.operatorFee !== undefined ? input.operatorFee : cur.OperatorFee);
        const totalFee = money(govtFee + operatorFee);
        const paidAmount = clampPaid(input.paidAmount !== undefined ? input.paidAmount : cur.PaidAmount, totalFee);
        const balanceAmount = money(Math.max(0, totalFee - paidAmount));
        const status = input.status || (balanceAmount <= 0 ? 'Completed' : 'Pending');
        const paymentStatus = balanceAmount <= 0 ? 'Paid' : (paidAmount > 0 ? 'Partial' : 'Unpaid');

        await tQuery(`
            UPDATE dbo.ServiceRecords
            SET ModuleCode = @moduleCode,
                GovtFee = @govtFee,
                OperatorFee = @operatorFee,
                TotalFee = @totalFee,
                PaidAmount = @paidAmount,
                BalanceAmount = @balanceAmount,
                Amount = @govtFee,
                Charge = @operatorFee,
                TotalAmount = @totalFee,
                DueAmount = @balanceAmount,
                Status = @status,
                PaymentStatus = @paymentStatus,
                PaymentMode = @paymentMode,
                Remarks = @remarks,
                ExtraFieldsJson = @extra,
                UpdatedAt = GETDATE()
            WHERE RecordID = @id AND UserID = @uid
        `, {
            moduleCode, govtFee, operatorFee, totalFee, paidAmount, balanceAmount,
            status, paymentStatus,
            paymentMode: input.paymentMode || cur.PaymentMode || 'Cash',
            remarks: input.remarks !== undefined ? input.remarks : cur.Remarks,
            extra: input.extraFields !== undefined ? sanitizeExtraFields(input.extraFields) : cur.ExtraFieldsJson,
            id, uid: userId
        });

        await removeMirrors(tQuery, { moduleCode: cur.ModuleCode, recordId: id });

        const sn = {
            globalSerialNo: cur.GlobalSerialNo,
            snCode: cur.SNCode,
            moduleCode: cur.ModuleCodeSerial
        };

        await writeMirrors(tQuery, {
            recordId: id, moduleCode, modulePrefix,
            customerId: cur.CustomerID, userId, recordDate: cur.RecordDate,
            govtFee, operatorFee, totalFee, paidAmount, balanceAmount,
            paymentMode: input.paymentMode || cur.PaymentMode,
            referenceNo: input.referenceNo || null,
            customerName: null,
            walletAccountId: parseInt(input.walletAccountID, 10) || null,
            cashAccountId: parseInt(input.cashAccountID, 10) || null,
            sn, serviceName: null
        });

        return { recordID: id, totalFee, paidAmount, balanceAmount, status };
    });
}

/**
 * Soft delete + complete reversal.
 */
async function deleteServiceRecord(recordId, userId) {
    const id = parseInt(recordId, 10);
    if (!id) throw new Error('RecordID galat hai');

    return await withTransaction(async (tQuery) => {
        const curRes = await tQuery(`
            SELECT * FROM dbo.ServiceRecords WHERE RecordID = @id AND UserID = @uid AND IsActive = 1
        `, { id, uid: userId });
        if (!curRes.recordset.length) throw new Error('Record nahi mila');
        const cur = curRes.recordset[0];

        await removeMirrors(tQuery, { moduleCode: cur.ModuleCode, recordId: id });

        await tQuery(`
            UPDATE dbo.ServiceRecords
            SET IsActive = 0, UpdatedAt = GETDATE()
            WHERE RecordID = @id AND UserID = @uid
        `, { id, uid: userId });

        await deactivateGlobalTransaction(cur.ModuleCode, id, tQuery);

        if (cur.CustomerID) await refreshCustomerBalance(tQuery, cur.CustomerID);

        return { recordID: id, deleted: true };
    });
}

module.exports = {
    createServiceRecord,
    updateServiceRecord,
    deleteServiceRecord,
    MODULE_SERVICE_TABLE,
    MODULE_SERVICE_PK
};
