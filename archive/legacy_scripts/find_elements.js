const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');

const patterns = ['id="invCustomerSelect"', 'id="bcCustomerSelect"', 'id="cscCustomerSelect"', 'id="khataCustomerSelect"'];
patterns.forEach(pat => {
  lines.forEach((l, i) => {
    if (l.includes(pat)) {
      console.log(`${pat} found at line ${i + 1}`);
    }
  });
});
