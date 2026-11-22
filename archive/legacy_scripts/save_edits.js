const fs = require('fs');
const e14865 = JSON.parse(fs.readFileSync('scripts/edit_14865.json', 'utf8'));
fs.writeFileSync('scripts/edit_14865_target.html', e14865.Target);
fs.writeFileSync('scripts/edit_14865_replacement.html', e14865.Replacement);

const e14927 = JSON.parse(fs.readFileSync('scripts/edit_14927.json', 'utf8'));
fs.writeFileSync('scripts/edit_14927_target.html', e14927.Target);
fs.writeFileSync('scripts/edit_14927_replacement.html', e14927.Replacement);

console.log('Saved target and replacement files successfully!');

