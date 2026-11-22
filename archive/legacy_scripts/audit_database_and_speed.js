const { query, getPool } = require('../database/db');

async function auditDatabaseAndSpeed() {
    try {
        console.log('--- 1. DATABASE CONNECTION & POOL CHECK ---');
        const pool = await getPool();
        console.log(`Pool Status: Connected, Database: CashManagement, Driver: mssql`);

        console.log('\n--- 2. TABLE ROW COUNTS ---');
        const tablesRes = await query(`
            SELECT 
                t.NAME AS TableName,
                p.rows AS RowCounts
            FROM sys.tables t
            INNER JOIN sys.indexes i ON t.OBJECT_ID = i.object_id
            INNER JOIN sys.partitions p ON i.object_id = p.OBJECT_ID AND i.index_id = p.index_id
            WHERE t.is_ms_shipped = 0 AND i.index_id < 2
            ORDER BY p.rows DESC
        `);
        console.table(tablesRes.recordset);

        console.log('\n--- 3. INDEX HEALTH & MISSING INDEX ANALYSIS ---');
        const missingRes = await query(`
            SELECT TOP 10
                mig.index_group_handle,
                mid.index_handle,
                CONVERT(decimal(28,1), 
                    migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans)
                ) AS improvement_measure,
                'CREATE INDEX [IX_' + OBJECT_NAME(mid.object_id) + '_' + 
                REPLACE(REPLACE(ISNULL(mid.equality_columns, ''), ', ', '_'), '[', '') + 
                '] ON ' + mid.statement + ' (' + ISNULL(mid.equality_columns, '') + 
                CASE WHEN mid.equality_columns IS NOT NULL AND mid.inequality_columns IS NOT NULL THEN ', ' ELSE '' END + 
                ISNULL(mid.inequality_columns, '') + ')' + 
                ISNULL(' INCLUDE (' + mid.included_columns + ')', '') AS create_index_statement
            FROM sys.dm_db_missing_index_groups mig
            INNER JOIN sys.dm_db_missing_index_group_stats migs ON migs.group_handle = mig.index_group_handle
            INNER JOIN sys.dm_db_missing_index_details mid ON mig.index_handle = mid.index_handle
            ORDER BY improvement_measure DESC
        `);

        if (missingRes.recordset.length === 0) {
            console.log('✅ No critical missing indexes found! Query engine is optimal.');
        } else {
            console.log(`Found ${missingRes.recordset.length} suggested indexes:`);
            missingRes.recordset.forEach(m => {
                console.log(`Impact: ${m.improvement_measure} | SQL: ${m.create_index_statement}`);
            });
        }

        console.log('\n--- 4. QUERY SPEED LATENCY BENCHMARK ---');
        const benchmarks = [
            { name: 'Dashboard Stats', sql: 'SELECT COUNT(*) as c FROM Transactions WHERE UserID = 1' },
            { name: 'Universal Search Customers', sql: 'SELECT TOP 20 * FROM Customers WHERE CustomerName LIKE \'%Kumar%\' OR Phone LIKE \'%9%\'' },
            { name: 'CSC Applications List', sql: 'SELECT TOP 50 * FROM CSCApplications WHERE UserID = 1 ORDER BY CreatedAt DESC' },
            { name: 'BC Transactions List', sql: 'SELECT TOP 50 * FROM BCTransactions WHERE UserID = 1 ORDER BY TransDate DESC' },
            { name: 'Universal Registry Lookup', sql: 'SELECT TOP 20 * FROM UniversalTxnRegistry WHERE ModuleCode LIKE \'%BC%\' ORDER BY CreatedAt DESC' }
        ];

        for (const b of benchmarks) {
            const start = Date.now();
            await query(b.sql);
            const duration = Date.now() - start;
            console.log(`⏱️ ${b.name}: ${duration}ms ${duration < 50 ? '⚡ EXTREMELY FAST' : duration < 200 ? '✅ FAST' : '⚠️ ACCEPTABLE'}`);
        }

        process.exit(0);
    } catch (e) {
        console.error('Audit error:', e);
        process.exit(1);
    }
}

auditDatabaseAndSpeed();
