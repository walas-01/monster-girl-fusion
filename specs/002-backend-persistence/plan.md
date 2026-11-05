# Backend Persistence Foundation — Implementation Plan

Status: Approved and implemented — locally verified, with Linux ARM64 execution and actual POSIX signal delivery still unverified.

## Approach

Extend the existing standalone backend with one file-backed SQLite connection. Open/configure it and apply pending migrations before listening for HTTP traffic. Reuse the existing configuration parser, application factory, test runner, and shutdown path rather than introducing an ORM or repository framework.

The user approved the specification, this plan, and the bookkeeping schema before implementation, then explicitly approved replacing driver 13.0.3 with 12.11.1 after the clean-install blocker below.

## Approved dependency resolution

- Driver 13.0.3 loaded after initial installation but failed clean `npm ci` on Windows: its implicit node-gyp rebuild required Visual Studio toolchain discovery despite bundled binaries. Work paused for approval; no compiler or script-policy workaround was installed.
- The user approved pinning 12.11.1. Its explicit install script tries a prebuilt release download before node-gyp fallback. The lockfile now uses `bindings` 1.5.0 / `prebuild-install` 7.1.3 rather than v13's `node-addon-api`.
- Clean local and isolated production-only installs now succeed without Visual Studio tools. Native loading reports SQLite 3.53.2 on Node 24.19.0 / Windows x64.
- npm reports `prebuild-install` as deprecated/unmaintained. This is a recorded maintenance caveat, not a reason to silently change versions again. npm reported zero known vulnerabilities at verification time.

## Driver recommendation and compatibility

Use the approved `better-sqlite3` **12.11.1** runtime dependency and `@types/better-sqlite3` **9.6.0** development dependency, pinned in the package/lockfile. Declaration compatibility is verified for the API used here. Another driver or material runtime dependency change requires review.

| Option | Trade-off |
| --- | --- |
| `better-sqlite3` — recommended | Established synchronous prepared-statement/transaction API and explicit close; adds a native dependency that must be installed for the target OS/architecture. |
| Built-in `node:sqlite` | No external driver or addon installation, but Node 24.19.0 documents the module as stability 1.2 (release candidate), not stable. It also needs manual transaction handling. |
| Callback-based `sqlite3` | Async database work avoids blocking the event loop, but adds callback/promise integration and native dependency management without a demonstrated need for this small, single-process MVP. |

Compatibility evidence:

- Package metadata for 12.11.1 explicitly supports Node 24. The lockfile records the driver's native install script and JavaScript loader/installer dependencies.
- The [v12.11.1 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.11.1) includes `better-sqlite3-v12.11.1-node-v137-win32-x64.tar.gz` and `better-sqlite3-v12.11.1-node-v137-linux-arm64.tar.gz`. Node 24 uses ABI 137.
- The Windows prebuild loads after clean installation. Actual loading on Oracle Linux ARM64, including system-library compatibility, remains unverified. A suitable cached/downloadable binary is needed on the install platform.
- The normal supported prebuild path should not require a compiler. If it cannot load on the target, stop and review the exact failure and reproducible source-build requirements (node-gyp, supported Python, C/C++ toolchain, and compatible system libraries) before adopting a workaround. Do not add infrastructure/build packages silently.
- Reinstall on the target platform using the lockfile; never copy Windows `node_modules` to Linux. Recheck transitive packages and install-script behavior after locking the actual dependency tree.
- Built-in alternative stability was checked against the [exact Node 24.19.0 documentation](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html), not assumed from another Node release.

Synchronous SQL is an explicit simplicity trade-off: short database work blocks the Node event loop. Keep transactions small, prohibit network/file-await work inside them, and revisit the driver/execution model only if actual workload measurements justify it.

## Configuration and storage

- Add `DATABASE_PATH` to `Config` and `.env.example`. Preserve the existing `PORT` and `NODE_ENV` semantics.
- In development/test, a missing value defaults to `data/game.sqlite` under the backend package directory, outside `src/` and `dist/`. This default is for manual local use; automated tests always supply temporary paths.
- Resolve relative development/test paths against the backend package directory, **not** the caller's current working directory. Pass that base directory explicitly into the pure configuration parser; derive it from the server module's location, which has the same package-parent relationship in `src/` and `dist/`.
- In production, require an explicitly supplied **absolute** filesystem path. For documentation only, `/data/game.sqlite` illustrates a future mounted location; do not create a mount or container configuration.
- Reject missing production values, empty/whitespace-only values, leading/trailing whitespace, NUL characters, `:memory:`, and URI-style database names such as `file:` URLs. Accept ordinary native filesystem paths only; do not expand shell variables or `~`.
- Reject paths resolved inside the backend's source/build directories. This is a configuration guard, not a filesystem sandbox; document that operators must not symlink storage back into disposable application directories.
- In development/test, create missing parent directories recursively. In production, require the parent directory to exist and be writable so a mistyped mount path cannot silently create an unintended directory. A new database file in that directory may be created normally.
- If the configured file is a directory, corrupt/non-SQLite file, inaccessible, or otherwise unusable, fail startup with a sanitized diagnostic and code `1`. Never open a fallback database or delete/reset the configured file.
- Ignore `backend/data/` and SQLite files/sidecars (`*.sqlite`, `*.sqlite3`, `*.db`, and their `-wal`, `-shm`, and `-journal` variants) without hiding migration source or `.env.example`.

## Connection and transaction decisions

- `openDatabase(config)` opens one driver connection using the validated path and runtime directory policy; if any configuration step fails after opening, close it before propagating a safe initialization failure.
- Explicitly enable and verify `foreign_keys = ON`.
- Use `journal_mode = WAL`, verify the returned mode, and explicitly set `synchronous = FULL` rather than inheriting the driver's NORMAL WAL default. This favors committed-data durability over peak write speed.
- Set the lock-wait timeout to **1,000 ms**, below the existing 10-second shutdown budget. Do not expose tuning variables until there is a real need.
- Document local persistent storage supporting SQLite's locking/WAL behavior; no network-filesystem assumptions. Directory persistence includes WAL/SHM/journal files, and live database copies must not discard sidecars.
- Use native `prepare().run/get/all` with bound parameters; use `exec()` only for trusted, reviewed static SQL such as migrations and transaction-independent setup.
- Use the driver's native synchronous `transaction(callback)` API rather than creating a generic query/repository abstraction. Write/migration transactions use the `.immediate()` variant. Thrown errors roll back; verify the connection can subsequently execute valid work.
- Callbacks must be entirely synchronous: no async functions, returned promises, `await`, external I/O, or manual transaction-control SQL. Native nested transactions are savepoints; document and test that behavior rather than inventing another nesting policy.
- Database handles are owned by startup/lifecycle code and passed explicitly to future consumers, not opened as module-import side effects. `createApp()` remains database-independent in this feature.

## Approved schema

The only application table introduced is migration bookkeeping:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
  sql_hash TEXT NOT NULL CHECK (length(sql_hash) = 64),
  applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
) STRICT;
```

- `version`: positive sequential migration number, supplied explicitly by the runner.
- `name`: immutable English migration identifier, unique across the catalog.
- `sql_hash`: lowercase SHA-256 hex of migration SQL after normalizing CRLF line endings to LF. The runner generates/validates it; this detects changes to an already-applied migration.
- `applied_at`: server-generated Unix timestamp in milliseconds, inserted as a bound value when the migration is committed.
- No extra indexes beyond primary-key/unique constraints, foreign keys, seed catalogs, or domain tables.

Affected consumers: the new migration runner, database initialization/startup code, database integration tests, and setup documentation. No existing API consumer or stored schema needs migration because none exists yet.

Bootstrap this metadata table transactionally only on an otherwise empty application database. If a nonempty database lacks metadata, or the metadata table has an incompatible shape, refuse startup rather than claiming it is a fresh application database. Do not silently adopt unrelated SQLite files.

The production migration catalog starts **empty**. This feature creates bookkeeping only; fixture migrations/tables live exclusively in tests. No dummy first migration is needed. Changes to the bookkeeping schema itself would require a separately reviewed upgrade strategy.

## Migration workflow

- Store migrations as explicitly imported TypeScript modules exporting `{ version, name, sql }`, registered in a small `migration-catalog.ts` manifest. Compiling with the existing `tsc` build includes them as JavaScript; no SQL asset copying, filesystem discovery, or production TypeScript loader is needed.
- Run the same migration runner automatically at application startup in development and production. No separate CLI, reset command, or additional migration library in this feature.
- Validate the catalog before execution: unique names/versions and positive contiguous versions beginning at 1, in increasing order.
- Validate that recorded history is an exact prefix of the current catalog: versions, names, and SQL hashes match. Reject unknown/newer versions, gaps, incompatible metadata, or edited applied migrations without running pending work.
- Run each pending migration's static SQL and its bound history insertion in one `.immediate()` transaction. On failure, roll back that migration and record, close the connection, and stop startup. Earlier successful migrations remain committed.
- Applied migrations are immutable. Add a new migration for subsequent changes; only a migration that failed and has no completion record may be corrected and retried.
- Migration SQL is trusted application code reviewed through the feature's schema approval process. Prohibit `BEGIN`/`COMMIT`/`ROLLBACK`, nontransactional operations such as `VACUUM`, journal-mode changes, and disabling foreign keys inside migration SQL. Do not build a general SQL parser or pretend arbitrary untrusted migration SQL is safe.
- Log safe stage identifiers and validated migration versions, never SQL text, bound values, database contents, or raw driver exceptions. Map failures to fixed diagnostics for path/open, connection setup, history validation, migration execution, and cleanup.

## Startup and lifecycle integration

- Keep configuration parsing first. Open/configure the database and migrate it before constructing the listening service; only successful initialization reaches `listen()`.
- Ensure every initialization-failure path closes any opened connection. Preserve the file for diagnosis/retry rather than deleting it.
- Extend `installLifecycle()` with one optional cleanup callback, not a resource-container abstraction. Startup supplies idempotent database close; existing HTTP-only tests/callers can omit it.
- On normal signals/server failure, stop accepting connections, drain HTTP work, then invoke cleanup exactly once before reporting completion and exiting. An HTTP listen failure must also trigger database cleanup even though the server never became listening.
- Retain a **single overall 10-second deadline**, including cleanup. Keep it active until cleanup finishes, not just until HTTP closes. A cleanup throw/rejection upgrades the exit code to `1` and logs a safe error.
- At the deadline, force-close HTTP connections and exit with code `1`; do not grant cleanup another unbounded interval or describe forced shutdown as successful. Make a best-effort database close when safe and not already underway; process exit remains the fallback.
- Report distinct completion/failure/timeout events and preserve idempotence when signals/fatal errors repeat during draining or cleanup. Do not resume serving after a fatal failure.
- A JavaScript timer cannot preempt a synchronous native call or CPU-bound callback. The 10-second deadline covers responsive event-loop work, not a hard real-time OS guarantee. Keep close synchronous/short and document this limitation; do not introduce worker processes or infrastructure for this MVP.
- Keep `GET /api/health`, the error envelope, proxy trust, and frontend integration unchanged.

## Likely files

- `backend/package.json`, `backend/package-lock.json`: driver and declaration dependencies.
- `backend/src/config.ts`, `backend/.env.example`, `.gitignore`: path configuration and file exclusions.
- `backend/src/database/connection.ts`: connection opening/configuration and failure cleanup.
- `backend/src/database/migrations.ts`: bookkeeping bootstrap, history checks, and transactional runner.
- `backend/src/database/migration-catalog.ts`: typed, initially empty production manifest.
- `backend/src/server.ts`, `backend/src/lifecycle.ts`: initialization-before-listen and cleanup integration. Extract a small startup helper only if needed to test actual resource ownership/failure paths, not as a speculative service framework.
- `backend/tests/config.test.ts`, `lifecycle.test.ts`, `startup.test.ts`, `helpers.ts`: extend existing coverage and require isolated database paths for all service subprocesses.
- `backend/tests/database.test.ts`, `migrations.test.ts`, with test-only fixtures as needed.
- `backend/README.md`, `project.md`, feature documents, `MEMORY.md`: decisions, commands, verification results, and handoff.

## Ordered task batches

### Batch 1 — Dependency, path, and connection boundary

- [x] Install approved pinned dependencies, inspect the locked tree/install requirements, and verify native loading on the local platform. Stop for review on compatibility failure or unexpected build requirements.
- [x] Add path validation/defaults and source/compiled-equivalent resolution; update example configuration and ignore rules.
- [x] Implement opening/settings/cleanup with no HTTP coupling.
- [x] Test invalid/missing production settings, relative paths, source/build exclusions, directory policy, file-backed close/reopen durability, bound values, foreign keys, transaction commit/rollback, and nested savepoints. Use temporary files exclusively.
- [x] Run type checking and connection/configuration tests; document expected ARM64 support versus actual platform execution.

### Batch 2 — Migration bookkeeping and runner

- [x] Implement the approved metadata schema/bootstrap and empty production catalog.
- [x] Add catalog/history validation and transactional pending-migration execution with safe diagnostics.
- [x] Test fresh bootstrap, no-op repeat runs, ordered fixtures, preserved earlier migrations, complete DDL/data/history rollback on failure, corrected failed-migration retry, and rejected edited/unknown/gapped histories or unrelated database files.
- [x] Verify no test-domain tables or fixture migrations enter the production catalog/build.
- [x] Run migration/database tests and type checking.

### Batch 3 — Service integration and production verification

- [x] Gate HTTP startup on successful initialization and integrate exactly-once cleanup into existing lifecycle handling, including listen failure and fatal-error paths.
- [x] Extend lifecycle tests for drain-before-close ordering, idle/active/stalled requests, cleanup throw/rejection, an unsettled cleanup deadline, and repeated signals/failures. Preserve existing regression tests and explicit Windows/POSIX skips.
- [x] Update every startup subprocess test to use a fresh temporary database directory; production subprocesses supply absolute paths. Tests never write into the default local database or load a developer's `.env`.
- [x] Test actual startup failures for unusable storage and incompatible migration state, with no `LISTENING` event; use test-only composition to exercise a failed migration through the real initializer without shipping a failure switch/endpoint.
- [x] Test resource cleanup on initialization/listen failure and graceful stop, and restart a child process against the same database to verify committed fixture durability. Do not create fixture domain tables through public routes.
- [x] Verify source and compiled startup select the same path base. Run an isolated production-only install/build-output smoke test that bootstraps metadata and applies test-only fixture migrations using the compiled runner, without development loaders or dependencies.
- [x] Run `npm ci`, type checks, the complete test suite, and the production build; smoke-test development startup with isolated storage.
- [x] Update documentation and handoff with approved decisions, migration authoring, storage permissions/sidecars, diagnostics, test results, and unverified ARM64/POSIX behavior. Preserve existing user edits in `project.md`.
- [x] Review the complete diff and ignored-file behavior; do not commit SQLite files, secrets, generated output, or infrastructure.

## Verification results and remaining limits

- Windows x64 / Node 24.19.0 / npm 11.17.0: `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` pass. Tests: 103 passed, two POSIX signal-delivery tests skipped.
- `npm run dev` was smoke-tested with isolated database storage; automatic watch restart after a source edit was not separately exercised.
- An isolated `npm ci --omit=dev` install ran compiled HTTP health/404, metadata initialization, test-only compiled migrations and durable reopen, configuration precedence, and registered graceful cleanup with no TypeScript or `tsx` present.
- No developer database or `.env` was modified. The production catalog remains empty; only bookkeeping is application schema. No infrastructure was introduced.
- Actual Linux ARM64 execution, target system-library compatibility, and actual POSIX signal delivery remain unverified. Metadata/release assets are compatibility evidence, not a target-runtime test.
- SQLite's synchronous API can block timer delivery; the shared shutdown deadline cannot preempt a native call. The deprecated prebuild installer and install-script policy warnings are documented in the backend README.

## API, deployment, and persistent-state impact

- API: no new endpoints or error-contract changes. Health keeps its liveness-only meaning, but the listener now requires successful database initialization.
- Configuration: adds `DATABASE_PATH`. Existing production startup without it intentionally fails under the approved specification; update all documented commands/examples and affected tests.
- Persistence: one application database directory, write permission, and SQLite WAL/SHM/journal support. Local default `backend/data/` is ignored. Production directory provisioning is an operator/infrastructure responsibility deferred to a later feature.
- Runtime/build: one native driver plus one development declaration package. Normal supported prebuild installation is expected; actual target Linux compatibility must still be verified before deployment.
- Sessions: no session database/store is implemented. `connect-sqlite3` remains a future authentication decision and is not replaced or installed here.
- Infrastructure: no new ports, credentials, services, Docker/Compose/Caddy files, or cloud resources.

## Approval checkpoint

All three batches, the schema, and the driver revision were approved and implemented. Changes to the driver, schema, WAL/FULL/1-second lock policy, absolute production path, or synchronous execution model require another review.
