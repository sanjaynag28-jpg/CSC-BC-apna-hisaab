/**
 * database/moduleRegistry.js
 * ---------------------------------------------------------------------------
 * Single source of truth for dynamic module metadata.
 *
 * Pehle module prefix/table map code me hardcoded tha (globalTxnRegistry.js).
 * Ab yeh TxnModules table se aata hai, isliye naya module add karne ke liye
 * sirf ek row insert karna kaafi hai — code change nahi.
 *
 * Safety:
 *   - TxnModules table missing ho ya DB down ho to FALLBACK_MODULES use hota hai.
 *   - Result 60 second cache hota hai; module add karne par clearModuleCache().
 *   - Kabhi kuch delete/update nahi karta (read + upsert only).
 */

const { query } = require('./db');

// Built-in fallback: agar TxnModules available na ho to bhi app chalta rahe.
const FALLBACK_MODULES = {
    CSC: { moduleCode: 'CSC', prefix: 'CSC', table: 'CSCApplications', pk: 'AppID', isCore: true, isActive: true },
    BC: { moduleCode: 'BC', prefix: 'BC', table: 'BCTransactions', pk: 'BCID', isCore: true, isActive: true },
    BillPay: { moduleCode: 'BillPay', prefix: 'BP', table: 'BillPayments', pk: 'PaymentID', isCore: true, isActive: true },
    Invoices: { moduleCode: 'Invoices', prefix: 'INV', table: 'Invoices', pk: 'InvoiceID', isCore: true, isActive: true },
    Khata: { moduleCode: 'Khata', prefix: 'KH', table: 'KhataEntries', pk: 'KhataID', isCore: true, isActive: true },
    Cashbook: { moduleCode: 'Cashbook', prefix: 'CB', table: 'Transactions', pk: 'TransactionID', isCore: true, isActive: true },
    Bills: { moduleCode: 'Bills', prefix: 'BIL', table: 'Bills', pk: 'BillID', isCore: true, isActive: true },
    Service: { moduleCode: 'Service', prefix: 'SRV', table: 'ServiceRecords', pk: 'RecordID', isCore: false, isActive: true }
};

const CACHE_TTL_MS = 60 * 1000;
let cache = { loadedAt: 0, map: null };

function normalizeRow(row) {
    const table = row.RecordTable || row.TargetTable || 'ServiceRecords';
    const pk = row.PrimaryKeyColumn || (table === 'ServiceRecords' ? 'RecordID' : 'RecordID');
    const prefix = String(row.DocPrefix || row.Prefix || '').trim() || String(row.ModuleCode || 'MOD').substring(0, 4).toUpperCase();
    return {
        moduleCode: String(row.ModuleCode || '').trim(),
        moduleName: row.ModuleName || row.ModuleCode,
        prefix,
        table,
        pk,
        isCore: row.IsCore === undefined ? false : !!row.IsCore,
        isActive: row.IsActive === undefined ? true : !!row.IsActive,
        displayOrder: row.SortOrder !== undefined && row.SortOrder !== null ? row.SortOrder : (row.DisplayOrder || 0)
    };
}

function buildFallbackMap() {
    const map = {};
    for (const key of Object.keys(FALLBACK_MODULES)) map[key] = { ...FALLBACK_MODULES[key] };
    return map;
}

/**
 * TxnModules ko load karo (cached). DB error par fallback map.
 */
async function loadModules(force = false) {
    const now = Date.now();
    if (!force && cache.map && (now - cache.loadedAt) < CACHE_TTL_MS) {
        return cache.map;
    }
    try {
        const res = await query(`
            SELECT ModuleCode, ModuleName, Prefix, TargetTable, PrimaryKeyColumn,
                   IsCore, IsActive, DisplayOrder, DocPrefix, RecordTable, SortOrder
            FROM dbo.TxnModules
        `);
        const map = buildFallbackMap();
        for (const row of res.recordset || []) {
            const norm = normalizeRow(row);
            if (!norm.moduleCode) continue;
            // DB row fallback ko override karta hai (lekin purane fallback keys bache rehte hain)
            map[norm.moduleCode] = { ...(map[norm.moduleCode] || {}), ...norm };
        }
        cache = { loadedAt: now, map };
        return map;
    } catch (err) {
        // Table missing (fresh DB) ya DB down — app ko nahi todna
        if (cache.map) return cache.map;
        cache = { loadedAt: now, map: buildFallbackMap() };
        return cache.map;
    }
}

/**
 * Ek module ka config do. Unknown module ke liye synthetic entry (prefix auto)
 * return hoti hai taaki naya module bina row ke bhi crash na kare.
 */
async function resolveModule(moduleCode) {
    if (!moduleCode) return null;
    const map = await loadModules();
    if (map[moduleCode]) return map[moduleCode];

    // Unknown: case-insensitive match try karo
    const lower = String(moduleCode).toLowerCase();
    const found = Object.keys(map).find(k => k.toLowerCase() === lower);
    if (found) return map[found];

    return {
        moduleCode,
        moduleName: moduleCode,
        prefix: String(moduleCode).replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase() || 'MOD',
        table: 'ServiceRecords',
        pk: 'RecordID',
        isCore: false,
        isActive: true,
        displayOrder: 999
    };
}

/**
 * Saare modules ki list (admin UI / dropdowns ke liye).
 */
async function listModules({ includeInactive = false } = {}) {
    const map = await loadModules(true);
    return Object.values(map)
        .filter(m => includeInactive || m.isActive !== false)
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || String(a.moduleCode).localeCompare(String(b.moduleCode)));
}

/**
 * Naya module register karo (idempotent). Yehi "naya service/module" ka entry point hai.
 */
async function upsertModule({
    moduleCode, moduleName, prefix, targetTable = null,
    primaryKeyColumn = null, isCore = false, displayOrder = 100
}) {
    if (!moduleCode || !moduleName || !prefix) {
        throw new Error('moduleCode, moduleName aur prefix zaroori hain');
    }
    const cleanPrefix = String(prefix).trim().toUpperCase();
    const table = targetTable || 'ServiceRecords';
    const pk = primaryKeyColumn || 'RecordID';
    await query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.TxnModules WHERE ModuleCode = @code)
        BEGIN
            INSERT INTO dbo.TxnModules
                (ModuleCode, ModuleName, Prefix, DocPrefix, TargetTable, RecordTable, PrimaryKeyColumn, IsCore, IsActive, DisplayOrder, SortOrder, UserID)
            VALUES
                (@code, @name, @prefix, @prefix, @table, @table, @pk, @isCore, 1, @order, @order, 1);
        END
        ELSE
        BEGIN
            UPDATE dbo.TxnModules
            SET ModuleName = @name,
                Prefix = @prefix,
                DocPrefix = @prefix,
                TargetTable = @table,
                RecordTable = @table,
                PrimaryKeyColumn = @pk,
                DisplayOrder = @order,
                SortOrder = @order,
                UpdatedAt = GETDATE()
            WHERE ModuleCode = @code;
        END
    `, {
        code: moduleCode,
        name: moduleName,
        prefix: cleanPrefix,
        table,
        pk,
        isCore: isCore ? 1 : 0,
        order: displayOrder
    });
    clearModuleCache();
    return await resolveModule(moduleCode);
}

function clearModuleCache() {
    cache = { loadedAt: 0, map: null };
}

module.exports = {
    FALLBACK_MODULES,
    loadModules,
    resolveModule,
    listModules,
    upsertModule,
    clearModuleCache
};
