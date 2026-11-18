// BCTransactions me PortalName (AEPS portal source) column add + Notes se backfill
const { query, closePool } = require('D:/Cash Managment BC/database/db');
function portalFromNotes(notes){
  if(!notes) return null;
  let n=String(notes).trim();
  // "Portal: X | TxnID..." direct-save format
  let m=n.match(/^Portal:\s*(.+?)\s*(?:\||$)/i);
  if(m) return m[1].trim();
  // first segment before '|' is portal name
  let first=n.split('|')[0].trim();
  if(first && first.length>=3 && !/^verified edit/i.test(first) && !/^all customers/i.test(first)) return first;
  return null;
}
(async()=>{
  try{
    // 1) column exists?
    let c=await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='BCTransactions' AND COLUMN_NAME='PortalName'`);
    if(c.recordset.length===0){
      console.log('Adding PortalName column...');
      await query(`ALTER TABLE BCTransactions ADD PortalName NVARCHAR(100) NULL`);
      console.log(' added');
    } else console.log('PortalName column already exists');

    // 2) backfill
    let rows=await query(`SELECT BCID, PortalName, Notes FROM BCTransactions WHERE PortalName IS NULL OR PortalName=''`);
    console.log('rows needing backfill:',rows.recordset.length);
    let filled=0;
    for(const row of rows.recordset){
      let p=portalFromNotes(row.Notes);
      if(p){
        // normalize old generic portal name kept as-is
        await query(`UPDATE BCTransactions SET PortalName=@p WHERE BCID=@id`, {p:p.slice(0,100), id:row.BCID});
        filled++;
      }
    }
    console.log('backfilled:',filled);

    // 3) verify groups
    let g=await query(`SELECT PortalName, COUNT(*) c FROM BCTransactions GROUP BY PortalName ORDER BY c DESC`);
    console.log('groups:'); console.table(g.recordset);
    let last=await query(`SELECT TOP 6 BCID, SNCode, PortalName, Notes FROM BCTransactions ORDER BY BCID DESC`);
    console.log('last:'); console.table(last.recordset);
  }catch(e){
    console.error('PortalName migration failed:', e);
    process.exitCode = 1;
  } finally{await closePool().catch(()=>{})}
})();
