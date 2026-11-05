# Backend

Standalone Express 5 / TypeScript service with Google authentication and file-backed SQLite. Requires Node.js 24 LTS (`>=24 <25`), npm, a Google web-client ID, and a stable session signing secret. No frontend or separately running database/session service is needed. Google certificate verification uses outbound HTTPS on cache misses.

## Quick start

From the repository root:

```sh
cd backend
npm ci
```

Before starting, provide `GOOGLE_CLIENT_ID` and `SESSION_SECRET` through environment variables or an ignored `backend/.env`. If you do not already have `.env`, copy `.env.example`; do not overwrite existing settings. The client ID must be for your Google web application, not a client secret/service-account key. Google Cloud/client creation and the frontend sign-in widget are not implemented by this feature.

Generate your own session secret locally:

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

Put the generated 64-character hexadecimal value in `SESSION_SECRET` and keep it stable across restarts. Never commit/share it or copy it into frontend configuration. A Google client secret or refresh token is not required. Once configured:

```sh
npm run dev
```

Open `http://localhost:3000/api/health`; expect HTTP `200` with `{"status":"ok"}`. This confirms HTTP availability only, not database or external-service readiness.

On first startup, the backend creates the local SQLite database, migration history, and approved `users`/`sessions` tables. The default file is `backend/data/game.sqlite`, ignored by Git. Existing foundation/auth databases upgrade through the pending migrations: migration 1 creates auth tables and migration 2 adds case-insensitive username uniqueness. Subsequent starts reuse storage; the application never resets it automatically. Username-only setup is implemented; no monster/game tables or starter inventory exist yet.

`dev` watches application source and restarts it on changes. Stop it with Ctrl+C. There is no player-facing interface yet.

## Commands

Run these from `backend/`:

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact locked development/runtime dependencies. |
| `npm run dev` | Run TypeScript source using Node watch mode and `tsx`. |
| `npm run typecheck` | Check source and tests using strict TypeScript. |
| `npm test` | Run Node's test runner, including compiling and testing production startup. |
| `npm run build` | Compile application source to `dist/` (not tests). |
| `npm start` | Run the compiled service with plain Node, without a development loader. |

For a production-mode run, build first, supply the required auth settings, set `NODE_ENV=production`, an absolute `DATABASE_PATH`, and an explicit HTTPS `APP_ORIGIN`. Ensure the database's parent exists and is writable before `npm start`. Production auth endpoints require actual HTTPS or correctly configured trusted HTTPS forwarding; health remains public over internal HTTP. A runtime-only installation needs `package.json`, `package-lock.json`, `dist/`, and `npm ci --omit=dev`; compilation requires development dependencies in a separate build step.

## Configuration

Both `dev` and `start` optionally load `backend/.env` via Node's native `--env-file-if-exists` flag. The file is optional, but Google client ID/session secret configuration is now required in all environments. A message that `.env` was not found is informational when settings are supplied through the process environment. Process environment values take precedence. `.env` and generated artifacts are ignored by Git.

| Variable | Default | Accepted values |
| --- | --- | --- |
| `PORT` | `3000` | Decimal digits representing an integer from 1 to 65535; no whitespace, signs, or fractions. |
| `NODE_ENV` | `development` | `development`, `test`, or `production` (case-sensitive). |
| `DATABASE_PATH` | `data/game.sqlite` in development/test; required in production | A file-backed native filesystem path outside `src/` and `dist/`. Must be absolute in production. |
| `GOOGLE_CLIENT_ID` | Required | One Google web-client ID ending in `.apps.googleusercontent.com`, at most 256 characters. |
| `SESSION_SECRET` | Required | Stable 64 hexadecimal characters generated from 32 random bytes. |
| `SESSION_TTL_SECONDS` | `604800` (seven days) | Integer from 60 to 2592000 (30 days), absolute from login rather than sliding with activity. |
| `APP_ORIGIN` | `http://localhost:5173` in development/test; required in production | One HTTP(S) origin without credentials, non-root path, query, or fragment. Production requires HTTPS. |
| `TRUST_PROXY_CIDRS` | Empty/disabled | Comma-separated explicit IP addresses/CIDRs. No aliases, hop counts, booleans, or `/0` ranges. |

Defaults apply only to missing variables, not empty values. Invalid configuration fails startup with a fixed, actionable diagnostic and exit code `1`, without echoing the supplied value. An occupied port also fails with exit code `1`.

The service binds to `0.0.0.0`, not just loopback. On a local machine it may be reachable from other network interfaces; use the host firewall appropriately. This is not a public deployment configuration.

Relative database paths in development/test resolve against the backend package directory, independent of the shell's working directory and whether source or compiled code is running. They do not expand `~` or shell variables. Empty/padded paths, NUL characters, `:memory:`, URI-style names such as `file:` URLs, and source/build-directory paths are rejected. The source/build exclusion is not a filesystem sandbox: do not symlink storage back into those directories.

Development/test startup creates missing database parent directories. Production does not: provision the directory separately, then supply its absolute file path (for example, `/data/game.sqlite` on a future Linux deployment). The database file itself may be created there on first startup. Production configuration never silently falls back to a local database.

`DATABASE_PATH` remains the sole database setting. Sessions borrow the same connection/file; there is no session-specific path or database. Changing `SESSION_SECRET` makes existing signed cookies unusable under that key. Existing saved session deadlines are not extended when TTL configuration changes.

Set `APP_ORIGIN` to the browser application's origin, not a value derived from request Host/forwarded headers. Its local default anticipates Vite's future development proxy. For direct browser testing against port 3000, set it to that actual browser origin; command-line POST clients must supply the configured Origin and CSRF token. No Vite/frontend configuration is included yet.

## SQLite and migrations

The application uses one `better-sqlite3` 12.11.1 connection, owned by startup/lifecycle code. It explicitly enables foreign keys, WAL journaling, FULL synchronization, and a 1,000 ms lock-wait timeout. SQLite must be on local writable storage supporting its locking/WAL behavior. Keep the entire database directory persistent, including `-wal`, `-shm`, and `-journal` sidecars; do not discard sidecars or copy only a live main file. Stop the service before manual filesystem copies. Backups and restore automation are outside this feature.

Connection setup and migrations must succeed **before** the HTTP listener starts. An unusable/corrupt file, unsupported migration state, or failed migration stops startup with code `1`, without resetting the file or choosing a fallback. Any opened connection is closed on initialization or HTTP-listen failure.

`schema_migrations` records version, unique English name, SQL SHA-256 hash, and application time in Unix milliseconds. Its approved schema is in [`../specs/002-backend-persistence/plan.md`](../specs/002-backend-persistence/plan.md). It is bootstrapped transactionally only in an otherwise empty database. Existing incompatible bookkeeping or an unrelated nonempty database is refused, not silently adopted.

The single production catalog now includes migration 1, `create_authentication_tables`, creating `users`, `sessions`, and the session-expiration index atomically. Its exact schema is in [`../specs/003-backend-authentication/plan.md`](../specs/003-backend-authentication/plan.md). There is no adapter-owned migration catalog/connection or independent table initialization. Fixture tables remain tests only. To introduce another migration:

1. Obtain feature-plan and exact schema approval first.
2. Add an explicitly imported TypeScript module exporting a `Migration` with the next contiguous `version` (currently 3), an immutable unique `name` matching `[a-z][a-z0-9_-]*`, and reviewed static `sql`.
3. Register it in increasing order in `migration-catalog.ts`. The normal TypeScript build compiles the module; no SQL asset-copy step or production loader is needed.
4. Start the service normally (`npm run dev`, or build and `npm start`). This is the migration workflow; there is no separate migration CLI or reset/down command.

Completed history must be an exact prefix of the catalog. Unknown/newer versions, gaps, changed names/SQL, or an incompatible bookkeeping definition fail initialization. SQL hashes normalize CRLF to LF; otherwise applied SQL is immutable. Add a new migration for subsequent changes rather than editing completed work.

Each pending migration's SQL and history record commit in one immediate transaction. If it fails, neither that migration's schema/data changes nor its record remain; earlier completed migrations stay committed. A failed, unrecorded migration may be corrected and retried. Do not place transaction-control SQL, `VACUUM`, journal-mode changes, or foreign-key disabling in migration SQL. It is reviewed application code, not untrusted SQL parsed by a general safety engine.

Future data access should use parameterized `prepare().run/get/all` and native `transaction(callback).immediate()` for related writes. Callbacks are **synchronous only**: no async functions, promises, `await`, external I/O, or manual commit/rollback. Nested native transactions use savepoints. Keep database work short: synchronous SQL and lock waits block the Node event loop.

Persistence diagnostics use fixed codes (`DATABASE_STORAGE_ERROR`, `DATABASE_OPEN_ERROR`, `DATABASE_SETUP_ERROR`, `MIGRATION_CATALOG_ERROR`, `MIGRATION_HISTORY_ERROR`, `MIGRATION_FAILED`, and `DATABASE_CLOSE_ERROR`), without SQL values, database contents, or raw driver exceptions. Check configuration, directory/file access, compatible deployment versions, and migration source when diagnosing them. Shutdown cleanup failures use `CLEANUP_ERROR` and a failing exit status.

## HTTP behavior

- `GET /api/health`: `200`, `{"status":"ok"}`.
- Unknown paths (inside or outside `/api`): `404`, `{"error":{"code":"NOT_FOUND","message":"Route not found."}}`.
- Unexpected request-handling errors: `500`, `{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred."}}`.

Responses use JSON and do not expose internal error messages, paths, or stacks. If a response has already started, it cannot be replaced with a JSON envelope; the sanitized error is delegated to Express to close the connection. Operational logs use fixed diagnostics, not request bodies, query strings, or arbitrary error objects. No intentional failure/inspection routes are included in the service.

`X-Powered-By` is disabled. Proxy trust defaults to disabled; only explicitly configured proxy addresses/subnets can influence protocol/client-IP detection. Production auth rejects insecure requests instead of silently issuing no cookie. A trusted proxy must replace untrusted forwarded headers, and backend exposure must not bypass the intended boundary. There is no CORS access or automatic HTTPS redirect. No Caddy/network infrastructure has been configured or verified.

## Authentication API and browser flow

All auth responses (including errors) use `Cache-Control: no-store`. Session cookies are named `mgf.sid`, host-only, HttpOnly, SameSite=Lax, and scoped to `/api`. They are always Secure in production and non-Secure only for local development/test HTTP. The signed cookie contains an opaque SID, not user data or Google tokens.

1. `GET /api/auth/csrf` with same-origin credentials returns `200 {"csrfToken":"..."}`. It creates/saves an anonymous 15-minute session only when needed; an existing valid token is reused.
2. The frontend Google Identity Services UI obtains an ID token. POST `/api/auth/google` with JSON `{"credential":"<ID-token>"}`, `X-CSRF-Token`, the cookie, and the matching browser Origin. JSON bodies are limited to 16 KiB; the credential must be a three-part JWT no longer than 8,192 characters. Extra identity fields are rejected.
3. Successful login returns `200 {"authenticated":true,"user":{"id":"<uuid>","username":null},"requiresOnboarding":true,"csrfToken":"<new-token>"}`. The backend verifies Google's signature/audience/issuer/expiry and verified-email claims, creates/reuses the account by subject, regenerates the SID, rotates CSRF, and awaits persistent save before success. Existing usernames are preserved. No Google credential is stored or logged.
4. `GET /api/auth/session` returns `{"authenticated":false}` or the current authenticated user/onboarding fields, without contacting Google or extending expiry. It never returns the Google subject/email or SID. Missing, forged, expired, or stale-user sessions do not authorize access.
5. POST `/api/auth/logout` with Origin and the current `X-CSRF-Token` deletes the stored session, clears the cookie, and returns `204`. This ends only the current application session, not Google or other devices. The old cookie cannot be reused.

Auth POSTs require **Origin plus a synchronizer token**; SameSite alone is not the CSRF defense. Missing/null/incorrect Origin, explicitly cross-site Fetch Metadata, or missing/old CSRF fails before Google verification/account mutation. GETs can omit Origin; if present it must match. Old tabs can refetch the token after login rotates it. An expired/already absent session does not bypass logout security: bootstrap a fresh anonymous token if necessary, then log out. Username setup additionally checks the authenticated current account before its CSRF/body checks, so an anonymous username request with an allowed Origin returns 401.

Expected JSON error codes include `INVALID_JSON`/`INVALID_REQUEST` (400), `INVALID_GOOGLE_TOKEN`/`AUTH_REQUIRED` (401), `CSRF_INVALID`/`HTTPS_REQUIRED`/`ONBOARDING_REQUIRED` (403), `BODY_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), and `AUTH_UNAVAILABLE`/`SESSION_UNAVAILABLE` (503). Messages are fixed English technical text; a future client localizes by code. Unknown errors retain `500 INTERNAL_ERROR`.

Google verification uses the official library with a five-second certificate-fetch timeout and no transport retries. A verified email claim is required, but email is not a linking/authorization key; the same subject reuses its account even if the email changes. User creation and session saving are separate short operations: a failed login save may leave an account row that is reused on retry, never a successful response pretending the save worked.

Session expiry is an absolute server deadline (default seven days from login), enforced in the database and when resolving authorization; reads/touch do not slide it. Expired rows are purged on store initialization and every 15 minutes. The adapter owns only this timer and its four store operations, borrowing the application connection. Expiration cleanup targets only `sessions`; disposal cancels the timer without closing the database. Corrupt rows and store failures fail safely with no in-memory fallback.

### Username-only setup

An authenticated account without a name can POST `/api/auth/username` with `{"username":"Luna_7"}`, a freshly fetched `X-CSRF-Token`, and the matching browser Origin. Only that one JSON string field is accepted (2 KiB body limit; raw string at most 256 characters). Account identity always comes from the session, not request data.

The backend trims surrounding whitespace, then requires 3–20 ASCII letters/digits/underscores including at least one alphanumeric. Names are case-insensitively unique, but preserve saved spelling. Assignment is permanent through the MVP API. Same-name resubmissions ignoring case/outer whitespace confirm the original spelling; different names for an already-configured account are rejected. The short immediate SQLite transaction and conditional UPDATE enforce one-time assignment, while the unique index resolves competing accounts.

Success is `200 {"authenticated":true,"user":{"id":"<existing-uuid>","username":"Luna_7"},"requiresOnboarding":false}`. It does not regenerate/extend sessions, change IDs, or grant game data. Current session inspection and later Google login read the saved name from SQLite.

New error codes: `INVALID_USERNAME` (400), `USERNAME_TAKEN`/`USERNAME_ALREADY_SET` (409), and `USERNAME_UNAVAILABLE` (503). Standard auth/CSRF/JSON/media/body errors still apply. A client must reconcile session state after ambiguous save failures instead of blindly reposting: the SQL commit can succeed even if its HTTP response is lost.

`requiresOnboarding` and `requireOnboarded` currently mean **username setup only**. They do not prove starter monsters were granted or define eligibility for future game routes. Starter grants must have their own approved durable exactly-once eligibility/state, including already-named accounts. No protected game/debug route ships here.

Migration 2 (`create_case_insensitive_username_index`) adds the partial UNIQUE `users_username_nocase_idx` on `username COLLATE NOCASE` where non-NULL. It leaves migration 1, existing user/session data, and the original case-sensitive constraint unchanged. SQLite NOCASE folds ASCII only, matching new-name validation; legacy out-of-policy names remain readable/immutable rather than automatically rewritten.

Before applying an upgrade, take a consistent SQLite backup using the storage/sidecar precautions above. If old usernames conflict by ASCII capitalization, migration 2 rolls back and startup fails safely before listening. No account is silently renamed/merged. An operator may diagnose privately using this read-only query:

```sql
SELECT username COLLATE NOCASE AS conflicting_name, COUNT(*) AS account_count
FROM users
WHERE username IS NOT NULL
GROUP BY username COLLATE NOCASE
HAVING COUNT(*) > 1;
```

Any correction of real account names requires an explicit data decision; do not delete/reset the database or edit recorded migration hashes to bypass it. No new configuration, files, packages, or infrastructure are needed for username setup.

This is not a public-deployment security claim: request throttling, frontend CSP/XSS controls, actual Caddy TLS/header behavior, and live Google/browser integration still require their own review/verification before internet exposure.

## Lifecycle

`SIGINT` and `SIGTERM` initiate one idempotent shutdown: stop accepting new connections, let active requests finish, close idle keep-alive connections, dispose the session adapter/timer, then close the shared database exactly once. Database close is attempted even if adapter disposal fails. Successful shutdown logs `SHUTDOWN_COMPLETE` and exits with code `0`.

One overall 10-second deadline covers HTTP draining and ordered resource cleanup. At the deadline, remaining HTTP connections are force-closed, cleanup is attempted if not already underway, and the process logs `SHUTDOWN_FORCED` and exits with code `1`. Cleanup errors and unrecoverable server/process failures result in `SHUTDOWN_FAILED` and code `1`; the service does not resume after a fatal error.

A JavaScript timer cannot interrupt synchronous native SQL or a CPU-bound callback. This is a bounded responsive-event-loop shutdown policy, not a hard real-time OS guarantee. Keep transactions and native cleanup short.

Windows supports terminal Ctrl+C, but sending `SIGINT`/`SIGTERM` using `subprocess.kill()` force-terminates the process rather than delivering POSIX signals. Do not interpret a Windows process-kill smoke test as proof of graceful Linux shutdown.

## Structure

- `src/config.ts`: pure runtime configuration validation.
- `src/app.ts`: application composition, health and 404 handlers; no listener or process handlers.
- `src/middleware/error-handler.ts`: sanitized request errors.
- `src/lifecycle.ts`: server/process failure handling and bounded shutdown.
- `src/server.ts`: environment parsing and package-relative configuration.
- `src/startup.ts`: database-before-listener startup and resource ownership.
- `src/database/`: connection/settings, safe errors, initialization, and migrations.
- `src/auth/google.ts`, `users.ts`: verified identity and parameterized account operations, separate from HTTP/session mutation.
- `src/auth/session-store.ts`, `session.ts`: borrowed SQLite store, timer disposal, cookie/absolute-expiration policy, and session operations.
- `src/auth/csrf.ts`, `routes.ts`, `authorization.ts`: request security, thin API orchestration, and future authorization guards.
- `src/types/express-session.d.ts`: application session/request typing; not runtime secrets or configuration.
- `tests/`: isolated database, auth/crypto/CSRF/cookie, migration, lifecycle, and restart tests. No developer credentials/files or live Google requests are used. The HTTP application factory remains testable without a database or production auth resources.

TypeScript uses native ESM/NodeNext and `.js` relative import specifiers so compiled imports run directly in Node. TypeScript 6.0.3 provides the JavaScript compiler for this foundation; no native TypeScript compiler dependency is needed.

## Linux ARM64 compatibility evidence

The deployment compatibility target is documented in [`../project.md`](../project.md). No Docker, Compose, Caddy, or cloud resources are included.

Dependency metadata and the committed lockfile were inspected:

| Dependency | Evidence |
| --- | --- |
| Express 5.3.0 | JavaScript dependency tree with no native/platform restrictions; declares Node `>=18`. |
| `google-auth-library` 11.3.3 / `express-session` 1.19.0 | JavaScript packages declaring Node `>=22` and `>=0.8` respectively. Clean installs and the used APIs are verified on Node 24. No additional native runtime driver or connect-sqlite3 dependency is introduced. |
| `better-sqlite3` 12.11.1 | Supports Node 24 and publishes Node ABI 137 prebuilt binaries for Windows x64 and Linux ARM64. Clean installation/native loading verified on Windows x64; Oracle Linux runtime/system-library compatibility remains unverified. |
| `bindings` 1.5.0 / `prebuild-install` 7.1.3 | JavaScript loader/installer dependencies of the SQLite driver. The installer attempts a release-binary download before a node-gyp source-build fallback. `prebuild-install` is deprecated/unmaintained; keep this maintenance caveat under review. |
| TypeScript 6.0.3 | JavaScript compiler; declares Node `>=14.17`, with no native/platform dependency. |
| `tsx` 4.23.15 | Declares Node `>=18`; uses esbuild `~0.28.0`, locked to `0.28.2`. |
| esbuild 0.28.2 | Publishes the optional `@esbuild/linux-arm64` 0.28.2 binary (`os: linux`, `cpu: arm64`, Node `>=18`). Its install script selects/checks the platform binary. Keep optional dependencies available; no source compiler is expected for this supported binary path. |
| `fsevents` 2.3.3 | Optional `tsx` dependency restricted to macOS; not required on Linux ARM64 or Windows. |
| `@types/better-sqlite3` 9.6.0 / `@types/express` 5.0.6 / `@types/express-session` 1.19.0 / `@types/node` 24.19.2 | Development type declarations; the implemented APIs type-check against the pinned dependencies. |

Recheck the exact metadata when upgrading; useful sources are the [SQLite driver metadata](https://registry.npmjs.org/better-sqlite3/12.11.1), [v12.11.1 release binaries](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.11.1), [Express metadata](https://registry.npmjs.org/express/5.3.0), and [esbuild Linux ARM64 binary metadata](https://registry.npmjs.org/@esbuild/linux-arm64/0.28.2).

Install dependencies on the target OS/architecture using the lockfile; never copy Windows `node_modules` into Linux. Driver installation needs access to its prebuilt release download (or a suitable cache). A missing/incompatible binary can trigger source compilation; stop and review build requirements rather than installing a toolchain or suppressing scripts silently. The custom session adapter reuses this already-approved driver and connection.

Version 13.0.3 was initially approved but failed clean `npm ci` on Windows because its implicit node-gyp step required C++ toolchain discovery despite bundled binaries. The user approved pinning 12.11.1, which passes clean installation here without Visual Studio tools. No broad install-script bypass or infrastructure change was added.

## Verification and limits

Verified locally on Windows x64 with Node 24.19.0 and npm 11.17.0:

- `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- Feature 005 suite: 194 tests pass; three skip in the current environment (two Windows/POSIX signal tests and the optional default-port startup check because port 3000 is already occupied). Independent configured-port startup is verified.
- Coverage includes the persistence/HTTP regressions, actual locally signed JWTs verified by the official library, claim rejection/certificate caching/five-second transport abort, auth/CSRF/body limits, SID/token rotation, callback-once/store failures, absolute expiration, cookie/proxy policy, and authenticated restart/logout/changed-secret behavior.
- Child-process tests exercise registered signal handlers through simulated process events on Windows. This tests wiring and exit codes, not OS-level signal delivery.
- `npm run dev` watch startup, the auth migration in isolated storage, public health, and local CSRF bootstrap were smoke-tested. Watch restart after source edits was not separately exercised; developer `.env`/database were untouched.
- An isolated `npm ci --omit=dev` installation ran the compiled shared-database service, migration, full signed-test-credential login/session/logout, Secure cookies through controlled trusted forwarding, environment-over-file precedence, and graceful cleanup, without TypeScript/tsx. Google certificates were controlled test keys; no live Google requests or real accounts were used.
- npm reported zero known vulnerabilities. It warned about deprecated `prebuild-install`/`node-domexception` and install scripts not covered by an explicit `allowScripts` policy (SQLite driver/esbuild); no script-policy bypass was added.
- Username coverage includes migration collision rollback/startup refusal, preservation of account/session data, ASCII/trim boundaries, permanent/idempotent assignment, simultaneous one-/two-account submissions, safe lock/storage errors, security/body checks, unchanged session expiry, and saved usernames across process restart/later login. No developer database is used in these tests.

Actual Linux ARM64 execution/system libraries, POSIX signal delivery, live Google accounts/browser behavior, and real Caddy HTTPS integration remain unverified. Metadata, test keys, and simulated forwarding are not substitutes for those checks or a claim that public production deployment is ready.
