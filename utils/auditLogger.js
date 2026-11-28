const { query } = require('../database/db');
const { getCurrentActor } = require('./requestContext');

/**
 * Universal Audit Logger for Cash Management BC
 * Har ek action (Add, Update, Delete) ki poori detail AuditLogs table me save karta hai.
 * Safe design: Kabhi bhi application flow ko throw karke break nahi karta.
 */

// Ye fields kabhi audit log me plain text me nahi jaane chahiye
const PII_FIELDS = [
    'AadhaarNumber', 'Aadhaar', 'CustomerAadhaar', 'DateOfBirth', 'DOB',
    'Password', 'PasswordHash', 'OTP', 'Otp', 'CardNumber', 'CVV', 'AccountNumber'
];

function redactValue(value) {
    if (value === null || value === undefined) return value;
    const str = String(value);
    if (!str) return value;
    if (/^\d{12}$/.test(str.replace(/\s/g, ''))) {
        return 'XXXX-XXXX-' + str.replace(/\s/g, '').slice(-4);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return 'REDACTED';
    return value;
}

function redactObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactObject);
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (PII_FIELDS.some(p => p.toLowerCase() === key.toLowerCase())) {
            out[key] = redactValue(value);
        } else if (value && typeof value === 'object') {
            out[key] = redactObject(value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

function serialize(data) {
    if (!data) return null;
    if (typeof data === 'string') return data.substring(0, 8000);
    try {
        return JSON.stringify(redactObject(data)).substring(0, 8000);
    } catch (e) {
        return null;
    }
}

async function logAudit({
    userId = 1,
    action = 'ACTION',
    module = 'General',
    tableName = 'General',
    recordId = null,
    entityName = null,
    amount = null,
    description = null,
    oldData = null,
    newData = null,
    details = null,
    tQuery = null
}) {
    try {
        // Audit row business transaction se INDEPENDENT likhi jaati hai, taaki:
        // 1) Audit insert fail hone se paisa wala transaction rollback na ho
        // 2) Audit trail me "kya hua" ka record bacha rahe
        // (AuditLogs row pe koi lock nahi hoti, isliye deadlock ka risk nahi)
        const queryRunner = tQuery || query;

        const safeOldData = serialize(oldData);
        const safeNewData = serialize(newData);

        const safeAmount = (amount !== null && amount !== undefined && !isNaN(parseFloat(amount)))
            ? parseFloat(amount)
            : null;

        const safeRecordId = (recordId !== null && recordId !== undefined && !isNaN(parseInt(recordId)))
            ? parseInt(recordId)
            : null;

        const safeDesc = description ? String(description).substring(0, 500) : null;
        const safeEntity = entityName ? String(entityName).substring(0, 255) : null;
        const safeDetails = details ? String(details).substring(0, 4000) : (safeDesc || `${action} on ${tableName}`);
        const actor = getCurrentActor();
        const actorUserId = actor?.actorUserId || userId || 1;
        const actorName = actor?.actorName || null;

        await queryRunner(`
            INSERT INTO AuditLogs (
                UserID, Action, TableName, RecordID, Module, Description, EntityName, Amount, OldData, NewData, Details, CreatedAt, CreatedByUserID, CreatedByName
            )
            VALUES (
                @userId, @action, @tableName, @recordId, @module, @description, @entityName, @amount, @oldData, @newData, @details, GETDATE(), @actorUserId, @actorName
            )
        `, {
            userId: actor?.shopUserId || userId || 1,
            action: String(action).toUpperCase().substring(0, 50),
            tableName: String(tableName).substring(0, 50),
            recordId: safeRecordId,
            module: String(module).substring(0, 50),
            description: safeDesc,
            entityName: safeEntity,
            amount: safeAmount,
            oldData: safeOldData,
            newData: safeNewData,
            details: safeDetails,
            actorUserId,
            actorName
        });
    } catch (err) {
        console.error('🚨 [AuditLogger] Failed to write audit log:', err.message);
    }
}

module.exports = {
    logAudit,
    redactObject
};
