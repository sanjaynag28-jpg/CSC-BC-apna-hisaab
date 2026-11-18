'use strict';

function assertIsolatedDatabase() {
    const database = process.env.DB_NAME;
    const declaredTestDatabase = process.env.TEST_DB_NAME;
    if (!database || !declaredTestDatabase || database !== declaredTestDatabase ||
        !/^CashManagement_Test(?:_|$)/i.test(database)) {
        throw new Error('Tests require DB_NAME and TEST_DB_NAME to match an explicitly configured CashManagement_Test database.');
    }
}

function assertIsolatedServer() {
    assertIsolatedDatabase();
    if (process.env.TEST_SERVER_ISOLATED !== '1') {
        throw new Error('Set TEST_SERVER_ISOLATED=1 only after starting the server against the isolated test database.');
    }
    const baseUrl = process.env.TEST_BASE_URL;
    if (!baseUrl) throw new Error('TEST_BASE_URL must point to the local isolated test server.');
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:') throw new Error('Integration tests require a local HTTP test server.');
    if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
        throw new Error('Integration tests are restricted to a local test server.');
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error('TEST_BASE_URL must be a local server origin without a path, query, or fragment.');
    }
    return baseUrl.replace(/\/+$/, '');
}

async function verifyDatabaseTarget(query) {
    assertIsolatedDatabase();
    const result = await query('SELECT DB_NAME() AS DatabaseName');
    const actual = result.recordset && result.recordset[0] && result.recordset[0].DatabaseName;
    if (actual !== process.env.TEST_DB_NAME) {
        throw new Error(`Connected database "${actual}" is not the declared isolated test database.`);
    }
}

module.exports = { assertIsolatedDatabase, assertIsolatedServer, verifyDatabaseTarget };
