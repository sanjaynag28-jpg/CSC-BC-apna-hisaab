const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/sanjay nag/.gemini/antigravity/brain/d7348a13-a163-4f24-ac0f-b3ce70aedc69/page_previews';
const files = fs.readdirSync(dir);

const results = [];
for (const f of files) {
    if (f.endsWith('.png') || f.endsWith('.jpg')) {
        const stat = fs.statSync(path.join(dir, f));
        results.push({ name: f, time: stat.mtime.toISOString(), size: stat.size });
    }
}

results.sort((a, b) => a.time.localeCompare(b.time));

console.log('Total preview images:', results.length);
console.log('\n--- All receipts and modals ---');
results.filter(r => /receipt|slip|modal|dossier|detail|passbook/i.test(r.name)).forEach(r => {
    console.log(`${r.time}  ${r.name.padEnd(45)}  ${(r.size/1024).toFixed(1)} KB`);
});

