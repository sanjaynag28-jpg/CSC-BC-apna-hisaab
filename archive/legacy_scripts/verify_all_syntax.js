const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let errors = 0;
function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') {
      checkDir(full);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      try {
        execSync(`node -c "${full}"`);
      } catch (err) {
        console.error('SYNTAX ERROR IN:', full);
        errors++;
      }
    }
  }
}

['public', 'routes', 'database', 'middleware', 'utils', 'server.js'].forEach(item => {
  if (fs.existsSync(item)) {
    if (fs.statSync(item).isDirectory()) checkDir(item);
    else {
      try { execSync(`node -c "${item}"`); } catch (err) {
        console.error('SYNTAX ERROR IN:', item);
        errors++;
      }
    }
  }
});

if (errors === 0) {
  console.log('✅ ALL JS FILES ARE 100% SYNTAX CLEAN!');
} else {
  console.log(`❌ Found ${errors} syntax error(s).`);
}
