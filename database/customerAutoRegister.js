/**
 * customerAutoRegister.js
 * 
 * Auto-registers or resolves a Customer in the master `Customers` table
 * whenever any transaction/application is created (CSC Services, BC Counter, Invoices, Khata, etc.)
 * with customer details (Name, Phone, Aadhaar, etc.).
 * 
 * Ensures:
 * 1. No duplicates if customer already exists by Aadhaar, Phone, or Name.
 * 2. Enriches existing customer with newly provided details (e.g. Phone, 12-digit Aadhaar, Address) if missing.
 * 3. Supports family detection when phone is shared with a different member name.
 * 4. Filters out generic walk-in placeholders without contact info.
 * 5. Can run inside an active SQL transaction (using tQuery) or standalone (using db.query).
 */

const { query } = require('./db');

const GENERIC_NAMES = new Set([
    'walk-in customer',
    'walk in customer',
    'walkin customer',
    'walk-in',
    'walk in',
    'walkin',
    'direct naya / walk-in customer',
    'direct walk-in',
    'direct naya',
    'naya customer',
    'new customer',
    'cash',
    'unknown',
    'na',
    'n/a',
    'null',
    'none',
    '-',
    '--',
    'customer',
    'grahak'
]);

// Converts words to title case (capital first letter and capital after space)
function toTitleCaseWords(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|[\s\(\[\{\.\-\/])\p{L}/gu, match => match.toUpperCase());
}

// Helper to check if a phone is dummy/placeholder
function isDummyPhone(phone) {
    if (!phone) return true;
    const digits = phone.toString().replace(/\D/g, '');
    if (digits.length === 0) return true;
    if (digits.length < 10) return false;
    const last10 = digits.slice(-10);
    // All same digits (e.g. 0000000000, 1111111111, 9999999999)
    if (/^(\d)\1{9}$/.test(last10)) return true;
    // Sequential dummy numbers
    if (last10 === '1234567890' || last10 === '0123456789' || last10 === '9876543210') return true;
    // Common dummy prefixes in legacy data: 9400000000, 9400000001, 99999999xx
    if (/^94000000\d{2}$/.test(last10) || /^99999999\d{2}$/.test(last10)) return true;
    return false;
}

// Normalizes 10-digit Indian mobile number
function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.toString().replace(/\D/g, '');
    if (digits.length < 10) return digits.length > 0 ? digits : null;
    const last10 = digits.slice(-10);
    if (isDummyPhone(last10)) return null;
    return last10;
}

// Normalizes 12-digit Aadhaar number
function normalizeAadhaar(aadhaar) {
    if (!aadhaar) return null;
    const digits = aadhaar.toString().replace(/\D/g, '');
    return digits.length === 12 ? digits : null;
}

// Checks if name is a generic placeholder
function isGenericName(name) {
    if (!name) return true;
    const trimmed = name.toString().trim().toLowerCase();
    return trimmed.length === 0 || GENERIC_NAMES.has(trimmed);
}

/**
 * Resolves an existing customer or auto-creates a new customer record.
 * 
 * @param {Object} params
 * @param {number|string} [params.customerId] - Explicit customer ID if selected
 * @param {string} [params.customerName] - Customer full name
 * @param {string} [params.customerPhone] - 10-digit mobile number
 * @param {string} [params.customerAadhaar] - 12-digit Aadhaar or last 4 digits
 * @param {string} [params.address] - Customer address
 * @param {string} [params.email] - Customer email
 * @param {string} [params.source] - Where this was triggered (e.g., 'CSC Service', 'BC Counter', 'Invoice')
 * @param {Function} [executor] - Optional query function (e.g., tQuery within withTransaction)
 * @returns {Promise<{ customerId: number|null, isNew: boolean, customer: Object|null }>}
 */
async function resolveOrCreateCustomer(params = {}, executor = null) {
    const exec = executor || query;

    const rawId = params.customerId ? parseInt(params.customerId) : null;
    const userId = params.userId || params.UserID || 1;
    let name = toTitleCaseWords((params.customerName || params.name || '').toString().trim());
    const cleanPhone = normalizePhone(params.customerPhone || params.phone);
    const cleanAadhaar = normalizeAadhaar(params.customerAadhaar || params.aadhaar);
    const address = params.address ? params.address.toString().trim() : null;
    const email = params.email ? params.email.toString().trim() : null;
    const dob = params.dob || params.dateOfBirth || params.DateOfBirth || null;
    const source = params.source || params.notes || 'Auto-Register';

    // 1. If explicit customer ID provided and valid, verify & enrich
    if (rawId && rawId > 0) {
        const existing = await exec(`
            SELECT TOP 1 * FROM Customers 
            WHERE CustomerID = @id AND UserID = @userId AND IsActive = 1
        `, { id: rawId, userId });

        if (existing.recordset.length > 0) {
            const cust = existing.recordset[0];
            const cleanCustAadhaar = cust.AadhaarNumber ? cust.AadhaarNumber.replace(/\D/g, '') : null;
            const sameName = isGenericName(name) || cust.CustomerName.trim().toLowerCase() === name.toLowerCase();
            const sameAadhaar = !cleanAadhaar || !cleanCustAadhaar || cleanCustAadhaar === cleanAadhaar;

            if (sameName && sameAadhaar) {
                await enrichCustomerWithLatestData(cust, { name, cleanPhone, cleanAadhaar, address, email, dob, userId, source }, exec);
                return { customerId: cust.CustomerID, isNew: false, customer: cust };
            }
            // Agar naam ya Aadhaar alag hai (jaise form me naya customer name 'Subi Khan' ya 'Rahnuma Khatoon' bhara ho
            // par purani ID 'All Customers' select thi), to rawId ko ignore karke naya customer match/register karein!
        }
    }

    // If generic name AND no phone AND no 12-digit Aadhaar, don't create a fake customer
    if (isGenericName(name) && !cleanPhone && !cleanAadhaar) {
        return { customerId: null, isNew: false, customer: null, reason: 'generic_walkin' };
    }

    // 2. Try match by 12-Digit Aadhaar (Highest priority / unique per shop)
    if (cleanAadhaar) {
        const aadhaarMatch = await exec(`
            SELECT TOP 1 * FROM Customers 
            WHERE IsActive = 1 AND UserID = @userId AND (AadhaarNumber = @aadhaar OR REPLACE(REPLACE(AadhaarNumber, ' ', ''), '-', '') = @aadhaar)
            ORDER BY CustomerID ASC
        `, { aadhaar: cleanAadhaar, userId });

        if (aadhaarMatch.recordset.length > 0) {
            const cust = aadhaarMatch.recordset[0];
            await enrichCustomerWithLatestData(cust, { name, cleanPhone, cleanAadhaar, address, email, dob, userId, source }, exec);
            return { customerId: cust.CustomerID, isNew: false, customer: cust };
        }
    }

    // 3. Try match by 10-Digit Mobile Phone
    if (cleanPhone && cleanPhone.length === 10) {
        // A. Exact Name + Same Phone match
        if (name && !isGenericName(name)) {
            const namePhoneMatch = await exec(`
                SELECT TOP 1 * FROM Customers 
                WHERE IsActive = 1 AND UserID = @userId
                  AND (Phone = @exactPhone OR Phone LIKE @phonePattern)
                  AND LOWER(LTRIM(RTRIM(CustomerName))) = LOWER(@name)
                ORDER BY IsFamilyHead DESC, CustomerID ASC
            `, {
                exactPhone: cleanPhone,
                phonePattern: `%${cleanPhone}%`,
                name: name,
                userId
            });

            if (namePhoneMatch.recordset.length > 0) {
                const cust = namePhoneMatch.recordset[0];
                await enrichCustomerWithLatestData(cust, { name, cleanPhone, cleanAadhaar, address, email, dob, userId, source }, exec);
                return { customerId: cust.CustomerID, isNew: false, customer: cust };
            }
        }

        // B. Phone exists in DB - check if same person or family member
        const phoneMatch = await exec(`
            SELECT * FROM Customers 
            WHERE IsActive = 1 AND UserID = @userId
              AND (Phone = @exactPhone OR Phone LIKE @phonePattern)
            ORDER BY IsFamilyHead DESC, CustomerID ASC
        `, {
            exactPhone: cleanPhone,
            phonePattern: `%${cleanPhone}%`,
            userId
        });

        const skipFamily = !!(params.skipFamilyLink || params.independentCustomer);
        if (phoneMatch.recordset.length > 0 && !skipFamily) {
            const records = phoneMatch.recordset;
            // If the name is generic or matches one of the records closely, link to it
            if (isGenericName(name)) {
                const primary = records.find(r => r.IsFamilyHead) || records[0];
                await enrichCustomerWithLatestData(primary, { name, cleanPhone, cleanAadhaar, address, email, dob, userId, source }, exec);
                return { customerId: primary.CustomerID, isNew: false, customer: primary };
            }

            // If name is a different person sharing the phone -> Family Member creation!
            const head = records.find(r => r.IsFamilyHead) || records[0];
            const familyId = head.FamilyID || head.CustomerID;
            const parentId = head.CustomerID;
            const famName = head.FamilyName || `${head.CustomerName} Parivar`;

            // Check if this specific name already exists under this family
            const existingMember = records.find(r => r.CustomerName.trim().toLowerCase() === name.toLowerCase());
            if (existingMember) {
                await enrichCustomerWithLatestData(existingMember, { name, cleanPhone, cleanAadhaar, address, email, dob, userId, source }, exec);
                return { customerId: existingMember.CustomerID, isNew: false, customer: existingMember };
            }

            // Create new family member customer
            const newMemberRes = await exec(`
                INSERT INTO Customers (
                    CustomerName, Phone, AadhaarNumber, Address, Email,
                    OpeningBalance, CurrentBalance, BalanceType, CreditLimit,
                    Notes, IsActive, ParentCustomerID, FamilyID, IsFamilyHead,
                    Relationship, KhataMode, FamilyName, DateOfBirth, UserID
                )
                OUTPUT INSERTED.*
                VALUES (
                    @name, @phone, @aadhaar, @address, @email,
                    0, 0, 'Settled', 0,
                    @notes, 1, @parentId, @familyId, 0,
                    'Family Member', 'Separate', @famName, @dob, @userId
                )
            `, {
                name: name,
                phone: cleanPhone,
                aadhaar: cleanAadhaar,
                address: address,
                email: email,
                dob: dob || null,
                notes: `Auto-registered as family member via ${source}`,
                parentId: parentId,
                familyId: familyId,
                famName: famName,
                userId
            });

            const createdMember = newMemberRes.recordset[0];
            console.log(`[CustomerAutoRegister] Auto-registered family member: #${createdMember.CustomerID} - ${createdMember.CustomerName} (Family of ${head.CustomerName})`);
            return { customerId: createdMember.CustomerID, isNew: true, customer: createdMember };
        }
    }

    // 4. Try match by Exact Name (ONLY if NO Phone and NO Aadhaar was provided)
    if (!cleanPhone && !cleanAadhaar && name && !isGenericName(name) && name.length >= 2) {
        const nameMatch = await exec(`
            SELECT TOP 1 * FROM Customers 
            WHERE IsActive = 1 AND UserID = @userId AND LOWER(LTRIM(RTRIM(CustomerName))) = LOWER(@name)
            ORDER BY IsFamilyHead DESC, CustomerID ASC
        `, { name: name, userId });

        if (nameMatch.recordset.length > 0) {
            const cust = nameMatch.recordset[0];
            await enrichCustomerWithLatestData(cust, { name, cleanPhone, cleanAadhaar, address, email, dob, userId, source }, exec);
            return { customerId: cust.CustomerID, isNew: false, customer: cust };
        }
    }

    // 5. Customer does not exist -> AUTO-REGISTER NEW CUSTOMER
    if (isGenericName(name)) {
        if (cleanPhone) {
            name = `Customer ${cleanPhone}`;
        } else if (cleanAadhaar) {
            name = `Customer ${cleanAadhaar.slice(-4)}`;
        } else {
            return { customerId: null, isNew: false, customer: null, reason: 'unnamed_walkin' };
        }
    }

    const famName = `${name} Parivar`;
    const insertRes = await exec(`
        INSERT INTO Customers (
            CustomerName, Phone, AadhaarNumber, Address, Email,
            OpeningBalance, CurrentBalance, BalanceType, CreditLimit,
            Notes, IsActive, IsFamilyHead, Relationship, KhataMode, FamilyName, DateOfBirth, UserID
        )
        OUTPUT INSERTED.*
        VALUES (
            @name, @phone, @aadhaar, @address, @email,
            0, 0, 'Settled', 0,
            @notes, 1, 1, 'Self', 'Separate', @famName, @dob, @userId
        )
    `, {
        name: name,
        phone: cleanPhone,
        aadhaar: cleanAadhaar,
        address: address,
        email: email,
        dob: dob || null,
        notes: `Auto-registered via ${source}`,
        famName: famName,
        userId
    });

    const createdCust = insertRes.recordset[0];

    // Set FamilyID to its own CustomerID for the new head
    await exec(`
        UPDATE Customers 
        SET FamilyID = CustomerID 
        WHERE CustomerID = @id AND UserID = @userId
    `, { id: createdCust.CustomerID, userId });
    createdCust.FamilyID = createdCust.CustomerID;

    console.log(`[CustomerAutoRegister] Successfully auto-registered new customer: #${createdCust.CustomerID} - ${createdCust.CustomerName} via ${source}`);

    return { customerId: createdCust.CustomerID, isNew: true, customer: createdCust };
}

/**
 * Safely updates missing or newer fields on an existing customer record,
 * and maintains an exact audit trail in AuditLogs table.
 */
async function enrichCustomerWithLatestData(cust, details = {}, exec = query) {
    try {
        const updates = [];
        const diffs = [];
        const oldData = {};
        const newData = {};
        const params = { id: cust.CustomerID };
        const uid = details.userId || cust.UserID || 1;
        const source = details.source || 'Auto-Register';

        // 1. Mobile Phone (add if missing, or replace dummy phone like 9400000000 / 9999999999, or update if user provided new valid phone)
        if (details.cleanPhone && details.cleanPhone.length === 10) {
            const curPhone = cust.Phone ? cust.Phone.trim() : null;
            const curDigits = curPhone ? curPhone.replace(/\D/g, '').slice(-10) : null;
            const isCurDummy = !curDigits || isDummyPhone(curDigits);

            if (isCurDummy || (curDigits !== details.cleanPhone)) {
                updates.push('Phone = @newPhone');
                params.newPhone = details.cleanPhone;
                diffs.push(`Mobile: '${curPhone || 'Khali'}' ➔ '${details.cleanPhone}'`);
                oldData.Phone = curPhone;
                newData.Phone = details.cleanPhone;
                cust.Phone = details.cleanPhone;
            }
        }

        // 2. Customer Name (update if current is generic e.g. 'Customer 1234' or new fuller name provided)
        if (details.name && !isGenericName(details.name)) {
            const cleanNewName = details.name.trim();
            const curName = (cust.CustomerName || '').trim();
            const isCurGeneric = isGenericName(curName);

            if (isCurGeneric || (cleanNewName.toLowerCase() !== curName.toLowerCase() && cleanNewName.length >= curName.length)) {
                updates.push('CustomerName = @newName');
                params.newName = cleanNewName;
                diffs.push(`Naam: '${curName || 'N/A'}' ➔ '${cleanNewName}'`);
                oldData.CustomerName = curName;
                newData.CustomerName = cleanNewName;
                cust.CustomerName = cleanNewName;
            }
        }

        // 3. 12-Digit Aadhaar (update if missing or newly provided, ensuring unique per shop)
        if (details.cleanAadhaar && details.cleanAadhaar.length === 12) {
            const curAadhaar = cust.AadhaarNumber ? cust.AadhaarNumber.replace(/\D/g, '') : null;
            if (!curAadhaar || curAadhaar !== details.cleanAadhaar) {
                // Ensure no other customer in this shop has this Aadhaar
                const checkAadhaar = await exec(`
                    SELECT TOP 1 CustomerID FROM Customers 
                    WHERE IsActive = 1 AND UserID = @uid 
                      AND (AadhaarNumber = @checkAadhaar OR REPLACE(REPLACE(AadhaarNumber, ' ', ''), '-', '') = @checkAadhaar) 
                      AND CustomerID != @id
                `, { checkAadhaar: details.cleanAadhaar, id: cust.CustomerID, uid });

                if (checkAadhaar.recordset.length === 0) {
                    updates.push('AadhaarNumber = @newAadhaar');
                    params.newAadhaar = details.cleanAadhaar;
                    diffs.push(`Aadhaar: '${curAadhaar ? ('XXXX-XXXX-' + curAadhaar.slice(-4)) : 'Khali'}' ➔ '${'XXXX-XXXX-' + details.cleanAadhaar.slice(-4)}'`);
                    oldData.AadhaarNumber = curAadhaar;
                    newData.AadhaarNumber = details.cleanAadhaar;
                    cust.AadhaarNumber = details.cleanAadhaar;
                }
            }
        }

        // 4. Date of Birth (DOB)
        if (details.dob) {
            let cleanDob = null;
            if (typeof details.dob === 'string') {
                cleanDob = details.dob.split('T')[0].trim();
            } else if (details.dob instanceof Date) {
                cleanDob = details.dob.toISOString().split('T')[0];
            }
            if (cleanDob && /^\d{4}-\d{2}-\d{2}$/.test(cleanDob)) {
                const curDob = cust.DateOfBirth 
                    ? (typeof cust.DateOfBirth === 'string' ? cust.DateOfBirth.split('T')[0] : cust.DateOfBirth.toISOString().split('T')[0]) 
                    : null;
                if (!curDob || curDob !== cleanDob) {
                    updates.push('DateOfBirth = @newDob');
                    params.newDob = cleanDob;
                    diffs.push(`DOB: '${curDob || 'Khali'}' ➔ '${cleanDob}'`);
                    oldData.DateOfBirth = curDob;
                    newData.DateOfBirth = cleanDob;
                    cust.DateOfBirth = cleanDob;
                }
            }
        }

        // 5. Address (update if missing or newly provided with meaningful content)
        if (details.address && details.address.toString().trim().length >= 3) {
            const cleanAddr = details.address.toString().trim();
            const curAddr = cust.Address ? cust.Address.toString().trim() : null;
            if (!curAddr || (cleanAddr.toLowerCase() !== curAddr.toLowerCase() && cleanAddr.length >= (curAddr ? curAddr.length : 0))) {
                updates.push('Address = @newAddress');
                params.newAddress = cleanAddr;
                diffs.push(`Pata: '${curAddr || 'Khali'}' ➔ '${cleanAddr}'`);
                oldData.Address = curAddr;
                newData.Address = cleanAddr;
                cust.Address = cleanAddr;
            }
        }

        // 6. Email (update if missing or newly provided)
        if (details.email && details.email.toString().trim().length >= 5 && details.email.includes('@')) {
            const cleanEmail = details.email.toString().trim();
            const curEmail = cust.Email ? cust.Email.toString().trim() : null;
            if (!curEmail || cleanEmail.toLowerCase() !== curEmail.toLowerCase()) {
                updates.push('Email = @newEmail');
                params.newEmail = cleanEmail;
                diffs.push(`Email: '${curEmail || 'Khali'}' ➔ '${cleanEmail}'`);
                oldData.Email = curEmail;
                newData.Email = cleanEmail;
                cust.Email = cleanEmail;
            }
        }

        // If any field changed, apply to database and write Audit Log entry
        if (updates.length > 0) {
            updates.push('UpdatedAt = GETDATE()');
            await exec(`
                UPDATE Customers 
                SET ${updates.join(', ')} 
                WHERE CustomerID = @id
            `, params);

            console.log(`[CustomerAutoRegister] Customer #${cust.CustomerID} (${cust.CustomerName}) updated via ${source}: ${diffs.join(' • ')}`);

            // Safe Audit Log write
            try {
                const { logAudit } = require('../utils/auditLogger');
                await logAudit({
                    userId: uid,
                    action: 'UPDATE',
                    module: 'Customers',
                    tableName: 'Customers',
                    recordId: cust.CustomerID,
                    entityName: cust.CustomerName,
                    description: `Customer Data Auto-Updated via ${source}`,
                    details: diffs.join(' • '),
                    oldData,
                    newData
                });
            } catch (auditErr) {
                console.warn('[CustomerAutoRegister] Audit log write warning:', auditErr.message);
            }
        }
    } catch (err) {
        console.warn(`[CustomerAutoRegister] Warning enriching customer #${cust.CustomerID}:`, err.message);
    }
}

// Backward-compatible alias
const enrichCustomerIfMissing = enrichCustomerWithLatestData;

module.exports = {
    resolveOrCreateCustomer,
    enrichCustomerWithLatestData,
    enrichCustomerIfMissing,
    normalizePhone,
    normalizeAadhaar,
    isDummyPhone,
    isGenericName
};
