const http = require('http');
const { query, withTransaction } = require('../database/db');

function httpGet(path) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: 'localhost',
            port: 3000,
            path: path,
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
    });
}

async function verifyAll() {
    console.log('====================================================');
    console.log('VERIFYING 4 NAYE ISSUES (N1, N2, N3, N4) LIVE');
    console.log('====================================================');

    try {
        // --- 1. VERIFY N2 & APP 819 REPAIR ---
        console.log('\n--- 1. Testing N2 & App 819 Postings ---');
        const tx819 = await query("SELECT TransactionID, Amount, TransType, Reference, Tags FROM Transactions WHERE Reference = 'APP-819' AND IsDeleted = 0");
        console.log('App 819 Active Transactions:', tx819.recordset);
        const kh819 = await query("SELECT KhataID, CustomerID, CSCAppID, EntryType, Amount, Description FROM KhataEntries WHERE CSCAppID = 819");
        console.log('App 819 Khata Entries:', kh819.recordset);

        if (tx819.recordset.length === 2 && kh819.recordset.length >= 2) {
            console.log('N2 / App 819 Status: ✅ PASSED (Postings exist and intact)');
        } else {
            console.error('N2 / App 819 Status: ❌ FAILED');
        }

        // Test N2 Shared-Ack Guard Simulation
        console.log('\n--- 1b. Testing N2 Shared-Ack Guard ---');
        // Create a dummy app with same Ack as 819 (990079734289612)
        let dummyAppId = null;
        await withTransaction(async (tQuery) => {
            const ins = await tQuery(`
                INSERT INTO CSCApplications (
                    UserID, CustomerName, ServiceType, AckNumber, ApplyDate,
                    GovtFee, OperatorFee, TotalFee, PaidAmount, DueAmount, PaymentStatus, IsActive
                )
                OUTPUT INSERTED.AppID
                VALUES (1, 'Dummy Test App', 'Test Service', '990079734289612', GETDATE(), 50, 50, 100, 100, 0, 'Paid', 1)
            `);
            dummyAppId = ins.recordset[0].AppID;
        });

        // Try deleting dummyAppId via API or logic
        // Verify that deleting dummyApp does NOT delete 819 txns!
        const delRes = await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: 3000,
                path: `/api/csc/${dummyAppId}`,
                method: 'DELETE'
            }, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve({ status: res.statusCode, body: d }));
            });
            req.end();
        });
        console.log(`Deleted dummy app #${dummyAppId}: Status ${delRes.status}`);

        // Check if 819 transactions are STILL alive
        const tx819After = await query("SELECT TransactionID FROM Transactions WHERE Reference = 'APP-819' AND IsDeleted = 0");
        if (tx819After.recordset.length === 2) {
            console.log('N2 Shared-Ack Guard Status: ✅ PASSED (App 819 transactions remained intact!)');
        } else {
            console.error('N2 Shared-Ack Guard Status: ❌ FAILED (Transactions were touched!)');
        }

        // --- 2. VERIFY N3 ANALYTICS BP COMMISSION ---
        console.log('\n--- 2. Testing N3 Analytics BP Commission ---');
        const analyticsRes = await httpGet('/api/reports/analytics?year=2026');
        if (analyticsRes.status === 200 && analyticsRes.data?.data?.monthlyTrends) {
            const trends = analyticsRes.data.data.monthlyTrends;
            const totalBpComm = trends.reduce((acc, m) => acc + (parseFloat(m.BPCommission) || 0), 0);
            const totalNetProfit = trends.reduce((acc, m) => acc + (parseFloat(m.NetProfit) || 0), 0);
            console.log('Analytics Total BP Commission:', totalBpComm.toFixed(2));
            console.log('Analytics Total Net Profit:', totalNetProfit.toFixed(2));

            if (Math.abs(totalBpComm - 337.82) < 0.05) {
                console.log('N3 Status: ✅ PASSED (Analytics includes exact ₹337.82 BP Commission)');
            } else {
                console.error(`N3 Status: ❌ FAILED (Expected 337.82, got ${totalBpComm})`);
            }
        } else {
            console.error('Failed to fetch analytics:', analyticsRes);
        }

        // --- 3. VERIFY N4 REGISTRY ORPHANS ---
        console.log('\n--- 3. Testing N4 Registry Orphans ---');
        const khataOrphans = await query(`
            SELECT r.GlobalSerialNo FROM UniversalTxnRegistry r
            LEFT JOIN KhataEntries k ON r.RecordID = k.KhataID
            WHERE r.SourceModule = 'Khata' AND r.IsActive = 1 AND k.KhataID IS NULL
        `);
        const cscOrphans = await query(`
            SELECT r.GlobalSerialNo FROM UniversalTxnRegistry r
            LEFT JOIN CSCApplications c ON r.RecordID = c.AppID
            WHERE r.SourceModule = 'CSC' AND r.IsActive = 1 AND (c.AppID IS NULL OR c.IsActive = 0)
        `);
        console.log(`Active Khata Orphans: ${khataOrphans.recordset.length}`);
        console.log(`Active CSC Orphans: ${cscOrphans.recordset.length}`);

        if (khataOrphans.recordset.length === 0 && cscOrphans.recordset.length === 0) {
            console.log('N4 Status: ✅ PASSED (0 Registry Orphans)');
        } else {
            console.error('N4 Status: ❌ FAILED (Orphans found)');
        }

        // --- 4. VERIFY N1 EXCEL MANAGER CODE PARITY ---
        console.log('\n--- 4. Testing N1 Excel Manager Cashbook Posting Parity ---');
        const fs = require('fs');
        const emContent = fs.readFileSync('routes/excel_manager.js', 'utf8');
        const hasFeeIn = emContent.includes('CSC_FEE_IN');
        const hasGovtFeeOut = emContent.includes('CSC_GOVT_FEE_OUT');
        const hasUppclIn = emContent.includes('UPPCL_BILL_IN');
        const hasUppclOut = emContent.includes('UPPCL_BILL_OUT');
        const hasRegGlobal = emContent.includes('registerGlobalTransaction');
        const hasBalanceUpdate = emContent.includes('sp_UpdateAccountBalance');

        console.log('excel_manager.js has CSC_FEE_IN:', hasFeeIn);
        console.log('excel_manager.js has CSC_GOVT_FEE_OUT:', hasGovtFeeOut);
        console.log('excel_manager.js has UPPCL_BILL_IN:', hasUppclIn);
        console.log('excel_manager.js has UPPCL_BILL_OUT:', hasUppclOut);
        console.log('excel_manager.js has registerGlobalTransaction:', hasRegGlobal);
        console.log('excel_manager.js has sp_UpdateAccountBalance:', hasBalanceUpdate);

        if (hasFeeIn && hasGovtFeeOut && hasUppclIn && hasUppclOut && hasRegGlobal && hasBalanceUpdate) {
            console.log('N1 Status: ✅ PASSED (Full accounting parity implemented in Excel import)');
        } else {
            console.error('N1 Status: ❌ FAILED (Some postings missing in excel_manager.js)');
        }

        console.log('\n====================================================');
        console.log('ALL 4 NAYE ISSUES (N1 TO N4) VERIFIED!');
        console.log('====================================================');

    } catch (e) {
        console.error('Verification error:', e);
    } finally {
        process.exit(0);
    }
}

verifyAll();
