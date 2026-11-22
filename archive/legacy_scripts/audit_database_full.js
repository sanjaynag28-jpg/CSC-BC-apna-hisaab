const { getPool, sql } = require('../database/db');

async function audit() {
    try {
        const pool = await getPool();

        // 1. All Tables & Row Counts
        const tablesRes = await pool.request().query(`
            SELECT t.name AS TableName, p.rows AS [RowCount]
            FROM sys.tables t
            INNER JOIN sys.indexes i ON t.object_id = i.object_id
            INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
            WHERE i.index_id <= 1 AND t.is_ms_shipped = 0
            ORDER BY p.rows DESC
        `);

        console.log('=== DATABASE TABLES & ROW COUNTS ===');
        console.table(tablesRes.recordset);

        // 2. All Columns for each table
        const colsRes = await pool.request().query(`
            SELECT 
                t.name AS TableName,
                c.name AS ColumnName,
                ty.name AS DataType,
                c.max_length AS MaxLength,
                c.is_nullable AS IsNullable
            FROM sys.tables t
            INNER JOIN sys.columns c ON t.object_id = c.object_id
            INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
            WHERE t.is_ms_shipped = 0
            ORDER BY t.name, c.column_id
        `);

        // Group by TableName
        const tableCols = {};
        for (const col of colsRes.recordset) {
            if (!tableCols[col.TableName]) tableCols[col.TableName] = [];
            tableCols[col.TableName].push(`${col.ColumnName} (${col.DataType})`);
        }

        console.log('\n=== TABLE SCHEMAS (COLUMNS) ===');
        for (const [tbl, cols] of Object.entries(tableCols)) {
            console.log(`\nTABLE [${tbl}]:`);
            console.log('  ' + cols.join(', '));
        }

        process.exit(0);
    } catch (e) {
        console.error('Audit DB error:', e.message);
        process.exit(1);
    }
}

audit();
