(async () => {
    const payload = {
        CustomerID: null,
        ServiceType: 'Cash Withdrawal',
        CustomerName: 'Test Speed Customer',
        CustomerPhone: '9876543210',
        CustomerAadhaarLast4: '5822 7003 9999',
        BankName: 'Indian Bank',
        Amount: 500,
        CustomerCharge: 10,
        CommissionEarned: 1,
        CashAccountID: 1,
        PortalAccountID: 5,
        RRN_UTR: '631110999999',
        TransDate: '2026-11-07',
        Notes: 'Digipay Lite | TxnID: 999999999999999999',
        Status: 'Success'
    };

    console.time('API POST /api/bc Time');
    const res = await fetch('http://localhost:3000/api/bc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const json = await res.json();
    console.timeEnd('API POST /api/bc Time');
    console.log('Result success:', json.success, 'BCID:', json.data?.BCID, 'SNCode:', json.data?.SNCode);

    // Delete test record
    if (json.data?.BCID) {
        await fetch(`http://localhost:3000/api/bc/${json.data.BCID}`, { method: 'DELETE' });
        console.log('Test record cleaned up!');
    }
})();

