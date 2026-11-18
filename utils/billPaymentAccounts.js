async function resolveTenantBillAccounts(userId, reqWalletId, reqCashId, dbQuery) {
    function parseRequestedId(value, label) {
        if (value === undefined || value === null || String(value).trim() === '') return null;
        const raw = String(value).trim();
        if (!/^\d+$/.test(raw)) {
            throw new Error(`${label} ID valid hona chahiye.`);
        }
        const parsed = Number(raw);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
            throw new Error(`${label} ID valid hona chahiye.`);
        }
        return parsed;
    }

    let effCashId = parseRequestedId(reqCashId, 'Cash Account');
    if (effCashId !== null) {
        const chk = await dbQuery(
            'SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1',
            { id: effCashId, userId }
        );
        if (chk.recordset.length === 0) {
            throw new Error('Chuna gaya Cash Account aapki dukaan se match nahi karta ya inactive hai.');
        }
    } else {
        const defCash = await dbQuery(
            "SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType = 'Cash' AND IsActive = 1 ORDER BY AccountID ASC",
            { userId }
        );
        if (defCash.recordset.length === 0) {
            throw new Error('Aapki dukaan ka koi active Cash Account nahi mila. Kripya pehle Settings/Accounts me Cash Account banayein.');
        }
        effCashId = defCash.recordset[0].AccountID;
    }

    let effWalletId = parseRequestedId(reqWalletId, 'Wallet/Bank Account');
    if (effWalletId !== null) {
        const chk = await dbQuery(
            'SELECT AccountID FROM Accounts WHERE AccountID = @id AND UserID = @userId AND IsActive = 1',
            { id: effWalletId, userId }
        );
        if (chk.recordset.length === 0) {
            throw new Error('Chuna gaya Wallet/Bank Account aapki dukaan se match nahi karta ya inactive hai.');
        }
    } else {
        const defWallet = await dbQuery(
            "SELECT TOP 1 AccountID FROM Accounts WHERE UserID = @userId AND AccountType IN ('Bank', 'Portal', 'UPI', 'Digipay', 'Wallet', 'Other') AND IsActive = 1 ORDER BY AccountID ASC",
            { userId }
        );
        if (defWallet.recordset.length === 0) {
            throw new Error('Aapki dukaan ka koi active Bank ya Wallet Account nahi mila. Kripya pehle Settings/Accounts me Bank/Portal Account banayein.');
        }
        effWalletId = defWallet.recordset[0].AccountID;
    }

    return { effCashId, effWalletId };
}

module.exports = { resolveTenantBillAccounts };
