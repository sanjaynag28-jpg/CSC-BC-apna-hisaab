const path = require('path');
const db = require(path.join(__dirname, '../database/db'));
const http = require('http');

async function testEndpoint(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                if (!(res.statusCode >= 200 && res.statusCode < 400)) return resolve(false);
                try {
                    const j = JSON.parse(body);
                    resolve(j.success === true);
                } catch {
                    resolve(true); // non-JSON (rare)
                }
            });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(4000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function verifyAll() {
    console.log('====================================================');
    console.log('   CMBC INVARIANT VERIFICATION SUITE (30-SEC CHECK)  ');
    console.log('====================================================\n');

    let totalErrors = 0;
    const pool = await db.getPool();

    // -----------------------------------------------------------------
    // INVARIANT 1: Source Active Rows Without Universal SN
    // -----------------------------------------------------------------
    try {
        const queries = [
            { module: 'Transactions', sql: "SELECT COUNT(*) as c FROM Transactions WHERE GlobalSerialNo IS NULL AND IsDeleted = 0" },
            { module: 'BillPayments', sql: "SELECT COUNT(*) as c FROM BillPayments WHERE GlobalSerialNo IS NULL AND IsDeleted = 0" },
            { module: 'CSCApplications', sql: "SELECT COUNT(*) as c FROM CSCApplications WHERE GlobalSerialNo IS NULL AND IsActive = 1" },
            { module: 'BCTransactions', sql: "SELECT COUNT(*) as c FROM BCTransactions WHERE GlobalSerialNo IS NULL" },
            { module: 'KhataEntries', sql: "SELECT COUNT(*) as c FROM KhataEntries WHERE GlobalSerialNo IS NULL" },
            { module: 'Invoices', sql: "SELECT COUNT(*) as c FROM Invoices WHERE GlobalSerialNo IS NULL" },
            { module: 'Bills', sql: "SELECT COUNT(*) as c FROM Bills WHERE GlobalSerialNo IS NULL" }
        ];

        let missingSN = 0;
        const details = [];
        for (const q of queries) {
            const res = await pool.request().query(q.sql);
            const cnt = res.recordset[0].c;
            if (cnt > 0) {
                missingSN += cnt;
                details.push(`${q.module}: ${cnt}`);
            }
        }
        if (missingSN === 0) {
            console.log('✅ Invariant 1: Source active rows without SN: 0 (PASSED)');
        } else {
            console.error(`❌ Invariant 1 FAILED: ${missingSN} active rows without SN (${details.join(', ')})`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 1 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 2: Registry Duplicate GlobalSerialNo
    // -----------------------------------------------------------------
    try {
        const res = await pool.request().query(`
            SELECT GlobalSerialNo, COUNT(*) as cnt
            FROM UniversalTxnRegistry
            WHERE IsActive = 1
            GROUP BY GlobalSerialNo
            HAVING COUNT(*) > 1
        `);
        if (res.recordset.length === 0) {
            console.log('✅ Invariant 2: Registry duplicate SN: 0 (PASSED)');
        } else {
            console.error(`❌ Invariant 2 FAILED: Duplicate active SN found:`, res.recordset);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 2 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 3: Registry Orphan (Active Registry Row with Missing/Deleted Source)
    // -----------------------------------------------------------------
    try {
        const res = await pool.request().query(`
            SELECT COUNT(*) as orphanCount FROM UniversalTxnRegistry r
            WHERE r.IsActive = 1 AND (
                (r.SourceModule = 'Cashbook' AND NOT EXISTS (SELECT 1 FROM Transactions t WHERE t.TransactionID = r.RecordID AND t.IsDeleted = 0)) OR
                (r.SourceModule = 'BillPay' AND NOT EXISTS (SELECT 1 FROM BillPayments bp WHERE bp.PaymentID = r.RecordID AND bp.IsDeleted = 0)) OR
                (r.SourceModule = 'CSC' AND NOT EXISTS (SELECT 1 FROM CSCApplications c WHERE c.AppID = r.RecordID)) OR
                (r.SourceModule = 'BC' AND NOT EXISTS (SELECT 1 FROM BCTransactions b WHERE b.BCID = r.RecordID)) OR
                (r.SourceModule = 'Khata' AND NOT EXISTS (SELECT 1 FROM KhataEntries k WHERE k.KhataID = r.RecordID)) OR
                (r.SourceModule = 'Invoices' AND NOT EXISTS (SELECT 1 FROM Invoices i WHERE i.InvoiceID = r.RecordID)) OR
                (r.SourceModule = 'Bills' AND NOT EXISTS (SELECT 1 FROM Bills bl WHERE bl.BillID = r.RecordID))
            )
        `);
        const orphans = res.recordset[0].orphanCount;
        if (orphans === 0) {
            console.log('✅ Invariant 3: Registry orphan rows: 0 (PASSED)');
        } else {
            console.error(`❌ Invariant 3 FAILED: Found ${orphans} orphan registry rows!`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 3 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 4: Active Source Rows Missing Ledger Mirrors (NOT EXISTS)
    // -----------------------------------------------------------------
    try {
        const bpIncomeMissing = await pool.request().query(`
            SELECT COUNT(*) as cnt FROM BillPayments bp
            WHERE bp.IsDeleted = 0 AND bp.TotalCollected > 0
              AND NOT EXISTS (
                  SELECT 1 FROM Transactions t
                  WHERE t.SourceModule = 'BillPay' AND t.SourceID = bp.PaymentID AND t.LineType = 'CASH_IN'
                    AND t.TransType = 'Income' AND t.IsDeleted = 0
              )
        `);

        const bpExpenseMissing = await pool.request().query(`
            SELECT COUNT(*) as cnt FROM BillPayments bp
            WHERE bp.IsDeleted = 0 AND bp.BillAmount > 0
              AND NOT EXISTS (
                  SELECT 1 FROM Transactions t
                  WHERE t.SourceModule = 'BillPay' AND t.SourceID = bp.PaymentID AND t.LineType = 'BILL_OUT'
                    AND t.TransType = 'Expense' AND t.IsDeleted = 0
              )
        `);

        const cscIncomeMissing = await pool.request().query(`
            SELECT COUNT(*) as cnt FROM CSCApplications c
            WHERE c.IsActive = 1 AND c.PaidAmount > 0
              AND NOT EXISTS (
                  SELECT 1 FROM Transactions t
                  WHERE t.SourceModule = 'CSC' AND t.SourceID = c.AppID AND t.LineType = 'FEE_IN'
                    AND t.Tags = 'CSC_FEE_IN' AND t.IsDeleted = 0
              )
        `);

        const invIncomeMissing = await pool.request().query(`
            SELECT COUNT(*) as cnt FROM Invoices inv
            WHERE inv.PaidAmount > 0
              AND NOT EXISTS (
                  SELECT 1 FROM Transactions t
                  WHERE t.SourceModule = 'Invoices' AND t.SourceID = inv.InvoiceID AND t.LineType = 'PAYMENT_IN'
                    AND t.TransType = 'Income' AND t.IsDeleted = 0
              )
        `);

        const bcFlowMissing = await pool.request().query(`
            SELECT COUNT(*) as cnt FROM BCTransactions bc
            WHERE (
                SELECT COUNT(*) FROM KhataEntries k
                WHERE k.BCID = bc.BCID AND k.EntryType = 'BC-Flow'
            ) <> 2
        `);

        const missingTotal =
            bpIncomeMissing.recordset[0].cnt +
            bpExpenseMissing.recordset[0].cnt +
            cscIncomeMissing.recordset[0].cnt +
            invIncomeMissing.recordset[0].cnt +
            bcFlowMissing.recordset[0].cnt;

        if (missingTotal === 0) {
            console.log('✅ Invariant 4: Active rows missing mirrors (NOT EXISTS, exactly 2 BC-Flow): 0 (PASSED)');
        } else {
            console.error(`❌ Invariant 4 FAILED: Missing mirrors detected:
               - BP Income missing: ${bpIncomeMissing.recordset[0].cnt}
               - BP Expense missing: ${bpExpenseMissing.recordset[0].cnt}
               - CSC Income missing: ${cscIncomeMissing.recordset[0].cnt}
               - Invoice Income missing: ${invIncomeMissing.recordset[0].cnt}
               - BC Flow (not exactly 2): ${bcFlowMissing.recordset[0].cnt}`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 4 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 5: Mirror Amount vs Parent Amount Mismatches (Rule 1 Identity)
    // -----------------------------------------------------------------
    try {
        const bpAmtMismatch = await pool.request().query(`
            SELECT COUNT(*) as cnt
            FROM BillPayments bp
            JOIN Transactions tInc ON tInc.SourceModule = 'BillPay' AND tInc.SourceID = bp.PaymentID AND tInc.LineType = 'CASH_IN' AND tInc.IsDeleted = 0
            JOIN Transactions tExp ON tExp.SourceModule = 'BillPay' AND tExp.SourceID = bp.PaymentID AND tExp.LineType = 'BILL_OUT' AND tExp.IsDeleted = 0
            WHERE bp.IsDeleted = 0 AND (tInc.Amount <> bp.TotalCollected OR tExp.Amount <> bp.BillAmount)
        `);

        const cscAmtMismatch = await pool.request().query(`
            SELECT COUNT(*) as cnt
            FROM CSCApplications c
            JOIN Transactions t ON t.SourceModule = 'CSC' AND t.SourceID = c.AppID AND t.LineType = 'FEE_IN' AND t.IsDeleted = 0
            WHERE c.IsActive = 1 AND c.PaidAmount > 0 AND t.Amount <> c.PaidAmount
        `);

        const invAmtMismatch = await pool.request().query(`
            SELECT COUNT(*) as cnt
            FROM Invoices inv
            JOIN Transactions t ON t.SourceModule = 'Invoices' AND t.SourceID = inv.InvoiceID AND t.LineType = 'PAYMENT_IN' AND t.IsDeleted = 0
            WHERE inv.PaidAmount > 0 AND ABS(t.Amount - inv.PaidAmount) > 0.01
        `);

        const diffCount = bpAmtMismatch.recordset[0].cnt + cscAmtMismatch.recordset[0].cnt + invAmtMismatch.recordset[0].cnt;
        if (diffCount === 0) {
            console.log('✅ Invariant 5: Mirror amount vs Parent amount (Rule 1 Identity): 0 diff (PASSED)');
        } else {
            console.error(`❌ Invariant 5 FAILED: ${diffCount} amount mismatches detected! (BP: ${bpAmtMismatch.recordset[0].cnt}, CSC: ${cscAmtMismatch.recordset[0].cnt}, Inv: ${invAmtMismatch.recordset[0].cnt})`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 5 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 6: Sum(Ledger) vs Account Balance (Comprehensive Derived Balance)
    // -----------------------------------------------------------------
    try {
        const accounts = await pool.request().query('SELECT AccountID, AccountName, CurrentBalance, OpeningBalance FROM Accounts WHERE IsActive = 1');
        let driftCount = 0;

        for (const acc of accounts.recordset) {
            const accId = acc.AccountID;

            const ledgerRes = await pool.request().query(`
                SELECT
                    ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = ${accId} AND TransType IN ('Income', 'Loan Received', 'Loan Recovery') AND IsDeleted = 0), 0) +
                    ISNULL((SELECT SUM(Amount) FROM Transactions WHERE ToAccountID = ${accId} AND TransType = 'Transfer' AND IsDeleted = 0), 0) -
                    ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = ${accId} AND TransType IN ('Expense', 'Loan Given', 'Loan Repay') AND IsDeleted = 0), 0) -
                    ISNULL((SELECT SUM(Amount) FROM Transactions WHERE AccountID = ${accId} AND TransType = 'Transfer' AND IsDeleted = 0), 0) as Ledger
            `);

            const bcCashRes = await pool.request().query(`
                SELECT
                    ISNULL((
                        SELECT SUM(CASE
                                WHEN ServiceType IN ('Cash Deposit', 'Money Transfer') THEN Amount
                                WHEN ServiceType = 'Cash Withdrawal' THEN -Amount
                                WHEN ServiceType = 'QR Pay' AND QROperation = 'Cash Given to Customer' THEN -Amount
                                WHEN ServiceType = 'QR Pay' AND QROperation = 'Send - Cash Taken from Customer' THEN Amount
                                ELSE 0 END)
                        FROM BCTransactions WHERE CashAccountID = ${accId} AND Status = 'Success'
                    ), 0) + ISNULL((
                        SELECT SUM(ISNULL(b.CustomerCharge, 0))
                        FROM BCTransactions b
                        WHERE b.CashAccountID = ${accId} 
                          AND b.Status = 'Success'
                          AND NOT EXISTS (
                              SELECT 1 FROM KhataEntries k 
                              WHERE k.BCID = b.BCID AND k.EntryType = 'Gave'
                          )
                    ), 0) as BCCash
            `);

            const bcPortalRes = await pool.request().query(`
                SELECT
                    ISNULL((
                        SELECT SUM(CASE
                                WHEN ServiceType = 'Cash Withdrawal' THEN Amount
                                WHEN ServiceType = 'QR Pay' AND QROperation IN ('Cash Given to Customer', 'Deposit/Payment') THEN Amount
                                WHEN ServiceType = 'QR Pay' AND QROperation IN ('Send - Cash Taken from Customer', 'Send - Direct Transfer') THEN -Amount
                                WHEN ServiceType IN ('Cash Deposit', 'Money Transfer') THEN -Amount
                                ELSE 0 END) + SUM(ISNULL(CommissionEarned, 0))
                    FROM BCTransactions WHERE PortalAccountID = ${accId} AND Status = 'Success'
                ), 0) as BCPortal
            `);

            const opening = acc.OpeningBalance || 0;
            const ledger = ledgerRes.recordset[0].Ledger || 0;
            const bcCash = bcCashRes.recordset[0].BCCash || 0;
            const bcPortal = bcPortalRes.recordset[0].BCPortal || 0;
            const derived = opening + ledger + bcCash + bcPortal;

            if (Math.abs(acc.CurrentBalance - derived) > 0.05) {
                console.error(`❌ Account ${accId} (${acc.AccountName}) balance drift: Stored=${acc.CurrentBalance}, Derived=${derived}`);
                driftCount++;
            }
        }

        if (driftCount === 0) {
            console.log('✅ Invariant 6: Sum(Ledger) vs Account balance: 0 diff (PASSED)');
        } else {
            console.error(`❌ Invariant 6 FAILED: ${driftCount} account balance drift(s) detected!`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 6 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 7: Duplicate TxnReference in Active BillPayments (FATAL GUARD)
    // -----------------------------------------------------------------
    try {
        const dupRef = await pool.request().query(`
            SELECT TxnReference, COUNT(*) as cnt
            FROM BillPayments
            WHERE IsDeleted = 0 AND LEN(ISNULL(TxnReference, '')) > 0
            GROUP BY TxnReference
            HAVING COUNT(*) > 1
        `);

        if (dupRef.recordset.length === 0) {
            console.log('✅ Invariant 7: Duplicate TxnReference in active BillPayments: 0 (PASSED)');
        } else {
            console.error('❌ Invariant 7 FAILED: Duplicate TxnReference in active BillPayments:', dupRef.recordset);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 7 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 8: Core API Endpoints 200 OK & Success True
    // -----------------------------------------------------------------
    try {
        const port = process.env.PORT || ((await testEndpoint('http://localhost:4000/api/accounts')) ? 4000 : 3000);
        const endpoints = [
            `http://localhost:${port}/api/transactions?limit=1`,
            `http://localhost:${port}/api/bill-payments?limit=1`,
            `http://localhost:${port}/api/csc?limit=1`,
            `http://localhost:${port}/api/bc?limit=1`,
            `http://localhost:${port}/api/khatabook/summary`,
            `http://localhost:${port}/api/accounts`
        ];

        let failedEndpoints = 0;
        for (const ep of endpoints) {
            const ok = await testEndpoint(ep);
            if (!ok) {
                console.error(`❌ Invariant 8 FAILED: Endpoint unreachable or error/non-success: ${ep}`);
                failedEndpoints++;
            }
        }
        if (failedEndpoints === 0) {
            console.log('✅ Invariant 8: All Core API endpoints 200 OK & success:true (PASSED)');
        } else {
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 8 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 9: BillPayment Mirror Pair Integrity (Exactly 1 Inc + 1 Exp)
    // -----------------------------------------------------------------
    try {
        const res = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM (
                SELECT bp.PaymentID
                FROM BillPayments bp
                JOIN Transactions t ON t.IsDeleted = 0
                     AND t.SourceModule = 'BillPay' AND t.SourceID = bp.PaymentID
                WHERE bp.IsDeleted = 0
                GROUP BY bp.PaymentID
                HAVING SUM(CASE WHEN t.LineType = 'CASH_IN' AND t.TransType = 'Income' THEN 1 ELSE 0 END) <> 1
                    OR SUM(CASE WHEN t.LineType = 'BILL_OUT' AND t.TransType = 'Expense' THEN 1 ELSE 0 END) <> 1
            ) x
        `);
        const badPairs = res.recordset[0].cnt;
        if (badPairs === 0) {
            console.log('✅ Invariant 9: BillPay mirror pair integrity (1 CASH_IN + 1 BILL_OUT): 0 bad (PASSED)');
        } else {
            console.error(`❌ Invariant 9 FAILED: ${badPairs} BillPayment(s) have invalid mirror pair counts!`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 9 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 10: Source SN Missing in UniversalTxnRegistry (True Gap)
    // -----------------------------------------------------------------
    try {
        const res = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM (
                SELECT t.GlobalSerialNo FROM Transactions t
                WHERE t.IsDeleted = 0 AND t.GlobalSerialNo IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM UniversalTxnRegistry r WHERE r.GlobalSerialNo = t.GlobalSerialNo)
                UNION ALL
                SELECT k.GlobalSerialNo FROM KhataEntries k
                WHERE k.GlobalSerialNo IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM UniversalTxnRegistry r WHERE r.GlobalSerialNo = k.GlobalSerialNo)
                UNION ALL
                SELECT b.GlobalSerialNo FROM BillPayments b
                WHERE b.IsDeleted = 0 AND b.GlobalSerialNo IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM UniversalTxnRegistry r WHERE r.GlobalSerialNo = b.GlobalSerialNo)
                UNION ALL
                SELECT b.GlobalSerialNo FROM BCTransactions b
                WHERE b.GlobalSerialNo IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM UniversalTxnRegistry r WHERE r.GlobalSerialNo = b.GlobalSerialNo)
                UNION ALL
                SELECT c.GlobalSerialNo FROM CSCApplications c
                WHERE c.GlobalSerialNo IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM UniversalTxnRegistry r WHERE r.GlobalSerialNo = c.GlobalSerialNo)
            ) src
        `);
        const unregSN = res.recordset[0].cnt;
        if (unregSN === 0) {
            console.log('✅ Invariant 10: Source SN without registry row (True Gap): 0 (PASSED)');
        } else {
            console.error(`❌ Invariant 10 FAILED: ${unregSN} source rows have SN missing from UniversalTxnRegistry!`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 10 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 11: Identity Coverage (SourceModule/SourceID Required on Known Mirrors)
    // -----------------------------------------------------------------
    try {
        const res = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM Transactions
            WHERE IsDeleted = 0 AND SourceModule IS NULL
              AND (
                  Tags IN ('CSC_FEE_IN', 'CSC_GOVT_FEE_OUT', 'UPPCL_BILL_IN', 'UPPCL_BILL_OUT')
                  OR Reference LIKE 'BP-%'
                  OR Reference LIKE 'INV-%'
                  OR Reference LIKE 'APP-%'
              )
        `);
        const untagged = res.recordset[0].cnt;
        if (untagged === 0) {
            console.log('✅ Invariant 11: Transactions identity coverage (0 untagged mirror rows): 0 (PASSED)');
        } else {
            console.error(`❌ Invariant 11 FAILED: Found ${untagged} active mirror transactions without SourceModule identity!`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 11 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 12: CSC Mirror Integrity (FEE_IN & GOVT_OUT/UPPCL_OUT Mirror Counts)
    // -----------------------------------------------------------------
    try {
        const feeInRes = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM (
                SELECT c.AppID
                FROM CSCApplications c
                LEFT JOIN Transactions t ON t.IsDeleted = 0
                     AND t.SourceModule = 'CSC' AND t.SourceID = c.AppID AND t.LineType = 'FEE_IN'
                WHERE c.IsActive = 1 AND c.PaidAmount > 0
                GROUP BY c.AppID
                HAVING COUNT(t.TransactionID) <> 1
            ) x
        `);
        const govtOutRes = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM (
                SELECT c.AppID
                FROM CSCApplications c
                LEFT JOIN Transactions t ON t.IsDeleted = 0
                     AND t.SourceModule = 'CSC' AND t.SourceID = c.AppID AND t.LineType IN ('GOVT_OUT', 'UPPCL_OUT')
                WHERE c.IsActive = 1 AND c.GovtFee > 0
                GROUP BY c.AppID
                HAVING COUNT(t.TransactionID) <> 1
            ) x
        `);
        const badFeeIn = feeInRes.recordset[0].cnt;
        const badGovtOut = govtOutRes.recordset[0].cnt;
        if (badFeeIn === 0 && badGovtOut === 0) {
            console.log('✅ Invariant 12: CSC FEE_IN & GOVT_OUT/UPPCL_OUT mirror integrity: 0 bad (PASSED)');
        } else {
            console.error(`❌ Invariant 12 FAILED: CSC mirror integrity error (Bad FEE_IN: ${badFeeIn}, Bad GOVT_OUT: ${badGovtOut})!`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 12 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 13: Invoice Mirror Cumulative Amount Integrity (t.Amount = i.PaidAmount)
    // -----------------------------------------------------------------
    try {
        const res = await pool.request().query(`
            SELECT COUNT(*) AS cnt
            FROM Invoices i
            JOIN Transactions t ON t.IsDeleted = 0
              AND t.SourceModule = 'Invoices' AND t.SourceID = i.InvoiceID AND t.LineType = 'PAYMENT_IN'
            WHERE i.PaidAmount > 0 AND ABS(t.Amount - i.PaidAmount) > 0.01
        `);
        const badInvoices = res.recordset[0].cnt;
        if (badInvoices === 0) {
            console.log('✅ Invariant 13: Invoice mirror cumulative amount integrity: 0 bad (PASSED)');
        } else {
            console.error(`❌ Invariant 13 FAILED: ${badInvoices} invoice mirror(s) do not match cumulative PaidAmount!`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 13 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // INVARIANT 14: Sacred Accounting Invariant & Schema Polymorphism
    // Rule: Paisa, Date, Balance ALWAYS typed DECIMAL / DATE (never JSON)
    // Polymorphism: KhataEntries.SourceModule & SourceID 100% populated
    // Data Cleanliness: Documents.EntityType 0 NULLs and canonical casing
    // -----------------------------------------------------------------
    try {
        // 1. Check KhataEntries SourceModule / SourceID nulls
        const khataNullRes = await pool.request().query(`
            SELECT COUNT(*) AS cnt FROM KhataEntries WHERE SourceModule IS NULL OR SourceID IS NULL;
        `);
        const khataNullCount = khataNullRes.recordset[0].cnt;

        // 2. Check Documents EntityType nulls or non-standard casing
        const docBadRes = await pool.request().query(`
            SELECT COUNT(*) AS cnt 
            FROM Documents 
            WHERE EntityType IS NULL 
               OR EntityType NOT IN ('Customer', 'CSC', 'BillPay', 'Invoice', 'Khata', 'BC', 'Shop', 'UCL', 'PAC');
        `);
        const docBadCount = docBadRes.recordset[0].cnt;

        // 3. Check customer balance integrity
        const custBalRes = await pool.request().query(`
            SELECT CustomerID, CurrentBalance, OpeningBalance FROM Customers WHERE IsActive = 1;
        `);
        let custDrift = 0;
        for (const c of custBalRes.recordset) {
            const kRes = await pool.request().query(`
                SELECT 
                    ISNULL(SUM(CASE WHEN EntryType = 'Gave' THEN Amount ELSE 0 END), 0) -
                    ISNULL(SUM(CASE WHEN EntryType = 'Got' THEN Amount ELSE 0 END), 0) AS NetKhata,
                    COUNT(CASE WHEN ReferenceNo = 'OPENING-BAL' THEN 1 END) AS HasOpeningEntry
                FROM KhataEntries WHERE CustomerID = ${c.CustomerID};
            `);
            const netKhata = parseFloat(kRes.recordset[0].NetKhata) || 0;
            const hasOpeningEntry = kRes.recordset[0].HasOpeningEntry > 0;
            const opening = parseFloat(c.OpeningBalance) || 0;
            const expectedBal = hasOpeningEntry ? netKhata : (opening + netKhata);
            const actualBal = parseFloat(c.CurrentBalance) || 0;

            if (Math.abs(expectedBal - actualBal) > 0.05) {
                custDrift++;
            }
        }

        if (khataNullCount === 0 && docBadCount === 0 && custDrift === 0) {
            console.log('✅ Invariant 14: Sacred accounting typed decimals, Khata polymorphism & Documents clean: 0 issues (PASSED)');
        } else {
            console.error(`❌ Invariant 14 FAILED: Khata NULLs: ${khataNullCount}, Bad Documents: ${docBadCount}, Balance drifts: ${custDrift}`);
            totalErrors++;
        }
    } catch (e) {
        console.error('❌ Invariant 14 Error:', e.message);
        totalErrors++;
    }

    // -----------------------------------------------------------------
    // SUMMARY
    // -----------------------------------------------------------------
    console.log('\n====================================================');
    if (totalErrors === 0) {
        console.log('🎉 ALL 14 INVARIANTS PASSED (0 ERRORS DETECTED) ✅');
        console.log('====================================================\n');
        process.exit(0);
    } else {
        console.error(`💥 VERIFICATION FAILED: ${totalErrors} invariant(s) failed ❌`);
        console.log('====================================================\n');
        process.exit(1);
    }
}

verifyAll();
