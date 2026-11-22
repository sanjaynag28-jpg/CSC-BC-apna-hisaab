const { getPool, sql } = require('../database/db');

(async () => {
    const pool = await getPool();

    try {
        console.time('EXEC with @id');
        await pool.request().input('id', sql.Int, 1).query('EXEC sp_UpdateAccountBalance @AccountID = @id');
        console.timeEnd('EXEC with @id');
        console.log('Success with @AccountID = @id!');
    } catch (e) {
        console.error('Error with @AccountID = @id:', e.message);
    }

    try {
        console.time('EXEC without param name');
        await pool.request().input('id', sql.Int, 1).query('EXEC sp_UpdateAccountBalance @id');
        console.timeEnd('EXEC without param name');
        console.log('Success without param name!');
    } catch (e) {
        console.error('Error without param name:', e.message);
    }

    process.exit(0);
})();
