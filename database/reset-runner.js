// Database Reset Utility (Safe CommonJS runner)
const { query, closePool } = require('./db');

async function resetDb() {
    console.log('⚠️ Database Reset Runner called.');
    // Keep safe: do not reset production database automatically
}

module.exports = { resetDb };
