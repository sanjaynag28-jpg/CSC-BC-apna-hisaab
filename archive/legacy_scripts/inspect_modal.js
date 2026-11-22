const fs = require('fs');

const modalId = process.argv[2] || 'cscDetailModal';
const html = fs.readFileSync('public/index.html', 'utf8');

const target = `id="${modalId}"`;
const idx = html.indexOf(target);
if (idx === -1) {
    console.log(`Modal with ID "${modalId}" not found.`);
    process.exit(1);
}

// Find the start of the tag
const startIdx = html.lastIndexOf('<', idx);
// Find the end of this modal div (matching closing </div>)
let depth = 0;
let endIdx = startIdx;
let inside = false;

for (let i = startIdx; i < html.length; i++) {
    if (html.slice(i, i + 4) === '<div') {
        depth++;
        inside = true;
    } else if (html.slice(i, i + 6) === '</div>') {
        depth--;
        if (depth === 0 && inside) {
            endIdx = i + 6;
            break;
        }
    }
}

const modalHtml = html.slice(startIdx, endIdx);
console.log(`=== MODAL: ${modalId} (Length: ${modalHtml.length} chars) ===\n`);
console.log(modalHtml.slice(0, 3000));
if (modalHtml.length > 3000) {
    console.log('\n... [TRUNCATED ' + (modalHtml.length - 3000) + ' CHARS] ...\n');
    console.log(modalHtml.slice(-1500));
}

