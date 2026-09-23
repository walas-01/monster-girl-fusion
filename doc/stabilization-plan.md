# Stabilization Plan

This plan is intentionally limited to crash prevention, correctness, mutation safety, validation, error handling, and state integrity.

## Batch 1: Runtime Foundations - Completed

These changes are independent and should land first because later fixes depend on deterministic persistence and consistent API failures.

### 1. Make database and seed paths deterministic

**Audit finding:** SQLite and seed paths depend on the process working directory, which can silently select or create the wrong database (`doc/system-audit.md:87-88`, `451-453`).

**Why now:** Writing valid data to an unintended database creates divergent application state and makes later verification unreliable.

**Affected files:** `backend/src/db/database.js`, `backend/src/scripts/seed.js`.

**Concrete change:** Resolve `backend/game.db` relative to `database.js` and `src/data/monsters.json` relative to `seed.js` using `__dirname`. Do not add broader environment configuration.

**Dependencies:** None. Complete before database-backed verification.

**Verification:** Start and seed from both the repository root and `backend/`. Confirm both use `backend/game.db` and no root-level database is created.

**Behavior risk:** Low. Any environment accidentally relying on a current-directory database will begin using the intended backend database.

### 2. Correct the case-sensitive frontend import

**Audit finding:** `HomePage.jsx` imports `components/player`, while the actual directory is `components/Player` (`doc/system-audit.md:148`, `446`).

**Why now:** This is a build/startup failure on case-sensitive filesystems.

**Affected file:** `frontend/src/pages/HomePage.jsx`.

**Concrete change:** Change only the import path casing.

**Dependencies:** None.

**Verification:** Run `npm run build`, preferably on a case-sensitive filesystem or CI environment.

**Behavior risk:** None.

### 3. Add API 404 and centralized JSON error middleware

**Audit finding:** Unmatched routes, malformed JSON, and uncaught controller/service failures can return Express HTML or inconsistent error objects (`doc/system-audit.md:215-229`, `464-466`).

**Why now:** Frontend recovery and validation depend on predictable status codes and JSON responses.

**Affected file:** `backend/src/server.js`; all `/api/*` endpoints.

**Concrete change:** Add an API-only 404 handler after the routers and a final four-argument error handler. Return JSON 400 for malformed JSON, preserve recognized 4xx parser statuses, and return a generic JSON 500 for unexpected failures. Log internal errors server-side without returning raw SQLite/runtime details.

**Dependencies:** Middleware must be registered after all routers.

**Verification:** Exercise malformed JSON, an unknown `/api` route, and a forced service exception. Expect stable JSON with 400, 404, and 500 respectively.

**Behavior risk:** Low. Consumers receiving Express HTML will receive JSON instead.

## Batch 2: Confirmed Crash Paths and API Contracts - Completed

### 4. Correct monster-detail absence handling and stale requests

**Audit finding:** `GET /api/monsters/details/:id` returns `200 {monster:null}`, after which `MonsterDetailPage` dereferences `monster.image_path` and crashes (`doc/system-audit.md:101`, `207`, `368`, `445`).

**Why now:** This is a confirmed runtime crash and an incorrect API contract.

**Affected files:** `backend/src/controllers/monsters_controller.js`, `frontend/src/services/api.js`, `frontend/src/pages/MonsterDetailPage.jsx`.

**Affected endpoint:** `GET /api/monsters/details/:id`.

**Concrete change:** Validate `id` as a positive integer and return JSON 400 when malformed. Return JSON 404 when the service returns `null`. On the frontend, reject a successful response without a valid `monster` object and never render `DetailScreen` with null data. Cancel or ignore superseded requests when `id` changes so an older response cannot overwrite a newer route.

**Dependencies:** Uses Item 3's JSON error contract.

**Verification:** Cover a valid ID, absent positive ID, nonnumeric ID, mocked `200 {monster:null}`, and rapid navigation between two IDs. None may dereference null or display stale details.

**Behavior risk:** Low. Missing records change from HTTP 200 to 404.

### 5. Repair the player-monster controller's broken catch path

**Audit finding:** `uuid` is scoped inside `try` but referenced in `catch`, causing another `ReferenceError` while handling the original failure (`doc/system-audit.md:205`, `466`).

**Why now:** A recoverable service failure currently becomes an unhandled secondary exception.

**Affected file:** `backend/src/controllers/monsters_controller.js`.

**Affected endpoint:** `GET /api/monsters/:uuid`.

**Concrete change:** Read the parameter outside the `try`, or reference `req.params.uuid` directly. Forward unexpected exceptions to the centralized error middleware instead of maintaining a separate raw-error response.

**Dependencies:** Item 3.

**Verification:** Force `getMonstersByPlayerUuid()` to throw and verify one JSON 500 response with no secondary exception.

**Behavior risk:** None for successful requests.

### 6. Parse and validate frontend API responses defensively

**Audit finding:** Fusion parses JSON before checking `response.ok`; non-JSON failures mask the HTTP failure. Other methods discard status information and trust response envelopes (`doc/system-audit.md:394-411`).

**Why now:** Callers need reliable status information to distinguish stale identity, rejected mutations, uncertain failures, and malformed success responses.

**Affected file:** `frontend/src/services/api.js`.

**Concrete change:** Add one small internal response helper that safely handles JSON, empty bodies, and non-JSON bodies; throws an error carrying the HTTP status; and validates required success envelopes. Validate `player`, `monsters` as an array, and `monster` for detail/fusion responses. Continue exposing the same exported API functions.

**Dependencies:** Item 3 defines normal backend errors, though the helper must remain defensive against proxies and network failures.

**Verification:** Mock JSON success, JSON 4xx, empty 500, HTML 502, malformed JSON, and malformed 2xx envelopes.

**Behavior risk:** Low. Malformed responses that previously propagated undefined data will become explicit errors.

## Batch 3: Player and Collection State Integrity - Completed

### 7. Replace duplicated player initialization with one state transition

**Audit finding:** Two mount effects independently restore identity, loading ends before player lookup completes, stale UUIDs remain after 404, and player creation stores the UUID without storing the player (`doc/system-audit.md:112-113`, `365-367`, `475-477`).

**Why now:** The application can claim a player exists while holding no valid player object, show creation during unresolved restoration, or retain invalid identity indefinitely.

**Affected files:** `frontend/src/context/PlayerContext.jsx`, `frontend/src/pages/HomePage.jsx`, `frontend/src/components/Player/Navbar.jsx`.

**Affected endpoints:** `POST /api/players`, `GET /api/players/:uuid`.

**Concrete change:** Use one bootstrap effect. Keep identity loading active until lookup resolves. On confirmed 404, remove the stored UUID and clear player and collection state. On network or 5xx failure, retain the UUID, expose a recoverable load error, and do not present the visitor as a new player. On successful creation, set `player` and `playerUuid` together before loading the collection. Expose a minimal retry operation for transient restoration failures.

**Dependencies:** Item 6 is required to distinguish 404 from transient failures.

**Verification:** Cover no stored UUID, valid UUID, stale UUID/404, server 500, network rejection, retry, and successful creation. The username must be available immediately after creation.

**Behavior risk:** Medium. Initialization timing changes, but contradictory states are removed.

### 8. Distinguish collection failure from an empty collection

**Audit finding:** `refreshMonsters()` swallows failures and leaves `monsters` as an empty or stale array, making request failure indistinguishable from a valid empty collection (`doc/system-audit.md:117-121`, `367`, `475`).

**Why now:** Treating failed loading as valid empty state is misleading and can allow actions against stale collection data.

**Affected files:** `frontend/src/context/PlayerContext.jsx`, `frontend/src/pages/HomePage.jsx`, `frontend/src/pages/FusionPage.jsx`.

**Concrete change:** Track collection loading and collection error separately. Validate that the API returns an array before storing it. Preserve the last confirmed collection on refresh failure rather than replacing it. Expose a retry operation, and prevent fusion submission while collection state is unresolved or known to be stale.

**Dependencies:** Items 6 and 7.

**Verification:** Cover valid empty collection, populated collection, malformed envelope, initial network failure, refresh failure with existing data, and successful retry.

**Behavior risk:** Low to medium. Failures previously displayed as empty or stale data will become explicit unavailable states.

## Batch 4: Persistence-Boundary Validation - Completed

Validation should remain route-specific and small. This batch does not add authentication, new domain mechanics, or a validation framework.

### 9. Validate player and direct-monster creation

**Audit finding:** Player creation passes arbitrary bodies to SQLite, while direct monster creation accepts unchecked species, nickname, and player ID and returns raw database errors (`doc/system-audit.md:158`, `165`, `176`, `192`, `464`).

**Why now:** Both endpoints persist data and can currently receive malformed types or missing ownership references.

**Affected files:** `backend/src/controllers/players_controller.js`, `backend/src/services/players_service.js`, `backend/src/controllers/monsters_controller.js`, `backend/src/services/monsters_service.js`.

**Affected endpoints:** `POST /api/players`, `POST /api/monsters`.

**Concrete change:** Require a body object. For players, require a trimmed, nonempty string username. For monsters, require a nonempty species string, a positive integer `playerId`, and either a string or null/omitted nickname. Explicitly verify referenced player and species records. Return 400 for malformed input, 404 for absent references, and send unexpected failures to centralized error handling.

**Dependencies:** Item 3.

**Verification:** Test null/array bodies, missing fields, wrong types, whitespace-only names, nonexistent player/species, nullable nickname, and valid requests. Failed requests must not change row counts.

**Behavior risk:** Low. SQLite-coercible malformed inputs will be rejected.

**Scope limit:** Do not enforce `monster_slots` or resources. Those are unimplemented mechanics, and existing data already violates the apparent slot rule.

### 10. Validate encyclopedia and enemy writes before transactions

**Audit finding:** Catalog and enemy writers destructure or iterate unchecked data and can crash or persist structurally invalid values (`doc/system-audit.md:161`, `170`, `184-186`, `269`, `337`).

**Why now:** These are persistence boundaries capable of corrupting reference data used by frontend rendering and fusion.

**Affected files:** `backend/src/controllers/monsters_controller.js`, `backend/src/services/monsters_service.js`, `backend/src/controllers/enemies_controller.js`, `backend/src/services/enemies_service.js`.

**Affected endpoints:** `POST /api/monsters/encyclopedia`, `POST /api/enemies`.

**Concrete change:** Require encyclopedia input to be a nonempty array of objects with nonempty textual fields, integral tier/stats, positive HP, and a recipes array. Require enemy input to contain its existing camel-case textual and integral numeric fields, with positive HP and nonnegative stats. Validate the complete catalog payload before beginning writes so invalid batches insert neither encyclopedia rows nor recipes. Translate known uniqueness and foreign-key conflicts to stable 400 or 409 responses.

**Dependencies:** Item 3. Embedded recipe validation also depends on Item 11.

**Verification:** Cover wrong top-level types, missing fields, wrong numeric types, invalid recipe structures, duplicate enemy names, foreign-key failures, and valid writes. Invalid catalog batches must leave all involved tables unchanged.

**Behavior risk:** Medium. Values previously accepted through SQLite coercion will be rejected.

### 11. Enforce deterministic recipe integrity

**Audit finding:** The database permits duplicate, reversed, same-pair conflicting recipes, while fusion selects an arbitrary result with `LIMIT 1` (`doc/system-audit.md:203`, `271-282`, `457`).

**Why now:** Ambiguous reference data can make a destructive fusion produce an unpredictable result.

**Affected files:** `backend/src/db/database.js`, `backend/src/controllers/monsters_controller.js`, `backend/src/services/monsters_service.js`.

**Affected endpoints:** `POST /api/monsters/encyclopedia`, `PUT /api/monsters/recipes`, `POST /api/monsters/fuse`.

**Concrete change:** Define the invariant that one unordered parent pair has at most one result. Add a unique SQLite expression index over the canonical unordered pair, after checking for existing conflicts and reporting a clear startup integrity failure if any exist. Validate recipe arrays and nonempty parent names before mutation. Detect duplicate unordered pairs within a request. Keep same-species pairs valid because two distinct instances may legitimately share a species. Remove arbitrary `LIMIT 1` behavior and treat multiple matches as an integrity failure without consuming parents.

**Dependencies:** Item 3. Complete before fusion behavior changes.

**Verification:** Cover exact duplicates, reversed duplicates, conflicting results, duplicate pairs within one request, same-species recipes, valid recipe replacement, and rollback after any invalid entry. The current checked-in database should pass the preflight because the audit found no ambiguous recipes.

**Behavior risk:** Medium. Previously accepted ambiguous recipe writes will be rejected. An already-corrupt external database will fail clearly rather than continue producing arbitrary results.

## Batch 5: Fusion Mutation Safety - Completed

### 12. Validate fusion input and classify failures before mutation

**Audit finding:** Number `1` and string `"1"` can bypass strict same-parent comparison while SQLite resolves both to the same row. The controller also maps every thrown error to 400 (`doc/system-audit.md:203`, `467`).

**Why now:** This directly affects correctness of the destructive fusion transaction.

**Affected files:** `backend/src/controllers/monsters_controller.js`, `backend/src/services/monsters_service.js`.

**Affected endpoint:** `POST /api/monsters/fuse`.

**Concrete change:** Require an object body containing two positive integer parent IDs and a nonempty UUID string. Normalize IDs once and compare normalized values before database reads. Preserve the existing transaction. Return 400 for malformed/self-fusion requests, 404 for missing player or parent, and the existing client failure for no recipe. Forward unexpected database failures to central middleware. Do not expose raw exception text.

**Dependencies:** Items 3 and 11.

**Verification:** Test identical numeric IDs, number/string variants, fractional, negative, object and missing IDs, wrong owner, missing parent, no recipe, ambiguous recipe, and successful fusion. Every failure must leave parent/result row counts unchanged.

**Behavior risk:** Low. Inputs previously accepted through SQLite coercion will be rejected.

### 13. Prevent duplicate frontend fusion and apply the committed result atomically

**Audit finding:** The UI allows repeated fusion submissions, blocks distinct same-species instances, and relies on a swallowed collection refresh after a successful destructive mutation (`doc/system-audit.md:132-135`, `423`, `478-479`).

**Why now:** Duplicate submissions and post-commit refresh failure can replace success with an error or leave the UI showing consumed parents.

**Affected files:** `frontend/src/pages/FusionPage.jsx`, `frontend/src/context/PlayerContext.jsx`, `frontend/src/services/api.js`.

**Affected endpoint:** `POST /api/monsters/fuse`.

**Concrete change:** Compare selections by instance `id`, not species `name`. Add an `isFusing` guard and a real `disabled` attribute. Capture selected IDs before awaiting the request. After a validated success response, update context in one local transition by removing both consumed IDs and adding the returned monster; do not depend on a follow-up fetch to represent the committed mutation. Remove the unnecessary player refresh because fusion does not mutate player fields.

For network or 5xx failures where commit status is uncertain, attempt collection reconciliation. If reconciliation also fails, mark the collection unresolved and disable further fusion rather than presenting stale parents as safe to retry. Known 4xx rejections can leave the confirmed collection unchanged.

**Dependencies:** Items 6, 8, and 12.

**Verification:** Delay the mocked request and double-click; exactly one POST must occur. Verify two distinct same-species IDs are selectable while one instance cannot be selected twice. Test success, known 4xx rejection, network loss after request submission, failed reconciliation, and normal failure recovery. A successful response must immediately remove both parents and add exactly one result.

**Behavior risk:** Low to medium. Same-species combinations become reachable, duplicate requests stop, and collection ordering may change if the result is appended.

## Verification Strategy

Because the repository has no test framework, stabilization verification should use a disposable copy of `game.db` and focused endpoint/component checks. Adding a broad testing architecture is outside this plan.

Required checks:

1. Run frontend lint and production build.
2. Exercise all changed endpoint success and rejection paths.
3. Compare database row counts before and after every rejected mutation.
4. Verify transaction rollback for invalid catalog, recipe, and fusion operations.
5. Verify frontend state for restoration 404, transient restoration failure, collection failure, missing details, fusion success, fusion rejection, and uncertain network failure.
6. Confirm `PRAGMA integrity_check` and `PRAGMA foreign_key_check` still pass.
7. Confirm the recipe uniqueness invariant against existing and newly submitted data.

## Explicit Exclusions

This plan does not include authentication or authorization, hiding UUIDs, portal/combat/acquisition features, slot/resource mechanics, UI polish, navigation changes, image corrections, CORS, rate limiting, security headers, deployment configuration, pagination, performance indexes, general migration infrastructure, graceful shutdown, logging frameworks, or broad architectural refactoring.

Implementation of these fixes requires a separate request.
