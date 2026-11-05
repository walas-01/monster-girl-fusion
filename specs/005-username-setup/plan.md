# Feature 005 — Username-only account setup plan

Status: Approved and implemented — all four batches locally verified; remaining manual/platform limits are recorded below.

## 1. Approach and boundaries

Extend the existing authenticated account flow rather than introduce another sign-in method or onboarding framework. Add a username mutation to the auth router, a small synchronous account operation using the shared SQLite connection, and a localized form in the existing frontend view. Keep Google login, session restoration, and logout unchanged.

No new packages, configuration, infrastructure, or starter/game tables. Preserve existing player data and developer environment settings. Tests use isolated temporary storage. The user approved this plan, exact SQL/data policy, and all four batches before implementation.

## 2. Exact approved database change

Add migration **2**, `create_case_insensitive_username_index`, through the existing catalog/history:

```sql
CREATE UNIQUE INDEX users_username_nocase_idx
ON users (username COLLATE NOCASE)
WHERE username IS NOT NULL;
```

Proposed module: `backend/src/database/migrations/002-create-case-insensitive-username-index.ts`.

### Why an additional index

- SQLite's built-in NOCASE folds ASCII letters, matching the approved ASCII username policy without a normalization column, Unicode extension, or dependency.
- The partial index excludes unset usernames; many accounts can still have `username = NULL`.
- Keep migration 1 and its hash immutable. Retain the original case-sensitive UNIQUE constraint: the extra index is a small amount of redundant index storage but avoids rebuilding `users`, touching its identity/profile fields, or complicating foreign-key consumers.
- Backend validation enforces format; the index enforces cross-account uniqueness. One-time assignment is enforced by the conditional transactional write below. No triggers/table rebuild are proposed.

### Existing data and failure policy

- Preserve every saved username and its capitalization, all user IDs, Google data, timestamps, and session rows.
- If existing records include names differing only by ASCII capitalization, index creation fails. The existing migration runner rolls back this migration/history entry and refuses startup before HTTP listening. Never choose a winner, rename, delete, or merge accounts automatically.
- Document a read-only diagnostic query for an operator to identify conflicts privately:

  ```sql
  SELECT username COLLATE NOCASE AS conflicting_name, COUNT(*) AS account_count
  FROM users
  WHERE username IS NOT NULL
  GROUP BY username COLLATE NOCASE
  HAVING COUNT(*) > 1;
  ```

  Resolving actual conflicting names requires a separately approved data decision. Do not dump names in startup logs or modify the developer database to test this.
- Preexisting out-of-policy names (for example, manually entered short or non-ASCII names) remain readable and immutable, not silently rewritten or rejected at migration time. New assignments must satisfy the approved rules. NOCASE is not general Unicode folding; this migration makes no Unicode equivalence guarantee for legacy names. If such data needs cleanup, stop for a separate explicit decision. No endpoint exists today to create these names, but fixtures/manual data may contain them.
- Fresh databases apply migrations 1 then 2. Upgrades append only migration 2; reruns do nothing. Collision/failure tests verify no partial index/history or account/session loss.

## 3. Additive API contract

### `POST /api/auth/username`

Request:

```json
{"username":"Luna_7"}
```

- JSON object with exactly one `username` string. Extra fields, including client-supplied account IDs, are rejected.
- Reuse auth router no-store responses, production HTTPS/Origin protections, session middleware, current-user authorization, and synchronizer token in `X-CSRF-Token`.
- Order: existing router security/session handling, `requireAuthenticated`, `requireCsrf`, JSON media-type check/parser (2 KiB limit), then input validation/account operation. An insecure/hostile-Origin request is denied before auth/body handling. A missing account returns 401 before CSRF; an existing authenticated session with an invalid token returns 403.
- Trim JavaScript surrounding whitespace; after trimming require 3–20 ASCII letters/digits/underscores and at least one ASCII alphanumeric. Bound the raw string to 256 characters before normalization. Wrong body shape/type gives `INVALID_REQUEST`; a string violating raw/normalized username rules gives `INVALID_USERNAME`. Do not silently truncate or lowercase display spelling.

Successful first assignment or same-name confirmation returns **200**:

```json
{
  "authenticated": true,
  "user": {"id":"<existing-user-uuid>","username":"Luna_7"},
  "requiresOnboarding": false
}
```

This matches the authenticated session response shape. The frontend already obtains a fresh CSRF token before each mutation, so no new token field or session regeneration is necessary. Username setup does not elevate authentication privileges or change/extend session expiry; no username is cached inside the session. The transaction's committed account result determines success even if the connection is subsequently interrupted.

### New fixed errors

| Status | Code | Fixed technical message |
| --- | --- | --- |
| 400 | `INVALID_USERNAME` | `Username must contain 3 to 20 ASCII letters, digits, or underscores and include a letter or digit.` |
| 409 | `USERNAME_TAKEN` | `This username is already in use.` |
| 409 | `USERNAME_ALREADY_SET` | `A username has already been selected for this account.` |
| 503 | `USERNAME_UNAVAILABLE` | `Username setup is temporarily unavailable.` |

Reuse existing 400 invalid JSON/request, 401 auth required, 403 Origin/CSRF/HTTPS, 413 body limit, 415 media-type, and session/database auth failure handling. Do not map every SQLite failure to a taken name or expose driver diagnostics.

### Compatibility and affected consumers

- Existing `/google`, `/session`, `/csrf`, and `/logout` response fields/statuses do not change. Their existing frontend consumer remains valid.
- `users.ts` lookups already read current username from SQLite, so sessions automatically observe assignment on their next read. Keep `requiresOnboarding` equivalent to `username === null`.
- Existing `requireOnboarded` behavior stays compatible: it checks **username completion only**, not starter ownership or future game-entry eligibility. Document this limitation rather than rename/export-break the helper.
- Frontend additions affect `AuthApi`, API tests/mocks, controller/pending states, `useAuth`, `App`, and translations. All first-party implementations/fixtures must be updated together; no new external consumer or breaking HTTP contract is introduced.
- Existing migration/startup tests hardcode catalog length/index names or use fixture migration 2. Update them to expect the real new index/history and place custom fixture migrations after the real catalog; do not weaken migration validation.

## 4. Backend operation

Proposed `backend/src/auth/username.ts` contains a small validation helper and parameterized account operation, keeping HTTP orchestration in `routes.ts`.

1. Normalize/validate input; no database work for invalid names.
2. In one short `db.transaction(...).immediate()` callback, re-read the user by authenticated internal ID. The read must happen inside this transaction, not rely on earlier middleware state.
3. If the row is absent, reject with `AUTH_REQUIRED`. If a username already exists and equals the normalized input ignoring ASCII case, return the saved row unchanged. If a different name exists, reject with `USERNAME_ALREADY_SET` without considering availability or overwriting it.
4. For an unset account, run `UPDATE users SET username = ? WHERE id = ? AND username IS NULL RETURNING id, username`. Require one returned row. The unique index is the final arbiter; do not rely on an availability precheck.
5. Let errors roll back before classifying them. Preserve expected `ApiError` instances, map `SQLITE_CONSTRAINT_UNIQUE` from this username-only update to `USERNAME_TAKEN`, and map other storage/lock failures to `USERNAME_UNAVAILABLE`. Use structured error codes, not driver-message matching/logging.

This protects same-account races and two-account name races, including differently capitalized submissions. No async callbacks, Google verification, HTTP writes, resource grants, or session saves inside the SQL transaction. The application remains the only supported mutation interface; direct administrative SQL can bypass application immutability and is not a public feature.

## 5. Frontend integration

- Add a small `UsernameForm.tsx` near the existing auth components and a tiny frontend validation helper. Do not introduce a root shared package just to share a few username rules; use mirrored boundary tests to prevent frontend/backend drift.
- Render only for confirmed authenticated sessions requiring username setup. One label/input, translated rule/permanence help, save button, and accessible field feedback. Use `autoComplete="username"`, disable unwanted autocapitalization/spellcheck, and validate the trimmed value before issuing requests. Keep surrounding whitespace normalization consistent with backend behavior; permit enough raw input to avoid a maxlength/trim mismatch.
- Reuse existing dark panel/control styling, keyboard focus, English/Spanish dictionaries, and language selector. Preserve draft/error on language changes, display invalid/taken messages alongside the form with `aria-describedby`/`aria-invalid`, and focus an invalid field as appropriate. Render saved usernames as React text, never HTML.
- Keep draft in view state keyed by the confirmed user ID so temporary form unmounts during reconciliation do not lose it. Clear when a different account is confirmed, confirmed logout occurs, or setup succeeds. Never persist drafts/CSRF/credentials to localStorage or URLs; hide the draft while account state is unknown.
- Extend the existing `AuthApi` with `setUsername`, keeping relative requests and same-origin cookies. Accept the session-shaped response only if authenticated, username is non-null, and `requiresOnboarding` is false.
- Extend the existing controller/hook with a `savingUsername` pending state and a username command. Keep the same synchronous duplicate-operation lock; allow setup only for a confirmed unconfigured account. During a mutation, disable save/input/logout/language changes and remove conflicting sign-in actions. Do not add a second independent request controller competing with auth state.
- Obtain a fresh CSRF token before every deliberate save. On valid success, replace auth state from the response. On any potentially committed failure, inspect the session before allowing another save; no automatic POST replay. If inspection confirms a saved name (including another tab's different name), use that saved state and do not show obsolete inline errors as though the save were still required. If still unconfigured, retain input and translated invalid/taken/service/security feedback. If unknown, require read-only retry; if anonymous, show existing sign-in flow.
- Add controlled tests for stale-tab outcomes, failed/rejected/committed requests, expiry, draft persistence, and changing accounts. Existing login/logout behavior must remain unchanged. No routing or new game UI.

## 6. Deployment and operations

- No new environment variables/secrets, ports, services, native packages, or persistent files. Uses the same `DATABASE_PATH`, SQLite connection, migration runner, HTTP lifecycle, and frontend static build.
- Migration runs before listening and is restart-safe. Back up the shared database safely before deploying a schema upgrade, including its required journal/WAL handling; do not copy a live SQLite file naively or auto-edit player names.
- Existing Linux ARM64 verification limitations remain; SQL NOCASE/partial indexes and the pinned SQLite driver require no new extension/toolchain. No Docker, Compose, Caddy, cloud resources, proxy-trust, HTTPS/cookie, or Vite-proxy changes.
- Bounded JSON parsing and fixed errors follow current patterns. Public-deployment moderation/throttling/CSP/security review remains separate work, not a claim made by this feature.
- Update `project.md` to separate username setup from future exactly-once starter grants, and document the existing `requiresOnboarding`/`requireOnboarded` meaning. Do not introduce a starter eligibility marker until that feature's schema is approved.

## 7. Ordered batches and verification

### Batch 1 — Migration and atomic username operation

- [x] Add the approved migration/index without editing migration 1. Update catalog-aware fixtures/expectations and preserve existing unrelated work.
- [x] Implement validated, parameterized one-time assignment and fixed errors.
- [x] Test fresh/upgrade/repeat migration, NULL usernames, case conflicts with full rollback/history preservation, untouched users/sessions, and legacy-name preservation.
- [x] Test trimming, 3/20 boundaries, punctuation/Unicode/underscore-only rejection, case-preserved display, same-name confirmation, permanent assignment, competing accounts, same-account races, and safe storage errors. Run backend type checks and relevant persistence/account tests.

### Batch 2 — Secured additive endpoint

- [x] Add `/api/auth/username` through existing middleware; no session contract/cookie changes.
- [x] Test unauthorized/stale/expired accounts, invalid Origin/CSRF, JSON shape/type/body/charset limits, ignored client identity rejection, fixed errors, and no-store responses.
- [x] Prove current session inspection/later Google login see the saved name, same-ID persistence survives restart, and concurrent HTTP submissions cannot overwrite/take a name twice. Verify only account username changes, with no grants/extra tables/session-expiry extension.
- [x] Run full backend regressions/typecheck/build and inspect the diff before frontend integration.

### Batch 3 — Localized form and safe async state

- [x] Add translated form/rules/permanence/errors and frontend validation; extend API/controller/hook without an unrelated rewrite.
- [x] Test save success, duplicate actions, invalid/taken names, retained draft across language/reconciliation, same/different-account resets, CSRF refresh/rejection, expired session, stale tab, committed-but-lost response, and failed read-only reconciliation.
- [x] Run frontend typecheck/tests/build plus existing auth UI regressions. Confirm Google login/logout/restoration still work with controlled SDK/identity responses and no credential/CSRF storage or new runtime dependency appears; live Google was not reverified.

### Batch 4 — Integration and handoff

- [x] Exercise the real frontend proxy/backend with temporary SQLite and controlled identity: save username, reload, restart, conflict, logout/login, and case-insensitive collision. No developer database or credentials used by checks.
- [x] Inspect mobile/desktop/keyboard form behavior in the browser in English and Spanish. Distinguish controlled browser checks from live Google/user verification.
- [x] Run both full suites, clean typecheck/build checks, whitespace/diff/ignore checks, and document actual results/remaining platform limits.
- [x] Update package READMEs, project architecture/onboarding separation, spec/plan checklists, and memory handoff. No infrastructure or starter content.

## Approval gate

The user approved the plan, **exact migration 2/index and collision/legacy-data policy**, additive contract, and all batches before implementation. All identified first-party consumers/fixtures were updated. Any future data correction, schema expansion, or starter/game decision requires separate approval.

## Verification results

- Windows x64 / Node 24.19.0 / npm 11.17.0: backend **194 passed, three skips**, frontend **44 passed**, both typechecks/builds pass. Skips are two actual POSIX signal tests on Windows plus the optional default-port startup check (3000 already occupied). Existing running services were not stopped. Dependencies/lockfiles were unchanged.
- Migration tests cover upgrade/repeat, case-insensitive collision rollback without account/session/history loss, legacy names, direct uniqueness enforcement, and compiled startup refusal/connection cleanup for conflicting names. Migration 1 remains unchanged.
- Account/HTTP tests cover mirrored normalization boundaries, immutable/idempotent assignment, concurrent same-account/different-account submissions using separate cookie jars, safe busy/storage errors, current account authorization, CSRF/Origin/body checks, unchanged persisted sessions/expiry, and later sign-in/restart identity/name preservation.
- Frontend tests cover form validation/permanence guidance, translated inline errors/focus, pending-state locking, raw/normalized request rules, retained draft through language/reconciliation, clearing across account/logout/completion, stale-tab/lost-response outcomes, and read-only recovery without automatic mutation replay.
- Headless Chrome exercised actual Vite + backend/auth/session store and temporary SQLite: local validation, save via keyboard, reload after backend restart, case-insensitive two-account conflict, retained draft/translated error, subsequent valid name, and logout/login with saved identity. Google SDK/verifier responses were controlled test dependencies only. Reviewed screenshots at 375×812 and 1280×900 show the intended minimal form/conflict layout without horizontal overflow; no reference images were supplied. Temporary browser harness removed after checks.
- No live Google identity, developer database, or developer `.env` was used by verification. The user's earlier report of working Google sign-in remains separate from these controlled checks. Live Google for the new flow, Caddy TLS/headers, Linux ARM64, and real POSIX signal delivery remain unverified.
- No new packages, game tables/grants, configuration, public ports/services, infrastructure, or authentication bypass. Username completion explicitly does not represent starter eligibility/grants.
