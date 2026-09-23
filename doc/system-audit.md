# System Audit

Updated: 2026-09-21

This document describes the repository after completion of
`doc/stabilization-plan.md`, all four batches in
`doc/server-refinement-plan.md`, and all four batches in
`doc/frontend-refinement-plan.md`. It records current behavior and remaining
risks; it is not an implementation roadmap.

## 1. Repository Overview

Monster Girl Fusion is a local full-stack prototype with three main parts:

- `frontend/`: React 19 and Vite single-page application.
- `backend/`: Express 5 API backed by a synchronous SQLite database through
  `better-sqlite3`.
- `backend/game.db`: tracked mutable application data, including schema and seed
  content.

The frontend and backend run as separate Node processes in development. The
frontend uses relative `/api` URLs, and Vite proxies them to
`http://localhost:3001` during development.

### Current top-level documentation

- `README.md` contains only a one-sentence project description; it does not
  document setup or verification.
- `backend/README.txt` is a short development note rather than backend usage
  documentation.
- `doc/stabilization-plan.md` records the completed stabilization work.
- `doc/server-refinement-plan.md` records the completed backend refinement work.
- `doc/frontend-refinement-plan.md` records the completed frontend refinement
  work.

## 2. Runtime Architecture

### Frontend

`frontend/src/App.jsx` defines four product routes:

- `/`
- `/portal`
- `/fusion`
- `/monster/:id`

It also defines a wildcard client route with Spanish not-found text and a Home
link. The shared navbar identity/status area is itself a Home link.

`frontend/src/main.jsx` mounts `App`; `App` owns `BrowserRouter` and
`PlayerProvider`. `frontend/src/context/PlayerContext.jsx` owns persistent player
identity, player creation state, collection state, request race protection, and
the complete fusion operation lifecycle. The context object and `usePlayer` hook
are separated into `frontend/src/context/PlayerContext.js` so the provider module
contains only the component export required by Fast Refresh.

`frontend/src/services/api.js` is the only frontend module that communicates
with the backend. It performs five calls:

- `POST /api/players`
- `GET /api/monsters/details/:id`
- `GET /api/players/:uuid`
- `GET /api/monsters/:uuid`
- `POST /api/monsters/fuse`

The client has no frontend environment configuration for the API origin. The
development proxy target is hardcoded in `frontend/vite.config.js`.

Every frontend API request has a ten-second timeout. The adapter composes that
timeout with caller cancellation, preserves HTTP status and backend request IDs
on generated errors, and marks timeout or malformed-success outcomes for
non-idempotent operations as uncertain.

### Backend

`backend/src/app.js` creates the Express application, disables `X-Powered-By`,
adds Helmet security headers, assigns server-owned request IDs, enables JSON
parsing with an explicit size limit, mounts the player, monster, and enemy
routers, and registers the API 404 and centralized error middleware. It exports
the application without opening a listener.

Each request receives an `X-Request-ID` response header and one structured
completion or abort log. Logs use route templates rather than raw UUID paths and
do not include request bodies or arbitrary exception messages. Unexpected-error
logs carry the same request ID.

`backend/src/server.js` validates the configured port, imports the application,
owns listener startup, applies explicit request/header/keep-alive timeouts, and
registers graceful `SIGINT`/`SIGTERM` handling. Shutdown stops new connections,
allows active requests a bounded completion period, destroys any sockets still
tracked at the deadline, and then closes SQLite. Port `3001` remains the default.

The backend follows a route/controller/service split:

- Routes declare paths and HTTP methods.
- Controllers validate requests and map expected outcomes to HTTP responses.
- Services execute synchronous SQL and own transactions.

The split is generally clear. Primitive validation and expected HTTP errors are
shared, while catalog and recipe normalization remain domain-specific. Database
initialization remains tied to the singleton service imports, while application
construction and listener startup are separate. This supports isolated
integration and process-lifecycle testing.

### Persistence

`backend/src/db/database.js` uses a validated `DATABASE_PATH` override when
provided and otherwise resolves the database path relative to the module
location, so startup no longer depends on the process working directory. The
separate seed script also resolves its input path relative to its own module.

Startup performs the following work:

- Enables foreign keys.
- Creates missing tables with idempotent `CREATE TABLE IF NOT EXISTS`
  statements.
- Rejects existing recipe data containing unordered duplicate parent pairs.
- Creates a unique expression index that prevents future unordered duplicate
  recipe pairs.
- Applies all schema creation, recipe-conflict preflight, and index creation in
  one startup transaction.

Startup does not run the seed script or apply versioned migrations.

The database module exports a singleton connection. Services import that
connection directly. Backend integration tests set `DATABASE_PATH` before
loading the application and run against a disposable copy of `backend/game.db`.

## 3. Data Model

The SQLite database contains these domain tables:

- `players`
- `monster_encyclopedia`
- `monsters`
- `monster_recipes`
- `enemies`

### Relationships

- `monsters.owner_id` references `players.id`.
- `monsters.species` references `monster_encyclopedia.name`.
- `monster_recipes.parent_1`, `parent_2`, and `result` reference
  `monster_encyclopedia.name`.

The foreign keys use SQLite's default deletion behavior; the schema does not
declare cascades.

### Invariants enforced by application code or indexes

- Player public identifiers generated by the application are UUIDs; monster,
  enemy, and internal player identifiers are auto-incrementing integers.
- Player names are non-empty strings after trimming.
- Monster instance insertion verifies that both the player and species exist.
- Fusion ingredients must exist, belong to the requesting player, be distinct,
  and match one recipe.
- Fusion deletes both ingredients and creates the result in one transaction.
- An expression index permits only one recipe for an unordered pair of species.
- Recipe replacement validates the complete payload before deleting existing
  recipes and performs replacement in one transaction.

### Remaining persistence limitations

- Several domain constraints are application-only rather than table-level
  constraints. Direct SQL writes can bypass them.
- SQLite uses an explicit five-second busy timeout and is closed during graceful
  process shutdown. Journaling remains at SQLite's configured/default policy.
- A tracked mutable database is convenient for the prototype but makes clean
  initialization, review, and concurrent development less predictable.
- Services return a mix of raw rows, inserted rows, custom objects, and sentinel
  values such as `null`. Controllers must know those conventions individually.

## 4. API Inventory

The backend currently exposes 12 endpoints.

### Players

| Method | Path | Current behavior |
|---|---|---|
| `POST` | `/api/players` | Validates a non-empty username, creates a player, and returns `201`. |
| `GET` | `/api/players/:uuid` | Validates and canonicalizes the UUID, returns the player when present, and returns `404` when absent. |

### Monsters

| Method | Path | Current behavior |
|---|---|---|
| `GET` | `/api/monsters/encyclopedia` | Returns all species. |
| `POST` | `/api/monsters/encyclopedia` | Validates an array, inserts valid new species transactionally, skips existing names, returns `201` when rows are created, and returns `200` when all entries are skipped. |
| `GET` | `/api/monsters/recipes` | Returns all recipes. |
| `PUT` | `/api/monsters/recipes` | Validates the full recipe set for one result species and replaces that species' recipes transactionally. An empty array intentionally clears that result's recipes. |
| `POST` | `/api/monsters` | Validates species, nickname, and numeric player ID, verifies player/species references, creates an instance, and returns `201`. |
| `GET` | `/api/monsters/:uuid` | Validates and canonicalizes the UUID, returns `{monsters_found, monsters}` for an existing player, and returns `404` for a missing player. An existing empty collection returns `200` with an empty array. |
| `GET` | `/api/monsters/details/:id` | Validates a positive integer identifier, returns the joined monster detail and recipes, and returns JSON `404` when absent. |
| `POST` | `/api/monsters/fuse` | Validates positive parent IDs and UUID format, returns structured `400`/`404` outcomes for expected failures, and performs successful fusion transactionally. |

### Enemies

| Method | Path | Current behavior |
|---|---|---|
| `GET` | `/api/enemies` | Returns all enemy rows in an `{message, enemies}` envelope. |
| `POST` | `/api/enemies` | Validates name, display name, image path, difficulty, HP, and combat stats; maps duplicate names to `409`; returns `201` on success. |

### Cross-cutting response behavior

- Unknown `/api` paths return JSON `404` responses.
- Expected controller failures use JSON error bodies with a `message` string.
- Unexpected errors reach centralized middleware and return JSON `500` responses.
- JSON parse failures are handled centrally rather than returning an Express HTML
  page.
- Expected failures use one explicit `HttpError` type. Shared validators cover
  request records, strings, safe integer ranges, route integers, and UUIDs.
  Unknown errors remain generic `500` responses even if they carry an arbitrary
  `status` property.
- Response bodies do not use one common envelope. Changing that would be a broad
  client contract change and is not inherently necessary.
- Unsupported methods are normally handled as generic API `404` responses rather
  than explicit `405 Method Not Allowed` responses.
- Responses include standard Helmet headers and a server-generated
  `X-Request-ID`.

## 5. Frontend State and API Behavior

### Player identity

The player UUID is persisted in `localStorage`. On startup, the provider:

1. Reads the stored UUID.
2. Removes malformed UUIDs before issuing a request.
3. Canonicalizes valid UUIDs to lowercase.
4. Fetches the player when a valid UUID exists.
5. Clears identity after a player lookup `400` or `404`.
6. Preserves identity after network and `5xx` failures.
7. Fetches the collection for the resolved player.

Loading, initialization failure, retry, and explicit local-session reset states
are distinct. A transient backend failure does not create a replacement
identity. Request counters prevent superseded player and collection requests
from committing stale state.

Player creation state is provider-owned and uses `idle`, `pending`, `error`, and
`uncertain` states. One in-flight promise prevents duplicate creation requests
across page remounts or navigation. Confirmed backend rejection remains
retryable; timeout, network failure, and malformed successful responses are
presented as uncertain and block another request until the user explicitly
resets local session state. The former unused `refreshPlayer` operation has been
removed.

### Collection state

The provider keeps the collection in memory and exposes it to the home and fusion
pages. Collection state is replaced only by endpoint-validated payloads whose
`monsters_found` count matches the array length.

A collection `404` invalidates only the matching stored identity and clears its
player and collection state. Other collection failures preserve the identity and
remain recoverable.

Home renders explicit player loading, restoration error, creation error,
uncertain creation, collection loading, collection error, empty collection, and
populated collection states. The player form is a semantic form with an
associated label, required input, Enter submission, and blank/pending submission
protection.

### Fusion lifecycle

Fusion operation state is provider-owned and uses `idle`, `pending`,
`reconciling`, `success`, `confirmed-error`, and `uncertain` states. Parent IDs,
result, message, unresolved state, and notice visibility survive route remounts.
One provider-level in-flight promise prevents a second fusion POST while an
operation is pending or reconciling.

Outcome handling is explicit:

- Successful fusion removes both consumed instance IDs and adds the validated
  result in one state update.
- Known `400` rejection preserves the confirmed collection and backend message.
- Fusion `404`, network failure, timeout, `5xx`, and malformed success trigger a
  collection reconciliation request.
- If both parents remain after reconciliation, the fusion is reported as a
  confirmed failure.
- If either parent is absent, the UI reports that the collection changed without
  claiming a definite failed fusion.
- If reconciliation fails or is superseded, the last confirmed collection is
  preserved, the operation remains unresolved, another fusion is blocked, and a
  synchronization-only retry is available.
- A reconciliation `404` confirms the player no longer exists and clears local
  identity.

Fusion renders player loading/error/guest states, collection loading/error/empty
states, pending/reconciling announcements, and synchronized result states.
Monster selection uses native buttons with keyboard support and `aria-pressed`;
selected monsters can be deselected, and a third choice is disabled until one is
removed. The result window is a labelled modal dialog with initial focus, focus
containment, Escape dismissal, focus restoration, and narrow-screen sizing.

### Defensive response parsing

`frontend/src/services/api.js`:

- Reads response text before parsing JSON.
- Distinguishes malformed/empty success payloads from normal API results.
- Preserves HTTP status on generated errors so callers can distinguish `404`
  from transient failures.
- Preserves `X-Request-ID` on generated response errors.
- Enforces a ten-second timeout and distinguishes timeout from caller
  cancellation.
- Validates complete endpoint-specific player, collection monster, detail
  monster, nested recipe-parent, and fusion-result contracts.
- Requires positive safe IDs, valid UUIDs, required non-empty strings, integral
  statistics and resources, valid arrays, and matching collection counts.
- Requires restored player UUIDs to match the requested UUID after
  canonicalization.

The monster detail page uses an `AbortController` so superseded route requests do
not commit stale details, even if a mocked or non-conforming request ignores the
abort signal. It distinguishes invalid IDs, absent/consumed instances, malformed
successful responses, and retryable network/timeout/`5xx` failures. Error states
are in Spanish and include appropriate retry and Home recovery actions.

### Existing UI states

- Unknown client routes render a Spanish not-found state with a Home link.
- The navbar's player status is a keyboard-operable Home link and uses Spanish
  loading, unavailable, and guest text.
- Portal expedition cards remain intentionally non-interactive. They no longer
  use arrow/action or acquisition affordances and are labelled `Próximamente`.
- The document language is `es`, the browser title is `Monster-G`, and the stale
  missing-favicon reference has been removed.
- Informative monster portraits use display names. Decorative action, arrow,
  stat, placeholder, and type images use empty alt text.
- Icon-only type tags have an accessible name, and stat groups expose a concise
  label while hiding the decorative bar from assistive technology.
- Collection lists use monster instance IDs as stable keys.
- Persisted `monsters/pumpking.png` and `monsters/phoenyx.png` paths resolve
  through explicit frontend aliases to the existing pumpkin and phoenix assets.

### Remaining frontend limitations

- The Vite development proxy target is hardcoded rather than configured by
  environment.
- Player UUID is a bearer-style capability stored in browser local storage; it
  is not authentication.
- Most mutation/admin endpoints have no first-party UI consumer.
- Player creation has no server idempotency or recovery key. If creation commits
  but its response is lost, the frontend can prevent automatic duplication and
  report uncertainty but cannot recover the new UUID.
- Frontend tests use Vitest, jsdom, and React Testing Library; there is no
  browser-level end-to-end suite.

## 6. Completed Refinement Findings

The following findings addressed by stabilization, server refinement, and
frontend refinement are resolved and should not be treated as current defects:

- Database and seed paths no longer depend on the launch directory.
- Case-sensitive frontend imports match actual filenames.
- Unknown API routes and backend errors return JSON rather than framework HTML.
- Missing monster details no longer crash the detail page.
- Stale monster detail responses no longer overwrite newer route state.
- Frontend API consumers reject malformed success payloads.
- Player bootstrap separates stale identity from transient backend failure.
- Player, instance, enemy, recipe, and fusion writes validate at the HTTP
  boundary before persistence.
- Unordered duplicate recipes are rejected and prevented by a unique index.
- Recipe replacement cannot partially delete valid data after a later invalid
  row is encountered.
- Fusion validates ownership and recipe state and mutates the database in one
  transaction.
- Duplicate fusion submission is blocked while a request is pending.
- Successful fusion updates collection state atomically, while uncertain network
  outcomes trigger reconciliation.
- Persisted player identity is validated before restoration; malformed values
  and confirmed `400`/`404` outcomes no longer trap the UI in a retry loop.
- Player creation pending/error/uncertain state and duplicate protection survive
  route changes.
- Complete successful-response contracts are validated before data reaches
  context or rendering code.
- Every frontend request has bounded timeout and consistent cancellation
  behavior.
- Fusion state, duplicate protection, reconciliation, and unresolved-operation
  recovery are durable across routes.
- Home, Fusion, detail, and unknown routes render explicit loading, error, empty,
  and recovery states for existing behavior.
- Existing creation, navigation, fusion-selection, and dialog controls are
  keyboard operable and expose appropriate accessibility semantics.
- Portal no longer represents unimplemented expeditions as interactive or
  promises acquisition behavior.
- Known pumpkin and phoenix persisted asset paths resolve through frontend
  aliases.
- The frontend has a passing automated test suite and a zero-error lint run.

## 7. Current Findings

### High impact

#### No authentication or authorization boundary

The entire API is unauthenticated. Player lookup, collection access, and fusion
use a client-supplied UUID as authority; direct monster creation accepts an
internal numeric player ID; monster details use enumerable numeric instance IDs;
and catalog, recipe, and enemy writes require no player identity. The endpoint
that previously enumerated every player UUID has been removed, but possession of
a UUID is still not authentication.

This is acceptable only as an explicitly local prototype assumption. Proper
authentication would require a separate product and security design because it
would change client behavior and API contracts.

### Medium impact

#### Committed player creation cannot be recovered after a lost response

Player creation is non-idempotent and the UUID exists only in the successful
response. If the backend commits but the browser loses, times out, or rejects
that response before receiving a valid player payload, the frontend marks the
outcome uncertain and blocks automatic resubmission. It cannot determine or
recover the created UUID. A complete solution requires a separately designed
backend idempotency or recovery contract.

#### Server exposure depends on deployment assumptions

The backend listener does not specify a loopback host even though startup output
describes localhost. There is no CORS or trusted-proxy policy. The intended safe
deployment is therefore same-origin/local unless separate network requirements
are approved.

### Low impact

#### Unsupported methods use generic not-found responses

Unknown HTTP methods fall through to generic `404` handling rather than returning
`405` with an `Allow` header.

This is a protocol-quality issue rather than a current frontend defect.

#### Service contracts are informal

Services return several result shapes and use conventions such as `null`, raw
rows, inserted rows, or custom objects. Those conventions are readable at the
current repository size but are not declared or type-checked.

#### Frontend proxy configuration is hardcoded

The Vite proxy target is fixed to the localhost development backend. The backend
port and database path now support validated environment overrides while
retaining deterministic defaults.

#### Tooling remains incomplete

The frontend has a 114-test Vitest/jsdom/React Testing Library suite covering the
API adapter, player provider, Home, Fusion, details, routing, shared rendering,
and keyboard/accessibility behavior. ESLint completes with zero errors, and the
production Vite build passes. The backend has a passing 28-test `node:test`
suite. There is no formatter, continuous integration configuration, or
browser-level end-to-end suite.

Backend tests cover rejected-mutation invariants and major lifecycle behavior,
but do not inject failures after fusion insertion or recipe deletion. Configured
HTTP timeout values are asserted, while request/header/keep-alive expiration is
not behavior-tested.

#### Transitive dependency advisory

`npm audit --omit=dev` reports one vulnerable transitive `qs` package entry
covering two moderate advisories. The application currently enables JSON parsing
rather than URL-encoded body parsing, so the reported parsing paths may not be
exercised directly, but the production dependency tree remains flagged until a
separately verified dependency update is applied.

## 8. Feature Gaps

These are product capabilities, not stabilization regressions:

- The enemy system has API and persistence support but no gameplay/UI loop.
- Combat is not implemented.
- Player resources are stored but have no current API/UI mutation path or
  progression loop.
- Monster collection has no acquisition path other than API operations and
  fusion of existing instances.
- Recipe and species administration rely on direct API calls.
- There is no authentication, account recovery, or multi-device identity flow.

## 9. Constraints for Further Work

Further refinement should preserve the stabilized product behavior and observe
these boundaries:

- Do not add gameplay or product features as part of backend cleanup.
- Do not alter existing table definitions or add columns/tables without a
  separately approved migration strategy.
- Preserve established response shapes unless a contract is ambiguous,
  inconsistent, or unsafe.
- Trace frontend and other repository consumers before changing an endpoint.
- Prefer small route/controller/service changes over broad architectural
  rewrites.
- Preserve the frontend's existing visual identity and prefer behavioral state,
  safety, and accessibility corrections over visual changes.
- Do not add state-management or component abstractions without a concrete
  correctness or reuse need.
- Treat authentication, proxy policy, CORS origin policy, and rate limiting as
  deployment or product decisions that require explicit requirements.

## 10. Current Assessment

The repository is a coherent local prototype with a working client/server/data
flow. Completed stabilization and refinement addressed the previously identified
crash paths, malformed-response handling, identity recovery, mutation validation,
recipe ambiguity, fusion atomicity, frontend request durability, missing UI
states, and accessibility gaps.

The backend now has a testable application boundary, validated runtime
configuration, baseline regression coverage, shared request validation, trusted
error classification, explicit missing-player collection behavior, basic HTTP
hardening, reduced UUID exposure, and correlated privacy-conscious request logs.
HTTP timeouts, graceful shutdown, SQLite lock behavior, connection closure, and
atomic startup initialization are explicit. Shutdown, lock behavior, executable
startup, and initialization rollback have process-level coverage; timeout values
are configured and asserted but their network expiration behavior is not tested.

The frontend now enforces complete endpoint-specific response contracts, applies
bounded request timeouts, protects non-idempotent creation and fusion operations
across navigation, reconciles uncertain fusion outcomes, and represents existing
loading/error/empty/not-found states. Its semantic form, navigation, selection,
dialog, image, type, and stat behavior have focused accessibility coverage. The
frontend suite contains 114 passing tests, lint has zero errors, and the
production build passes.

Remaining work is no longer a single bounded frontend-correctness batch. Product
gaps, player-creation idempotency/recovery, dependency maintenance,
authorization, deployment policy, unsupported-method semantics, browser-level
end-to-end coverage, and schema-level hardening remain separate concerns.
