/**
 * Cash Management - Automated Setup (SQLite Edition)
 * 100% Embedded Zero-Install
 */
const path = require('path');

console.log('====================================================');
console.log('   CASH MANAGEMENT SYSTEM - SQLITE EDITION SETUP     ');
console.log('   100% Zero-Install Embedded Database               ');
console.log('====================================================');

const { setupSQLite } = require('./database/setup_sqlite.js');
setupSQLite();
