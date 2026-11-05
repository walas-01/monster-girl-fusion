# Backend Authentication — Implementation Plan

Status: Approved and implemented — all five batches locally verified. Live Google/browser/Caddy integration, actual Linux ARM64 execution, and POSIX signal delivery remain unverified.

## Approach and approval boundary

Extend the existing backend with Google identity verification, minimal accounts, and persistent application sessions. Keep the HTTP application factory testable without production configuration, a database, or live Google requests. Reuse the migration runner, SQLite connection policy, JSON error envelope, and bounded lifecycle cleanup.

The user approved this specification and revised one-database plan before implementation, including the exact tables and local session adapter. Accounts, future game data, sessions, and migration history share the existing file and connection selected by `DATABASE_PATH`. No frontend, Google Cloud resources, onboarding mutations, game tables, or deployment infrastructure is included.

The resulting application database after this feature will contain:

```text
game.sqlite
├── schema_migrations
├── users
└── sessions
```

There is no existing authentication/session implementation or session database to consolidate. No data-transfer tool, database merge, second connection, or additional mount is needed. One logical SQLite database still has WAL/SHM sidecars that must be persisted and backed up correctly.

## 1. Dependencies and session-adapter recommendation

Approved new pinned dependencies:

| Package | Purpose and evidence |
| --- | --- |
| `google-auth-library` 11.3.3 | Official ID-token verifier; declares Node `>=22`, compatible with the Node 24 baseline. Use an `OAuth2Client`, not application-default/service-account credentials. |
| `express-session` 1.19.0 | Signed opaque session cookies and server-side session lifecycle. JavaScript implementation; declares Node `>=0.8`. |
| `@types/express-session` 1.19.0 | Development-only declarations and application session-data augmentation. |

Retain `better-sqlite3` 12.11.1 and its existing declarations. Inspect the actual locked dependency tree, clean installation, audit results, and native/script requirements during implementation. Stop on unexpected installation/build requirements; do not install compilers or bypass scripts silently.

### Approved session-adapter decision

**Use a small local `SQLiteSessionStore extends session.Store`, borrowing the already-open application `better-sqlite3` connection instead of adding `connect-sqlite3`.** The user approved this adapter and one-database architecture, now recorded in `project.md`. The adapter never opens or closes a database.

The exact published [connect-sqlite3 0.9.18 source](https://cdn.jsdelivr.net/npm/connect-sqlite3@0.9.18/lib/connect-sqlite3.js) was reviewed:

- It optionally installs `sqlite3 ^5`, introducing another native driver. Version 5.1.7 has published Node-API Windows x64/Linux ARM64 prebuilds; existence alone does not verify Node 24/Oracle Linux execution or clean installation.
- Its daily cleanup interval is unref'd but its handle is not retained/exposed for cancellation. Closing its database can leave future timer callbacks targeting a closed handle in a long-lived/test process.
- Some error branches invoke a callback then continue to invoke it again; session JSON parsing inside a database callback is not guarded.
- Initialization throws from an asynchronous callback instead of providing a clean initialization error contract. There is no complete public resource-close lifecycle.

Alternatives considered:

| Option | Trade-off |
| --- | --- |
| Local adapter — recommended | Reuses the existing connection and migration catalog; explicitly owns store errors, expiration, and its cleanup timer. Requires implementing/testing four store methods, not a general session framework. |
| Keep `connect-sqlite3` unchanged | Matches the original document but retains the identified lifecycle/error paths; not recommended for the approved requirements. |
| Wrap/fork/patch `connect-sqlite3` | Requires another driver or a shared-driver bridge plus package-specific repairs; more moving parts than the required store interface. |

The approved adapter is implemented and documented in `project.md`; any replacement or additional driver still requires review.

## 2. Configuration and cookies

Extend the pure configuration parser and existing setup documentation. There is no auth-disabled production mode, fake credential, shared development signing key, or automatically regenerated secret.

| Variable | Proposed behavior |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Required in every runtime environment. One nonempty, bounded Google web-client ID ending in `.apps.googleusercontent.com`; exact audience comparison at verification. No Google client secret. |
| `SESSION_SECRET` | Required stable 64-character hexadecimal secret, generated from 32 random bytes. Document a Node `crypto.randomBytes` command; never commit or log its output. Changing it invalidates existing signed cookies. |
| `DATABASE_PATH` | Existing sole database-path setting, unchanged: development/test default `data/game.sqlite`; production requires an absolute path with an existing writable parent. User and session tables use this same file/connection. |
| `SESSION_TTL_SECONDS` | Default `604800` (seven days); decimal integer from 60 to 2592000 (30 days). An absolute lifetime from successful login, not an idle/rolling lifetime. Existing sessions keep their saved deadline across configuration changes. |
| `APP_ORIGIN` | One allowed browser origin. Default `http://localhost:5173` in development/test for the future Vite proxy; production requires an explicit HTTPS origin. Accept only a normalized HTTP(S) origin, with no credentials, query, fragment, or non-root path. |
| `TRUST_PROXY_CIDRS` | Missing/empty means disabled. Otherwise a comma-separated list of literal IP addresses/CIDRs. Validate address/prefix syntax; reject booleans, hop counts, aliases, and all-address `/0` ranges. Never set unconditional trust. |

Preserve existing `DATABASE_PATH` validation and package-relative resolution. There is no session-path variable, path-alias comparison, second-database directory policy, or additional connection. Operators must keep the database directory persistent and outside disposable source/build storage; the existing path guard is not a filesystem sandbox.

Cookie policy:

- Name `mgf.sid`, path `/api`, host-only (no Domain), HttpOnly, SameSite=Lax.
- Secure is **always true in production**, false only for development/test HTTP. Do not add a cookie-security override that weakens production.
- Set `saveUninitialized: false`, `resave: false`, `rolling: false`, and an explicit store. Do not set express-session's separate `proxy: true`; use Express's validated trust boundary.
- Store an authoritative `expiresAt` in session data and enforce it on the server and in the session table. Clamp outgoing cookie expiration to that deadline whenever a cookie is issued; do not derive server validity from express-session's automatically touched `cookie.maxAge`.
- Anonymous CSRF-bootstrap sessions expire after 15 minutes. Successful login creates a new session with a new seven-day/configured deadline. Reading/touching a session never extends its absolute validity.
- Clear the cookie with matching path/host/security/SameSite attributes on successful logout or explicit stale-user invalidation.

## 3. Approved schema — one reviewed application migration

Add migration **1, `create_authentication_tables`**, containing both table definitions below and the session-expiration index. Register it in the existing application catalog. The migration commits all these changes and its history record atomically; a failure leaves neither a half-created authentication schema nor a completion record.

### Users table

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  google_id TEXT NOT NULL UNIQUE CHECK (length(google_id) BETWEEN 1 AND 255),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  username TEXT UNIQUE CHECK (username IS NULL OR length(username) > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;
```

- Generate `id` with Node's `crypto.randomUUID()`; use bound parameters for values.
- `google_id` is the verified `sub`. Email is not unique and is never an account-linking or authorization key.
- Update email only from a newly verified Google login for the same subject; preserve ID, creation time, and username.
- `username = NULL` means onboarding is required. Authentication always leaves a new username NULL. No extra onboarding flag, monster rows, or grants are introduced.
- Future onboarding must atomically assign the approved username and grant starting monsters exactly once. Username format/normalization belongs to that future feature; the minimal uniqueness/nonempty constraints here do not decide those rules.
- A synchronous immediate transaction performs insert-if-absent by unique subject and lookup/update. Concurrent/repeated login attempts must converge on one account.

### Sessions table

```sql
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY NOT NULL CHECK (length(sid) > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
  data TEXT NOT NULL CHECK (json_valid(data))
) STRICT;

CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
```

- Use the existing application migration catalog and single `schema_migrations` history. There is no session migration catalog or adapter-owned table initialization.
- Persist express-session's cookie data plus application-controlled `csrfToken`, `expiresAt`, and optional `userId`. Never persist Google credentials or full profile objects.
- `sid` is express-session's opaque random identifier; only the signed cookie goes to the browser. The SQLite directory remains private runtime data.
- `userId` remains inside serialized session data, not in a separate SQL column. No SQL foreign key to `users` is assumed; authentication checks the current user and invalidates stale-user sessions. A separate user-ID column is unnecessary for this feature.
- User and session operations share the existing WAL/FULL/foreign-key/1-second lock policy and connection. Do not create a second connection for cleanup or session access.
- These are the only new tables/indexes beyond already-approved bookkeeping. Affected consumers are authentication/account queries, the session adapter, configuration/startup/lifecycle, migrations, tests, and documentation. Existing HTTP consumers require no migration.

## 4. Session-store implementation and expiration

Implement only the methods needed by express-session: `get`, `set`, `destroy`, and `touch`, plus session-only cleanup/disposal behavior. Construct the adapter with the existing database handle; it borrows that handle and does not own its lifecycle.

- Use prepared parameterized statements. Each method invokes its callback exactly once, including driver/JSON/validation failures; never throw an asynchronous error into the event loop or return cached authentication when storage fails.
- `get` returns only unexpired, structurally valid session data. Expired rows are unusable even if cleanup has not deleted them. A corrupt stored session returns a safe store error, not an authenticated result.
- `set` atomically upserts serialized session data with its validated server-controlled absolute `expiresAt`; it does not extend expiry using a refreshed cookie maxAge.
- `destroy` deletes the row and reports completion/failure. `touch` is a deliberate no-op for fixed absolute expiration, with a successful callback; it never extends a row's deadline.
- Delete only expired rows from `sessions` at adapter initialization and every 15 minutes through one retained, unref'd timer. Never drop tables, reset the database, or modify users/game data. Background cleanup errors are sanitized; there is no memory fallback.
- `dispose()` is idempotent: mark the adapter unavailable and cancel its timer, but do not close the shared connection. Subsequent store operations return predictable callback errors. Startup/lifecycle owns the single database close. Store failure maps to `503 SESSION_UNAVAILABLE`; health remains independent.
- Keep this adapter bounded to this interface. Do not introduce a generic persistence layer, arbitrary table-name configuration, or another native driver.

## 5. Google verification and account service

- Construct one `OAuth2Client` with the configured client ID and call `verifyIdToken({ idToken, audience })`. Do not use `GoogleAuth`/ADC, tokeninfo as a substitute, or custom signature cryptography.
- Restrict accepted issuers to `accounts.google.com` and `https://accounts.google.com`; after library verification also validate exact audience, nonempty/bounded subject, finite unexpired `exp`, and required verified-email claims. If `azp` is present, require the configured client ID.
- Approved email policy: require `email_verified === true` and a nonempty bounded email claim. This uses Google's verification, not an application-managed verification flow. Never link/update another user based on that email.
- Explicit expiry rejection ensures the application does not accidentally accept an already-expired token solely because the library allows clock skew. Keep system time correct in operations.
- Bound Google certificate-fetch requests through supported transport options (five-second timeout and disabled retries); retain the library's certificate cache. Verify those options affect this exact pinned version with a controlled transport test. Do not use a timeout that merely abandons an uncancelled network promise without inspecting behavior.
- Map known provider transport failures/timeouts to `503 AUTH_UNAVAILABLE`; invalid/unverifiable credentials to `401 INVALID_GOOGLE_TOKEN`. Do not classify failures by echoing/logging raw library messages, which may contain the JWT. Unknown verification failures fail closed with a generic safe response.
- The account service receives verified claims only. It does no HTTP handling, session mutation, or Google requests inside SQLite transactions.

## 6. API contracts and CSRF handshake

All auth responses, including errors, use `Cache-Control: no-store`. No CORS access is enabled. Production rejects non-HTTPS auth requests with `403 HTTPS_REQUIRED` before session handling, using `req.secure` only through the approved proxy trust setting. Health remains accessible over internal HTTP.

### Browser sequence

1. Fetch `/api/auth/csrf` with same-origin credentials to obtain a synchronizer token and, if necessary, an anonymous HttpOnly session cookie.
2. Obtain a Google credential through the future frontend and POST it to `/api/auth/google` with `Content-Type: application/json` and `X-CSRF-Token`. Browser Origin must match `APP_ORIGIN`.
3. Login regenerates the session identifier, rotates the CSRF token, sets its absolute deadline/user ID, and explicitly saves it before success. Use the new returned CSRF token for logout/future mutations; stale tabs may refetch it.
4. Inspect `/api/auth/session` on reload. POST `/api/auth/logout` with the current token to invalidate the stored session.

### Endpoints

| Route | Request and successful response |
| --- | --- |
| `GET /api/auth/csrf` | `200 { "csrfToken": "<opaque-token>" }`. Reuse a valid session's token; create/save an anonymous 15-minute session only when needed. Never return its SID. |
| `POST /api/auth/google` | Exactly `{ "credential": "<Google-ID-token>" }`; `200 { "authenticated": true, "user": { "id": "<uuid>", "username": null }, "requiresOnboarding": true, "csrfToken": "<new-token>" }`. Username/flag reflect the existing row for future onboarded users. Email/Google subject are not returned. |
| `GET /api/auth/session` | `200 { "authenticated": false }` for missing/expired/forged/stale-user sessions; otherwise `200 { "authenticated": true, "user": { "id": "<uuid>", "username": null }, "requiresOnboarding": true }`, reflecting the current account. |
| `POST /api/auth/logout` | `204` with no body after successful stored-session invalidation and cookie clearing. Valid CSRF on an anonymous bootstrap session also succeeds. |

Security/validation rules:

- Use a 32-byte random synchronizer token stored server-side, encoded base64url. Compare expected/provided tokens with bounded input and timing-safe comparison; never accept one supplied only in a URL/body or a separate unsigned cookie.
- Both POST endpoints require a valid stored CSRF token **and** an exact allowed Origin. Missing Origin, `Origin: null`, conflicting origins, missing session/token, or stale token return `403 CSRF_INVALID` before account mutation or Google verification.
- GETs may omit Origin (normal same-origin browser behavior); if present it must match. Reject explicitly cross-site Fetch Metadata requests. SOP/no CORS prevents an unrelated origin reading the bootstrap token; do not add JSONP or token-bearing redirects.
- Missing/expired sessions do not make logout throw a server error, but do not bypass CSRF either: clients can bootstrap a fresh token then log out safely. A repeated POST with the destroyed old token receives `403`, not a special unauthenticated security exception.
- Scope strict JSON parsing to the login operation, limit body to 16 KiB and credential length to 8,192 characters, reject extra fields, and require a three-part base64url JWT shape before calling Google. Do not decode an unverified payload to authorize anything.
- After successful verification/account lookup, regenerate the session and explicitly await save. If regeneration/saving fails, return `503 SESSION_UNAVAILABLE`, clear the cookie, and attempt to destroy the partial new session; do not send success or credentials. Account upsert and express-session regeneration/save remain separate short operations, not a transaction spanning asynchronous callbacks. A user row may remain and is safely reused on retry; sharing a database does not imply that the entire login flow is atomic.
- Stale-user sessions are destroyed and cookies cleared before returning unauthenticated; inability to invalidate/read reliably returns a safe service failure, not authentication success.

Error envelope stays `{ "error": { "code": "...", "message": "<fixed-English-message>" } }`:

| Status | Codes |
| --- | --- |
| `400` | `INVALID_JSON`, `INVALID_REQUEST` |
| `401` | `INVALID_GOOGLE_TOKEN`, `AUTH_REQUIRED` (protected-route helper only) |
| `403` | `CSRF_INVALID`, `HTTPS_REQUIRED`, `ONBOARDING_REQUIRED` (helper only) |
| `413` | `BODY_TOO_LARGE` |
| `415` | `UNSUPPORTED_MEDIA_TYPE` |
| `503` | `AUTH_UNAVAILABLE`, `SESSION_UNAVAILABLE` |
| `500` | Existing `INTERNAL_ERROR` for unexpected failures |

Add a small typed expected-API-error boundary and map known JSON-parser/session failures without trusting arbitrary `error.status`/messages. Preserve the existing unknown-route and unexpected-error behavior. Logs use fixed stage/codes, never JWTs, cookies, headers, full session JSON, or profile data.

## 7. Authorization, composition, and lifecycle

- Add `requireAuthenticated` and `requireOnboarded` middleware for future routes, backed by the stored user ID and a fresh account lookup. Test them through private test routers; do not ship a fake protected/game/debug route.
- Keep `/api/health` registered before session middleware and independent of all database reads/writes. Limit auth/session middleware to the route groups that need it; anonymous health/404 requests do not create sessions/cookies.
- Extend `createApp` composition through explicit auth/router/options inputs while retaining HTTP-only fixtures. Production always supplies real auth resources; test injection is not an environment-controlled bypass or public route.
- Configure proxy trust centrally on the Express application, never unconditionally in express-session. Trusted proxy IPs must replace client-supplied forwarded headers, and direct backend exposure must not bypass the boundary; no proxy configuration is created here.
- Startup validates configuration, opens the application connection once, applies its single migration catalog, and passes that same handle to account access and the session adapter. Construct the Google verifier, then listen. Do not eagerly contact Google at startup or make health depend on Google availability.
- After HTTP draining (or on later startup failure), dispose the session adapter/timer first, then close the database exactly once. Attempt database close even if adapter disposal fails (use a small explicit try/finally or equivalent, not a resource-container framework). If migration initialization fails before the adapter exists, the existing initializer releases the connection.
- Reuse one lifecycle cleanup callback and the existing overall ten-second deadline. Disposal and database close are synchronous/short; preserve cleanup failure/timeout tests and the documented inability of timers to preempt blocking native work. On forced shutdown, stop the timer and attempt the same ordered cleanup without granting another time budget.

## 8. Likely files and database impact

- `backend/package.json`, `package-lock.json`: Google/session dependencies and declarations only; no connect-sqlite3/sqlite3 installation under the recommended option.
- `backend/src/config.ts`, `.env.example`: new auth settings; preserve the existing sole `DATABASE_PATH` and its validation. Never modify the developer's `.env` or database.
- `backend/src/database/migration-catalog.ts`, new `backend/src/database/migrations/001-create-authentication-tables.ts`: one migration for users, sessions, and the expiration index through the existing runner. No `session-migrations.ts` or second catalog.
- `backend/src/auth/google.ts`: official token verification and safe verified-identity output; no SQL or session mutation.
- `backend/src/auth/users.ts`: parameterized account lookup/upsert through the shared connection; no HTTP or Google requests inside transactions.
- `backend/src/auth/session-store.ts`: the four-method store borrowing that connection, expiry cleanup timer, and `dispose()`; no database opening/closing or schema initialization.
- `backend/src/auth/session.ts`: express-session configuration, cookie/absolute-expiry policy, and session field handling; no independent persistence lifecycle.
- `backend/src/auth/csrf.ts`: synchronizer tokens and allowed-origin checks.
- `backend/src/auth/routes.ts`: thin orchestration of bootstrap/login/session/logout.
- `backend/src/auth/authorization.ts`: future authentication/onboarding guards, tested without adding game/debug endpoints.
- `backend/src/types/express-session.d.ts`: application-controlled session fields; request account typing as needed.
- `backend/src/app.ts`, `startup.ts`, `lifecycle.ts` as needed: explicit composition and cleanup. Extend the existing error handler for approved API errors.
- Existing tests/helpers plus focused authentication, store, CSRF/proxy, migration, and restart tests. Adapt all compiled/source startup fixtures to explicit test configuration and one temporary database per application fixture.
- `backend/README.md`, `project.md`, this feature's docs, `MEMORY.md`: approved architecture/API/configuration and verification handoff.

No current domain schema or API contract is removed. One authentication migration changes the database from bookkeeping-only to bookkeeping+users+sessions. The adapter must use those migrated tables, not create them itself. Auth configuration becomes mandatory for real service startup, so README examples and every startup test must change together.

## 9. Ordered task batches

### Batch 1 — Dependency/configuration and approved migrations

- [x] Install only approved dependencies, lock versions, inspect install/audit/native requirements, and verify clean Node 24 installation. Stop on new build or compatibility blockers.
- [x] Add validated auth settings without introducing a session-specific database path; preserve existing `DATABASE_PATH`, default-disabled proxy trust, and production cookie security.
- [x] Add the single approved authentication migration to the existing catalog. Verify upgraded foundation databases retain bookkeeping and that a failure rolls back users, sessions, the index, and its history record together.
- [x] Test existing path rules, invalid auth config, both tables in the same file, schema constraints, unique subject reuse/email change, nullable username, and ordered/repeated migration safety.
- [x] Run configuration/database tests and type checks. Update environment examples using placeholders only.

### Batch 2 — Persistent session adapter and lifecycle

- [x] Implement the four-method store with the existing database handle, authoritative expiration, guarded serialization/callbacks, cleanup timer, and idempotent disposal. Do not open/close a database in the adapter.
- [x] Wire express-session with the approved options, cookie clamping, CSRF-bootstrap lifetime, and typed fields.
- [x] Test persistence/reopen, callback-once errors, corrupt rows, expiry at the boundary, touch without extending lifetime, destroy, failed saves, and periodic cleanup that leaves users untouched. Verify disposal cancels the timer while the shared connection remains usable for account queries.
- [x] Integrate startup failure cleanup and shutdown ordering within the existing budget: adapter disposal before one database close, including a disposal error. Verify both account/session access receive the same handle and health causes no database operations/cookies.

### Batch 3 — Google verification, accounts, and authorization

- [x] Implement the official verifier boundary, fixed claims policy, bounded transport, and sanitized failure mapping; use controlled verifier/transport injection only in tests.
- [x] Implement parameterized account creation/lookup/update and future auth/onboarding middleware. No inventory or onboarding mutations.
- [x] Test wrong signatures/audience/issuer/expiry/claims, provider transport failure, duplicate/concurrent subjects, email changes, missing users, and onboarding denials.
- [x] Exercise the real library with locally generated test signing keys/claims and controlled certificate responses where practical, so tests are not only mocks asserting their own output. No real Google tokens or external requests.

### Batch 4 — Endpoints and browser security

- [x] Add the exact routes/envelopes, scoped body limits, no-store responses, Origin+CSRF checks, trusted-proxy policy, and secure-cookie guards.
- [x] Test full bootstrap/login/session/logout, old SID/token invalidation, session-save failure, anonymous/expired logout behavior, stale-user cleanup, and every declared error status.
- [x] Test missing/null/cross-origin headers, Fetch Metadata denial, forged cookies, production cookie flags, untrusted forwarded headers, and trusted HTTPS forwarding. Do not add CORS or diagnostic endpoints.
- [x] Keep existing health/404/error behavior verified with no session creation or store writes.

### Batch 5 — Restart/production verification and documentation

- [x] Prove an authenticated cookie survives a child-process restart with the same database/secret; logout/absolute expiry prevents reuse. Include store-failure and changed-secret cases.
- [x] Run the complete regression suite, type checks, clean `npm ci`, and production build. Verify source/compiled configuration equivalence and isolated `npm ci --omit=dev` startup with approved schemas and no TypeScript/tsx.
- [x] Smoke-test development startup with isolated storage and explicitly supplied non-secret test client ID/temporary secret. Never enable fake authentication in production code.
- [x] Document required local secret/client-ID setup, exact API/CSRF sequence, storage/migrations, absolute session expiration, proxy/cookies, startup changes, maintenance caveats, and manual/platform checks not performed.
- [x] Update `project.md` only with approved decisions, preserving user annotations. Update feature acceptance/checklists and `MEMORY.md`; inspect the full diff/ignore behavior for secrets, SQLite files, or infrastructure.

## Verification results

- Windows x64 / Node 24.19.0 / npm 11.17.0: clean `npm ci`, type checking, and production build pass. Full suite: **172 passed, two POSIX signal-delivery tests skipped**.
- Actual RSA signatures and negative claims are exercised through the official Google library with controlled certificate responses, including HTTP login. The pinned transport's request-level retry setting is overridden through a request interceptor, and an aborting five-second timeout is tested without network access.
- Session cookie expiration is pinned through each session instance's touch behavior so express-session's automatic cookie touch cannot slide the absolute deadline. Stored expiry, repeated reads, and outgoing cookie deadlines have regression coverage.
- Child-process tests prove shared-handle cleanup ordering, initialization/disposal failure cleanup, stable-secret authenticated restart, changed-secret rejection, persisted logout, and expiry across restart. No fake auth endpoint or runtime bypass is shipped; explicit dependency injection is confined to test composition.
- An isolated production-only install ran compiled migrations and a full signed-test-token bootstrap/login/session/logout flow with controlled trusted HTTPS forwarding, environment-over-file precedence, and graceful cleanup. TypeScript and tsx were absent. No live Google request/account was used.
- Development watch startup, shared auth schema initialization, health, and CSRF bootstrap were smoke-tested with temporary storage/configuration. Watch restart after an edit was not separately tested. Developer `.env` and database were not modified.
- npm reported zero known vulnerabilities and warnings for deprecated prebuild-install/node-domexception and existing install-script policy coverage. No additional native runtime driver, compiler, or script bypass was introduced.
- Actual browser/live Google login, Caddy TLS/header behavior, Oracle Linux ARM64/system libraries, and real POSIX signal delivery remain unverified. No public deployment hardening, frontend, onboarding mutation, or infrastructure was added.

## 10. Deployment impact, risks, and limits

- Adds authentication settings and two tables in the existing SQLite database, but no second database path/file/connection, port, service, Google client secret, or infrastructure resource. Reuse `DATABASE_PATH`, its persistent directory, the backend port, and the future same-origin `/api` proxy path.
- Session writes/expiration cleanup share locking with account and future game writes. This is an accepted simplicity trade-off for the single-process portfolio MVP; keep transactions/cleanup short and revisit storage separation only if measured load justifies it. Backups include sensitive session rows and must remain private; do not copy only a live main file while ignoring WAL sidecars.
- Local service startup will require a Google client ID and stable session secret even before the frontend exists. Documentation may explain obtaining a web-client ID, but agents do not create Google Cloud resources or expose secrets.
- Google certificate verification needs outbound HTTPS on cache misses; availability errors must fail closed. Session inspection does not contact Google.
- Metadata inspection indicates the proposed new runtime packages are JavaScript using Node facilities; the existing native SQLite driver remains the only native runtime driver. Recheck the locked tree and report actual ARM64 execution as unverified unless tested.
- Existing driver/prebuild-installer maintenance caveats remain; clean production installs must be rerun, not inferred from earlier features.
- Windows cannot prove POSIX signal delivery; actual Oracle Linux ARM64, system libraries, live Google/browser integration, and Caddy HTTPS behavior remain manual/target checks until performed.
- This feature does not add request throttling, XSS/CSP frontend controls, or public deployment hardening. Before internet exposure, review login/CSRF-bootstrap abuse limits and reverse-proxy limits in an explicitly approved security/deployment plan. Do not claim those protections exist.

## Approval checkpoint

The user approved and implementation completed all five batches, including the local session adapter, exact single-database migration, claims, expiration, CSRF/API, and cookie/proxy policies. Future material changes to these decisions or schemas require another review.
