const fs = require('fs');

let recon = fs.readFileSync('scripts/reconstructed_csc_modals.html', 'utf8');
const receiptUpgraded = fs.readFileSync('scripts/edit_14927_replacement.html', 'utf8');

const rStart = recon.indexOf('<!-- 3. CSC Citizen Acknowledgment Receipt Modal');
if (rStart !== -1) {
    recon = recon.slice(0, rStart) + receiptUpgraded.trim() + '\n        </div>\n    </div>\n';
}

fs.writeFileSync('scripts/final_csc_modals_to_inject.html', recon);

// Check div count
const openDivs = (recon.match(/<div(\s|>)/g) || []).length;
const closeDivs = (recon.match(/<\/div>/g) || []).length;
console.log('Open divs:', openDivs, 'Close divs:', closeDivs);
if (openDivs === closeDivs) {
    console.log('PERFECT! Div tags are completely balanced!');
} else {
    console.log('Difference:', openDivs - closeDivs);
}
