const fs = require('fs');

const serverJs = fs.readFileSync('server.js', 'utf8');

const idx = serverJs.indexOf('app.get(\'/api/extension/config\'');
console.log(serverJs.slice(idx, idx + 1500));
