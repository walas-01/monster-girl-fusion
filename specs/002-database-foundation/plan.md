# 002 — Database Foundation Implementation Plan

**Status:** all four batches complete (2026-11-12). Clean install/typecheck/build/full suite **170 passed / two Windows POSIX-signal skips / zero failures** (172 total), isolated runtime-only restart/persistence and development `.env`/watch checks passed on Windows x64/Node 24.19.0/npm 12.2.2. The user approved npm 12 plus an explicit driver-script deny after the historical npm 11 blocker. Dependency versions and global npm unchanged; only generated root npm-engine metadata changed in the lock for batch 4. Operating/offline backup/recovery documentation complete; no real `.env`, player data or infrastructure changes. Linux ARM64, real POSIX signals, power-loss behavior and real-data restore drills remain unverified. Earlier batch/follow-up results below are historical snapshots, including their then-pending tasks.

**UI mockups:** Decision: no (no UI).

## 1. Approach and decisions for approval

Use one persistent SQLite database and one synchronous connection owned by backend startup. Create the nine agreed tables, initially empty, and run a small explicit migration sequence before opening HTTP. Keep SQL visible; no ORM, repository layer, schema generator, migration framework, session adapter, or new API is needed.

### Driver recommendation

| Option | Advantage | Trade-off |
| --- | --- | --- |
| **`better-sqlite3` 13.1.1 — recommended** | Mature synchronous API with short transactions and automatic rollback on exceptions; direct SQL remains readable. | Adds a native runtime dependency. A matching binary must load on each target; source compilation needs a native toolchain if the packaged binary cannot be used. |
| Node 24 `node:sqlite` | Already shipped with Node; no additional driver package. | Current Node 24 documentation marks it release candidate. Its API/stability follows the Node release, and transaction boundaries would be managed explicitly. |

Propose pinning runtime `better-sqlite3` **13.1.1** and development `@types/better-sqlite3` **9.6.0**. Registry metadata checked during planning reports Node `>=22`, compatible in principle with the project's Node `>=24.19.0 <25` range. Read-only archive inspection confirmed packaged `win32-x64.node`, `linux-arm64.node`, and `linuxmusl-arm64.node` binaries. The subsequently authorized isolated Windows check passed, as recorded under batch 1; metadata alone does not prove other target compatibility. A native C++/Python/node-gyp toolchain may still be required if a binary is missing or incompatible; do not suppress install errors or silently switch versions/drivers. Linux ARM64 execution remains unverified.

Batch 1 task 1 verified this driver in isolated temporary storage under explicit user authorization. Do not adopt the old pre-reboot version or advance to project installation without authorization for the next task.

### Approved schema and migration choices

- Use SQLite `STRICT` tables and explicit integer-range checks. This prevents incompatible stored types; it does not replace future HTTP validation or prevent SQLite's lossless type conversions.
- Encode difficulties as **1 = Easy, 2 = Normal, 3 = Hard, 4 = Very Hard** in both enemy definitions and player progression. This does not choose the player's initial unlocked difficulty.
- No initial balances, purchased levels, capacities, starter roster, or game content. Required state must be supplied explicitly by future initialization. The existing `tired_until = 0` sentinel is the only inventory default.
- Use `foreign_keys = ON`, WAL journaling, `synchronous = FULL`, and a **1,000 ms** busy timeout. These are fixed backend connection settings, not extra environment variables. FULL avoids relying on the driver's faster, less durable WAL default. A synchronous driver still blocks the event loop during SQL/lock waits: keep work short and use one backend process for the MVP.
- Fail on incompatible migration history; never adopt an unrelated database, reset player storage, or repair history automatically.

## 2. Files and why they are needed

| Path | Responsibility / why the existing code is not enough |
| --- | --- |
| `backend/src/database.ts` — new | Resolve/validate storage, open/configure the connection, and close on connection-configuration failure. Existing HTTP lifecycle code cannot currently open persistent storage. Keep path helpers here instead of creating separate configuration/connection modules. Batch 3 startup will call the migration runner explicitly and close the owned connection if it fails. |
| `backend/src/migrations.ts` — new | Reviewed bootstrap SQL, ordered migration definitions, SHA-256 checksums, and the small migration runner. Keeping the substantial schema apart from file/lifecycle code improves readability. One file is sufficient; no file per table, dynamic folder scanning, plugin registry, or SQL asset-copy build step. |
| `backend/tests/database.test.ts` — new | Temporary-file integration tests for schema, constraints, migrations, and persistence. These have a different purpose from HTTP tests. Keep their helpers local. |
| `backend/src/server.ts` — extend | Own the database during startup and close it after HTTP, including failed startup and forced shutdown. Preserve annotations, log style, and the returned `{ server, shutdown }` shape. |
| `backend/tests/server.test.ts` — extend | Give every real-backend child a disposable DATABASE_PATH; verify new startup/closure failures and adapt lifecycle/compiled checks. Preserve existing assertions instead of removing them. |
| `backend/package.json` / lockfile | Pin approved driver/types and include database tests in the existing explicit test command. No additional test runner or migration CLI. |
| `backend/.env.example`, README, `database.md`, `project.md`, spec/plan/memory | Document the actual new storage/schema and operating rules once verified. Do not overwrite the user's real `.env` or unrelated historical notes. |

`app.ts` stays presentation/HTTP-only for now. It needs no database argument, application-local placeholder, or public database endpoint until an approved route actually uses SQL. The connection is owned by `startServer`, not a global singleton created on import. Future services can use the same connection when introduced; do not add unused services now.

## 3. Storage configuration

### DATABASE_PATH

- Read the existing process environment; development's native `.env` loading already makes the variable available. No new loader or configuration dependency.
- Nonproduction, absent variable: default to `<backend package>/data/game.sqlite`; create that default data directory if necessary.
- Explicit nonproduction relative paths resolve against the backend package directory, not the caller's shell working directory. Locate that directory relative to the module so source and `dist/` execution agree.
- Production (`NODE_ENV=production`): require an explicit absolute path. The containing directory must already exist. No fallback to the development file.
- For explicit paths in any mode, require the parent directory to exist rather than recursively creating a tree from a possible typo. Empty/whitespace-only values, leading/trailing whitespace, directory targets, and `:memory:` are invalid runtime settings. Spaces inside valid paths are supported.
- Keep the DATABASE_PATH override commented in `.env.example` so copying the example still uses the auto-created development default. Document creating the parent directory before enabling a custom override.
- Reject normalized lexical paths inside `src/`, `dist/`, or `node_modules`, including `..` traversal. Paths outside the repository are allowed when explicitly configured. Under the user's approved simplification, do not resolve symbolic links/junctions or inspect targets before opening: DATABASE_PATH and storage-directory links are trusted operator configuration. An alias can bypass the lexical guard; keeping actual storage outside code is the operator's responsibility. Ordinary directory/permissions/missing-parent/invalid-database errors are delegated to the driver; no explicit regular-file guarantee is provided.
- Let opening the file prove writability; report controlled errors without logging environment dumps, SQL row data, or credentials. Never choose a different file after an error.

Before the first implementation-time use of a non-test storage path, inspect whether it already exists. An unfamiliar database is potential user work: stop and investigate rather than migrate or replace it. Routine implementation tests never use the development default or user data.

### Connection settings

Open one owned `better-sqlite3` connection, set the busy timeout and pragmas before migration transactions, and verify the selected values. Reject unsupported WAL operation rather than silently weakening the configuration. Do not hold transactions across `await`, HTTP responses, or external requests.

The main file and SQLite `-wal`/`-shm` sidecars belong to persistent storage; all remain ignored by Git under the existing rules. Failed opening/migration may leave an empty file or SQLite housekeeping artifacts, but must not leave a partially committed schema or a leaked connection. Do not promise byte-for-byte filesystem immutability on failed startup.

## 4. Approved initial SQL

The following initial schema is implemented in `backend/src/migrations.ts` and verified with the approved driver in temporary storage. The history table is bootstrapped by the runner; migration 1 creates the eight domain tables. No real player storage has been initialized.

General policies:

- Safe integer upper bound: `9007199254740991`; timestamps are UTC Unix milliseconds.
- UUID fields check length 36, not full UUID syntax. Future acquisition/auth code generates proper UUIDs.
- Species/type/aspect identifiers have a 1–64 character storage bound; exact token vocabulary/syntax and portable image-path validation belong to future catalog validation. No made-up definitions are inserted.
- Username SQL requires a value and enforces length and ASCII case-insensitive uniqueness. Future authentication collects the username before creating the user row, implements trimming, the approved ASCII character policy, and permanence; no immutability trigger is added here.
- Species types are required and may be `normal`; no default or type vocabulary table is introduced. Aspects and `starters_granted_at` are the only nullable domain fields. Recovery is stored only as `tired_until`, without a status column.
- JSON session data must be an object. This is not an authentication/session adapter or complete validation of its future fields.
- No cascade deletes, extra lookup tables, or hidden initial player values.

### Bootstrap history table

Owned by the runner, not a separate game migration:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER NOT NULL PRIMARY KEY
    CHECK (version BETWEEN 1 AND 9007199254740991),
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 128),
  sql_hash TEXT NOT NULL CHECK (length(sql_hash) = 64),
  applied_at INTEGER NOT NULL CHECK (applied_at BETWEEN 0 AND 9007199254740991)
) STRICT;
```

The runner always binds an explicit version and computes the lowercase SHA-256 string itself; it does not rely on SQLite's implicit INTEGER-primary-key allocation.

### Migration 1 — `create_initial_schema`

```sql
CREATE TABLE users (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  google_id TEXT NOT NULL UNIQUE CHECK (length(google_id) BETWEEN 1 AND 255),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  username TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(username) BETWEEN 3 AND 20),
  crystals INTEGER NOT NULL CHECK (crystals BETWEEN 0 AND 9007199254740991),
  mushrooms INTEGER NOT NULL CHECK (mushrooms BETWEEN 0 AND 9007199254740991),
  souls INTEGER NOT NULL CHECK (souls BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991)
) STRICT;

CREATE TABLE player_progress (
  user_id TEXT NOT NULL PRIMARY KEY,
  monster_capacity_level INTEGER NOT NULL
    CHECK (monster_capacity_level BETWEEN 0 AND 9007199254740991),
  egg_capacity_level INTEGER NOT NULL
    CHECK (egg_capacity_level BETWEEN 0 AND 9007199254740991),
  incubation_speed_level INTEGER NOT NULL
    CHECK (incubation_speed_level BETWEEN 0 AND 9007199254740991),
  highest_expedition_difficulty INTEGER NOT NULL
    CHECK (highest_expedition_difficulty BETWEEN 1 AND 4),
  starters_granted_at INTEGER
    CHECK (starters_granted_at BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE TABLE sessions (
  sid TEXT NOT NULL PRIMARY KEY CHECK (length(sid) > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at BETWEEN 0 AND 9007199254740991),
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object')
) STRICT;

CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE monster_species (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 6),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 64),
  aspect TEXT CHECK (length(aspect) BETWEEN 1 AND 64),
  base_hp INTEGER NOT NULL CHECK (base_hp BETWEEN 1 AND 9007199254740991),
  base_atk INTEGER NOT NULL CHECK (base_atk BETWEEN 0 AND 9007199254740991),
  base_spd INTEGER NOT NULL CHECK (base_spd BETWEEN 0 AND 9007199254740991),
  base_aim INTEGER NOT NULL CHECK (base_aim BETWEEN 0 AND 9007199254740991),
  image_path TEXT NOT NULL CHECK (length(image_path) BETWEEN 1 AND 255)
) STRICT;

CREATE TABLE enemy_species (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 4),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 64),
  aspect TEXT CHECK (length(aspect) BETWEEN 1 AND 64),
  base_hp INTEGER NOT NULL CHECK (base_hp BETWEEN 1 AND 9007199254740991),
  base_atk INTEGER NOT NULL CHECK (base_atk BETWEEN 0 AND 9007199254740991),
  base_spd INTEGER NOT NULL CHECK (base_spd BETWEEN 0 AND 9007199254740991),
  base_aim INTEGER NOT NULL CHECK (base_aim BETWEEN 0 AND 9007199254740991),
  image_path TEXT NOT NULL CHECK (length(image_path) BETWEEN 1 AND 255)
) STRICT;

CREATE INDEX enemy_species_difficulty_idx ON enemy_species(difficulty);

CREATE TABLE monsters (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  user_id TEXT NOT NULL,
  species_id TEXT NOT NULL,
  max_hp INTEGER NOT NULL CHECK (max_hp BETWEEN 1 AND 9007199254740991),
  atk INTEGER NOT NULL CHECK (atk BETWEEN 0 AND 9007199254740991),
  spd INTEGER NOT NULL CHECK (spd BETWEEN 0 AND 9007199254740991),
  aim INTEGER NOT NULL CHECK (aim BETWEEN 0 AND 9007199254740991),
  tired_until INTEGER NOT NULL DEFAULT 0
    CHECK (tired_until BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX monsters_user_id_idx ON monsters(user_id);
CREATE INDEX monsters_species_id_idx ON monsters(species_id);

CREATE TABLE monster_recipes (
  input_a_species_id TEXT NOT NULL,
  input_b_species_id TEXT NOT NULL,
  result_species_id TEXT NOT NULL,
  PRIMARY KEY (input_a_species_id, input_b_species_id),
  CHECK (input_a_species_id < input_b_species_id),
  FOREIGN KEY (input_a_species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (input_b_species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (result_species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX monster_recipes_input_b_idx ON monster_recipes(input_b_species_id);
CREATE INDEX monster_recipes_result_idx ON monster_recipes(result_species_id);

CREATE TABLE eggs (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  user_id TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
  created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991),
  ready_at INTEGER NOT NULL CHECK (ready_at BETWEEN 0 AND 9007199254740991),
  CHECK (ready_at >= created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX eggs_user_id_idx ON eggs(user_id);
```

There are **nine application tables** including history and **seven explicitly declared indexes**. Primary keys/UNIQUE constraints also create SQLite-managed indexes where applicable; do not duplicate those. No AUTOINCREMENT or extra application table is needed.

`sessions.data.userId` remains a logical reference inside JSON, not a SQL foreign key. Enemy difficulty, type definitions, image availability, egg definitions, and the nonempty derived hatch pool are future server/catalog validation responsibilities, not new tables/triggers. There is no AIM cap of 10 in this schema; combat bounds remain undecided.

### Follow-up migration 2 — `add_species_localized_names`

The user subsequently approved storing both display names on shared monster/enemy species. This is a scoped schema follow-up, not a restart of the paused batch 4. Migration 1 above remains byte-for-byte unchanged. The default `backend/data/` directory was absent; no non-test storage was opened or created. Migration 2 adds:

```sql
ALTER TABLE monster_species ADD COLUMN name_en TEXT NOT NULL CHECK (length(name_en) > 0);
ALTER TABLE monster_species ADD COLUMN name_es TEXT NOT NULL CHECK (length(name_es) > 0);
ALTER TABLE enemy_species ADD COLUMN name_en TEXT NOT NULL CHECK (length(name_en) > 0);
ALTER TABLE enemy_species ADD COLUMN name_es TEXT NOT NULL CHECK (length(name_es) > 0);
```

No extra table/index/default, uniqueness requirement, fake translation, API endpoint or owned-instance field. Fresh/empty-catalog databases apply version 2; preexisting unnamed species make the SQL fail and the migration transaction roll back without data loss. Such populated databases need a separately reviewed naming/data migration, not a reset or edited history. Other version-1 player rows/history are preserved when the catalog tables are empty. Names are authored bilingual catalog content; the frontend's static interface translations remain separate. The frontend language preference is approved for localStorage, but its implementation still requires the frontend plan.

Follow-up verification: typecheck/build and full suite **170 passed / two Windows POSIX-signal skips / zero failures** (172 total) with existing dependencies, not a clean-install result. Five additional cases cover version-1 upgrade preserving history/player rows, rollback with populated legacy monster/enemy catalogs, required names, Unicode and nonunique display names. Existing constraint/default/no-op/compiled-startup checks were adapted to the two-version history without dropping guarantees. History comparisons use explicit ORDER BY version; SQL results without ordering were never guaranteed to follow version order. Migration 1 is retained unchanged; no real species or player content was seeded. Batch 4 remains paused on the installation issue.

## 5. Minimal migration runner

- Keep bootstrap SQL and an explicit ordered list in `migrations.ts`: version 1 `create_initial_schema`, followed by version 2 `add_species_localized_names`, with the SQL above. Use TypeScript string literals so `tsc` emits the same data into JavaScript without copying external `.sql` assets.
- Compute SHA-256 from SQL text with LF line endings, using Node's built-in crypto. No manually maintained checksum file or schema snapshot system.
- Validate migration definitions: contiguous positive safe versions, unique names, and nonempty SQL. No dynamic discovery.
- Use one short **immediate transaction for startup bootstrap, history validation, and the pending migration batch**. Each migration's SQL and inserted history row share that transaction. A failure rolls back all pending startup changes, including a newly bootstrapped history table; previously committed versions stay intact.
- Validate stored rows in version order against an exact prefix of available versions/names/hashes, including safe timestamps. Newer, gapped, renamed, or changed history fails closed. With no recorded versions, refuse other pre-existing user tables/views/triggers rather than adopting an unknown schema.
- Execute only the suffix not yet applied, with bound parameters for history inserts. Reopening an up-to-date database neither recreates schema nor rewrites stored rows/history.
- Export the runner for direct tests; allow tests to supply an explicit test migration list to exercise a failing next version. This is not a runtime plugin/configuration mechanism.
- No down migrations, automatic resets, separate CLI, periodic migration job, or automatic backups. A future change appends a new migration. An applied migration must not be edited to make a failing checksum disappear.

Checksums detect edits to reviewed migration source/history, not every possible manual change to live database objects. Manual schema editing is unsupported; do not add a full schema-fingerprint or automatic-repair subsystem. Test missing/invalid history and failed migration SQL, not claim protection against arbitrary administrator tampering or corrupt storage.

## 6. Startup and shutdown integration

1. Validate PORT first, then resolve/open/configure/migrate the database. Invalid PORT must not create default storage as a side effect.
2. Only after database initialization succeeds, create/bind HTTP and register shutdown. If initialization or binding fails, close any owned connection and release acquired resources; do not log a successful start.
3. Preserve `createApp()` and the `{ server, shutdown }` result. Do not add a global database getter, unused route dependencies, or a generic resource registry.
4. Extend the existing `registerShutdown(server, timeoutMs)` with **one optional third `closeDatabase` callback**, supplied by real startup. Existing direct HTTP-only tests keep their current calls. This callback is necessary to close the one real connection from both returned shutdown calls and signal-triggered closure; it is not a framework for future resources.
5. Keep the single cached shutdown promise. Drain HTTP, then close the database once, then resolve or reject. Always remove the owned signal listeners and timer, including close errors. Signal-triggered failure keeps an unsuccessful exit status.
6. **Correct the forced-close ordering when integrating the database:** current code calls `finish(error)` before `closeAllConnections()`. That is harmless for today's HTTP-only promise but would close a future database too early if `finish` gained database cleanup. Instead, record the timeout error, force remaining HTTP connections closed, and perform DB closure from the HTTP close completion path. Do not release SQLite before closing HTTP, and do not lose the timeout failure when the HTTP callback eventually runs.
7. Test startup failures and normal/repeated/forced closure with a real temporary DB and an observed close callback. There are no WebSocket/upgraded sockets in this service; do not invent shutdown mechanisms for them. No asynchronous business transaction is introduced by this feature.

## 7. Implementation batches

### Batch 1 — Driver, paths, and connection settings

- [x] In isolated temporary storage, verify the approved pinned driver installs and loads on Windows/Node 24 and can open/close a temporary file. Stop and discuss native incompatibility instead of changing the driver/version silently.
- [x] Add the approved dependency/types and `database.ts` storage/settings code; extend the existing explicit test script with `tests/database.test.ts`.
- [x] Test absent/explicit/relative/absolute/invalid paths, production requirements, prohibited storage locations, foreign keys, WAL/FULL/timeout settings, failure cleanup, and persistence across close/reopen. Never use actual developer storage.

Task 1 results: on Windows x64 / Node 24.19.0 / npm 11.17.0, an isolated temporary package pinned only `better-sqlite3` 13.1.1. `npm install` added two packages, reported zero vulnerabilities, and emitted no installation warnings. A bounded smoke check loaded the packaged `prebuilds/win32-x64.node` directly, opened a new temporary SQLite file, executed `SELECT 1` and queried SQLite version **3.54.1**, then closed/reopened it. A technical `PRAGMA user_version = 1` header write persisted across reopen; no tables existed. Both connections were closed. This header value is only a disposable driver probe, not the application's migration mechanism. No native toolchain was needed on this machine; ARM64 remains unverified.

Only temporary fixture/package/lock/report/database files were created outside the repository. No development types, project dependencies, application source, nine-table SQL, migrations, or configured game database were installed/created/executed. Backend suites/typecheck/build were not rerun for this isolated check; their prior feature-001 results remain historical, not additional verification in this task. Stop here until task 2 is authorized.

Task 2 results: installed the pinned runtime driver and development types in `backend/` and updated the lockfile/test script. `database.ts` exports explicit `resolveDatabasePath(value, nodeEnv)` and `openDatabase(value, nodeEnv)`; no environment mutation, connection-on-import, SQL schema or placeholder migration module. It resolves default/relative/production storage, checks lexical/real locations and regular-file targets, configures and verifies WAL/FULL/foreign keys/1,000ms timeout, and attempts cleanup on initialization failure. No HTTP/startup code or real `.env` changed. Two initial tests cover package-relative resolution and temporary open/query/close with zero application tables. Typecheck/build pass; full suite **39 passed / two POSIX-signal skips** on Windows x64 / Node 24.19.0; install added three packages and reported zero vulnerabilities. Temporary test storage was cleaned up. README and current-status notes explain that integration is still pending. Exhaustive task-3 checks are not claimed complete.

Task 3 results (2026-11-12): expanded `tests/database.test.ts` to 37 cases. Copied temporary packages isolate default paths, source/compiled resolution, invalid/production/custom paths, traversal, prohibited roots and directory aliases from developer files. Additional cases verify actual foreign-key enforcement, WAL/FULL/1,000ms settings, close/reopen persistence, non-SQLite file preservation, and connection cleanup after thrown or mismatched configuration. Only disposable technical tables were created; no application schema or migrations. Typecheck/build pass; full suite **73 passed / three skipped / zero failures** (76 total). The file-symlink case explicitly skips on Windows EPERM; directory-junction tests passed. The other two skips remain real POSIX signals. No `database.ts`, HTTP lifecycle, real `.env`, dependencies, or production infrastructure changes were needed. Linux ARM64, real POSIX signals, file-symlink protection on this host, actual power-loss and OS storage failures remain unverified.

### Batch 2 — Exact schema and transactional migrations

- [x] Add the reviewed SQL and migration runner in `migrations.ts`; initialize all nine tables in temporary files and assert the eight domain tables are empty and history records version 1 only.
- [x] Test keys, nullable fields, username collisions, numeric bounds, types, JSON sessions, canonical recipes, RESTRICT relationships, expected indexes, and absence of unwanted tables. Use clearly disposable records only; do not create a game roster or author catalog fixtures.
- [x] Test repeat/no-op migration initialization preserving rows, added next-version behavior, injected SQL failure rollback, missing/gapped/newer/changed history rejection, and refusal of an unknown pre-existing schema. Keep an up-to-date database's row/history snapshots unchanged. Real HTTP startup is still batch 3.

Batch 2 results (2026-11-12): added explicit migration 1, LF-normalized SHA-256 checksums and an immediate transaction covering bootstrap/history validation/all pending versions. Stored history integers are read exactly as bigint to reject unsafe timestamps. No schema fingerprints, repair/reset paths, CLI, seeding or extra dependencies. `openDatabase` remains connection-only; `runMigrations(database)` is explicit and does not own/close the caller's connection. The future startup integration must close it on runner failure. Expanded `database.test.ts` with 74 schema/migration cases: exact STRICT tables/indexes, empty domain tables, every required column, all numeric boundaries, identities/keys, nullable aspects/marker, normal type, JSON, canonical recipes, RESTRICT, readiness, defaults, persisted/no-op snapshots, next versions, rollback including bootstrap, unknown/history errors and source/compiled checksum parity. Typecheck/build pass; full suite **147 passed / three skipped / zero failures** (150 total), using disposable storage only. SQLite INTEGER PRIMARY KEY can allocate for NULL despite NOT NULL; the runner always validates and binds explicit versions, as planned. Internal-name filtering uses GLOB so an unknown `sqlitex_probe` table is not mistaken for a SQLite internal object. Windows skips and unverified Linux ARM64/POSIX limits remain unchanged.

### Batch 3 — Owned lifecycle and regression isolation

- [x] Integrate database startup/closure in `server.ts`, including failed bind, normal closure, forced timeout ordering, repeated calls, and DB-close errors. Preserve the existing HTTP contract and user annotations.
- [x] Update **every** real-backend child in `server.test.ts` to receive a per-test temporary DATABASE_PATH with an existing parent directory; production-mode compiled children must receive an absolute path. HTTP-only `createApp` and direct `readPort` tests must not open SQLite.
- [x] Run typecheck/build/full tests, including source/compiled temporary persistence and startup failure paths. Retain real POSIX-signal tests with explicit Windows skips, direct lifecycle checks, and bounded child cleanup. Do not weaken checks to accommodate SQLite.

Task 1 results (2026-11-12): `startServer` validates PORT, opens/configures SQLite and calls `runMigrations` before HTTP creation/binding. Migration/bind failures close the owned connection without a startup-success log or signal-handler registration. The returned `{ server, shutdown }`, annotations, log style and HTTP contract are preserved. `registerShutdown` accepts one optional third synchronous database-close callback; it runs once from HTTP close completion. The deadline records a timeout and calls `closeAllConnections` rather than finishing early. Promise rejection retains the timeout; simultaneous HTTP/startup and DB-close errors are retained in AggregateError. Signal handlers/timer are removed even on DB-close failure. Ten new direct lifecycle tests verify real temporary SQLite ownership, readiness/health without SQL, migration/bind/config failures, combined startup-cleanup errors, draining, forced ordering, repeated calls and DB-close rejection. Typecheck/build pass. Targeted server selection: **37 passed / two POSIX skips** (39 selected). App/database suites: **115 passed / one file-symlink skip** (116 total). Combined: **152 passed / three skipped / zero failures**, not a full-suite result: five existing child tests were deliberately excluded pending task 2 because they lack per-test DATABASE_PATH. Do not run unmodified `npm test` until they are isolated; it can create developer default storage and the production child lacks its required path. No child environment setup, real `.env`, dependencies, infrastructure or developer data were changed. Actual SQLite native-close failures are reported, not guaranteed recoverable; tests inject a failure after releasing the real handle. Source/compiled child persistence, full regression and POSIX/native ARM64 execution remain unverified for this step.

Approved simplification follow-up (2026-11-12): the user explicitly requested fewer dispensable mechanisms, not denser code. Removed canonical path/alias resolution and regular-file preflight from `database.ts`; retained normalized lexical guards, package/default/production rules, parent-directory policy, pragmas/verification and failure cleanup. Four former alias-protection cases (including the file-symlink skip) were replaced by one lexical-only policy test; ordinary directory-target failure is still tested through the driver. This intentionally revises the earlier alias guarantee; historical batch results above describe the pre-simplification behavior. Typecheck/build pass; current app/database checks **113 passed / zero skipped**, selected server checks **37 passed / two POSIX skips**. Combined **150 passed / two skipped / zero failures** across 152 selected cases, not the full suite. Existing unrelated constraints/migration/lifecycle tests were preserved. No schema, API, lifecycle, child-environment, dependency or infrastructure changes. Task 2 remains pending.

Task 2 results (2026-11-12): every existing `spawn`/`execFile` call in `server.test.ts` now receives an explicit absolute DATABASE_PATH inside its own newly created temporary directory, overriding any inherited path. The existing `registerChildCleanup` helper now removes that directory only after the child has exited or bounded forced cleanup completes; the signal tests reuse it rather than duplicating cleanup. Existing assertions are retained, with checks that invalid PORT creates no DB, bind-failure/production-health children use their assigned temporary file, and HTTP-only signal children create no DB. No application source, schema/lifecycle behavior, real `.env`, dependencies or infrastructure changed. Typecheck/build pass; complete existing server suite **42 passed / two POSIX skips / zero failures** (44 total), including the five formerly excluded children. Verification supplied a sentinel inherited DATABASE_PATH: it remained unused, and the isolated temporary root was empty after all test cleanup. The two signal-child cases remain unexecuted on Windows; their environment/cleanup setup was reviewed, not claimed POSIX-verified. Historical full-suite warnings above applied before this task and are now resolved. The full application/database/server suite was not rerun in this task, and no new persistence/restart cases were added; task 3 remains pending.

Task 3 results (2026-11-12): added ten regression cases in `server.test.ts`, no application source fixes. Source and compiled `startServer` each run in two separate bounded child processes: health succeeds, the child calls public `shutdown`, exits normally without a signal, and the parent compares schema/history/probe-user snapshots after restart. The first start creates nine tables with empty domain data; a disposable user row inserted between processes survives unchanged, as does the original history timestamp/hash. The HTTP port can be rebound after both starts. Compiled cases disable TypeScript execution. Both actual entrypoints also reject missing parents, non-SQLite files, unknown schemas and changed history before bind; preserved file contents or schema/row snapshots are checked. A reserved port makes the expected DB error (rather than EADDRINUSE) prove initialization precedes bind. Existing POSIX-signal/direct closure tests and child isolation remain intact. Typecheck/build and full `npm test` pass: **165 passed / two POSIX skips / zero failures** (167 total). Bounded synchronous children wait for complete process exit before test storage cleanup; normal shutdown is code-driven, not a Windows force-kill claim. The inherited sentinel DATABASE_PATH was unused and all actual test directories were removed. npm/Node can leave a `node-compile-cache` under TEMP; this runtime cache is not SQLite/test-storage leakage and is removed with the owned verification root. No developer/player storage, real `.env`, schema/API/lifecycle behavior, dependencies or infrastructure changed. Real POSIX delivery, Linux ARM64, power-loss behavior and clean runtime-only packaging remain unverified. Stop before batch 4.

### Batch 4 — Runtime-only checks and documentation

- [x] Verify clean installation/build/tests and isolated compiled runtime-only startup with a configured temporary DB, no source/compiler/loader/auth secrets. Confirm persisted schema/data remain after restart, and temporary processes/connections close. Check source/compiled path consistency and `.env` behavior.
- [x] Update `.env.example` with DATABASE_PATH guidance, README, `database.md`, scoped `project.md` status, spec/plan results, and memory. Do not modify the real `.env` or production infrastructure.
- [x] Review changes and report actual test counts, native-install warnings, and unverified Linux ARM64/POSIX behavior. No automatic commit or authorization for authentication/gameplay.

Batch 4 blocked attempt (2026-11-12): verification copied package/lock/source/tests/config to isolated storage and ran `npm ci --include=dev --foreground-scripts` with Node 24.19.0/npm 11.17.0 on Windows x64. npm generated `node-gyp rebuild` for better-sqlite3 13.1.1 despite the published `gypfile: false`; lock-loaded metadata omits that field. Build failed because Visual Studio C++ tools are absent, and npm reported a temporary TypeScript vendor-folder EPERM cleanup warning. The attempt stopped before clean typecheck/build/tests, runtime-only packaging, source/compiled path and `.env`/watch checks. Earlier batch-3 tests are not new results for this attempt. A separate temporary lock experiment retaining `gypfile: false` passed clean install (81 packages, zero reported vulnerabilities), but lock regeneration removed the flag. After this trade-off was explained, the user selected **pause without workaround**. Do not apply manual lock metadata, suppress scripts, install tools or switch driver/npm versions without a new agreement. Only `.env.example` comments and status documentation changed in the project. Source/tests/package/lock/config matched the untouched copies; the real `.env` fingerprint was unchanged. All temporary package/data/cache fixtures were removed; the technical verifier and failed-install log remain in approved temp storage. No backend or watcher was launched. Runtime-only and final operating/backup documentation remain incomplete; checkboxes above stay open.

Batch 4 completion (2026-11-12): the user explicitly approved npm 12.2.2 and `allowScripts: { "better-sqlite3": false }`, resuming the batch without the rejected lock workaround. Recorded npm engine `>=12.2.2 <13` and packageManager; synchronized generated lock root metadata only, preserving all dependency entries/versions. Global npm unchanged; verified `npx --yes npm@12.2.2 --version`. npm 12 enforces dependency-script policy; future script requirements need review. The packaged native binary must work: automatic source fallback is intentionally disabled, not a promise of ARM64 compatibility.

Fresh isolated package checks: clean `ci` (81 packages), typecheck/build and full suite **170 passed / two Windows POSIX skips / zero failures**. Runtime directory contained only package files, dist and a fresh omit-dev install (67 packages); no source/compiler/types/loader/auth secrets, TS execution disabled. SQLite 3.54.1 loaded; health/404, both migration versions/localized-name columns, restart/persisted schema/history/probe data and direct exported shutdown passed. A poison `.env` was ignored by compiled start. Both installs reported zero vulnerabilities and no native-build or EPERM warnings at check time. Earlier candidate tests also regenerated the lock and repeated clean installation successfully with unchanged dependency versions.

The actual dev command loaded a disposable `.env`, respected environment overrides, worked when that file was absent, and restarted after editing/restoring source without altering schema/history/probe data. Source/compiled path resolution matched. Workspace source/tests/config/lock/real `.env` fingerprints were unchanged throughout checks. All child trees stopped, ports were checked closed, connections closed, and owned temporary packages/storage/cache removed. Script/reports remain at `C:/Users/walas/AppData/Local/Temp/opencode/database-batch4-npm12-8SCtGc/`. README now covers pinned commands, production path/permissions, persistent WAL storage, migrations, offline backup/restore and failure investigation. `.env.example` guidance is complete. No player data, production infrastructure, frontend, API or application source changes were needed for batch 4.

Limits: Windows forced child cleanup is not POSIX graceful delivery; normal exported shutdown is verified separately. Linux ARM64 install/build/runtime, power-loss/storage failures, real-data restore drills, HTTPS/proxy and authentication remain unverified. These are documented limits, not open batch-4 implementation tasks.

## 8. API and deployment impact

| Area | Impact / limit |
| --- | --- |
| API/consumers | No endpoint or JSON-contract changes. Health still performs no SQL per request. `startServer` result and existing shutdown arguments remain supported; test child environment setup changes because startup now requires persistent storage. |
| Variables/secrets | Adds DATABASE_PATH, with production absolute-path requirement. Native development `.env` loading remains unchanged. No credentials or new secret values. |
| Persistent storage | One database directory, including WAL/SHM sidecars; separate from code/builds. No session DB, additional mount, snapshot artifacts, or imported catalog files. |
| Ports/services | Same backend HTTP port; no additional service, scheduler, worker, or network database. One process is the supported MVP shape. |
| Compilation/startup | Two source modules compile with existing settings; SQL lives in compiled strings. Native driver is a runtime dependency and must be installed for the target. Database initialization precedes HTTP readiness. |
| Linux ARM64 | Published 13.1.1 archive includes an ARM64 binary, but actual load/install/build/runtime and storage behavior remain unverified. npm 12 policy disables driver scripts, so there is no automatic source fallback; any future native build needs review/tooling/policy approval. Do not copy Windows modules or claim metadata proves deployment compatibility. |
| Proxy/HTTPS/cookies | No change; proxy trust stays disabled, no session cookies or auth added. |
| Development proxy/frontend | None; frontend remains unimplemented. |
| Docker/cloud | No Dockerfile, Compose, Caddy, VM, firewall, or mounted-resource changes. Document future persistent-directory requirements only. |

### Backup and recovery instructions to document

For this small MVP, stop the backend and confirm its connection is closed before taking a private consistent copy of the database directory and relevant SQLite sidecars. Do not back up a running WAL database by copying only its main file. Restore only while stopped, retaining matching migration code/history; never edit history to force an old build to run. No live-backup service or reset/restore CLI is added. Actual power-loss behavior and exhaustive OS storage failures are not verified by integration tests.

## 9. Approval checklist

Schema and migration choices were approved with the user's whole-batch-2 request after review; batch 3 was authorized step by step. Batch 4 was authorized, paused, then resumed with explicit approval of npm 12 and the driver-script deny. All choices below are implemented:

- [x] Driver `better-sqlite3` 13.1.1 and development types 9.6.0, including native build/platform caveats (authorized with batch 1 task 2).
- [x] All SQL in section 4: nine tables, seven explicit indexes, STRICT/type/numeric bounds, UUID/token/text bounds, JSON session object constraint, required username, nullable aspects/starter marker, uniqueness and RESTRICT rules (authorized with batch 2).
- [x] Difficulty codes 1–4, without choosing initial progression or adding balance values (authorized with batch 2).
- [x] DATABASE_PATH rules, default development location, production requirements, WAL/FULL/1,000 ms lock wait (connection code authorized with task 2; task 3 tests completed with the platform limits above).
- [x] Migration transaction/history policy (authorized with batch 2).
- [x] Startup integration and one database cleanup callback, including corrected forced-close ordering (authorized with batch 3 task 1; remaining regression-isolation/full-suite tasks are separate).

- [x] npm 12.2.2, npm engine range and explicit better-sqlite3 script deny (approved after disposable install/lock-regeneration/runtime experiments).

All four batches are complete within the documented platform limits. The rejected manual lock workaround remains absent. Initial player values, game rules, authentication, frontend implementation and production infrastructure are not implicitly approved.
