# Server Refinement Plan

This plan refines the stabilized backend without adding product features,
changing the existing database schema, or broadly rewriting the application.
Work is ordered so regression coverage precedes cross-cutting contract,
security, and lifecycle changes.

## Batch 1: Testable Runtime Foundation - Completed

### 1. Separate application construction from process startup

**Finding:** `backend/src/server.js` creates the Express app, initializes the
singleton database, registers middleware, and starts listening during import.
The port and database path cannot be overridden.

**Rationale:** This prevents isolated HTTP tests and complicates controlled
startup and shutdown.

**Affected files:** `backend/src/server.js`, `backend/src/db/database.js`, new
`backend/src/app.js`.

**Concrete change:** Move Express construction and route registration into
`app.js`. Keep listener ownership in `server.js`. Support validated `PORT` and
`DATABASE_PATH` environment overrides while preserving defaults of `3001` and
`backend/game.db`.

**Dependencies:** None.

**Verification:** Start from the repository root and `backend/`; verify both
still use `backend/game.db` and port `3001`. Start against an absolute temporary
database path. Verify invalid port configuration fails clearly.

**Behavior risk:** Low to medium. The normal defaults remain unchanged, but
startup structure changes.

**Contract impact:** None.

### 2. Add a backend regression harness

**Finding:** Validation, transactions, and API contracts currently have no
automated regression coverage.

**Rationale:** Later refinements affect cross-cutting middleware and error
classification. Tests should capture existing behavior before those changes.

**Affected files:** `backend/package.json`, new files under `backend/test/`.

**Concrete change:** Use Node's built-in `node:test` runner and `fetch`; do not
add a test framework. Copy `backend/game.db` into a temporary directory for each
test run, configure the application to use that copy, and listen on an ephemeral
port.

**Dependencies:** Item 1.

**Verification:** Add coverage for JSON 404s, malformed JSON, player
restoration, valid and absent monster details, collection loading, write
validation, recipe rollback, fusion success, and fusion rollback. Ensure
temporary files and database handles are cleaned up.

**Behavior risk:** Low. Test-only runtime behavior.

**Contract impact:** None.

## Batch 2: Validation and Contract Consistency - Completed

### 3. Centralize expected HTTP errors and reusable validation

**Finding:** Controllers use early responses, local validation helpers, ad hoc
`error.status`, service sentinel values, and direct SQLite error inspection.

**Rationale:** Equivalent failures can be classified differently, and the
central middleware currently trusts arbitrary 4xx status properties.

**Affected files:** All backend controllers,
`backend/src/services/monsters_service.js`, `backend/src/server.js` or
`backend/src/app.js`, and new small modules under `backend/src/http/`.

**Concrete change:** Introduce one explicit application HTTP error type and
small reusable validators for body objects, non-empty strings, safe integers,
and UUIDs. Keep domain-specific catalog and recipe normalization in the monster
controller. Central middleware will expose messages only for recognized
application and body-parser errors, preserve the existing `{message}` response
shape, and return a generic message for unknown failures.

**Dependencies:** Items 1 and 2.

**Verification:** Exercise malformed bodies and invalid fields for every
mutation endpoint. Verify expected 400/404/409 responses and generic 500
responses without SQLite details or stack traces.

**Behavior risk:** Medium because all controllers use the shared error path.

**Contract impact:** Response envelopes remain unchanged. Some inconsistent
error messages may become standardized.

### 4. Validate UUID read paths and clarify collection absence

**Finding:** `GET /api/players/:uuid` and `GET /api/monsters/:uuid` accept
arbitrary strings. The collection endpoint returns an empty collection when the
player does not exist.

**Rationale:** Invalid input, stale identity, and a legitimate empty collection
should not be indistinguishable.

**Affected files:** `backend/src/controllers/players_controller.js`,
`backend/src/controllers/monsters_controller.js`,
`backend/src/services/monsters_service.js`,
`frontend/src/context/PlayerContext.jsx`.

**Concrete change:** Validate UUID format on player lookup, collection lookup,
and fusion. Return `400` for malformed UUIDs. Verify player existence before
collection lookup and return `404` for an absent player. In `PlayerContext`,
treat a collection `404` as stale identity: invalidate the matching stored UUID
and clear player and collection state without treating transient failures as
stale identity.

**Dependencies:** Item 3.

**Verification:** Cover malformed UUID, absent well-formed UUID, existing player
with an empty collection, populated collection, deletion between player lookup
and collection lookup, and transient collection failure.

**Behavior risk:** Medium because stale collection behavior changes.

**Contract impact:** `GET /api/monsters/:uuid` changes from `200` with an empty
array to `404` for a missing player. Malformed UUIDs change from ordinary misses
to `400`. This is the only planned frontend contract adjustment.

### 5. Correct encyclopedia creation status

**Finding:** `POST /api/monsters/encyclopedia` returns `201` when every submitted
species already exists and nothing is created.

**Rationale:** A creation status should indicate that at least one resource was
created.

**Affected file:** `backend/src/controllers/monsters_controller.js`.

**Concrete change:** Preserve the current response body. Return `201` when
`added` is non-empty and `200` when all entries were skipped.

**Dependencies:** Items 2 and 3.

**Verification:** Test all-new, mixed new/existing, and all-existing submissions.
Confirm invalid batches still roll back.

**Behavior risk:** Low.

**Contract impact:** Status-only change for all-skipped submissions. There is no
first-party consumer.

## Batch 3: Security and Observability - Completed

### 6. Remove unauthenticated player enumeration

**Finding:** `GET /api/players` exposes every UUID, internal ID, resource count,
and slot count. No repository consumer uses it.

**Rationale:** UUIDs currently act as bearer-style capabilities for player
reads, collection access, and fusion. Enumerating them defeats their only
practical secrecy property.

**Affected files:** `backend/src/routes/players_routes.js`,
`backend/src/controllers/players_controller.js`,
`backend/src/services/players_service.js`.

**Concrete change:** Remove the listing route and its now-dead
controller/service methods. Do not add an alternative administrative endpoint
without an authentication design.

**Dependencies:** Item 2 establishes tests proving there are no first-party
consumers.

**Verification:** Confirm `GET /api/players` returns the normal JSON API `404`.
Confirm create and UUID lookup continue working.

**Behavior risk:** Medium for undocumented external scripts.

**Contract impact:** Intentional removal of one unsafe, unused endpoint. The
backend surface becomes 12 endpoints.

### 7. Add basic HTTP hardening, request IDs, and safe request logs

**Finding:** Express exposes `X-Powered-By`; no security headers, request
identifier, or consistent request log exists. Controller logs are noisy and
sometimes include player UUIDs.

**Rationale:** Basic hardening and correlatable logs improve operational safety
without changing product behavior.

**Affected files:** `backend/package.json`, lockfile, `backend/src/app.js`,
backend controllers.

**Concrete change:** Add `helmet` for maintained security-header defaults,
disable `X-Powered-By`, and make the JSON body limit explicit. Generate a
server-owned request ID, return it in `X-Request-ID`, and log request ID, method,
route template, status, and duration. Do not log bodies, raw UUID paths, or other
player capability values. Include request IDs in internal error logs. Remove
superseded controller `console.log` statements.

**Dependencies:** Items 1 and 3.

**Verification:** Inspect success, validation failure, unknown route, malformed
JSON, oversized body, and unexpected-error responses. Verify headers, one
completion log per request, correlation IDs, and absence of UUID/body data in
logs.

**Behavior risk:** Low. Security headers can affect clients that make unusual
assumptions, though this server exposes only JSON APIs.

**Contract impact:** Adds response headers. Existing JSON bodies remain
unchanged.

## Batch 4: Lifecycle and Persistence Discipline - Completed

### 8. Define HTTP server and SQLite lifecycle policy

**Finding:** The HTTP server has no explicit timeout or graceful shutdown
policy. SQLite startup is composed of independent DDL calls, connection timeout
behavior is implicit, and the connection is not closed explicitly.

**Rationale:** Controlled termination and deterministic lock behavior prevent
dropped work, hanging shutdowns, and partially initialized new databases.

**Affected files:** `backend/src/server.js`, `backend/src/db/database.js`.

**Concrete change:** Configure explicit request, header, keep-alive, and
graceful-shutdown deadlines appropriate for the synchronous local API. On
`SIGINT` or `SIGTERM`, stop accepting requests, allow active requests a bounded
completion period, close SQLite, and exit. Open SQLite with an explicit busy
timeout. Wrap existing idempotent schema/index initialization and recipe-conflict
preflight in one startup transaction without changing table or index
definitions.

**Dependencies:** Item 1. Implement after request logging so shutdown events can
be correlated.

**Verification:** Send a normal request during shutdown and confirm bounded
completion. Confirm a second process encounters the documented busy timeout.
Initialize a new temporary database successfully. Force startup initialization
failure and verify no partial schema is committed. Run `PRAGMA integrity_check`
and `PRAGMA foreign_key_check`.

**Behavior risk:** Medium around process termination and lock contention.

**Contract impact:** None. Environment overrides and process behavior become
explicit.

## Final Verification

1. Run the complete backend test suite against disposable databases.
2. Run the frontend production build.
3. Exercise all 12 resulting endpoints after removal of the player listing.
4. Confirm every rejected mutation leaves database row counts unchanged.
5. Confirm fusion and recipe replacement rollback under forced failures.
6. Confirm malformed, absent, and valid UUID behavior.
7. Confirm no request or error log exposes player UUIDs or request bodies.
8. Confirm database integrity and foreign-key checks pass.
9. Start and stop the server from both supported working directories.
10. Review the final API inventory against frontend consumers.

## Explicit Exclusions

- Authentication or authorization implementation.
- CORS, trusted-proxy, or rate-limit policy without deployment requirements.
- New tables, columns, constraints, or indexes.
- ORM adoption or conversion to an asynchronous database library.
- Global response-envelope redesign.
- API versioning or broad route renaming.
- Comprehensive `405 Method Not Allowed` routing.
- Gameplay, combat, resources, slots, acquisition, or administrative UI work.
- Unrelated frontend cleanup.
- Broad formatting, linting, or architectural rewrites.
