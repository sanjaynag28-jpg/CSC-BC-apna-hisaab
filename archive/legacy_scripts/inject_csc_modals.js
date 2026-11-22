const fs = require('fs');

const indexHtml = fs.readFileSync('public/index.html', 'utf8');
const cscModals = fs.readFileSync('scripts/final_csc_modals_to_inject.html', 'utf8');

// 1. Add id="btn-csc-new" to the button
let updated = indexHtml.replace(
    '<button class="btn-primary btn-csc-new" onclick="openNewCSCModal()"',
    '<button class="btn-primary btn-csc-new" id="btn-csc-new" onclick="openNewCSCModal()"'
);

// 2. Inject CSC Modals right before <!-- Scripts -->
const targetStr = '    <!-- Scripts -->\n    <script src="app.js';
if (!updated.includes(targetStr)) {
    console.error('Target string not found in index.html!');
    process.exit(1);
}

updated = updated.replace(targetStr, cscModals + '\n' + targetStr);

// 3. Verify tag balance
const openDivs = (updated.match(/<div(\s|>)/g) || []).length;
const closeDivs = (updated.match(/<\/div>/g) || []).length;
console.log('Open divs:', openDivs, 'Close divs:', closeDivs);

if (openDivs !== closeDivs) {
    console.error('Div tags are NOT balanced! Aborting.');
    process.exit(1);
}

// 4. Write updated index.html
fs.writeFileSync('public/index.html', updated, 'utf8');
console.log('Successfully injected CSC modals into public/index.html! New length:', updated.length);

