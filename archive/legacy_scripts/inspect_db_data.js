const { getPool } = require('../database/db');

async function inspectData() {
  const pool = await getPool();

  console.log('--- 1. BCTransactions non-null column counts ---');
  const bcCols = await pool.request().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(RRN_UTR) as has_rrn,
      COUNT(AccountBalance) as has_acc_balance,
      COUNT(DateOfBirth) as has_dob,
      COUNT(SNCode) as has_sncode,
      COUNT(CustomerAadhaarLast4) as has_aadhaar,
      COUNT(BankName) as has_bank,
      COUNT(CommissionEarned) as has_comm,
      COUNT(CustomerCharge) as has_charge,
      COUNT(Notes) as has_notes,
      COUNT(BeneficiaryName) as has_bene
    FROM BCTransactions
  `);
  console.log(bcCols.recordset[0]);

  console.log('--- 2. CSCApplications non-null column counts ---');
  const cscCols = await pool.request().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(AckNumber) as has_ack,
      COUNT(CustomerAadhaar) as has_aadhaar,
      COUNT(DateOfBirth) as has_dob,
      COUNT(ExpectedDate) as has_expected,
      COUNT(CompletionDate) as has_completion,
      COUNT(CertificateDocNo) as has_cert_no,
      COUNT(CertificateFile) as has_cert_file,
      COUNT(GovtFee) as has_govt_fee,
      COUNT(OperatorFee) as has_op_fee,
      COUNT(DueAmount) as has_due,
      COUNT(StatusRemarks) as has_remarks,
      COUNT(SNCode) as has_sncode
    FROM CSCApplications
  `);
  console.log(cscCols.recordset[0]);

  console.log('--- 3. Customers non-null column counts ---');
  const custCols = await pool.request().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(GSTIN) as has_gstin,
      COUNT(CreditLimit) as has_credit_limit,
      COUNT(Address) as has_address,
      COUNT(AadhaarNumber) as has_aadhaar,
      COUNT(DateOfBirth) as has_dob,
      COUNT(FamilyID) as has_family,
      COUNT(FamilyName) as has_family_name,
      COUNT(Relationship) as has_rel,
      COUNT(Notes) as has_notes
    FROM Customers
  `);
  console.log(custCols.recordset[0]);

  console.log('--- 4. KhataEntries non-null column counts ---');
  const khataCols = await pool.request().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(ReferenceNo) as has_ref,
      COUNT(Attachment) as has_attachment,
      COUNT(Description) as has_desc,
      COUNT(InvoiceID) as has_invoice,
      COUNT(CSCAppID) as has_csc,
      COUNT(BCID) as has_bc,
      COUNT(SNCode) as has_sncode
    FROM KhataEntries
  `);
  console.log(khataCols.recordset[0]);

  console.log('--- 5. Documents count and samples ---');
  const docs = await pool.request().query(`
    SELECT TOP 5 DocumentID, CustomerID, OriginalName, FileType, FileSize, UploadedBy, Description, CreatedAt
    FROM Documents
  `);
  console.log(docs.recordset);

  console.log('--- 6. BCCounterSessions sample ---');
  const sessions = await pool.request().query(`
    SELECT TOP 3 SessionID, SessionDate, OpeningCash, ActualClosingCash, ExpectedClosingCash, CashDifference, Status, Note500, Note200, Note100
    FROM BCCounterSessions ORDER BY SessionID DESC
  `);
  console.log(sessions.recordset);

  console.log('--- 7. AuditLogs count and sample ---');
  const audits = await pool.request().query(`
    SELECT TOP 5 LogID, Action, TableName, RecordID, Module, EntityName, Amount, CreatedAt, Details
    FROM AuditLogs ORDER BY LogID DESC
  `);
  console.log(audits.recordset);

  process.exit(0);
}

inspectData().catch(err => {
  console.error(err);
  process.exit(1);
});

