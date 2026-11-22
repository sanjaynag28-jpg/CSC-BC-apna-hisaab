const fs = require('fs');
const path = require('path');

const cssDir = 'public';
const files = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));

files.forEach(f => {
  const content = fs.readFileSync(path.join(cssDir, f), 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('640px') || (l.includes('.modal') && l.includes('max-width'))) {
      console.log(`${f}:${i+1}: ${l.trim()}`);
    }
  });
});
