const http = require('http');

const payload = JSON.stringify({
    customerName: 'Test Error Check',
    customerPhone: '9876543210',
    serviceType: 'PAN Card Naya (Apply)',
    govtFee: 107,
    operatorFee: 50,
    totalFee: 157,
    paidAmount: 157,
    dueAmount: 0,
    paymentMode: 'Cash',
    status: 'Applied'
});

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/csc',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        const json = JSON.parse(data);
        if (json.success && json.data && json.data.AppID) {
            console.log('✅ CSC Application Created Successfully! ID:', json.data.AppID);
            // Clean up test application
            const { query } = require('../database/db');
            await query("DELETE FROM CSCApplications WHERE AppID = @id", { id: json.data.AppID });
            await query("DELETE FROM Transactions WHERE Reference = @ref", { ref: `APP-${json.data.AppID}` });
            console.log('Cleaned up test record.');
        }
        process.exit(0);
    });
});

req.on('error', (e) => {
    console.error('Req error:', e);
    process.exit(1);
});

req.write(payload);
req.end();
