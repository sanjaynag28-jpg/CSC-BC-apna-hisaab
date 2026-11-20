const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});
const { query, withTransaction } = require('../database/db');
const { exportCustomersToExcel, getCustomersTemplateExcel, importCustomersFromExcel } = require('./excel_manager');
const { logAudit } = require('../utils/auditLogger');
const { clampInt, escapeLike } = require('../utils/helpers');
const { resolveOrCreateCustomer } = require('../database/customerAutoRegister');
const { registerGlobalTransaction } = require('../database/globalTxnRegistry');

// Helper to normalize phone number (digits only, last 10 digits)
function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.toString().replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

// Helper to normalize 12-digit Aadhaar number
function normalizeAadhaar(aadhaar) {
    if (!aadhaar) return null;
    const digits = aadhaar.toString().replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
}

// --------------------------------------------------------------------------
// 0. CHECK AADHAAR NUMBER & PREVENT DUPLICATES INSTANTLY
// --------------------------------------------------------------------------
router.get('/check-aadhaar', async (req, res) => {
    try {
        const { aadhaar, excludeId } = req.query;
        const cleanAadhaar = normalizeAadhaar(aadhaar);

        if (!cleanAadhaar) {
            return res.json({ success: true, exists: false });
        }

        if (cleanAadhaar.length !== 12) {
            return res.json({
                success: true,
                exists: false,
                invalidLength: true,
                length: cleanAadhaar.length,
                message: `Aadhaar theek 12 anko ka hona chahiye (abhi ${cleanAadhaar.length} ank hain)`
            });
        }

        const userId = req.user?.UserID || 1;
        let sql = `
            SELECT c.CustomerID, c.CustomerName, c.Phone, c.AadhaarNumber, c.DateOfBirth, c.Address, c.Email, c.FamilyName, c.Relationship, c.IsFamilyHead
            FROM Customers c
            WHERE c.IsActive = 1 AND c.UserID = @userId AND (c.AadhaarNumber = @aadhaar OR REPLACE(REPLACE(c.AadhaarNumber, ' ', ''), '-', '') = @aadhaar)
        `;
        let params = { aadhaar: cleanAadhaar, userId };

        if (excludeId) {
            sql += ` AND c.CustomerID != @excludeId`;
            params.excludeId = parseInt(excludeId);
        }

        const result = await query(sql, params);
        if (result.recordset.length > 0) {
            const existing = result.recordset[0];
            return res.json({
                success: true,
                exists: true,
                cleanAadhaar,
                customer: existing,
                message: `⚠️ Duplicate Aadhaar Alert: Yeh 12-digit Aadhaar number pehle se '${existing.CustomerName}' (Phone: ${existing.Phone || 'N/A'}) ke sath registered hai! Ek Aadhaar number kisi doosre customer name ke sath multiple use nahi ho sakta.`
            });
        }

        res.json({
            success: true,
            exists: false,
            cleanAadhaar,
            message: '✅ Aadhaar number upalabdh hai (Unique & Valid)'
        });
    } catch (err) {
        console.error('Error checking customer aadhaar:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 0.5 LIVE AUTO-REGISTER OR RESOLVE CUSTOMER FROM FORM
// --------------------------------------------------------------------------
router.post('/auto-register', async (req, res) => {
    try {
        const { CustomerName, Phone, AadhaarNumber, DateOfBirth, CustomerID, source } = req.body;

        if (!CustomerName || CustomerName.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Customer Name likhna zaroori hai (kam se kam 2 akshar).' });
        }

        const result = await resolveOrCreateCustomer({
            customerId: CustomerID ? parseInt(CustomerID) : null,
            customerName: CustomerName,
            customerPhone: Phone,
            customerAadhaar: AadhaarNumber,
            dob: DateOfBirth || null,
            source: source || 'Form Live Auto-Register',
            userId: req.user?.UserID || 1
        });

        if (!result.customerId) {
            return res.json({ success: false, error: 'Customer register nahi ho paya' });
        }

        res.json({
            success: true,
            isNew: result.isNew,
            customerId: result.customerId,
            customer: result.customer
        });
    } catch (err) {
        console.error('Error in auto-register route:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 1. CHECK PHONE NUMBER & DETECT FAMILY / DUPLICATES INSTANTLY
// --------------------------------------------------------------------------
router.get('/check-phone', async (req, res) => {
    try {
        const { phone, excludeId, name } = req.query;
        const cleanPhone = normalizePhone(phone);

        if (!cleanPhone || cleanPhone.length < 10) {
            return res.json({ success: true, exists: false, members: [] });
        }

        const userId = req.user?.UserID || 1;
        let sql = `
            SELECT c.CustomerID, c.CustomerName, c.Phone, c.AadhaarNumber, c.DateOfBirth, c.Address, c.Email, c.Relationship,
                   c.IsFamilyHead, c.FamilyID, c.FamilyName, c.KhataMode, c.CurrentBalance,
                   c.ParentCustomerID
            FROM Customers c
            WHERE c.IsActive = 1 AND c.UserID = @userId AND (c.Phone LIKE @phonePattern OR c.Phone = @exactPhone)
        `;
        let params = {
            phonePattern: `%${cleanPhone}%`,
            exactPhone: cleanPhone,
            userId
        };

        if (excludeId) {
            sql += ` AND c.CustomerID != @excludeId`;
            params.excludeId = parseInt(excludeId);
        }

        const result = await query(sql, params);
        const members = result.recordset;

        if (members.length === 0) {
            return res.json({
                success: true,
                exists: false,
                cleanPhone: cleanPhone,
                members: []
            });
        }

        // Check if an exact duplicate exists (same name & phone)
        let exactDuplicate = null;
        if (name && name.trim()) {
            const cleanName = name.trim().toLowerCase();
            exactDuplicate = members.find(m => m.CustomerName.trim().toLowerCase() === cleanName) || null;
        }

        // Find Family Head (or oldest customer with this phone)
        const familyHead = members.find(m => m.IsFamilyHead) || members[0];

        res.json({
            success: true,
            exists: true,
            cleanPhone: cleanPhone,
            count: members.length,
            isExactDuplicate: !!exactDuplicate,
            duplicateMember: exactDuplicate,
            familyHead: familyHead,
            familyId: familyHead ? familyHead.FamilyID : null,
            familyName: familyHead ? (familyHead.FamilyName || `${familyHead.CustomerName} Parivar`) : 'Family',
            members: members
        });
    } catch (err) {
        console.error('Error checking customer phone:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 2. GET FULL FAMILY TREE / HOUSEHOLD DETAILS BY CUSTOMER OR FAMILY ID
// --------------------------------------------------------------------------
router.get('/family/:id', async (req, res) => {
    try {
        const custId = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;

        // Find the customer (active pehle dekhein; agar recycle bin/inactive hai to fallback dekhein taaki family view na toote)
        let custRes = await query(`SELECT * FROM Customers WHERE CustomerID = @id AND UserID = @userId AND IsActive = 1`, { id: custId, userId });
        if (custRes.recordset.length === 0) {
            custRes = await query(`SELECT * FROM Customers WHERE CustomerID = @id AND UserID = @userId`, { id: custId, userId });
            if (custRes.recordset.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer nahi mila' });
            }
        }

        const targetCust = custRes.recordset[0];
        const targetFamilyId = targetCust.FamilyID || targetCust.CustomerID;

        // Fetch all family members belonging to this FamilyID (or linked to this customer)
        const membersRes = await query(`
            SELECT c.*,
                   p.CustomerName as ParentCustomerName,
                   (SELECT COUNT(*) FROM Invoices i WHERE i.CustomerID = c.CustomerID AND i.Status != 'Cancelled') AS TotalBills,
                   (SELECT COUNT(*) FROM KhataEntries k WHERE k.CustomerID = c.CustomerID) AS TotalKhataEntries
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            WHERE (c.IsActive = 1 OR c.CustomerID = @id) AND c.UserID = @userId
              AND (c.FamilyID = @famId OR c.CustomerID = @famId OR c.ParentCustomerID = @famId)
            ORDER BY c.IsFamilyHead DESC, c.CustomerID ASC
        `, { famId: targetFamilyId, id: custId, userId });

        const members = membersRes.recordset;
        const head = members.find(m => m.IsFamilyHead && m.IsActive) || members.find(m => m.IsFamilyHead) || members.find(m => m.IsActive) || members[0] || targetCust;

        // Calculate family-wide totals
        const totalToReceive = members.reduce((sum, m) => sum + (m.CurrentBalance > 0 ? parseFloat(m.CurrentBalance) : 0), 0);
        const totalToPay = members.reduce((sum, m) => sum + (m.CurrentBalance < 0 ? Math.abs(parseFloat(m.CurrentBalance)) : 0), 0);
        const netFamilyBalance = totalToReceive - totalToPay;

        res.json({
            success: true,
            data: {
                familyId: targetFamilyId,
                familyName: head ? (head.FamilyName || `${head.CustomerName} Parivar`) : `${targetCust.CustomerName} Parivar`,
                sharedPhone: head ? head.Phone : targetCust.Phone,
                head: head,
                membersCount: members.length,
                members: members,
                summary: {
                    totalToReceive,
                    totalToPay,
                    netFamilyBalance
                }
            }
        });
    } catch (err) {
        console.error('Error fetching family details:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 2.1 CHANGE FAMILY HEAD (MUKHIYA BADALEIN) - 100% SAFE, ZERO DATA LOSS
// --------------------------------------------------------------------------
router.post('/family/change-head', async (req, res) => {
    try {
        const { currentHeadId, newHeadId, oldHeadRelationship } = req.body;
        const userId = req.user?.UserID || 1;
        if (!currentHeadId || !newHeadId) {
            return res.status(400).json({ success: false, error: 'currentHeadId aur newHeadId dono zaroori hain' });
        }

        const cId = parseInt(currentHeadId);
        const nId = parseInt(newHeadId);
        if (cId === nId) {
            return res.status(400).json({ success: false, error: 'Current Mukhiya aur Naya Mukhiya same nahi ho sakte' });
        }

        const checkRes = await query(`
            SELECT CustomerID, CustomerName, Phone, FamilyID, IsFamilyHead, Relationship, FamilyName
            FROM Customers
            WHERE CustomerID IN (@cId, @nId) AND UserID = @userId AND IsActive = 1
        `, { cId, nId, userId });

        if (checkRes.recordset.length < 2) {
            return res.status(404).json({ success: false, error: 'Dono customer database me nahi mile' });
        }

        const oldHead = checkRes.recordset.find(c => c.CustomerID === cId);
        const newHead = checkRes.recordset.find(c => c.CustomerID === nId);

        if (!oldHead || !newHead) {
            return res.status(400).json({ success: false, error: 'Customer data verify nahi ho paya' });
        }

        const familyId = oldHead.FamilyID || oldHead.CustomerID;
        const newFamilyName = `${newHead.CustomerName} Parivar`;
        const oldHeadRel = (oldHeadRelationship && oldHeadRelationship.trim()) ? oldHeadRelationship.trim() : 'Mata (Mother)';

        await withTransaction(async (tQuery) => {
            // A. Make newHead the Mukhiya
            await tQuery(`
                UPDATE Customers SET
                    IsFamilyHead = 1,
                    ParentCustomerID = NULL,
                    FamilyID = @newHeadId,
                    FamilyName = @newFamilyName,
                    Relationship = 'Mukhiya (Self)',
                    UpdatedAt = GETDATE()
                WHERE CustomerID = @newHeadId AND UserID = @userId
            `, { newHeadId: nId, newFamilyName, userId });

            // B. Make oldHead a member linked to newHead
            await tQuery(`
                UPDATE Customers SET
                    IsFamilyHead = 0,
                    ParentCustomerID = @newHeadId,
                    FamilyID = @newHeadId,
                    FamilyName = @newFamilyName,
                    Relationship = @oldHeadRel,
                    UpdatedAt = GETDATE()
                WHERE CustomerID = @oldHeadId AND UserID = @userId
            `, { newHeadId: nId, oldHeadId: cId, oldHeadRel, newFamilyName, userId });

            // C. Point all other members of this family to newHead
            await tQuery(`
                UPDATE Customers SET
                    ParentCustomerID = @newHeadId,
                    FamilyID = @newHeadId,
                    FamilyName = @newFamilyName,
                    UpdatedAt = GETDATE()
                WHERE (FamilyID = @familyId OR ParentCustomerID = @oldHeadId)
                  AND CustomerID NOT IN (@oldHeadId, @newHeadId)
                  AND UserID = @userId
            `, { newHeadId: nId, oldHeadId: cId, familyId, newFamilyName, userId });

            await logAudit({
                action: 'UPDATE',
                module: 'Customers',
                tableName: 'Customers',
                recordId: nId,
                entityName: `${newHead.CustomerName} (${newFamilyName})`,
                description: `Mukhiya Badla Gaya: '${newHead.CustomerName}' naye Mukhiya bane, '${oldHead.CustomerName}' sadasya bane`,
                oldData: { OldHead: oldHead, NewHead: newHead },
                newData: { NewHeadID: nId, OldHeadID: cId, FamilyName: newFamilyName, OldHeadRelationship: oldHeadRel },
                details: `Purane Mukhiya: ${oldHead.CustomerName} (#${cId}) -> Naye Mukhiya: ${newHead.CustomerName} (#${nId}), Parivar: ${newFamilyName}`,
                tQuery
            });
        });

        await query('EXEC sp_UpdateCustomerBalance @id', { id: nId });
        await query('EXEC sp_UpdateCustomerBalance @id', { id: cId });

        res.json({
            success: true,
            message: `Mukhiya safalta se badal diya gaya! Ab '${newHead.CustomerName}' Parivar Mukhiya hain aur '${oldHead.CustomerName}' (${oldHeadRel}) sadasya hain. Sara purana hisaab aur data bilkul surakshit hai.`
        });
    } catch (err) {
        console.error('Change head error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 2.2 UPDATE FAMILY MEMBER RELATIONSHIP (RISHTA BADALEIN)
// --------------------------------------------------------------------------
router.post('/family/update-relationship', async (req, res) => {
    try {
        const { customerId, relationship } = req.body;
        if (!customerId || !relationship) {
            return res.status(400).json({ success: false, error: 'customerId aur relationship zaroori hain' });
        }

        const oldCustRes = await query(`SELECT CustomerID, CustomerName, Relationship, Phone FROM Customers WHERE CustomerID = @id`, { id: parseInt(customerId) });
        const oldCust = oldCustRes.recordset[0] || {};

        await query(`
            UPDATE Customers SET
                Relationship = @rel,
                UpdatedAt = GETDATE()
            WHERE CustomerID = @id AND IsActive = 1
        `, {
            id: parseInt(customerId),
            rel: relationship.trim()
        });

        await logAudit({
            action: 'UPDATE',
            module: 'Customers',
            tableName: 'Customers',
            recordId: parseInt(customerId),
            entityName: oldCust.CustomerName || `Customer #${customerId}`,
            description: `Parivar Rishta Badla Gaya: ${oldCust.CustomerName || 'Member'} ka rishta '${relationship.trim()}' kiya gaya`,
            oldData: { Relationship: oldCust.Relationship },
            newData: { Relationship: relationship.trim() },
            details: `Purana Rishta: ${oldCust.Relationship || 'N/A'} -> Naya Rishta: ${relationship.trim()}`
        });

        res.json({ success: true, message: 'Rishta (Relationship) safalta se update ho gaya!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 2.4 SEPARATE A MEMBER FROM FAMILY (MAKE INDEPENDENT / SELF HEAD)
// --------------------------------------------------------------------------
router.post('/family/separate-member', async (req, res) => {
    try {
        const { customerId } = req.body;
        const custId = parseInt(customerId);
        if (!custId || isNaN(custId)) {
            return res.status(400).json({ success: false, error: 'Customer ID zaroori hai' });
        }
        const userId = req.user?.UserID || 1;

        const custRes = await query(`
            SELECT c.*, p.CustomerName as ParentName, p.CustomerID as ActualParentID
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            WHERE c.CustomerID = @id AND c.UserID = @userId AND c.IsActive = 1
        `, { id: custId, userId });

        if (custRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }

        const cust = custRes.recordset[0];
        if (!cust.ParentCustomerID && cust.IsFamilyHead && (!cust.FamilyID || cust.FamilyID === cust.CustomerID)) {
            return res.json({ success: true, message: 'Yeh customer pehle se swatantra (independent) hain' });
        }

        const newFamilyName = `${cust.CustomerName} Parivar`;
        const parentLabel = cust.ParentName ? `${cust.ParentName} (ID: #${cust.ActualParentID})` : (cust.FamilyID ? `Family #${cust.FamilyID}` : 'Parivar');

        await query(`
            UPDATE Customers
            SET 
                ParentCustomerID = NULL,
                FamilyID = @id,
                IsFamilyHead = 1,
                Relationship = 'Self',
                KhataMode = 'Separate',
                FamilyName = @familyName,
                UpdatedAt = GETDATE()
            WHERE CustomerID = @id AND UserID = @userId
        `, { id: custId, familyName: newFamilyName, userId });

        await logAudit({
            userId,
            action: 'UPDATE',
            module: 'Customers',
            tableName: 'Customers',
            recordId: custId,
            entityName: cust.CustomerName,
            description: `Parivar Sadasya Se Alag Kiya Gaya (Family Separation)`,
            details: `Purana Parivar: '${parentLabel}' se alag karke Swatantra Grahak (Self Head) banaya gaya • Rishta: '${cust.Relationship || 'Member'}' ➔ 'Self'`,
            oldData: {
                ParentCustomerID: cust.ParentCustomerID,
                FamilyID: cust.FamilyID,
                Relationship: cust.Relationship,
                IsFamilyHead: cust.IsFamilyHead
            },
            newData: {
                ParentCustomerID: null,
                FamilyID: custId,
                Relationship: 'Self',
                IsFamilyHead: true
            }
        });

        res.json({
            success: true,
            message: `'${cust.CustomerName}' ko parivar se alag karke swatantra grahak bana diya gaya hai.`
        });
    } catch (err) {
        console.error('Error separating family member:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 2.5 GET NEXT AVAILABLE CUSTOMER ID (FOR NEW REGISTRATIONS)
// --------------------------------------------------------------------------
router.get('/next-id', async (req, res) => {
    try {
        const result = await query(`SELECT ISNULL(MAX(CustomerID), 0) + 1 AS nextId FROM Customers`);
        res.json({ success: true, nextId: result.recordset[0].nextId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 2.6 CUSTOMERS EXCEL EXPORT, TEMPLATE & IMPORT
// --------------------------------------------------------------------------
router.get('/export/excel', async (req, res) => {
    await exportCustomersToExcel(res, req.user.UserID);
});

router.get('/template/excel', async (req, res) => {
    await getCustomersTemplateExcel(res);
});

router.post('/import/excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Kripya Excel file (.xlsx, .xls, .csv) upload karein.' });
        }
        const result = await importCustomersFromExcel(req.file.buffer, req.file.originalname, req.user.UserID);
        res.json(result);
    } catch (err) {
        console.error('Error importing customer excel:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 3. GET ALL CUSTOMERS WITH FAMILY & STATS
// --------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;

        // Lightweight brief mode for Master Data / Dropdowns / Quick lookup
        if (req.query.brief === '1') {
            const briefResult = await query(`
                SELECT c.CustomerID, c.CustomerName, c.Phone, c.AadhaarNumber, c.Address,
                       c.CurrentBalance, c.BalanceType, c.FamilyID, c.FamilyName, c.IsFamilyHead,
                       c.ParentCustomerID, c.DateOfBirth,
                       ISNULL(fam.FamilyMembersCount, 1) AS FamilyMembersCount,
                       ISNULL(fam.FamilyTotalBalance, c.CurrentBalance) AS FamilyTotalBalance
                FROM Customers c
                LEFT JOIN (
                    SELECT FamilyID, COUNT(*) AS FamilyMembersCount, SUM(CurrentBalance) AS FamilyTotalBalance
                    FROM Customers
                    WHERE IsActive = 1 AND UserID = @userId AND FamilyID IS NOT NULL
                    GROUP BY FamilyID
                ) fam ON c.FamilyID = fam.FamilyID
                WHERE c.IsActive = 1 AND c.UserID = @userId
                ORDER BY c.CustomerName ASC
            `, { userId });
            return res.json({ success: true, data: briefResult.recordset });
        }

        const { search, balanceFilter, familyFilter, page, limit } = req.query;
        let whereClauses = ['c.IsActive = 1', 'c.UserID = @userId'];
        let params = { userId };

        if (search && search.trim() !== '') {
            const rawSearch = search.trim();
            const numericId = parseInt(rawSearch.replace(/^[#c]/i, '').trim(), 10);
            const cleanDigits = rawSearch.replace(/\D/g, '');
            params.cleanDigits = cleanDigits;
            params.digitLike = cleanDigits ? `%${cleanDigits}%` : '';

            let digitClause = '';
            if (cleanDigits.length >= 3) {
                digitClause = ` OR REPLACE(REPLACE(ISNULL(c.AadhaarNumber, ''), ' ', ''), '-', '') LIKE @digitLike OR REPLACE(REPLACE(ISNULL(c.Phone, ''), ' ', ''), '-', '') LIKE @digitLike`;
            }

            if (!isNaN(numericId) && numericId > 0) {
                whereClauses.push(`(c.CustomerID = @searchId OR c.CustomerName LIKE @search OR c.Phone LIKE @search OR c.AadhaarNumber LIKE @search OR c.Address LIKE @search OR c.FamilyName LIKE @search${digitClause})`);
                params.search = `%${rawSearch}%`;
                params.searchId = numericId;
            } else {
                whereClauses.push(`(c.CustomerName LIKE @search OR c.Phone LIKE @search OR c.AadhaarNumber LIKE @search OR c.Address LIKE @search OR c.FamilyName LIKE @search${digitClause})`);
                params.search = `%${rawSearch}%`;
            }
        }

        if (balanceFilter === 'to_receive') {
            whereClauses.push('c.CurrentBalance > 0');
        } else if (balanceFilter === 'to_pay') {
            whereClauses.push('c.CurrentBalance < 0');
        } else if (balanceFilter === 'settled') {
            whereClauses.push('c.CurrentBalance = 0');
        }

        if (familyFilter === 'heads_only') {
            whereClauses.push('c.IsFamilyHead = 1');
        } else if (familyFilter === 'members_only') {
            whereClauses.push('c.IsFamilyHead = 0');
        }

        if (!params.searchId) params.searchId = -1;
        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Pre-aggregated LEFT JOINs instead of slow correlated subqueries
        let paginationSql = '';
        if (limit && parseInt(limit) > 0) {
            const p = Math.max(1, parseInt(page) || 1);
            const lim = parseInt(limit);
            const offset = (p - 1) * lim;
            paginationSql = `OFFSET ${offset} ROWS FETCH NEXT ${lim} ROWS ONLY`;
        }

        const result = await query(`
            SELECT c.*,
                   p.CustomerName as ParentCustomerName,
                   ISNULL(fam.FamilyMembersCount, 1) AS FamilyMembersCount,
                   ISNULL(fam.FamilyTotalBalance, c.CurrentBalance) AS FamilyTotalBalance,
                   ISNULL(inv.TotalBills, 0) AS TotalBills,
                   ISNULL(k.TotalKhataEntries, 0) AS TotalKhataEntries,
                   ISNULL(k.TotalGave, 0) AS TotalGave,
                   ISNULL(k.TotalGot, 0) AS TotalGot,
                   k.LastKhataDate
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            LEFT JOIN (
                SELECT FamilyID, COUNT(*) AS FamilyMembersCount, SUM(CurrentBalance) AS FamilyTotalBalance
                FROM Customers
                WHERE IsActive = 1 AND UserID = @userId AND FamilyID IS NOT NULL
                GROUP BY FamilyID
            ) fam ON c.FamilyID = fam.FamilyID
            LEFT JOIN (
                SELECT CustomerID, COUNT(*) as TotalBills
                FROM Invoices
                WHERE Status != 'Cancelled'
                GROUP BY CustomerID
            ) inv ON c.CustomerID = inv.CustomerID
            LEFT JOIN (
                SELECT CustomerID,
                       COUNT(*) as TotalKhataEntries,
                       SUM(CASE WHEN EntryType = 'Gave' THEN Amount ELSE 0 END) as TotalGave,
                       SUM(CASE WHEN EntryType = 'Got' THEN Amount ELSE 0 END) as TotalGot,
                       MAX(EntryDate) as LastKhataDate
                FROM KhataEntries
                GROUP BY CustomerID
            ) k ON c.CustomerID = k.CustomerID
            ${whereSql}
            ${params.searchId > 0 ? 'ORDER BY CASE WHEN c.CustomerID = @searchId THEN 0 ELSE 1 END, c.CustomerID DESC' : 'ORDER BY c.CustomerID DESC'}
            ${paginationSql}
        `, params);

        // Overall summary statistics with NextCustomerID (scoped to UserID)
        const stats = await query(`
            SELECT 
                COUNT(*) as TotalCustomers,
                COUNT(DISTINCT FamilyID) as TotalFamilies,
                ISNULL(SUM(CASE WHEN CurrentBalance > 0 THEN CurrentBalance ELSE 0 END), 0) as TotalToReceive,
                ISNULL(SUM(CASE WHEN CurrentBalance < 0 THEN ABS(CurrentBalance) ELSE 0 END), 0) as TotalToPay,
                ISNULL(SUM(CurrentBalance), 0) as NetBalance,
                ISNULL(MAX(CustomerID), 0) + 1 as NextCustomerID
            FROM Customers
            WHERE IsActive = 1 AND UserID = @userId
        `, { userId });

        res.json({
            success: true,
            data: result.recordset,
            summary: stats.recordset[0] || { TotalCustomers: 0, TotalFamilies: 0, TotalToReceive: 0, TotalToPay: 0, NetBalance: 0, NextCustomerID: 1 }
        });
    } catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 4A. GET CUSTOMER DUES SUMMARY & BREAKDOWN (UNIVERSAL DUE ALERT)
// --------------------------------------------------------------------------
router.get('/:id/dues-summary', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const custId = parseInt(req.params.id, 10);
        if (isNaN(custId)) {
            return res.status(400).json({ success: false, error: 'Invalid Customer ID' });
        }

        const custRes = await query(`
            SELECT CustomerID, CustomerName, Phone, AadhaarNumber, CurrentBalance, OpeningBalance
            FROM Customers
            WHERE CustomerID = @custId AND IsActive = 1 AND UserID = @userId
        `, { custId, userId });

        if (!custRes.recordset.length) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }
        const customer = custRes.recordset[0];

        // 1. Pending CSC applications with DueAmount > 0
        const cscRes = await query(`
            SELECT AppID, ServiceType, TotalFee, PaidAmount, DueAmount, ApplyDate, AckNumber
            FROM CSCApplications
            WHERE CustomerID = @custId AND IsActive = 1 AND DueAmount > 0 AND UserID = @userId
            ORDER BY ApplyDate DESC
        `, { custId, userId });

        // 2. Pending Invoices with BalanceAmount > 0
        const invRes = await query(`
            SELECT InvoiceID, InvoiceNumber, TotalAmount, PaidAmount, BalanceAmount, InvoiceDate
            FROM Invoices
            WHERE CustomerID = @custId AND Status != 'Cancelled' AND BalanceAmount > 0 AND UserID = @userId
            ORDER BY InvoiceDate DESC
        `, { custId, userId });

        // 3. Pending Bill Payments with CustomerDue > 0
        const bpRes = await query(`
            SELECT PaymentID, BillCategory, ProviderName, ConsumerNumber, BillAmount, CustomerCharge, TotalCollected, CustomerDue, PaymentDate
            FROM BillPayments
            WHERE CustomerID = @custId AND IsDeleted = 0 AND CustomerDue > 0 AND UserID = @userId
            ORDER BY PaymentDate DESC
        `, { custId, userId });

        // 4. Recent Khata Udhaar (EntryType = 'Gave')
        const khataRes = await query(`
            SELECT TOP 10 KhataID, EntryDate, EntryTime, EntryType, Amount, Description, ReferenceNo
            FROM KhataEntries
            WHERE CustomerID = @custId AND EntryType = 'Gave' AND UserID = @userId
            ORDER BY EntryDate DESC, KhataID DESC
        `, { custId, userId });

        res.json({
            success: true,
            data: {
                customer,
                currentBalance: parseFloat(customer.CurrentBalance || 0),
                dues: {
                    csc: cscRes.recordset,
                    invoices: invRes.recordset,
                    billPayments: bpRes.recordset,
                    recentKhataGave: khataRes.recordset
                }
            }
        });
    } catch (err) {
        console.error('Error fetching dues summary:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 4. GET SINGLE CUSTOMER BY ID
// --------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.UserID || 1;
        const result = await query(`
            SELECT c.*,
                   p.CustomerName as ParentCustomerName,
                   (SELECT COUNT(*) FROM Customers m WHERE m.FamilyID = c.FamilyID AND m.IsActive = 1 AND m.UserID = @userId) AS FamilyMembersCount,
                   (SELECT COUNT(*) FROM Invoices i WHERE i.CustomerID = c.CustomerID AND i.UserID = @userId) AS TotalBills,
                   (SELECT COUNT(*) FROM KhataEntries k WHERE k.CustomerID = c.CustomerID AND k.UserID = @userId) AS TotalKhataEntries
            FROM Customers c
            LEFT JOIN Customers p ON c.ParentCustomerID = p.CustomerID
            WHERE c.CustomerID = @id AND c.IsActive = 1 AND c.UserID = @userId
        `, { id: parseInt(req.params.id), userId });

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }

        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 5. POST CREATE CUSTOMER (WITH DUPLICATE BLOCKING & FAMILY PLAN)
// --------------------------------------------------------------------------
router.post('/', async (req, res) => {
    try {
        const {
            CustomerName, Phone, AadhaarNumber, Email, Address, GSTIN, DateOfBirth,
            OpeningBalance, BalanceType, CreditLimit, Notes,
            // Family Fields
            ParentCustomerID, Relationship, KhataMode, FamilyName, IsFamilyMember
        } = req.body;

        if (!CustomerName || CustomerName.trim() === '') {
            return res.status(400).json({ success: false, error: 'Customer Name likhna zaroori hai' });
        }

        const userId = req.user?.UserID || 1;
        const trimmedName = CustomerName.trim();
        const cleanPhone = normalizePhone(Phone);
        const cleanAadhaar = normalizeAadhaar(AadhaarNumber);

        // A. 12-DIGIT AADHAAR VALIDATION & UNIQUE CHECK (CANNOT BE DUPLICATE FOR ANY CUSTOMER NAME)
        if (cleanAadhaar) {
            if (cleanAadhaar.length !== 12) {
                return res.status(400).json({
                    success: false,
                    error: `⚠️ Aadhaar Error: Aadhaar number theek 12 anko (digits) ka hona zaroori hai! (Abhi ${cleanAadhaar.length} ank hain)`
                });
            }

            const aadhaarDup = await query(`
                SELECT CustomerID, CustomerName, Phone, AadhaarNumber
                FROM Customers
                WHERE IsActive = 1 AND UserID = @userId AND (AadhaarNumber = @aadhaar OR REPLACE(REPLACE(AadhaarNumber, ' ', ''), '-', '') = @aadhaar)
            `, { aadhaar: cleanAadhaar, userId });

            if (aadhaarDup.recordset.length > 0) {
                const existCust = aadhaarDup.recordset[0];
                return res.status(400).json({
                    success: false,
                    error: `⚠️ Duplicate Aadhaar Error: Yeh 12-digit Aadhaar number (${cleanAadhaar}) pehle se grahak '${existCust.CustomerName}' (ID: #${existCust.CustomerID}, Mobile: ${existCust.Phone || 'N/A'}) ke sath darj hai! Ek Aadhaar number kisi doosre customer name ke saath multiple use nahi ho sakta.`
                });
            }
        }

        // B. EXACT DUPLICATE CHECK: Same Name + Same Phone Number
        if (cleanPhone) {
            const dupCheck = await query(`
                SELECT CustomerID, CustomerName, Phone, Relationship, IsFamilyHead
                FROM Customers
                WHERE IsActive = 1 AND UserID = @userId
                  AND LOWER(LTRIM(RTRIM(CustomerName))) = LOWER(@name)
                  AND (Phone LIKE @phonePattern OR Phone = @exactPhone)
            `, {
                name: trimmedName,
                phonePattern: `%${cleanPhone}%`,
                exactPhone: cleanPhone,
                userId
            });

            if (dupCheck.recordset.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `⚠️ Duplicate Error: '${trimmedName}' is mobile number (${cleanPhone}) par pehle se registered hain! Duplicate customer add nahi ho sakta.`
                });
            }
        }

        // C. FAMILY PLAN RESOLUTION
        let parentId = null;
        let familyId = null;
        let isHead = 1;
        let rel = 'Self';
        let khata = 'Separate';
        let famName = FamilyName ? FamilyName.trim() : `${trimmedName} Parivar`;

        if (cleanPhone) {
            // Check if phone already exists for other family members
            const existingPhoneCheck = await query(`
                SELECT CustomerID, CustomerName, Phone, FamilyID, FamilyName, IsFamilyHead, KhataMode
                FROM Customers
                WHERE IsActive = 1 AND UserID = @userId AND (Phone LIKE @phonePattern OR Phone = @exactPhone)
                ORDER BY IsFamilyHead DESC, CustomerID ASC
            `, {
                phonePattern: `%${cleanPhone}%`,
                exactPhone: cleanPhone,
                userId
            });

            if (existingPhoneCheck.recordset.length > 0) {
                // Phone already exists! This is a FAMILY MEMBER creation
                const head = existingPhoneCheck.recordset.find(m => m.IsFamilyHead) || existingPhoneCheck.recordset[0];
                parentId = ParentCustomerID ? parseInt(ParentCustomerID) : head.CustomerID;
                familyId = head.FamilyID || head.CustomerID;
                isHead = 0;
                rel = Relationship && Relationship.trim() ? Relationship.trim() : 'Family Member';
                khata = KhataMode === 'Joint' ? 'Joint' : 'Separate';
                famName = head.FamilyName || `${head.CustomerName} Parivar`;
            }
        }

        // If manually selected ParentCustomerID even if phone was different
        if (ParentCustomerID && !parentId) {
            const parentRes = await query(`SELECT CustomerID, CustomerName, FamilyID, FamilyName FROM Customers WHERE CustomerID = @pid AND UserID = @userId`, {
                pid: parseInt(ParentCustomerID),
                userId
            });
            if (parentRes.recordset.length > 0) {
                const parent = parentRes.recordset[0];
                parentId = parent.CustomerID;
                familyId = parent.FamilyID || parent.CustomerID;
                isHead = 0;
                rel = Relationship && Relationship.trim() ? Relationship.trim() : 'Family Member';
                khata = KhataMode === 'Joint' ? 'Joint' : 'Separate';
                famName = parent.FamilyName || `${parent.CustomerName} Parivar`;
            }
        }

        let opening = parseFloat(OpeningBalance) || 0;
        if (BalanceType === 'ToPay' && opening > 0) {
            opening = -opening;
        }

        // INSERT customer atomically with initial ledger entry
        const newCustomer = await withTransaction(async (tQuery) => {
            const insertResult = await tQuery(`
                INSERT INTO Customers (
                    CustomerName, Phone, AadhaarNumber, Email, Address, GSTIN, DateOfBirth,
                    OpeningBalance, CurrentBalance, BalanceType, CreditLimit, Notes, IsActive,
                    ParentCustomerID, FamilyID, IsFamilyHead, Relationship, KhataMode, FamilyName, UserID
                )
                OUTPUT INSERTED.*
                VALUES (
                    @name, @phone, @aadhaar, @email, @address, @gstin, @dob,
                    @opening, @opening, @balType, @creditLimit, @notes, 1,
                    @parentId, @familyId, @isHead, @rel, @khata, @famName, @userId
                )
            `, {
                name: trimmedName,
                phone: Phone ? Phone.trim() : null,
                aadhaar: cleanAadhaar,
                email: Email ? Email.trim() : null,
                address: Address ? Address.trim() : null,
                gstin: GSTIN ? GSTIN.trim() : null,
                dob: DateOfBirth ? DateOfBirth : null,
                opening: opening,
                balType: opening > 0 ? 'ToReceive' : (opening < 0 ? 'ToPay' : 'Settled'),
                creditLimit: parseFloat(CreditLimit) || 0,
                notes: Notes ? Notes.trim() : null,
                parentId: parentId,
                familyId: familyId,
                isHead: isHead,
                rel: rel,
                khata: khata,
                famName: famName,
                userId
            });

            const createdCust = insertResult.recordset[0];

            // If customer was newly created head without a familyId, set FamilyID = their own CustomerID
            if (!familyId) {
                await tQuery(`UPDATE Customers SET FamilyID = CustomerID WHERE CustomerID = @id`, { id: createdCust.CustomerID });
                createdCust.FamilyID = createdCust.CustomerID;
            }

            // Handle opening balance entry in Khata
            let openingKhataId = null;
            if (opening !== 0) {
                const entryType = opening > 0 ? 'Gave' : 'Got';
                const absAmt = Math.abs(opening);
                const kRes = await tQuery(`
                    INSERT INTO KhataEntries (
                        CustomerID, EntryDate, EntryTime, EntryType, Amount, 
                        PaymentMode, Description, ReferenceNo, UserID
                    )
                    VALUES (
                        @custId, CAST(GETDATE() AS DATE), CONVERT(VARCHAR(5), GETDATE(), 108), @entryType, @amt,
                        'Opening Balance', 'Purana / Opening Hisaab', 'OPENING-BAL', @userId
                    );
                    -- KhataEntries par AFTER INSERT trigger hai, isliye OUTPUT nahi (SCOPE_IDENTITY safe)
                    SELECT CAST(SCOPE_IDENTITY() AS INT) AS KhataID;
                `, {
                    custId: createdCust.CustomerID,
                    entryType: entryType,
                    amt: absAmt,
                    userId
                });
                openingKhataId = kRes.recordset[0]?.KhataID || null;

                // Same transaction me SN registry — warna customer/khata save ho jata aur SN missing reh jata.
                if (openingKhataId) {
                    await registerGlobalTransaction({
                        sourceModule: 'Khata',
                        recordId: openingKhataId,
                        entityName: `${createdCust.CustomerName} (Opening Hisaab)`,
                        amount: Math.abs(opening),
                        transDate: new Date(),
                        createdAt: new Date(),
                        userId
                    }, tQuery);
                }

                await tQuery('EXEC sp_UpdateCustomerBalance @id', { id: createdCust.CustomerID });
            }

            await logAudit({
                action: 'CREATE',
                module: 'Customers',
                tableName: 'Customers',
                recordId: createdCust.CustomerID,
                entityName: createdCust.CustomerName,
                amount: opening !== 0 ? Math.abs(opening) : null,
                description: `Naya Customer Joda Gaya: '${createdCust.CustomerName}' (ID: #${createdCust.CustomerID})`,
                newData: createdCust,
                details: `Phone: ${Phone || 'N/A'}, Aadhaar: ${cleanAadhaar || 'N/A'}, Head: ${isHead ? 'Haan' : 'Nahi'}, Parivar: ${famName}, Opening: ${opening}`,
                tQuery
            });

            return { customer: createdCust, openingKhataId };
        });

        const custData = newCustomer.customer;
        const successMsg = isHead
            ? `Naya Customer '${custData.CustomerName}' (ID: #${custData.CustomerID}) safalta se add ho gaya!`
            : `Parivar Sadasya '${custData.CustomerName}' (ID: #${custData.CustomerID}, ${rel}) safalta se jod diya gaya!`;

        res.json({ success: true, data: custData, message: successMsg });
    } catch (err) {
        console.error('Error creating customer:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 6. PUT UPDATE CUSTOMER
// --------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
    try {
        const custId = parseInt(req.params.id);
        const userId = req.user?.UserID || 1;
        const reqBody = req.body || {};
        const {
            CustomerName, Phone, AadhaarNumber, Email, Address, GSTIN, DateOfBirth, CreditLimit, Notes,
            Relationship, KhataMode, FamilyName, ParentCustomerID
        } = reqBody;
        // ParentCustomerID clear bhi kar sakta hai - ISNULL() se ye kabhi null nahi hota tha
        const parentProvided = Object.prototype.hasOwnProperty.call(reqBody, 'ParentCustomerID');

        if (!CustomerName || CustomerName.trim() === '') {
            return res.status(400).json({ success: false, error: 'Customer Name likhna zaroori hai' });
        }

        const trimmedName = CustomerName.trim();
        const cleanPhone = normalizePhone(Phone);
        const cleanAadhaar = normalizeAadhaar(AadhaarNumber);

        // Fetch old customer data for audit diff
        const oldCustRes = await query(`SELECT * FROM Customers WHERE CustomerID = @id AND UserID = @userId`, { id: custId, userId });
        if (oldCustRes.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }
        const oldCust = oldCustRes.recordset[0];

        // A. 12-DIGIT AADHAAR VALIDATION & UNIQUE CHECK (CANNOT BE DUPLICATE ON OTHER CUSTOMER)
        if (cleanAadhaar) {
            if (cleanAadhaar.length !== 12) {
                return res.status(400).json({
                    success: false,
                    error: `⚠️ Aadhaar Error: Aadhaar number theek 12 anko (digits) ka hona zaroori hai! (Abhi ${cleanAadhaar.length} ank hain)`
                });
            }

            const aadhaarDup = await query(`
                SELECT CustomerID, CustomerName, Phone, AadhaarNumber
                FROM Customers
                WHERE IsActive = 1 AND UserID = @userId AND (AadhaarNumber = @aadhaar OR REPLACE(REPLACE(AadhaarNumber, ' ', ''), '-', '') = @aadhaar) AND CustomerID != @id
            `, { aadhaar: cleanAadhaar, id: custId, userId });

            if (aadhaarDup.recordset.length > 0) {
                const existCust = aadhaarDup.recordset[0];
                return res.status(400).json({
                    success: false,
                    error: `⚠️ Duplicate Aadhaar Error: Yeh 12-digit Aadhaar number (${cleanAadhaar}) pehle se grahak '${existCust.CustomerName}' (ID: #${existCust.CustomerID}, Mobile: ${existCust.Phone || 'N/A'}) ke sath darj hai! Duplicate Aadhaar allow nahi hai.`
                });
            }
        }

        // Check duplicate name + phone on other customers
        if (cleanPhone) {
            const dupCheck = await query(`
                SELECT CustomerID FROM Customers
                WHERE IsActive = 1 AND UserID = @userId AND CustomerID != @id
                  AND LOWER(LTRIM(RTRIM(CustomerName))) = LOWER(@name)
                  AND (Phone LIKE @phonePattern OR Phone = @exactPhone)
            `, {
                id: custId,
                name: trimmedName,
                phonePattern: `%${cleanPhone}%`,
                exactPhone: cleanPhone,
                userId
            });

            if (dupCheck.recordset.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `⚠️ Duplicate Error: '${trimmedName}' is phone number par pehle se registered hain!`
                });
            }
        }

        await query(`
            UPDATE Customers SET
                CustomerName = @name,
                Phone = @phone,
                AadhaarNumber = @aadhaar,
                Email = @email,
                Address = @address,
                GSTIN = @gstin,
                DateOfBirth = @dob,
                CreditLimit = @creditLimit,
                Notes = @notes,
                Relationship = ISNULL(@rel, Relationship),
                KhataMode = ISNULL(@khata, KhataMode),
                FamilyName = ISNULL(@famName, FamilyName),
                ParentCustomerID = CASE WHEN @parentProvided = 1 THEN @parentId ELSE ParentCustomerID END,
                UpdatedAt = GETDATE()
            WHERE CustomerID = @id AND UserID = @userId
        `, {
            id: custId,
            userId,
            name: trimmedName,
            phone: Phone ? Phone.trim() : null,
            aadhaar: cleanAadhaar,
            email: Email ? Email.trim() : null,
            address: Address ? Address.trim() : null,
            gstin: GSTIN ? GSTIN.trim() : null,
            dob: DateOfBirth ? DateOfBirth : null,
            creditLimit: parseFloat(CreditLimit) || 0,
            notes: Notes ? Notes.trim() : null,
            rel: Relationship ? Relationship.trim() : null,
            khata: KhataMode || null,
            famName: FamilyName ? FamilyName.trim() : null,
            parentId: (ParentCustomerID === null || ParentCustomerID === '' || ParentCustomerID === 0)
                ? null : parseInt(ParentCustomerID),
            parentProvided: parentProvided ? 1 : 0
        });

        await query('EXEC sp_UpdateCustomerBalance @id', { id: custId });

        const newCustRes = await query(`SELECT * FROM Customers WHERE CustomerID = @id`, { id: custId });
        const newCust = newCustRes.recordset[0] || {};

        // Build human-readable change diffs
        const diffs = [];
        if ((oldCust.CustomerName || '').trim() !== trimmedName) {
            diffs.push(`Naam: '${oldCust.CustomerName || 'N/A'}' ➔ '${trimmedName}'`);
        }
        if ((oldCust.Phone || '').trim() !== (cleanPhone || '')) {
            diffs.push(`Mobile: '${oldCust.Phone || 'Khali'}' ➔ '${cleanPhone || 'Hata diya gaya'}'`);
        }
        if ((oldCust.AadhaarNumber || '').replace(/\D/g, '') !== (cleanAadhaar || '')) {
            diffs.push(`Aadhaar: '${oldCust.AadhaarNumber ? ('XXXX-XXXX-' + oldCust.AadhaarNumber.slice(-4)) : 'Khali'}' ➔ '${cleanAadhaar ? ('XXXX-XXXX-' + cleanAadhaar.slice(-4)) : 'Khali'}'`);
        }
        const oldDobStr = oldCust.DateOfBirth ? (typeof oldCust.DateOfBirth === 'string' ? oldCust.DateOfBirth.split('T')[0] : oldCust.DateOfBirth.toISOString().split('T')[0]) : '';
        const newDobStr = DateOfBirth ? String(DateOfBirth).split('T')[0] : '';
        if (oldDobStr !== newDobStr) {
            diffs.push(`DOB: '${oldDobStr || 'Khali'}' ➔ '${newDobStr || 'Khali'}'`);
        }
        if ((oldCust.Address || '').trim() !== (Address ? Address.trim() : '')) {
            diffs.push(`Pata: '${oldCust.Address || 'Khali'}' ➔ '${Address ? Address.trim() : 'Khali'}'`);
        }
        if ((oldCust.Relationship || '').trim() !== (Relationship ? Relationship.trim() : '')) {
            diffs.push(`Rishta: '${oldCust.Relationship || 'N/A'}' ➔ '${Relationship ? Relationship.trim() : 'N/A'}'`);
        }
        if (oldCust.KhataMode !== KhataMode && KhataMode) {
            diffs.push(`Khata Mode: '${oldCust.KhataMode || 'Individual'}' ➔ '${KhataMode}'`);
        }

        await logAudit({
            action: 'UPDATE',
            module: 'Customers',
            tableName: 'Customers',
            recordId: custId,
            entityName: trimmedName,
            description: `Customer Profile Update Kiya Gaya: '${trimmedName}' (ID: #${custId})`,
            oldData: oldCust,
            newData: newCust,
            details: diffs.length > 0 ? diffs.join(' • ') : `Customer #${custId} Profile Updated (No field diff)`
        });

        res.json({ success: true, message: 'Customer details update ho gayi' });
    } catch (err) {
        console.error('Error updating customer:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 6.1 GET CUSTOMER PROFILE AUDIT / CHANGE HISTORY
// --------------------------------------------------------------------------
router.get('/:id/audit-history', async (req, res) => {
    try {
        const custId = parseInt(req.params.id);
        if (isNaN(custId)) {
            return res.status(400).json({ success: false, error: 'Invalid Customer ID' });
        }
        const result = await query(`
            SELECT TOP 100
                LogID, Action, Module, TableName, RecordID, Description, EntityName, Amount, OldData, NewData, Details, CreatedAt, UserID
            FROM AuditLogs
            WHERE TableName = 'Customers' AND RecordID = @id
            ORDER BY CreatedAt DESC, LogID DESC
        `, { id: custId });

        res.json({
            success: true,
            data: result.recordset || []
        });
    } catch (err) {
        console.error('Error fetching customer audit history:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
// 7. DELETE CUSTOMER (Safe Soft Delete with Financial & Family Integrity Guards)
// --------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
    try {
        const custId = parseInt(req.params.id, 10);
        if (!Number.isInteger(custId) || custId <= 0) {
            return res.status(400).json({ success: false, error: 'Valid Customer ID zaroori hai' });
        }
        const userId = req.user?.UserID || 1;
        const oldCustRes = await query(`SELECT * FROM Customers WHERE CustomerID = @id AND UserID = @userId`, { id: custId, userId });
        if (!oldCustRes.recordset.length) {
            return res.status(404).json({ success: false, error: 'Customer nahi mila' });
        }
        const oldCust = oldCustRes.recordset[0];

        // 1. Financial Integrity Guard: Pending balance hone par delete nahi ho sakta
        const bal = parseFloat(oldCust.CurrentBalance || 0);
        if (Math.abs(bal) > 0.01) {
            const formatted = Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 });
            const msg = bal > 0
                ? `Is grahak ka ₹${formatted} baaki hisaab (Lena) bacha hai. Delete karne se pehle khata clear karein.`
                : `Is grahak ka ₹${formatted} jama hisaab (Dena) bacha hai. Delete karne se pehle khata clear karein.`;
            return res.status(400).json({ success: false, error: msg });
        }

        // 2. Family Tree Integrity Guard: Agar family head hai aur doosre sadasya jude hain
        const activeMembers = await query(`
            SELECT COUNT(*) AS cnt FROM Customers 
            WHERE (FamilyID = @id OR ParentCustomerID = @id) AND CustomerID != @id AND IsActive = 1 AND UserID = @userId
        `, { id: custId, userId });
        if (activeMembers.recordset[0]?.cnt > 0) {
            return res.status(400).json({
                success: false,
                error: `Is grahak se ${activeMembers.recordset[0].cnt} parivaar sadasya jude hain. Pehle unhe alag karein.`
            });
        }

        await query(`UPDATE Customers SET IsActive = 0, UpdatedAt = GETDATE() WHERE CustomerID = @id AND UserID = @userId`, { id: custId, userId });

        await logAudit({
            action: 'DELETE',
            module: 'Customers',
            tableName: 'Customers',
            recordId: custId,
            entityName: oldCust.CustomerName || `Customer #${custId}`,
            description: `Customer Delete (Archived): '${oldCust.CustomerName || 'Grahak'}' (ID: #${custId})`,
            oldData: oldCust,
            details: `Grahak '${oldCust.CustomerName}' (ID: #${custId}, Phone: ${oldCust.Phone || 'N/A'}) ko surakshit tareeqe se delete (IsActive = 0) kiya gaya.`
        });

        res.json({ success: true, message: 'Customer safaltapoorvak delete kar diya gaya' });
    } catch (err) {
        console.error('Error deleting customer:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
