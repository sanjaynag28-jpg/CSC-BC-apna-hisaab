const fs = require('fs');
const lines = fs.readFileSync('scripts/current_modal_lines.txt', 'utf8').split('\n');

console.log('--- HEADER ---');
for (let i = 45; i < 75; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

console.log('--- AMOUNT ---');
for (let i = 150; i < 170; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

console.log('--- FOOTER ---');
for (let i = 185; i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
