const fs = require('fs');
const path = require('path');

const routesDir = 'routes';
for (const f of fs.readdirSync(routesDir)) {
    if (!f.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(routesDir, f), 'utf8');
    const matches = [...code.matchAll(/insertRes/g)];
    if (matches.length) {
        console.log(`In ${f}: ${matches.length} matches`);
    }
}
