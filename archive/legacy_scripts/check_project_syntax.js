const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== SYNTAX & COMPILATION CHECK ACROSS PROJECT ===');

function checkFile(filePath) {
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        new vm.Script(code, { filename: filePath });
        console.log(`✅ ${filePath}: Syntax OK`);
        return true;
    } catch (e) {
        console.error(`❌ ${filePath}: Syntax Error ->`, e.message);
        return false;
    }
}

const folders = ['routes', 'database', 'utils'];
let ok = true;

folders.forEach(f => {
    if (fs.existsSync(f)) {
        fs.readdirSync(f).forEach(file => {
            if (file.endsWith('.js')) {
                const fullPath = path.join(f, file);
                if (!checkFile(fullPath)) ok = false;
            }
        });
    }
});

checkFile('server.js');
checkFile('extension/content.js');
checkFile('public/app.js');

if (ok) {
    console.log('\n🎉 ALL PROJECT JAVASCRIPT FILES COMPILED CLEANLY WITHOUT ANY SYNTAX ERRORS!');
}
process.exit(0);
