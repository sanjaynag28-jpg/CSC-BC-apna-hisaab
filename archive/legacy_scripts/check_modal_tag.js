const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

// Let's check line 9718 in index.html
const lines = content.split('\n');
for (let i = 9715; i < 9735; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
