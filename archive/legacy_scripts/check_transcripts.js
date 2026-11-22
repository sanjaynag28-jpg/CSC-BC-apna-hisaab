const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain';
const convs = fs.readdirSync(brainDir);

for (const c of convs) {
    const tPath = path.join(brainDir, c, '.system_generated/logs/transcript.jsonl');
    if (fs.existsSync(tPath)) {
        const stat = fs.statSync(tPath);
        console.log(`${c} transcript.jsonl: ${(stat.size / 1024 / 1024).toFixed(2)} MB, modified: ${stat.mtime.toISOString()}`);
    }
}

