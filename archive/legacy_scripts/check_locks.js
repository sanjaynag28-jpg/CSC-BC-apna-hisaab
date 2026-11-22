const { getPool } = require('../database/db');

(async () => {
    const pool = await getPool();
    const r = await pool.request().query(`
        SELECT 
            r.session_id,
            r.status,
            r.blocking_session_id,
            r.wait_type,
            r.wait_time,
            r.command,
            SUBSTRING(t.text, 1, 150) as sql_snippet
        FROM sys.dm_exec_requests r
        CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t;
    `);
    console.log('Active requests in SQL Server:', r.recordset);

    const locks = await pool.request().query(`
        SELECT 
            tl.request_session_id,
            tl.resource_type,
            tl.request_mode,
            tl.request_status,
            OBJECT_NAME(p.object_id) as locked_table
        FROM sys.dm_tran_locks tl
        LEFT JOIN sys.partitions p ON p.hobt_id = tl.resource_associated_entity_id
        WHERE tl.request_session_id != @@SPID;
    `);
    console.log('Locks held in SQL Server:', locks.recordset);

    process.exit(0);
})();

