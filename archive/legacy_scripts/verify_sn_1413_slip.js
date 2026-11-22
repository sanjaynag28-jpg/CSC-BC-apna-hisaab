const { getPool } = require('../database/db');

(async () => {
    const pool = await getPool();
    const r = await pool.request().query("SELECT * FROM BCTransactions WHERE BCID = 199");
    const trans = r.recordset[0];
    
    // Simulate openSlipFromData logic
    const snCode = trans.SNCode || `SN-${trans.GlobalSerialNo}`;
    const rrnCode = trans.RRN_UTR || '-';
    const rawTxnId = String(trans.TransactionID || (trans.Notes && trans.Notes.match(/TxnID:\s*[:\s]*([A-Za-z0-9]+)/i)?.[1]) || '').replace(/^[\s:\-–—#=]+/, '').trim();
    const effectiveRrn = (rrnCode && rrnCode !== '-') ? rrnCode : (rawTxnId || '-');
    const cleanBank = String(trans.BankName || '').replace(/^[\s:\-–—#=]+/, '').trim();

    console.log('--- SLIP PREVIEW FOR SN-1413 ---');
    console.log('Top Header:');
    console.log('  Universal SN:', snCode);
    console.log('  Bank Ref / RRN:', effectiveRrn);
    console.log('  Kaam / Sewa:', (trans.ServiceType || '').toUpperCase());
    console.log('\nLen-Den Vivran (Left):');
    console.log('  Universal SN:', snCode);
    console.log('  Receipt No:', 'BC-2026-' + String(trans.BCID).padStart(4, '0'));
    console.log('  Tarikh & Samay:', trans.TransDate.toISOString().split('T')[0], trans.TransTime);
    console.log('  Kis Kaam Ka:', (trans.ServiceType || '').toUpperCase());
    console.log('  Portal:', trans.PortalName);
    console.log('  Bank Ref / RRN (लेन-देन नंबर):', effectiveRrn);
    console.log('  Portal Txn ID (गेटवे आईडी):', rawTxnId);
    console.log('\nGrahak evam Bank (Right):');
    console.log('  Grahak:', trans.CustomerName);
    console.log('  Mobile:', trans.CustomerPhone);
    console.log('  Bank:', cleanBank);
    console.log('  Aadhaar:', trans.CustomerAadhaarLast4);
    console.log('  Khata Balance:', '₹' + Number(trans.AccountBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }));
    console.log('\nAmount:');
    console.log('  LEN-DEN RASHI:', '₹' + Number(trans.Amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }));
    process.exit(0);
})();

