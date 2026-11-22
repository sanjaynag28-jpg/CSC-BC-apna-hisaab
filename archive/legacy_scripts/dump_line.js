const fs = require('fs');
const readline = require('readline');

async function dumpLine(targetLine) {
    const fileStream = fs.createReadStream('C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/.system_generated/logs/transcript_full.jsonl');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
        lineNo++;
        if (lineNo === targetLine) {
            const parsed = JSON.parse(line);
            console.log('Type:', parsed.type, 'Keys:', Object.keys(parsed));
            if (parsed.tool_calls) {
                console.log('Tool calls:', parsed.tool_calls.map(tc => ({ name: tc.name, path: tc.args?.Path })));
            }
            let str = parsed.content || JSON.stringify(parsed);
            fs.writeFileSync('scripts/line_' + targetLine + '_dump.txt', str);
            console.log('Saved scripts/line_' + targetLine + '_dump.txt, length:', str.length);
            break;
        }
    }
}
dumpLine(11955);
