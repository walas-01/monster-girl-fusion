# Backend Google Authentication and Persistent Sessions

Status: Approved and implemented with one database — locally verified; live Google/browser/Caddy integration, Linux ARM64 execution, and actual POSIX signal delivery remain unverified.

## Goal

Allow a future browser client to exchange a valid Google identity for an application session, check the current signed-in account, and log out. Account identity and sessions must survive backend restarts without exposing credentials or trusting client-provided account data.

This is a backend-only feature building on the completed service and persistence foundations. It does not complete the frontend sign-in experience or player onboarding.

## User-facing behavior

- A client submits a Google ID token obtained through Google Identity Services. The backend verifies it before establishing an application session.
- The first successful login creates a minimal account awaiting onboarding. Later logins with the same Google subject reuse that account, including when its Google email changes.
- A client can check whether its session is authenticated and obtain minimal account/onboarding information without submitting another Google token.
- A signed-in session survives a browser/backend restart until its documented expiration, provided the persistent store and session secret remain available.
- Logout ends the current application session; subsequent requests using that old session are unauthenticated. It does not sign the player out of Google or other application sessions/devices.
- New accounts still require username selection and starter monsters in a later feature. Authentication alone does not mean onboarding is complete.

## Scope

- Google ID-token verification and repeat-safe account creation/lookup.
- Backend operations for login, session inspection, and logout under `/api`.
- A persistent SQLite-backed session store in the existing application database and authentication middleware for future protected routes.
- Protection against session fixation, CSRF (including login CSRF), and unsafe cookie/proxy configuration.
- Environment-based authentication and narrowly trusted reverse-proxy settings, reusing the existing database path.
- Reviewed account/session tables in one migration catalog, tests, and documentation.

## Non-goals

- Frontend scaffolding, Google sign-in widgets, login screens, or Vite proxy implementation.
- Username submission/validation, starter-monster grants, or other onboarding mutations.
- Monster/game tables, protected game endpoints, or gameplay authorization rules beyond the authentication/onboarding boundary.
- Passwords, other identity providers, application-managed email verification, account linking, or account deletion.
- Storing Google ID/access/refresh tokens or accessing other Google APIs.
- Cross-site frontend hosting, broad CORS access, horizontally scaled backends, a separate session database, or a new infrastructure service.
- Google Cloud resource/client creation, Docker/Compose/Caddy configuration, or production deployment.

## Requirements

### 1. Verified Google identity

- Use the existing Google-only architecture: verify Google ID tokens on the backend using `google-auth-library`; never treat decoding a token as verification.
- Verify signature, expected audience from configured Google client ID, allowed issuer, expiry, and required identity claims before using the identity to create/retrieve an account.
- Identify an account by Google's stable subject identifier, never by an email address, client-submitted user ID, or unsigned profile fields.
- Store only minimal required verified profile/account data. Do not automatically link accounts by matching email addresses.
- Invalid, expired, malformed, wrong-audience, or otherwise unverifiable tokens do not create a new authenticated session. Verification-service failures must not bypass authentication.
- Do not return login success until session regeneration and persistent session saving succeed. A partial failure must remain recoverable by a later login without creating duplicate accounts.
- Login request validation must bound input size and reject missing/invalid credential fields without logging their values.

### 2. Accounts and the onboarding boundary

- Persist a minimal user identity with an internal identifier, unique Google subject, verified profile email, creation time, and an explicit way to represent incomplete onboarding.
- Repeated or overlapping successful logins for the same Google subject must not create multiple accounts.
- Authentication must not invent a username, mark an account as onboarded, or grant monsters/resources. Future onboarding must retain the project's exactly-once starter-grant requirement.
- Session inspection reports minimal account data and whether onboarding is required. Do not expose Google tokens, session IDs, secrets, or unnecessary profile information.
- Keep authentication separate from account-onboarding/game rules. Future routes must be able to distinguish unauthenticated accounts from authenticated accounts that still need onboarding.
- Exact columns, nullable fields, constraints, email-claim policy, and representation of onboarding state require approval in the implementation plan before schema changes.

### 3. Persistent sessions

- Use `express-session` with a persistent SQLite store, not its in-memory store or a silent in-memory fallback.
- Review the documented `connect-sqlite3` choice for Node 24/Linux ARM64 compatibility before adoption. If it cannot meet the requirements, propose an alternative and obtain approval rather than silently changing architecture or installing a toolchain.
- Store accounts, game data, sessions, and migration history in the same SQLite database selected by `DATABASE_PATH`. Reuse the existing connection and migration catalog; do not introduce a session-specific path, connection, or database.
- The session adapter borrows the application connection. It owns its session operations and cleanup timer, not the connection or database lifecycle. Expired-session cleanup must not modify account or game tables.
- The shared database and its sidecars remain outside source/build directories, stay ignored by Git, and are compatible with a future persistent-directory mount.
- Regenerate the session ID when authentication succeeds. The prior session identifier must not become or remain an authenticated session through that login.
- Authorize through a server-side session user identifier, not client-provided identity fields. A stale session referring to a nonexistent user is not authenticated.
- Set an explicit, documented session lifetime enforced by both cookie/store behavior and backend checks. Missing, expired, forged, or invalidated sessions must not authorize access.
- Preserve authenticated sessions across service restarts using stable configuration and persistent storage. Do not regenerate the signing secret automatically on each startup.
- Session-store read/write failures fail safely and must not produce successful authentication or authorization based on unverified client state.
- Logout invalidates the stored session and clears its cookie before reporting success. The operation must safely handle an already missing/expired session; state-changing security checks still apply.
- Avoid unnecessary session creation for health checks and routine anonymous requests. Session bootstrap required by the chosen CSRF design is permitted and must be documented.

### 4. Browser security and API behavior

- Cookies are HttpOnly, use an appropriate SameSite policy, and are Secure in production. Local HTTP development must not require disabling production cookie protections.
- Apply a reviewed CSRF defense to state-changing operations, including login and logout. A valid Google token alone is not sufficient protection against login CSRF.
- Define how the future browser client obtains any required CSRF token or supplies origin information. Bootstrap/helper endpoints may be added only as needed by the approved strategy.
- Do not rely on SameSite alone or untrusted Host/forwarded headers to decide which requests are authorized origins. Document behavior for missing, invalid, and cross-origin requests.
- Keep same-origin relative `/api` integration suitable for the future Vite development proxy and Caddy production proxy, without enabling unrestricted CORS.
- Keep reverse-proxy trust disabled by default. Production trust is environment-configured and restricted to the intended proxy boundary, never unconditional trust of all forwarded headers.
- Verify trusted HTTPS forwarding supports Secure cookies while spoofed forwarded headers from untrusted clients do not.
- Preserve the established JSON error envelope. Auth failures, input errors, CSRF denials, and service failures have documented status codes and stable English codes; future UI text remains localized by the client.
- Authentication/session responses must not be cached in ways that expose account information or present stale authentication state.
- Keep `GET /api/health` public, lightweight, and unchanged in contract; it must not create a session or perform database reads/writes.
- Exact routes, bodies, response fields, status codes, and CSRF handshake are reviewed in the plan. No existing frontend/API consumers need migration.

### 5. Configuration, persistence, and lifecycle

- Configure the Google audience/client ID, session signing secret, session lifetime, allowed browser origin(s), and proxy trust through appropriately validated environment settings. Keep `DATABASE_PATH` as the only database-path setting; the plan defines other exact names, supported values, and safe defaults.
- Required authentication configuration must fail startup clearly when absent/invalid, without printing secrets or token values. No hardcoded development secret, fake-login endpoint, or production authentication bypass.
- Local setup must explain how to provide a stable randomly generated secret and Google client ID; Google client secrets or refresh tokens are not needed for this ID-token flow.
- Production uses the established explicit absolute `DATABASE_PATH` and writable-parent policy for all application/session storage. Do not create production storage directories or cloud resources as part of implementation.
- Account and session tables use the existing reviewed application migration workflow and one `schema_migrations` history. The adapter does not create or migrate tables independently; its expiration cleanup behavior must also be reviewed.
- Initialize required authentication/session resources before listening. On startup failure or shutdown, stop/dispose the session adapter and its timer before closing the shared connection exactly once, preserving the single overall shutdown deadline and cleanup error handling. Attempt database close even if adapter disposal fails.
- Verify new direct/transitive dependencies, native binaries, and clean installs against Node 24 and the Linux ARM64 target. Report actual platform-verification limits; do not infer ARM64 runtime success from Windows tests.
- Logs and error responses never include Google credentials, cookies, authorization headers, session secrets, full session contents, or unnecessary personal data.

### 6. Verification and documentation

- Automated tests use one isolated temporary database per application fixture and a controlled Google-verification boundary. No developer credentials, real user tokens, or live Google requests are required for the automated suite.
- Cover valid login, repeat/concurrent account lookup, rejected identity claims/tokens, verification errors, input limits, and session-save failures without falsely successful login.
- Cover session-ID regeneration, stale/forged/expired sessions, server-side authentication checks, logout, cookie flags, CSRF including login, and trusted/untrusted proxy behavior.
- Prove a saved session remains authenticated after a test-process restart with the same database and secret, and that logout/expiry prevents that session from being reused.
- Cover session-store failures, startup migration/initialization failures, and resource cleanup/deadline behavior. No public diagnostic/fake-auth routes may ship for testing.
- Preserve existing health/error/persistence regressions and independent HTTP-application testing. Type checking, the full suite, and production build must pass.
- Verify a clean production-only installation can migrate accounts, initialize persistent sessions, and run the compiled service without development loaders.
- Document setup, API/CSRF interaction, session lifetime, storage/migrations, proxy/cookie behavior, safe diagnostics, and any manual Google/browser/ARM64 checks not performed.

## Acceptance criteria

- [x] Verified Google identity creates/reuses exactly one account per subject; invalid identity cannot establish a session.
- [x] New accounts remain explicitly un-onboarded; no username or starter inventory is assigned.
- [x] Login regenerates and persists the session before success; session inspection returns only safe minimal account/onboarding data.
- [x] Authentication survives a backend restart with persistent session storage and stable configuration.
- [x] Expired, forged, stale-user, and logged-out sessions cannot authorize access; storage failures fail safely.
- [x] Cookie settings, CSRF protection including login, and restricted proxy trust are documented and tested.
- [x] User/session table definitions, dependencies, and environment settings are reviewed and approved before implementation.
- [x] One `DATABASE_PATH`, connection, migration catalog, and history cover account/game/session data; adapter disposal leaves database closure to startup/lifecycle ownership.
- [x] Health behavior remains public and unchanged, without creating sessions or database writes.
- [x] Tests, type checks, build, clean installs, and compiled production verification pass, with platform/manual-test limitations reported.
- [x] No frontend, onboarding/game implementation, in-memory session fallback, or infrastructure is introduced.

## Approved decisions and remaining scope

- The user approved the backend-only specification and revised single-database plan, including exact table definitions, the local session adapter, dependencies, lifetime, CSRF/API contracts, Google claims, and proxy/cookie behavior, before implementation.
- Verification results and limitations are recorded in `plan.md` and `backend/README.md`. Tests use local signing keys/controlled Google certificate transport, not real Google accounts.
- The frontend sign-in flow and username/starter-monster onboarding remain separate features; no Google Cloud resources or client credentials are created by this feature.
