const sql = require('mssql');
const path = require('path');
const fs = require('fs');

// SQL Server Configuration
// Credentials: env vars preferred, phir .env file, phir local fallback.
function loadDotEnv() {
    try {
        const envPath = path.join(__dirname, '..', '.env');
        if (!fs.existsSync(envPath)) return;
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eq = trimmed.indexOf('=');
            if (eq === -1) return;
            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) process.env[key] = value;
        });
    } catch (err) {
        console.warn('⚠️ .env load failed:', err.message);
    }
}
loadDotEnv();

const config = {
    server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS',
    database: process.env.DB_NAME || 'CashManagement',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
    pool: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000
    },
    connectionTimeout: 15000,
    requestTimeout: 30000
};

let pool = null;
let poolPromise = null;

async function getPool() {
    if (pool && pool.connected) {
        return pool;
    }
    if (poolPromise) {
        return poolPromise;
    }

    const pendingPool = new sql.ConnectionPool(config).connect();
    poolPromise = pendingPool;
    try {
        pool = await pendingPool;
        if (poolPromise === pendingPool) poolPromise = null;
        console.log('✅ SQL Server se connected!');
        return pool;
    } catch (err) {
        if (poolPromise === pendingPool) {
            poolPromise = null;
            pool = null;
        }

        // Self-Healing: Agar target database abhi SQL Server par bana nahi hai (Error 4060)
        if (err.message && (err.message.includes('Cannot open database') || err.number === 4060)) {
            console.warn(`⚠️ Database "${config.database}" nahi mila. Master connection se auto-create kar rahe hain...`);
            try {
                const masterCfg = { ...config, database: 'master' };
                const mPool = await new sql.ConnectionPool(masterCfg).connect();
                await mPool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${String(config.database).replace(/'/g, "''")}') CREATE DATABASE [${String(config.database).replace(/\]/g, ']]')}]`);
                await mPool.close();
                console.log(`✅ Database "${config.database}" successfully create ho gaya! Reconnecting...`);
                pool = await new sql.ConnectionPool(config).connect();
                console.log('✅ SQL Server se connected!');
                return pool;
            } catch (createErr) {
                console.error('❌ Master se database create nahi ho paya:', createErr.message);
            }
        }

        console.error('❌ SQL Server connection error:', err.message);
        throw err;
    }
}

async function isDbAlive() {
    try {
        const p = await getPool();
        const res = await p.request().query('SELECT 1 AS alive');
        return Boolean(res && res.recordset && res.recordset.length > 0);
    } catch (err) {
        console.error('⚠️ Live DB Connection Check Failed:', err.message);
        try {
            if (pool) await pool.close();
        } catch (closeErr) {}
        pool = null;
        return false;
    }
}

async function query(queryStr, params = {}) {
    try {
        const p = await getPool();
        const request = p.request();
        
        // Parameters add karo
        for (const [key, value] of Object.entries(params)) {
            if (value && typeof value === 'object' && value.type) {
                request.input(key, value.type, value.value);
            } else {
                request.input(key, value);
            }
        }
        
        return await request.query(queryStr);
    } catch (err) {
        // If connection is dead or lost, reset pool
        if (err.code === 'ECONNRESET' || err.code === 'ECONNCLOSED' || err.code === 'ETIMEDOUT' || err.code === 'ESOCKET') {
            pool = null;
        }
        throw err;
    }
}

async function withTransaction(callback) {
    const p = await getPool();
    const transaction = new sql.Transaction(p);
    await transaction.begin();
    try {
        const transQuery = async (queryStr, params = {}) => {
            const request = new sql.Request(transaction);
            for (const [key, value] of Object.entries(params)) {
                if (value && typeof value === 'object' && value.type) {
                    request.input(key, value.type, value.value);
                } else {
                    request.input(key, value);
                }
            }
            return await request.query(queryStr);
        };
        const result = await callback(transQuery, transaction);
        await transaction.commit();
        return result;
    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {}
        if (err.code === 'ECONNRESET' || err.code === 'ECONNCLOSED' || err.code === 'ETIMEDOUT' || err.code === 'ESOCKET') {
            pool = null;
        }
        throw err;
    }
}

// Pool band karo (restore/reset ke liye zaroori - file replace se pehle)
async function closePool() {
    try {
        if (poolPromise) {
            await poolPromise.catch(() => null);
        }
        if (pool) {
            await pool.close();
            console.log('✅ SQL Server pool closed');
        }
    } catch (err) {
        console.error('⚠️ Pool close error:', err.message);
    } finally {
        pool = null;
        poolPromise = null;
    }
}

module.exports = { getPool, isDbAlive, query, withTransaction, closePool, sql };

