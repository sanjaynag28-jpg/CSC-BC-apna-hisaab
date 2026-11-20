const { query, withTransaction } = require('./db');
const { resolveModule, upsertModule } = require('./moduleRegistry');
const moment = require('moment');

const MODULE_PREFIXES = {
    CSC: 'CSC',
    BC: 'BC',
    Cashbook: 'CB',
    Khata: 'KH',
    Invoices: 'INV',
    Bills: 'BIL',
    BillPay: 'BP',
    Service: 'SRV'
};

const MODULE_TABLES = {
    CSC: { table: 'CSCApplications', pk: 'AppID' },
    BC: { table: 'BCTransactions', pk: 'BCID' },
    Cashbook: { table: 'Transactions', pk: 'TransactionID' },
    Khata: { table: 'KhataEntries', pk: 'KhataID' },
    Invoices: { table: 'Invoices', pk: 'InvoiceID' },
    Bills: { table: 'Bills', pk: 'BillID' },
    BillPay: { table: 'BillPayments', pk: 'PaymentID' },
    Service: { table: 'ServiceRecords', pk: 'RecordID' }
};

/**
 * Register a newly created transaction into UniversalTxnRegistry and update source table.
 * @param {Object} txn
 * @param {string} txn.sourceModule - 'CSC', 'BC', 'Cashbook', 'Khata', 'Invoices', 'Bills'
 * @param {number} txn.recordId - Primary key in source table
 * @param {string} txn.entityName - Customer name or description
 * @param {number} txn.amount - Transaction amount
 * @param {Date|string} txn.transDate - Transaction date (YYYY-MM-DD)
 * @param {Date|string} [txn.createdAt] - Creation timestamp
 * @param {number} [txn.userId] - User ID
 */
async function registerGlobalTransaction({ sourceModule, recordId, entityName, amount, transDate, createdAt, userId }, executor = null) {
    if (!sourceModule || !recordId) {
        throw new Error('sourceModule and recordId are required to register global transaction.');
    }

    const q = (typeof executor === 'function') ? executor : query;

    // DB-driven module config (TxnModules); hardcoded maps sirf fallback hain.
    const modConfig = await resolveModule(sourceModule);
    const prefix = (modConfig && modConfig.prefix) || MODULE_PREFIXES[sourceModule] || sourceModule.substring(0, 4).toUpperCase();
    const cleanDate = transDate ? new Date(transDate) : new Date();
    // Use local string format if createdAt explicitly provided, else use SQL Server GETDATE()
    const cleanCreated = createdAt ? moment(createdAt).format('YYYY-MM-DD HH:mm:ss') : null;
    const createdAtSql = cleanCreated ? '@cleanCreated' : 'GETDATE()';
    const cleanAmount = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
    const cleanEntity = (entityName || '').toString().substring(0, 150);
    const cleanUser = userId || 1;

    const executeOperation = async (tQ) => {
        const queryParams = {
            sourceModule,
            recordId,
            prefix,
            cleanEntity,
            cleanAmount,
            cleanDate,
            cleanUser
        };
        if (cleanCreated) {
            queryParams.cleanCreated = cleanCreated;
        }

        // Atomic serial allocation using UPDLOCK & HOLDLOCK to eliminate race condition
        const insertRes = await tQ(`
            DECLARE @nextMod INT;
            SELECT @nextMod = ISNULL(MAX(ModuleSerialNo), 0) + 1 
            FROM UniversalTxnRegistry WITH (UPDLOCK, HOLDLOCK) 
            WHERE SourceModule = @sourceModule;

            DECLARE @moduleCode VARCHAR(30) = @prefix + '-' + CAST(@nextMod AS VARCHAR(20));

            INSERT INTO UniversalTxnRegistry (
                SourceModule, RecordID, ModuleSerialNo, ModuleCode, 
                EntityName, Amount, TransDate, CreatedAt, UserID, IsActive
            )
            OUTPUT INSERTED.GlobalSerialNo, INSERTED.SNCode, INSERTED.ModuleCode
            VALUES (
                @sourceModule, @recordId, @nextMod, @moduleCode,
                @cleanEntity, @cleanAmount, @cleanDate, ${createdAtSql}, @cleanUser, 1
            );
        `, queryParams);

        const inserted = insertRes.recordset[0];
        const { GlobalSerialNo, SNCode, ModuleCode } = inserted;

        // Update source table (if dedicated table configured or dynamic ServiceRecords)
        const targetTable = (modConfig && modConfig.table) ? modConfig.table : (MODULE_TABLES[sourceModule]?.table || 'ServiceRecords');
        const pkCol = (modConfig && modConfig.pk) ? modConfig.pk : (MODULE_TABLES[sourceModule]?.pk || 'RecordID');

        if (targetTable && pkCol) {
            try {
                const serialCol = (targetTable === 'ServiceRecords') ? 'DocCode = @ModuleCode, ModuleCodeSerial = @ModuleCode' : 'ModuleCode = @ModuleCode';
                await tQ(`
                    UPDATE ${targetTable} 
                    SET GlobalSerialNo = @GlobalSerialNo, SNCode = @SNCode, ${serialCol}
                    WHERE ${pkCol} = @recordId
                `, {
                    GlobalSerialNo,
                    SNCode,
                    ModuleCode,
                    recordId
                });
            } catch (updErr) {
                console.warn(`Registry update source table warning for ${sourceModule} #${recordId}:`, updErr.message);
            }
        }

        return {
            globalSerialNo: GlobalSerialNo,
            snCode: SNCode,
            moduleCode: ModuleCode
        };
    };

    if (typeof executor === 'function') {
        return await executeOperation(executor);
    } else {
        return await withTransaction(async (tQuery) => {
            return await executeOperation(tQuery);
        });
    }
}

/**
 * Fast lookup transaction by Serial Number, SNCode, or ModuleCode
 * Examples: '45', 'SN-45', 'sn 45', 'CSC-12', 'BC-5', 'KH-33'
 */
async function lookupBySN(queryText, userId = null) {
    if (!queryText || typeof queryText !== 'string') return null;
    const q = queryText.trim().toUpperCase();

    let sqlWhere = '';
    let params = {};

    // Pure number (e.g. "45")
    if (/^\d+$/.test(q)) {
        const num = parseInt(q, 10);
        sqlWhere = 'GlobalSerialNo = @num OR SNCode = @snCode';
        params = { num, snCode: `SN-${num}` };
    }
    // "SN-45", "SN 45", or "SN45"
    else if (/^SN[-\s]?(\d+)$/i.test(q)) {
        const m = q.match(/^SN[-\s]?(\d+)$/i);
        const num = parseInt(m[1], 10);
        sqlWhere = 'SNCode = @snCode OR GlobalSerialNo = @num';
        params = { snCode: `SN-${num}`, num };
    }
    // Module code (e.g. "CSC-10", "CSC 10", "CSC10", "BC-5", "CB-1", "KH-20", "INV-1", "INSUR-7")
    // Prefix 2-10 alphanumeric: dynamic modules ke lambe prefixes bhi support hain.
    else if (/^([A-Z][A-Z0-9]{1,9})[-\s]?(\d+)$/i.test(q)) {
        const cleanMod = q.replace(/^([A-Z][A-Z0-9]{1,9})[-\s]?(\d+)$/i, '$1-$2').toUpperCase();
        sqlWhere = 'ModuleCode = @cleanMod';
        params = { cleanMod };
    } else {
        return null;
    }

    const res = await query(`
        SELECT TOP 1 
            GlobalSerialNo, SNCode, ModuleCode, SourceModule, RecordID,
            EntityName, Amount, TransDate, CreatedAt, UserID, IsActive
        FROM UniversalTxnRegistry
        WHERE (${sqlWhere}) AND IsActive = 1
        ${userId ? 'AND UserID = @userId' : ''}
    `, userId ? { ...params, userId } : params);

    if (!res.recordset || res.recordset.length === 0) return null;

    const row = res.recordset[0];
    const modConfig = await resolveModule(row.SourceModule);
    const targetTable = (modConfig && modConfig.table) ? modConfig.table : (MODULE_TABLES[row.SourceModule]?.table || 'ServiceRecords');
    const pkCol = (modConfig && modConfig.pk) ? modConfig.pk : (MODULE_TABLES[row.SourceModule]?.pk || 'RecordID');

    // Fetch full details from source table (user-scoped — cross-tenant leak na ho)
    let details = null;
    if (targetTable && pkCol) {
        const detUserId = userId || row.UserID;
        const detRes = await query(
            `SELECT * FROM ${targetTable} WHERE ${pkCol} = @id${detUserId ? ' AND UserID = @userId' : ''}`,
            detUserId ? { id: row.RecordID, userId: detUserId } : { id: row.RecordID }
        );
        details = detRes.recordset[0] || null;
    }

    return {
        ...row,
        details
    };
}

/**
 * Deactivate registry entry when a transaction is deleted / cancelled
 */
async function deactivateGlobalTransaction(sourceModule, recordId, executor = null) {
    let mod = sourceModule;
    let recId = recordId;
    let exec = executor;

    if (typeof sourceModule === 'object' && sourceModule !== null) {
        mod = sourceModule.sourceModule || sourceModule.module;
        recId = sourceModule.recordId || sourceModule.id;
        if (typeof recordId === 'function') exec = recordId;
    }

    const q = (typeof exec === 'function') ? exec : query;
    await q(`
        UPDATE UniversalTxnRegistry 
        SET IsActive = 0 
        WHERE SourceModule = @sourceModule AND RecordID = @recordId
    `, { sourceModule: mod, recordId: recId });
}

/**
 * Update registry entry when a transaction is edited
 */
async function updateGlobalTransaction({ sourceModule, recordId, entityName, amount, transDate }, executor = null) {
    const q = (typeof executor === 'function') ? executor : query;
    try {
        await q(`
            UPDATE UniversalTxnRegistry 
            SET EntityName = @cleanEntity, 
                Amount = @cleanAmount, 
                TransDate = @cleanDate 
            WHERE SourceModule = @sourceModule AND RecordID = @recordId
        `, {
            sourceModule,
            recordId,
            cleanEntity: (entityName || '').toString().substring(0, 150),
            cleanAmount: typeof amount === 'number' ? amount : (parseFloat(amount) || 0),
            cleanDate: transDate ? new Date(transDate) : new Date()
        });
    } catch (err) {
        console.error('Failed to update UniversalTxnRegistry:', err);
    }
}

/**
 * Dynamically register a new module or service so UniversalTxnRegistry can track it.
 * @param {string} sourceModule - Module name (e.g. 'Insurance', 'FASTag')
 * @param {Object} [config]
 * @param {string} [config.prefix] - Short code (e.g. 'INS', 'FTG')
 * @param {string} [config.table] - Table name (e.g. 'InsurancePolicies')
 * @param {string} [config.pk] - Primary key column (e.g. 'PolicyID')
 */
async function registerModuleConfig(sourceModule, config = {}) {
    if (!sourceModule || typeof sourceModule !== 'string') return null;

    const prefix = config.prefix || sourceModule.substring(0, 4).toUpperCase();
    const table = config.table || null;
    const pk = config.pk || null;

    // In-memory fallback sync (DB down hone par bhi kaam aaye)
    MODULE_PREFIXES[sourceModule] = prefix;
    if (table && pk) MODULE_TABLES[sourceModule] = { table, pk };

    try {
        // Single source of truth: TxnModules table
        return await upsertModule({
            moduleCode: sourceModule,
            moduleName: config.name || sourceModule,
            prefix,
            targetTable: table,
            primaryKeyColumn: pk,
            isCore: !!config.isCore,
            displayOrder: config.displayOrder || 100
        });
    } catch (err) {
        console.warn(`registerModuleConfig(${sourceModule}) DB sync warning:`, err.message);
        return null;
    }
}

module.exports = {
    registerGlobalTransaction,
    updateGlobalTransaction,
    lookupBySN,
    deactivateGlobalTransaction,
    registerModuleConfig,
    MODULE_PREFIXES,
    MODULE_TABLES
};
