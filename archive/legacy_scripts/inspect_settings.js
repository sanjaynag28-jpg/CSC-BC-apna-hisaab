const fs = require('fs');
const s = fs.readFileSync('public/index.html', 'utf8');
const matches = [...s.matchAll(/id="(btn-tab-[^"]+)"[^>]*class="([^"]+)"/g)];
matches.forEach(m => console.log(m[1], 'classes:', m[2]));
const matches2 = [...s.matchAll(/class="([^"]*settings-tab-btn[^"]*)"[^>]*id="(btn-tab-[^"]+)"/g)];
matches2.forEach(m => console.log(m[2], 'classes:', m[1]));
