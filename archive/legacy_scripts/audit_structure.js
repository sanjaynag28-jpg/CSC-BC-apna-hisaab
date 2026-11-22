const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');

// Filter real modal overlay elements
const overlayRegex = /<div[^>]*class=["'][^"']*modal-overlay[^"']*["'][^>]*id=["']([^"']+)["']|id=["']([^"']+)["'][^>]*class=["'][^"']*modal-overlay[^"']*["']/g;
let m;
const overlays = [];
while ((m = overlayRegex.exec(html)) !== null) {
    const id = m[1] || m[2];
    if (id && !overlays.includes(id)) overlays.push(id);
}

console.log('Real Top-Level Modal Overlays:', overlays.length);
overlays.forEach((id, i) => {
    // Check if openModal('id') or similar is called in app.js
    const isCalled = js.includes(`'${id}'`) || js.includes(`"${id}"`);
    console.log(`${i + 1}. [${id}] - Used in JS: ${isCalled}`);
});
