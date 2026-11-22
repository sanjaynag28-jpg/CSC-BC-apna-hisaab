const sql = require('mssql');
const path = require('path');
const fs = require('fs');

// SQL Server Configuration
// Credentials: env vars preferred, phir .env file, phir local fallback.
function loadDotEnv(force = false) {
    try {
        const envPath = path.join(__dirname, '..', '.env');
        if (!fs.existsSync(envPath)) return;
        let content = fs.readFileSync(envPath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
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
            if (force || process.env[key] === undefined) process.env[key] = value;
        });
    } catch (err) {
        console.warn('⚠️ .env load failed:', err.message);
    }
}
loadDotEnv();

let workingCandidate = null;

function parseServerCandidates(rawServer, port) {
    const raw = String(rawServer || '127.0.0.1').trim();
    let host = raw;
    let instance = undefined;
    let explicitPort = port ? Number(port) : undefined;

    if (host.includes('\\')) {
        const parts = host.split('\\');
        host = parts[0].trim();
        instance = parts[1].trim();
    }
    if (host.includes(',')) {
        const parts = host.split(',');
        host = parts[0].trim();
        explicitPort = Number(parts[1].trim()) || explicitPort;
    }

    const cleanHost = (host === 'localhost' || host === '.') ? '127.0.0.1' : host;
    const candidates = [];

    // Candidate 1: Direct configured instance with sanitized host
    if (instance) {
        candidates.push({ server: cleanHost, options: { instanceName: instance }, port: explicitPort });
        candidates.push({ server: '127.0.0.1', options: { instanceName: instance }, port: explicitPort });
        candidates.push({ server: 'localhost', options: { instanceName: instance }, port: explicitPort });
    } else {
        candidates.push({ server: cleanHost, port: explicitPort });
    }

    // Candidate 2: Direct static port 1433 (bypasses SQL Browser UDP 1434 completely)
    candidates.push({ server: '127.0.0.1', port: 1433 });
    candidates.push({ server: 'localhost', port: 1433 });

    // Candidate 3: Named instance on 1433
    if (instance) {
        candidates.push({ server: '127.0.0.1', port: 1433, options: { instanceName: instance } });
    }

    // Candidate 4: Common instance fallbacks
    candidates.push({ server: '127.0.0.1', options: { instanceName: 'SQLEXPRESS' } });
    candidates.push({ server: '127.0.0.1', options: { instanceName: 'CMBCSQL' } });

    // Deduplicate
    const seen = new Set();
    return candidates.filter(c => {
        const key = `${c.server}:${c.port || ''}:${c.options?.instanceName || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

let pool = null;
let poolPromise = null;

async function getPool(overrides = {}) {
    const isCustomDb = Boolean(overrides && overrides.database);
    if (!isCustomDb && pool && pool.connected) {
        return pool;
    }
    if (!isCustomDb && poolPromise) {
        return poolPromise;
    }

    loadDotEnv(true);

    const targetDb = overrides.database || process.env.DB_NAME || 'CashManagement';

    const baseConfig = {
        database: targetDb,
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
        connectionTimeout: 10000,
        requestTimeout: 30000
    };

    const candidates = workingCandidate
        ? [workingCandidate, ...parseServerCandidates(process.env.DB_SERVER, process.env.DB_PORT)]
        : parseServerCandidates(process.env.DB_SERVER, process.env.DB_PORT);

    let lastErr = null;
    for (const cand of candidates) {
        const testCfg = {
            ...baseConfig,
            server: cand.server,
            port: cand.port,
            options: {
                ...baseConfig.options,
                ...(cand.options || {})
            }
        };

        try {
            const pending = new sql.ConnectionPool(testCfg).connect();
            if (!isCustomDb) poolPromise = pending;
            const connectedPool = await pending;
            if (!isCustomDb) {
                pool = connectedPool;
                poolPromise = null;
            }
            workingCandidate = cand;
            const instStr = cand.options?.instanceName ? `\\${cand.options.instanceName}` : '';
            const portStr = cand.port ? `:${cand.port}` : '';
            console.log(`✅ SQL Server se connected (${cand.server}${instStr}${portStr}) [DB: ${targetDb}]!`);
            return connectedPool;
        } catch (err) {
            if (!isCustomDb) {
                poolPromise = null;
                pool = null;
            }
            lastErr = err;

            // Self-Healing: Error 4060 (Database does not exist on this SQL Server)
            if (targetDb !== 'master' && err.message && (err.message.includes('Cannot open database') || err.number === 4060)) {
                console.warn(`⚠️ Database "${targetDb}" nahi mila. Master connection se auto-create kar rahe hain...`);
                try {
                    const masterCfg = { ...testCfg, database: 'master' };
                    const mPool = await new sql.ConnectionPool(masterCfg).connect();
                    await mPool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${String(targetDb).replace(/'/g, "''")}') CREATE DATABASE [${String(targetDb).replace(/\]/g, ']]')}]`);
                    await mPool.close();
                    console.log(`✅ Database "${targetDb}" successfully create ho gaya! Reconnecting...`);
                    const reconnected = await new sql.ConnectionPool(testCfg).connect();
                    if (!isCustomDb) pool = reconnected;
                    workingCandidate = cand;
                    console.log('✅ SQL Server se connected!');
                    return reconnected;
                } catch (createErr) {
                    console.error('❌ Master se database create nahi ho paya:', createErr.message);
                }
            }
        }
    }

    console.error(`❌ SQL Server connection error for DB "${targetDb}":`, lastErr?.message);
    throw lastErr || new Error(`SQL Server se connect nahi ho paya [DB: ${targetDb}]`);
}

async function getMasterPool() {
    return getPool({ database: 'master' });
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

module.exports = { getPool, getMasterPool, isDbAlive, query, withTransaction, closePool, sql };

