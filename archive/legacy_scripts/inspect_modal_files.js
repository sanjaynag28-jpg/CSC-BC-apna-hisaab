const fs = require('fs');
const readline = require('readline');

async function dumpLineExact(ln) {
    const fileStream = fs.createReadStream('C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/.system_generated/logs/transcript_full.jsonl');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
        lineNo++;
        if (lineNo === ln) {
            fs.writeFileSync('scripts/line_' + ln + '_read_file.txt', JSON.parse(line).content);
            console.log('Saved line_' + ln + '_read_file.txt');
            break;
        }
    }
}
dumpLineExact(14754);
