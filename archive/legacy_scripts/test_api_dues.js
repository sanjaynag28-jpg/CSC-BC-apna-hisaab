const http = require('http');

async function testEndpoint() {
    // Check if server is responding on 3000
    const req = http.get('http://localhost:3000/api/customers/729/dues-summary', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            console.log('Response:', data.slice(0, 300));
            process.exit(0);
        });
    });
    req.on('error', err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}

testEndpoint();
