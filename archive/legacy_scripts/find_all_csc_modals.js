const fs = require('fs');
const readline = require('readline');

async function findCscModals() {
    const fileStream = fs.createReadStream('C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/.system_generated/logs/transcript_full.jsonl');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
        lineNo++;
        if (line.includes('cscNewAppModal') && line.includes('cscReceiptModal') && line.includes('cscDetailModal')) {
            console.log('Line with ALL CSC modals:', lineNo, 'length:', line.length);
        }
    }
}
findCscModals();

