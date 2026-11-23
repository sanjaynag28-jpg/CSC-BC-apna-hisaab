# Cash Management Project Audit and Fix Report

Date: 2026-11-23
Branch: sqlite
Version: 1.0.70

## Result

The reported problems have been fixed. The live SQLite schema was migrated with a verified backup; no business records were lost or deleted.

## Fixes Applied

1. **Tenant isolation:** Removed 137 implicit `UserID || 1` fallbacks from authenticated API routes and the badges endpoint. Added a regression test covering every route.
2. **Failing setup tests:** Exported the SQL stored-procedure compatibility helpers from `setup-database.js`. Setup now only runs when invoked directly, not when imported by tests.
3. **Repeatable testing:** Added `npm test` for the unit test suite.
4. **Dependency security:** Removed the unused direct `archiver` dependency and pinned the vulnerable transitive `uuid` dependency to 11.1.1. Spreadsheet import/export smoke test passed.
5. **JWT secret:** Updated the SQLite installer to generate a per-install cryptographically random secret, rotate the known legacy default, and add an empty secret placeholder in `.env.example`.
6. **Documentation:** Added manual secret and local auto-login configuration guidance.
7. **SQLite integrity:** Added 51 restrictive foreign-key relationships and the missing natural-key unique index. Existing constraints and indexes were retained, and the known soft-deleted payment orphan was preserved unchanged.
8. **Safe migration:** Added dry-run/apply tooling with a verified SQLite backup, transactional table rebuilds, row/rowid/sequence hash checks, rollback on unexpected data or relationship errors, and a migration ledger entry.
9. **Schema auto-repair:** Fixed FK declarations being misread as columns, which could otherwise rebuild empty tables and remove an index. Added regression tests.

## Verification

- `npm test`: **32 passed, 0 failed**
- `npm audit --omit=dev`: **0 vulnerabilities**
- ExcelJS in-memory export/import smoke test: **PASS**
- Installer PowerShell syntax and edited block: **PASS**
- Project database invariant check: **14/14 passed**
- SQLite `integrity_check`: **ok**
- SQLite `foreign_key_check`: **1 approved soft-deleted legacy orphan; no other violations**
- Live business-table row/rowid hashes compared with the verified pre-migration backup: **all match**
- Migration dry-run after apply: **PASS; idempotent**

## Restart Note

The app was briefly stopped with approval for the schema migration and restarted after verification. The process now loads the updated code and local JWT secret; users may need to log in again.

## Repository State

The report and code changes are in the working tree; nothing was committed. `.env`, the SQLite database, backups, and customer uploads remain excluded from Git.

## Database and Schema Audit

The live database was initially inspected read-only, then migrated after the existing soft-deleted orphan policy was approved. The migration did not delete or alter business records.

### Passed

- SQLite `integrity_check`: **ok**
- Expected/live tables: **30 / 30**, with no missing or unexpected tables
- Expected/live indexes: **121 / 121**, definitions match
- Schema trigger: expected and present
- Applied schema migration ledger: **11 entries**, including `sqlite_integrity_constraints_v1`
- Column/default/key comparison: **no differences after the source-schema correction**
- Required username, API token, settings key, migration name, module code, service document, and registry SN unique indexes: **present**

### Findings

1. **Foreign-key integrity:** the canonical schema now declares 51 restrictive relationships. The previously orphaned `BillPayments.CustomerID` still points to a missing customer, but its payment is soft-deleted and was preserved unchanged per the approved policy. SQLite reports exactly this expected legacy violation.
2. **Natural-key uniqueness:** unique indexes now enforce the required username, API token, settings key, migration name, module code, service-document, and registry SN keys. Duplicate preflight and index creation succeeded.
3. **UCL serial type drift:** `UCLUpdates.GlobalSerialNo` is `TEXT`, matching migration 010 and the live database.

### Backup and migration

The pre-migration database backup was verified at `database/backups/cash_management_pre_constraints_2026-11-23T13-03-20-209Z.db`. A second verified backup was created before restoring an index after auto-repair. Both remain excluded from Git. No cascading deletes were introduced.
