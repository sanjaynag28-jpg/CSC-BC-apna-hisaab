const fs = require('fs');
const readline = require('readline');

async function findEdits() {
    const fileStream = fs.createReadStream('C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/.system_generated/logs/transcript_full.jsonl');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
        lineNo++;
        if (line.includes('edit_file') && line.includes('index.html') && (line.includes('cscNewAppModal') || line.includes('cscDetailModal') || line.includes('cscReceiptModal'))) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.tool_calls) {
                    for (const tc of parsed.tool_calls) {
                        if (tc.name === 'edit_file') {
                            console.log('Edit in line', lineNo, 'Target length:', tc.args.Target?.length, 'Replacement length:', tc.args.Replacement?.length);
                            fs.writeFileSync('scripts/edit_' + lineNo + '.json', JSON.stringify(tc.args, null, 2));
                        }
                    }
                }
            } catch(e) {}
        }
    }
}
findEdits();
