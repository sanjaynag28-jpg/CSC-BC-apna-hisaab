const { query } = require('../database/db');

async function check() {
    try {
        const csc = await query(`
            SELECT AppID, CustomerName, ServiceType, GovtFee, OperatorFee, TotalFee, PaidAmount, DueAmount, StatusRemarks 
            FROM CSCApplications 
            WHERE CustomerName IN ('Eshhak', 'Magtu', 'Kaium', 'Chandra Kali', 'Maisar', 'Shunil Kumar', 'Sunil Kumar', 'Arif', 'Ramesh Kumar', 'Shyamu Naag')
        `);
        console.log('CSC rows:');
        csc.recordset.forEach(r => console.log(r));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

check();
