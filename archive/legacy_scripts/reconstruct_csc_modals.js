const fs = require('fs');

function cleanReadOutput(txt) {
    const lines = txt.split('\n');
    const result = [];
    for (const l of lines) {
        const m = l.match(/^\s*(\d+):\s?(.*)$/);
        if (m) {
            result.push({ lineNo: parseInt(m[1]), text: m[2] });
        }
    }
    return result;
}

const f1 = fs.readFileSync('scripts/line_14750_read_file.txt', 'utf8');
const f2 = fs.readFileSync('scripts/line_14752_read_file.txt', 'utf8');
const f3 = fs.readFileSync('scripts/line_14754_read_file.txt', 'utf8');
const f4 = JSON.parse(fs.readFileSync('scripts/line_14756.json', 'utf8')).content;

const allLines = new Map();
[...cleanReadOutput(f1), ...cleanReadOutput(f2), ...cleanReadOutput(f3), ...cleanReadOutput(f4)].forEach(item => {
    allLines.set(item.lineNo, item.text);
});

const sortedLineNos = Array.from(allLines.keys()).sort((a, b) => a - b);
console.log('Reconstructed lines from', sortedLineNos[0], 'to', sortedLineNos[sortedLineNos.length - 1], 'count:', sortedLineNos.length);

const reconstructed = sortedLineNos.map(ln => allLines.get(ln)).join('\n');
fs.writeFileSync('scripts/reconstructed_csc_modals.html', reconstructed);
console.log('Saved to scripts/reconstructed_csc_modals.html, length:', reconstructed.length);

const modals = [...reconstructed.matchAll(/id="([^"]*Modal[^"]*)"/g)].map(m => m[1]);
console.log('Modals found in reconstructed:', modals);
