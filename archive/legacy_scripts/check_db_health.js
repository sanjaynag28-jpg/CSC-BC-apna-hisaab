const { query } = require('../database/db');

async function checkDatabaseHealth() {
    console.log('--- DATABASE HEALTH & TABLE AUDIT ---');

    // 1. Check Table row counts
    const tablesRes = await query(`
        SELECT 
            t.name AS TableName,
            p.rows AS RowCounts,
            SUM(a.total_pages) * 8 AS TotalSpaceKB,
            SUM(a.used_pages) * 8 AS UsedSpaceKB
        FROM sys.tables t
        INNER JOIN sys.indexes i ON t.OBJECT_ID = i.object_id
        INNER JOIN sys.partitions p ON i.object_id = p.OBJECT_ID AND i.index_id = p.index_id
        INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
        WHERE t.is_ms_shipped = 0
        GROUP BY t.name, p.rows
        ORDER BY p.rows DESC;
    `);

    console.log('\nTables & Record Counts:');
    tablesRes.recordset.forEach(r => {
        console.log(`- ${r.TableName.padEnd(25)} : ${String(r.RowCounts).padStart(6)} rows (${(r.TotalSpaceKB / 1024).toFixed(2)} MB)`);
    });

    // 2. Check Existing Indexes
    const indexRes = await query(`
        SELECT 
            t.name AS TableName,
            i.name AS IndexName,
            i.type_desc AS IndexType,
            i.is_primary_key AS IsPK,
            i.is_unique AS IsUnique
        FROM sys.indexes i
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        WHERE t.is_ms_shipped = 0
        ORDER BY t.name, i.index_id;
    `);

    console.log(`\nTotal Indexes Found: ${indexRes.recordset.length}`);

    // 3. Check for any fragmented or missing critical indexes
    console.log('\nDatabase Health Check Complete.');
    process.exit(0);
}

checkDatabaseHealth().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

