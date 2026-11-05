# Backend Persistence Foundation

Status: Approved and implemented — locally verified; Linux ARM64 execution and actual POSIX signal delivery remain unverified. See `plan.md`.

## Goal

Give the existing backend a small, reliable SQLite persistence foundation before authentication or game features introduce real player data. Future features must be able to apply reviewed schema changes and commit related changes atomically without depending on a running browser or volatile process state.

## User-facing behavior

There is no new player-facing interface or data-management endpoint. Developers can configure where the backend stores its database, start it reproducibly, and restart or rebuild the application without losing committed data.

The backend accepts HTTP traffic only after database initialization and required migrations succeed. Initialization failures stop startup clearly instead of starting a partially usable service or silently substituting an empty/in-memory database.

## Scope

- A SQLite driver compatible with the supported Node 24 runtime and the Linux ARM64 deployment target.
- One file-backed application database with an environment-configured path.
- Reproducible, versioned schema migrations and minimal migration bookkeeping.
- A small database boundary supporting queries and atomic transactions for future features.
- Integration with startup and bounded graceful shutdown.
- Automated persistence, migration, failure, and lifecycle verification.
- Setup documentation and documented deployment/storage impacts.

## Non-goals

- Users, authentication, session storage, or game-domain tables and seed catalogs.
- Database-backed API endpoints, a database browser, or a new readiness endpoint.
- Changing the existing health response or API error envelope.
- An ORM, general-purpose repository framework, connection pool, or multiple backend processes.
- Concurrent migration orchestration, horizontal scaling, or additional database engines.
- Automatic down migrations, destructive resets, backup automation, or a full disaster-recovery system.
- Frontend changes, Dockerfiles, Compose files, Caddy configuration, or cloud resources.

## Requirements

### 1. Driver and integration

- Select the smallest practical driver that supports queries, transactions, and explicit connection cleanup under Node 24.
- Review Linux ARM64 support before adoption, including native/transitive dependencies and any prebuilt-binary or source-build requirements. Distinguish documented compatibility from execution actually verified on ARM64.
- Keep database initialization and access separate from HTTP handlers and game rules. Preserve the existing ability to construct and test the HTTP application without opening the production database.
- Do not introduce speculative data-access layers or domain models.

### 2. Persistent file configuration

- The application database path is configurable through an environment variable. The implementation plan defines its name, local default, relative-path resolution, and directory-creation behavior.
- Local development has a documented non-secret file-backed default outside source and build directories. Production requires an explicit database path so a missing setting cannot silently select an unintended local database.
- Reject empty paths, in-memory database configuration, and unusable storage with an actionable startup diagnostic and nonzero exit status. Do not fall back to another database when opening the configured path fails.
- Reuse an existing database at the configured path without resetting it on startup. Rebuilding or replacing application code must not erase its contents.
- Keep database files and SQLite sidecar files out of version control. Document that future persistent mounts must cover the database directory, not just its main file.
- Introduce no credentials, additional services, or machine-specific filesystem assumptions.

### 3. Schema migrations

- Provide one reproducible migration workflow for both source-based development and the compiled production application, without requiring development loaders in production.
- Apply pending migrations in a deterministic order before the HTTP listener starts. Repeated startup with no pending migrations must preserve data and avoid reapplying completed migrations.
- Commit each migration's transactional schema/data changes and its completion record together. If it fails, roll back that migration, do not mark it complete, stop startup, and allow a corrected migration to be retried safely. Previously committed migrations need not be undone.
- Do not silently reset a database or proceed when its migration state is unsupported by the application.
- Migration bookkeeping is the only non-test schema permitted in this feature. Its representation, exact schema/constraints, and affected code must be proposed in the plan and explicitly approved before implementation.
- Do not add dummy player/game tables or sample data just to demonstrate migrations. Tests may use isolated fixture migrations and tables that never ship as application schema.

### 4. Queries and transactions

- Support parameterized statements so future code can bind values rather than concatenate untrusted input into SQL.
- Provide a straightforward way to execute related writes atomically. Successful transactions commit all changes; failed transactions leave none of their changes committed.
- Do not leave a failed transaction open or make the connection unusable for subsequent valid operations.
- Enable and verify foreign-key enforcement for application connections so future approved constraints can be relied on.
- Document transaction callback constraints and supported use; do not assume async, nested, or concurrent transaction behavior that the selected driver does not safely provide.
- Connection settings such as journal mode and lock-wait behavior are reviewed in the implementation plan, not assumed or exposed as unnecessary configuration.

### 5. Startup, shutdown, and diagnostics

- Open/configure the database and finish migrations before accepting HTTP connections.
- If later startup steps fail, including binding the HTTP port, close any opened database resources before exiting.
- Extend the existing graceful shutdown path to drain HTTP work before closing the database. Keep shutdown idempotent and within a finite overall deadline rather than adding an unbounded cleanup stage.
- Database cleanup failures must be diagnosable and result in a nonzero exit status. Forced termination must not be described as a successful graceful shutdown.
- Preserve safe operational logging: no SQL parameter values, database contents, secrets, or raw internal exception dumps.
- `GET /api/health` remains HTTP `200` with `{ "status": "ok" }` while serving requests. Startup gating does not change it into a continuous database-readiness check or introduce writes in that endpoint.

### 6. Verification and documentation

- Tests use isolated temporary database directories and never a developer's configured database. File-backed tests prove durability; in-memory tests alone are insufficient.
- Verify that committed fixture data survives closing/reopening a database and restarting a test process using the same file.
- Verify transaction commit, rollback, subsequent connection usability, parameter binding, and foreign-key enforcement.
- Verify fresh initialization, ordered pending migrations, repeated-run safety, and rollback/retry of a failed migration without a false completion record.
- Verify invalid configuration, unusable storage, failed migrations, and HTTP listen failures stop startup safely and release opened resources.
- Verify database cleanup on graceful shutdown and cleanup-failure/timeout behavior, preserving existing lifecycle coverage and documenting Windows/POSIX limitations.
- Existing HTTP tests, type checking, and production build must continue to pass. Verify the compiled application can initialize its database and run migrations without development dependencies.
- Document configuration, migration authoring/execution, directory ownership/writability, persistent sidecar storage, and verification limitations.

## Acceptance criteria

- [x] The backend uses a reviewed SQLite driver with documented Node 24/Linux ARM64 compatibility evidence and any execution limitations stated.
- [x] The configured file-backed database is reused across restarts; production rejects a missing path and invalid/unusable storage does not trigger a fallback database.
- [x] Committed fixture data survives reopening and a process restart using the same file.
- [x] Migrations run in order before HTTP startup and do not reapply completed work.
- [x] A failed migration rolls back its changes and completion record, stops startup, and can be retried safely after correction.
- [x] Transactions, parameter binding, and foreign-key enforcement behave as specified.
- [x] Startup failure and bounded shutdown close database resources, with cleanup failures reported and tested.
- [x] Existing API contracts and independent HTTP-application tests remain intact.
- [x] Type checks, persistence tests, existing regression tests, and production compilation/startup verification pass.
- [x] Only approved migration bookkeeping exists as application schema; no domain tables, sessions, frontend, or infrastructure are added.

## Approved decisions and future scope

- The user approved this specification, the implementation plan and bookkeeping schema, and the later driver revision to `better-sqlite3` 12.11.1. See `plan.md` for the trade-offs, exact schema, verification results, and platform limitations.
- Future schema/dependency changes still require explicit review; completion of this feature is not approval for domain tables.
- Separate persistent session storage remains an authentication-feature decision; do not install or implement it here.
