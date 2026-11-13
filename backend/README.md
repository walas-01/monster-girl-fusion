# Monster Girl Fusion — Backend

A minimal standalone HTTP backend. Features 001 and 002 are complete: HTTP foundation, SQLite connection/schema/migrations, owned startup/closure, isolated regression tests, clean installation and compiled runtime-only verification. Account creation, authentication, the session adapter, catalog loading, and gameplay endpoints remain unimplemented.

## Requirements

- Node.js `>=24.19.0 <25`.
- npm `>=12.2.2 <13`; verified with the recorded `12.2.2`. Commands below use a pinned invocation without changing global npm.
- Install dependencies on the machine/platform where they will be used. Do not copy Windows `node_modules` to Linux.

Direct versions are pinned in `package.json` and transitive versions in `package-lock.json`. Runtime dependencies are Express `5.3.0` and `better-sqlite3` `13.1.1`. Development dependencies are TypeScript `7.0.2`, `@types/express` `5.0.6`, `@types/node` `24.19.2`, and `@types/better-sqlite3` `9.6.0`. The driver includes native platform binaries. Its packaged Windows x64 binary loads without compilation; Linux ARM64 execution remains unverified. The approved script policy below prevents automatic native compilation fallback.

## Install and develop

Use npm 12, not npm 11: npm 11 synthesizes an unwanted `node-gyp rebuild` for this driver's lock-loaded metadata. The approved fix is `allowScripts: { "better-sqlite3": false }` in `package.json`, enforced by npm 12. It uses the packaged native binary rather than an install script. No manual `gypfile` lock metadata or global `ignore-scripts` setting is used.

npm 12 blocks dependency installation scripts unless approved. Review future script-dependent packages individually; do not blanket-approve scripts. If a compatible driver binary is missing, stop and review platform/driver support: this policy intentionally provides no automatic source-build fallback. A separately approved source build would need native build tools and a revised script policy.

From the repository root:

```sh
cd backend
npx --yes npm@12.2.2 --version
npx --yes npm@12.2.2 ci
```

All remaining commands run from `backend/`. `ci` uses the existing lockfile and replaces `node_modules`; it does not update dependency versions. `packageManager` records a version, but does not automatically replace your global npm. Use the pinned invocation throughout, or an independently managed matching npm installation. Download access to the npm registry is needed when the pinned tool/packages are not cached.

### Optional local configuration

If you do not already have `.env`, copy the example. Do not overwrite existing local settings.

PowerShell:

```powershell
Copy-Item .env.example .env
```

POSIX shell:

```sh
cp .env.example .env
```

The example contains:

```dotenv
PORT=3000
```

`.env` is ignored by Git; `.env.example` is safe to share. No Google credentials or session secrets are needed for this feature. Never commit real secrets.

Start development:

```sh
npx --yes npm@12.2.2 run dev
```

This executes `node --env-file-if-exists=.env --watch src/index.ts`:

- Node loads the optional local `.env`; missing files do not prevent startup.
- Existing process environment variables override file values.
- Imported TypeScript source changes restart the application without a manual build.
- Restart development manually after editing `.env`; automatic reload of that file is not promised.
- Native TypeScript execution does not check types. Run the typecheck separately.

Use Ctrl+C in the terminal to request shutdown. Do not run development and compiled startup on the same port simultaneously.

## Configuration

| Variable | Default | Validation |
| --- | --- | --- |
| `PORT` | `3000` when absent | Digits representing a safe integer between 1 and 65535. Empty, whitespace, fractional, signed, exponent, hexadecimal, out-of-range, and trailing-junk values are rejected. |
| `NODE_ENV` | Unset | Exact `production` enables the stricter database path requirements. |
| `DATABASE_PATH` | `backend/data/game.sqlite` outside production | Nonempty disk path without surrounding whitespace; production requires an explicit absolute path. Custom parents must exist. See storage rules below. |

There is no automatic fallback to another port. An invalid port or occupied address produces an error and unsuccessful exit status without a successful-startup message.

Example process overrides:

```powershell
$env:PORT = "4000"
npx --yes npm@12.2.2 run dev
# Remove this override when no longer wanted:
Remove-Item Env:PORT
```

```sh
PORT=4000 npx --yes npm@12.2.2 run dev
```

The server uses Node's default bind address: unspecified IPv6 when available, otherwise unspecified IPv4. It may be reachable beyond loopback. This is **not** a production network-exposure setup; do not expose it publicly without a separately reviewed deployment/security configuration. Express proxy trust remains disabled.

### SQLite storage — feature 002

`src/database.ts` exports `resolveDatabasePath(value, nodeEnv)` and `openDatabase(value, nodeEnv)`. `startServer` validates PORT first, passes `process.env.DATABASE_PATH` and `process.env.NODE_ENV` to the connection module, then runs migrations before creating/binding HTTP. Importing the modules does not open SQLite. Running `npm run dev`/`npm start` now initializes persistent storage; inspect any existing unfamiliar file before using that path. Implementation checks use temporary storage only.

- Nonproduction with an absent path resolves to `backend/data/game.sqlite`; opening that default creates its parent directory if necessary. No such workspace file is created by the tests.
- Explicit relative paths resolve against the package; their parent must already exist. Production requires an explicit absolute path.
- Empty/whitespace and in-memory paths are rejected; normalized lexical paths inside source/build/dependency directories are blocked, including `..` traversal. DATABASE_PATH is trusted operator configuration: symbolic links/junctions and real target locations are not inspected. Operators must keep actual storage outside code/build/dependency directories, including when using links. Directory targets, missing custom parents, permission problems and invalid database files are left to the driver's normal errors; no explicit regular-file preflight is performed.
- Opening enables and verifies foreign keys, WAL, FULL synchronization, and a 1,000 ms busy timeout. The caller owns the returned native connection and must close it. Initialization failure attempts to close an acquired connection.
- `src/migrations.ts` exports the ordered migration definitions and `runMigrations(database)`. The runner creates the history table plus eight empty domain tables and seven explicit indexes. It runs only when explicitly called, not when opening/importing a connection.
- All domain columns are required except species aspects and `player_progress.starters_granted_at`. Username selection must precede future account insertion. Resources/levels are nonnegative; difficulty codes are 1–4; `normal` is an accepted type identifier, not a default. Recovery uses `tired_until` only.
- `startServer` owns the connection, closes it on migration/bind failure, and supplies database cleanup to HTTP shutdown. Direct callers of `openDatabase`/`runMigrations` still own their connection and must close it themselves.

The implementation sequence and results are in [`../specs/002-database-foundation/plan.md`](../specs/002-database-foundation/plan.md). Do not use unfamiliar player storage for connection experiments. A failed open may leave an empty SQLite file or sidecars; no fallback path is chosen. A failed HTTP bind may leave a successfully migrated database; it closes the connection, not deletes the file.

### Migration rules

`runMigrations` uses one immediate transaction for history bootstrap, validation and all pending migrations. A failure rolls back the pending batch, including a newly created history table, while preserving earlier committed versions. An up-to-date database is a no-op for schema/data/history rows. Unknown existing schemas or missing/gapped/newer/changed history are rejected rather than adopted or repaired.

Migration SQL lives in TypeScript strings and compiles with the existing build. SHA-256 checksums normalize line endings to LF. Append a new ordered migration for a future schema change; never edit applied SQL, erase history, or reset player storage to bypass an error. There is no migration CLI, down migration, schema-fingerprint framework, or automatic repair. Tests can pass an explicit migration list to exercise next-version/failure cases; this is not runtime configuration. Checksums detect changes to migration SQL/history, not arbitrary manual schema tampering.

Current schema history has two versions. Migration 1 is unchanged; migration 2 (`add_species_localized_names`) adds required, nonempty `name_en` and `name_es` to `monster_species` and `enemy_species`. Names are shared catalog display data, not fields on owned monsters; no `enemies` instance table, translation table, defaults or real catalog entries are added. Existing version-1 databases with empty catalogs upgrade without changing player rows/history. If either species table already contains unnamed rows, the migration fails atomically rather than invent translations or discard data; agree a real naming/data migration before upgrading that database. No local `backend/data/` existed during this update, so no developer database was opened/created. Normal startup will apply pending migrations to the configured database; unfamiliar existing storage still requires review first.

## Check, build, and start compiled code

```sh
npx --yes npm@12.2.2 run typecheck
npx --yes npm@12.2.2 run build
npx --yes npm@12.2.2 test
```

Build **before** testing: subprocess and module-parity tests require current `dist/index.js`, `dist/database.js` and `dist/migrations.js`. Rebuild after source changes so those tests exercise current code.

All child tests receive their own absolute DATABASE_PATH with an existing temporary parent directory, overriding inherited configuration. Async-child cleanup stops/waits for the child before removing storage; short synchronous regression children also have a bounded timeout and finish before storage is removed. The full suite now passes. Point TEMP/TMP to disposable test storage when needed; tests do not load the real `.env`. Pure HTTP/port checks still do not open SQLite. npm/Node may create a compile cache under TEMP independently of test databases.

Then, with development stopped or a different port configured:

```sh
npx --yes npm@12.2.2 start
```

`npm start` executes `node dist/index.js`. It does **not** read `.env`; provide process environment variables. Nonproduction uses the default port/storage when absent; production requires an explicit absolute DATABASE_PATH with an existing parent directory.

For an explicit local compiled run that loads `.env`:

```sh
node --env-file=.env dist/index.js
```

The explicit `--env-file` command requires that file. Production should receive configuration from its runtime environment, not depend on a developer's local file. `NODE_ENV=production` can be supplied by that environment for Node/Express conventions; it does not load configuration files or add infrastructure.

### Runtime-only installation

Build in an environment containing development dependencies. A **separate runtime directory** needs only `package.json`, `package-lock.json`, and `dist/`, plus its installed runtime dependencies:

```sh
npx --yes npm@12.2.2 ci --omit=dev
npx --yes npm@12.2.2 start
```

There is no need to ship `src/`, tests, TypeScript, a development loader, or `.env`. Do not omit development dependencies before attempting to compile. Docker, Caddy, HTTPS, firewall rules, and cloud deployment are outside this feature.

This procedure passed in a separate Windows x64 directory with a temporary absolute DATABASE_PATH, production mode and TypeScript execution disabled. It loaded both migrations, served health/404 and preserved schema/history/probe data across restart. Supply production configuration before starting, for example (the directory is illustrative and must already exist):

```sh
NODE_ENV=production DATABASE_PATH=/var/lib/monster-girl/game.sqlite PORT=3000 npx --yes npm@12.2.2 start
```

On PowerShell, assign `$env:NODE_ENV`, `$env:DATABASE_PATH` (an absolute Windows path) and `$env:PORT` before the same start command. These are configuration examples, not a deployment setup; Linux ARM64 remains unverified. Give the backend account read/write/create access to its private persistent directory, including WAL/SHM files. Keep storage on a local filesystem, separate from releases and `dist/`, and retain the same path across rebuilds/restarts. Do not place WAL storage on a network share or run multiple backend writers as an unreviewed scaling strategy.

### Backup and recovery

This MVP uses a manual **offline** backup, not a live-backup service:

1. Stop the backend and every other SQLite client; wait for process exit and connection closure. Do not copy while a watcher or database browser can reopen/write the file.
2. Copy the whole dedicated database directory to a new private backup location, preserving filenames and any `-wal`, `-shm` or journal sidecars still present. A clean last close normally checkpoints/removes WAL/SHM; if they remain, do not delete them or separate the database from its WAL. Copying only the main file while WAL is active can lose committed data.
3. Record the application revision/migration versions, Node/npm versions and configured database filename with the backup. Keep backups outside the repository, release/build directories and public assets; restrict access because future backups will contain private player/session data. Back up runtime secrets separately with appropriate protection, never in Git.
4. To restore, keep all clients stopped. Preserve the current directory separately for investigation. Restore the entire selected backup into an empty dedicated directory, without mixing it with stale WAL/SHM files. Preserve its original database/sidecar filenames and grant the backend account directory access.
5. Point DATABASE_PATH to the restored absolute path and use code matching its migration history. Start once, inspect startup logs and check `/api/health`; health alone is not a data-integrity check. Verify expected records and history on an isolated copy before using an unfamiliar backup. Newer code may apply pending migrations; take a backup first. Older code rejects newer history. Never edit history, rerun old SQL manually, or erase data to bypass rejection.

If startup fails, stop and preserve the files/logs; investigate the path, permissions, native binary and history error rather than choosing an empty replacement database. Populated unnamed version-1 catalogs require an agreed naming/data migration as described above. WAL/FULL and regression tests do not certify every filesystem, power-loss scenario or backup restore; no restore drill against real player data was performed.

## HTTP behavior

### Health

`GET /api/health` returns HTTP `200` with:

```json
{ "status": "ok" }
```

This checks the responding HTTP process only; it runs no SQL and creates no sessions or files per request. Startup requires successful database initialization, but health does not recheck ongoing database state.

With the server running on port 3000, open `http://localhost:3000/api/health` in a browser or use:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

```sh
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/missing
```

### Errors

Unknown routes return HTTP `404`:

```json
{ "error": { "code": "NOT_FOUND", "message": "Route not found." } }
```

Unhandled request errors before a response starts return HTTP `500`:

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Internal server error." } }
```

These responses use `application/json; charset=utf-8`. Internal errors produce a fixed diagnostic log rather than dumping request data or the full error object. Private error messages, stacks, and attached properties are not returned. Once response headers have been sent, the handler delegates to Express; it cannot replace the existing response and the connection may be closed instead. No public endpoint deliberately triggers an error.

## Source map

| File | Responsibility |
| --- | --- |
| `src/app.ts` | `createApp`, health, 404 fallback, and exported error handler. No listener starts on import. |
| `src/server.ts` | `readPort`, SQLite startup ownership, HTTP readiness and `registerShutdown` with database cleanup after HTTP. |
| `src/index.ts` | Executable entry point and startup-failure exit status. |
| `src/database.ts` | Explicit SQLite path validation/open/settings; called by startup before migrations/HTTP. |
| `src/migrations.ts` | Initial nine-table schema, checksums/history and transactional runner; called explicitly by startup. |
| `tests/app.test.ts` | Application isolation and HTTP response contracts. |
| `tests/server.test.ts` | Port validation, source/compiled subprocesses, draining, timeout, repeated shutdown, and platform-aware signal tests. |
| `tests/database.test.ts` | Temporary connection/path/settings checks plus schema constraints, migration history, rollback and source/compiled parity. |
| `tsconfig.json` | Strict checking of source and tests without emitting output. |
| `tsconfig.build.json` | Emits application source only into `dist/`, not tests. |

TypeScript uses ESM/NodeNext, explicit relative `.ts` imports rewritten to `.js` at build time, and erasable syntax compatible with Node. Avoid enums, parameter properties, and path aliases that require a development transformer. No empty domain-layer directories, ORM, global configuration framework, or custom test framework is included.

## Shutdown

`SIGINT`/`SIGTERM` request a guarded close: stop accepting new connections, allow active requests to finish, and force-close remaining HTTP connections after 10 seconds. Repeated shutdown calls share one promise. Timers and owned signal listeners are removed; signal-triggered shutdown failure sets an unsuccessful exit status.

`registerShutdown(server, timeoutMs, closeDatabase)` keeps the third argument optional for HTTP-only callers. Startup supplies one synchronous SQLite-close callback. It runs once after HTTP close completion, including forced closure; the timeout remains a failure even after connections close. Database-close failure rejects shutdown; combined HTTP/timeout and DB-close failures retain both errors in AggregateError. Listeners/timer are removed even if cleanup throws. A native-close error is reported, not a promise that a failing driver can always release its handle.

Idle persistent connections can affect how long the close takes. The controlled draining test uses `Connection: close`; it does not certify immediate completion for arbitrary keep-alive clients. Shutdown does not replace future database transactions or a safe retry policy.

Windows `child.kill('SIGINT')`/`child.kill('SIGTERM')` force termination rather than exercise POSIX handlers. The suite explicitly skips those two real-signal tests on Windows while still running direct lifecycle tests. Automated real POSIX delivery remains unverified until run on Linux/macOS; forced cleanup of test processes is not evidence of graceful signal handling.

## Verification and limits

The final batch-4 result below is current. Earlier entries are historical snapshots, including their then-pending tasks and former path-policy guarantees.

Feature 001 baseline, verified on **2026-11-11, Windows x64, Node 24.19.0 / npm 11.17.0** (before adopting the SQLite dependency):

- Clean `npm ci`, typecheck, build, and full suite: **37 passed, two POSIX-signal skips, zero failures**.
- Both full and isolated runtime-only installs reported zero vulnerabilities at check time; this is not a permanent security guarantee.
- Source and compiled startup, port validation/bind failures, health, JSON errors, no session cookies, and controlled error-leakage checks.
- Direct active-request draining, shortened forced deadline, repeated shutdown, and signal-listener cleanup.
- Isolated `npm start` with only package files, `dist/`, and runtime dependencies; no source, `.env`, compiler, or development types. Health/404 passed with TypeScript execution disabled.
- Isolated `npm run dev` loaded a safe fixture `.env`, restarted after a source edit, and restarted again after byte-exact restoration. Workspace code/config/test fingerprints were unchanged. All temporary process trees stopped and their HTTP ports closed.

Feature 002 batches 1–2, checked through **2026-11-12** on the same platform/toolchain: pinned driver/types installed; typecheck/build pass; full suite **147 passed, three skipped, zero failures** (150 total). The 37 connection cases cover default/custom/production/invalid paths, source/compiled resolution, prohibited roots/traversal/directory aliases, settings, persistence and initialization-failure cleanup. Another 74 cases verify the nine-table schema, constraints/indexes, required/nullable fields, numeric bounds, JSON, canonical recipes, RESTRICT relationships, no-op/persistence, new versions, transactional rollback, incompatible/unknown history and compiled/source migration parity. All records are disposable probes; no game roster or developer data is created. A file-symlink case skips on Windows EPERM (requires Developer Mode or elevation); directory-junction tests passed. The other two skips are POSIX signals. The dependency install reported zero vulnerabilities; this batch added no dependencies. Linux ARM64, real POSIX signals and file-symlink protection on this host remain unverified. Runtime-only packaging with the adopted native dependency and lifecycle integration remain pending; the earlier runtime-only result does not verify this unfinished feature.

Feature 002 batch 3 task 1, **2026-11-12**: typecheck/build pass; selected direct server tests **37 passed / two POSIX skips**, app/database suites **115 passed / one file-symlink skip**. Combined **152 passed / three skipped / zero failures** across the selected checks. Ten new direct tests verify temporary DB startup/closure and failure ordering. Five child tests were deliberately not run, pending task-2 isolation. This is not a full-suite result; the 147-pass result above is the historical pre-integration baseline. No real `.env`, developer storage, new dependency or infrastructure changes.

Approved path simplification, **2026-11-12**, before child isolation: removed alias/realpath and regular-file preflight, while preserving basic path policy, SQLite settings/verification and error cleanup. Four old alias-protection cases were replaced by one lexical-only policy case; the directory-target case now checks the driver's controlled failure. The file-symlink skip was retired, not newly verified. Typecheck/build passed; app/database **113 passed / zero skipped**, selected server checks **37 passed / two POSIX skips**: **150 passed / two skipped / zero failures** in 152 selected cases. These counts and earlier alias guarantees are historical; native POSIX/ARM64 limits are unchanged.

Feature 002 batch 3 task 2, **2026-11-12**: typecheck/build pass; all existing server tests **42 passed / two POSIX skips / zero failures** (44 total), including the five previously excluded child cases. All child environment setups specify temporary absolute database paths; inherited sentinel storage stayed unused and all test storage was removed after child cleanup. Signal-child setup was reviewed but remains skipped on Windows. No application source, `.env`, schema/lifecycle, dependency or infrastructure changes. Full `npm test` and new source/compiled restart/persistence checks have not been run/added in this task.

Feature 002 batch 3 task 3, **2026-11-12**: typecheck/build and full `npm test` pass: **165 passed / two POSIX skips / zero failures** (167 total). Ten new cases verify source/compiled restart with normal public-shutdown calls, unchanged schema/history/probe-user data, reusable HTTP ports, and rejection of missing parents/invalid files/unknown schemas/changed history before binding. Compiled children run with TypeScript execution disabled. All fixtures are temporary; no application source corrections, `.env`, dependency, schema/API or infrastructure changes were needed. Inherited sentinel storage stayed unused; test directories were removed after processes finished. Earlier partial-suite results above are historical.

Feature 002 batch 4 attempt, **2026-11-12**: an isolated clean `npm ci --include=dev --foreground-scripts` failed before typecheck/build/tests/runtime checks. npm synthesized `node-gyp rebuild`; Visual Studio detection failed, with an additional EPERM warning during npm's temporary TypeScript-folder cleanup. The package includes `gypfile: false` and prebuilt binaries, but the generated lock metadata does not retain that flag. Related upstream reports: [npm #3341](https://github.com/npm/cli/issues/3341) and [better-sqlite3 #1516](https://github.com/WiseLibs/better-sqlite3/issues/1516). A separate disposable experiment adding the flag to the lock made clean installation pass, but `npm install --package-lock-only` removed it again. **The user chose to pause without that workaround.** Project package/lock, application code, real `.env` and system tools were left unchanged. Temporary packages/data/cache were removed; only a technical verification script and failure log remain outside the repository. `.env.example` received path guidance; final operating/backup docs are still pending. The 165-pass result above is the prior batch-3 result, not a new clean-install verification.

Authorized localization follow-up: migration 2 adds the four species-name columns without changing migration 1. Typecheck/build/full suite with existing dependencies pass **170 passed / two POSIX skips / zero failures** (172 total). Five new cases cover empty-catalog upgrade preserving history/player rows, populated legacy-catalog rollback, required Unicode names and repeatable display names. Existing migration/default/constraint/lifecycle checks now account for both versions. All databases were disposable; no developer storage was opened, no new dependencies or API contracts were added. This is not a clean-install result and does not resume the paused batch 4.

Feature 002 batch 4 completed, **2026-11-12, Windows x64, Node 24.19.0 / npm 12.2.2**. This supersedes the historical paused-install status above. The user approved npm 12 plus the explicit driver-script deny; global npm and dependency versions are unchanged. Lock regeneration retained the policy and dependency entries; no manual `gypfile` field was added. Clean full install (81 packages), typecheck/build and full suite **170 passed / two POSIX skips / zero failures** passed. Separate runtime-only install (67 packages) loaded SQLite **3.54.1**, started without source/compiler/types/auth secrets, ignored a poison `.env`, served health/404 and preserved schema/history/probe rows after restart. Direct exported shutdown also passed. Both installs reported zero vulnerabilities and no native-build/EPERM warnings at check time, not a permanent security guarantee.

The actual development command loaded a generated `.env`, respected process overrides, worked without `.env`, and restarted after a source edit and exact restoration while preserving database contents. Source/compiled path parity and both migration versions/name columns were checked. Workspace code/tests/config/lock/real `.env` fingerprints stayed unchanged throughout verification. All owned child trees stopped, ports closed and temporary package/database/cache directories were removed. Technical verifier/reports remain outside the repository.

Not verified: Linux ARM64 execution/build, real POSIX signals, actual power-loss behavior, a real-data backup/restore drill, real HTTPS/reverse-proxy behavior or Google authentication. Normal code-driven shutdown on Windows is verified, not OS-delivered POSIX shutdown. TypeScript 7 uses a native platform compiler; its Linux ARM64 package exists, but has not been executed here. Install build dependencies for the build host and runtime dependencies for the runtime host. Missing native prebuilds need a separate reviewed solution under this deny policy. No production infrastructure was created.

Feature specifications and results are in [`../specs/001-backend-foundation/`](../specs/001-backend-foundation/) and [`../specs/002-database-foundation/`](../specs/002-database-foundation/). [`../database.md`](../database.md) documents the implemented schema and still-pending game rules. Authentication, gameplay and production infrastructure require separate approved scope.
