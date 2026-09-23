# Project Technical Orientation

## 1. Project overview

Monster Girl Fusion is a web-game prototype centered on collecting Monster Girls,
viewing their details, and discovering new species by fusing owned monster
instances. The repository also contains enemy and player-resource data structures
for the broader battle-game concept.

The current SPA provides:

- Player creation and automatic restoration from a browser-stored UUID.
- A player monster collection with loading, error, and empty states.
- Monster-instance details and known fusion recipes.
- Selection and fusion of two owned monster instances.
- A non-interactive Portal/expedition screen marked `Próximamente`.
- Shared navigation and a client-side not-found page.

The frontend is a React/Vite single-page application. It calls a separate
Express API through relative `/api` URLs. The backend uses `better-sqlite3` and a
tracked SQLite database at `backend/game.db`. In development, Vite proxies `/api`
to the backend's default `http://localhost:3001` listener.

## 2. Repository structure

| Path | Purpose |
|---|---|
| `frontend/` | React SPA, Vite and ESLint configuration, static artwork, and frontend tests. It has its own `package.json`. |
| `frontend/src/App.jsx` | Browser router, provider boundary, navbar, product routes, and wildcard route. |
| `frontend/src/context/` | Shared player identity, collection, creation, and fusion state. |
| `frontend/src/services/api.js` | The frontend's centralized backend API adapter. |
| `frontend/src/pages/` | Home, Fusion, monster detail, and Portal screens. |
| `frontend/src/components/` | Reusable player and monster presentation components. |
| `backend/` | CommonJS Express API, SQLite access, seed data/script, and backend tests. It has its own `package.json`. |
| `backend/src/app.js` | Express application and middleware composition without opening a listener. |
| `backend/src/server.js` | HTTP listener, timeout policy, signal handling, and graceful shutdown. |
| `backend/src/routes/` | Player, monster, and enemy endpoint declarations. |
| `backend/src/controllers/` | HTTP validation and response mapping. |
| `backend/src/services/` | Domain operations, SQL, and transactions. |
| `backend/src/db/database.js` | Singleton SQLite connection and transactional schema initialization. |
| `backend/src/http/` | Shared validation, trusted HTTP errors, and request logging. |
| `backend/src/data/monsters.json` | Encyclopedia species and recipe seed input. |
| `backend/src/scripts/seed.js` | Explicit seed command entry point. |
| `backend/game.db` | Tracked mutable SQLite application/demo database. |
| `doc/` | System audit and completed stabilization, server-refinement, and frontend-refinement plans. |
| `doc/features/` | Reserved by repository convention for substantial feature specifications; the directory does not currently exist. |
| `doc/AGENT.md` | Agent behavior and contribution rules. This document describes the project instead of duplicating those rules. |

There is no root `package.json`; install and run frontend and backend commands in
their respective directories.

## 3. Runtime architecture and data flow

### Request path

The main runtime path is:

```text
React page/component
  -> frontend/src/services/api.js
  -> relative /api request
  -> Express route
  -> controller validation
  -> service/domain logic
  -> better-sqlite3 singleton
  -> backend/game.db
```

In development, `frontend/vite.config.js` proxies `/api` to port `3001`. The
backend does not serve the production frontend bundle.

### Player identity

1. `PlayerProvider` reads `localStorage.playerUuid`.
2. Malformed UUIDs are removed; valid UUIDs are canonicalized to lowercase.
3. `GET /api/players/:uuid` restores the player.
4. A player lookup `400` or `404` clears local identity. Transient failures retain
   it and expose retry/reset state.
5. `POST /api/players` creates a player, after which the returned UUID is stored
   and the collection is loaded.

Creation is non-idempotent. The provider deduplicates an in-flight request and
represents lost, timed-out, or malformed successful responses as uncertain, but
the backend has no key that can recover a committed creation whose UUID response
was lost.

### Monster collection and details

- `GET /api/monsters/:uuid` loads the current player's instances into
  `PlayerProvider`.
- A collection `404` clears the matching local player identity; other failures
  preserve recoverable state.
- `GET /api/monsters/details/:id` loads one globally addressed monster instance
  and its recipes. `MonsterDetailPage` aborts stale route requests and renders
  status-specific recovery states.

### Fusion

1. `FusionPage` selects two distinct instance IDs from the provider collection.
2. `PlayerProvider` guards one active operation and calls
   `POST /api/monsters/fuse` with both IDs and the player UUID.
3. The service validates ownership and recipe state, then deletes both parents
   and inserts the result in one SQLite transaction.
4. On success, the provider removes both parents and appends the result locally.
5. A known `400` preserves the collection. A `404`, network error, timeout,
   `5xx`, or malformed success triggers collection reconciliation.
6. Failed reconciliation preserves the last confirmed collection and blocks
   another fusion until synchronization succeeds.

### Database startup and seeding

Importing `backend/src/db/database.js` opens the configured database, enables
foreign keys, and transactionally initializes missing schema/indexes. Server
startup does not seed data. `npm run seed` in `backend/` explicitly runs
`backend/src/scripts/seed.js`, which reads `backend/src/data/monsters.json` and
adds species and recipes that are not already represented by species name.

## 4. Main technologies

| Technology | Area | Role |
|---|---|---|
| React 19 | Frontend runtime | Component rendering, state, effects, and context. |
| React DOM | Frontend runtime | Mounts the SPA from `frontend/src/main.jsx`. |
| React Router | Frontend runtime | Browser routing, route parameters, links, and not-found handling. |
| Vite | Frontend build/dev | Development server, API proxy, module transforms, production build, and Vitest configuration. |
| Tailwind CSS 4 | Frontend styling/build | Utility classes processed through the Tailwind Vite plugin. |
| Node.js | Backend runtime/tooling | Runs the Express server, scripts, and built-in test runner. |
| Express 5 | Backend runtime | HTTP routing, middleware, JSON parsing, and response handling. |
| SQLite | Persistence | Stores players, species, recipes, owned monster instances, and enemies. |
| `better-sqlite3` | Backend runtime | Synchronous SQLite binding, prepared statements, and transactions. |
| Vitest | Frontend test tooling | Runs API, context, page, route, and component tests. |
| Node test runner | Backend test tooling | Runs integration and lifecycle tests with `node --test`. |
| ESLint | Frontend development tooling | JavaScript, React Hooks, and Fast Refresh static checks. |

## 5. Secondary libraries and important imports

| Dependency/API | Classification | Use |
|---|---|---|
| `helmet` | Backend runtime dependency | Adds baseline HTTP security headers in `backend/src/app.js`. |
| `@tailwindcss/vite` | Frontend build dependency | Integrates Tailwind processing with Vite. |
| `@vitejs/plugin-react` | Frontend build dependency | React JSX and Fast Refresh support. |
| React Testing Library | Frontend test dependency | Component rendering and user-visible queries. |
| `@testing-library/user-event` | Frontend test dependency | Keyboard and pointer interaction simulation. |
| `@testing-library/jest-dom` | Frontend test dependency | DOM-specific Vitest assertions. |
| `jsdom` | Frontend test dependency | Browser-like test environment. |
| `nodemon` | Backend development dependency | Restarts `backend/src/server.js` during `npm run dev`. |
| Browser `fetch` | Frontend runtime API | Performs all production API requests through `frontend/src/services/api.js`. |
| `AbortController` | Browser runtime API | Implements request timeouts and detail-request cancellation. |
| `localStorage` | Browser runtime API | Persists the current player UUID. |
| Node `http` | Backend runtime API | Creates the server and applies timeout/shutdown policy. |
| Node `crypto.randomUUID` | Backend runtime API | Generates player UUIDs and server-owned request IDs. |
| Node `path` and filesystem APIs | Backend runtime/test APIs | Resolve database/seed paths and manage disposable test databases. |

There is no third-party state manager, ORM, migration framework, authentication
library, CORS middleware, or logging package.

## 6. Frontend architecture

### Entry and routing

- `frontend/index.html` defines the Spanish document shell and `#root`.
- `frontend/src/main.jsx` mounts `App` under React `StrictMode`.
- `frontend/src/App.jsx` owns `BrowserRouter`, `PlayerProvider`, the navbar, and
  routes for `/`, `/portal`, `/fusion`, `/monster/:id`, and `*`.

### Shared state

- `frontend/src/context/PlayerContext.js` exports the context and `usePlayer`.
- `frontend/src/context/PlayerContext.jsx` implements `PlayerProvider`.
- The provider owns identity restoration, player creation, monster collection,
  stale-request counters, request deduplication, and the fusion state machine.

Fusion states are `idle`, `pending`, `reconciling`, `success`,
`confirmed-error`, and `uncertain`. Player creation uses `idle`, `pending`,
`error`, and `uncertain`.

### API service

`frontend/src/services/api.js` is the only production module that calls `fetch`.
It exposes five operations:

| Function | Endpoint |
|---|---|
| `createPlayer` | `POST /api/players` |
| `getPlayerByUuid` | `GET /api/players/:uuid` |
| `getPlayerMonsters` | `GET /api/monsters/:uuid` |
| `getMonsterInfoById` | `GET /api/monsters/details/:id` |
| `fuseMonsters` | `POST /api/monsters/fuse` |

The adapter has a ten-second timeout, composes caller cancellation, preserves
HTTP status and `X-Request-ID` on generated errors, and validates complete
endpoint-specific response shapes before returning data.

### Pages and components

| File/area | Responsibility |
|---|---|
| `frontend/src/pages/HomePage.jsx` | Player creation/recovery and collection states. |
| `frontend/src/pages/FusionPage.jsx` | Parent selection, fusion submission, reconciliation messages, and accessible result dialog. |
| `frontend/src/pages/MonsterDetailPage.jsx` | Detail/recipe loading, cancellation, status-specific errors, and retry. |
| `frontend/src/pages/PortalPage.jsx` | Non-interactive expedition preview cards. |
| `frontend/src/components/Player/` | Semantic creation form and player-status/Home navbar. |
| `frontend/src/components/MonsterItem/` | Collection cards/lists, type tags, and stat display. |
| `frontend/src/imageHandler.js` | Eager asset lookup plus compatibility aliases for persisted image-path misspellings. |

Pages render explicit loading, error, empty, and recovery states. Loading text
uses status semantics; errors use alerts; Fusion selections are native pressed
buttons; and the fusion result uses a focus-managed modal dialog.

### Testing and configuration

- `frontend/vite.config.js` configures React, Tailwind, the dev proxy, and Vitest.
- `frontend/src/test/setup.js` installs jest-dom assertions and test cleanup.
- Tests are colocated as `frontend/src/**/*.test.js` and
  `frontend/src/**/*.test.jsx`.
- `frontend/eslint.config.js` enables recommended JavaScript, React Hooks, and
  Fast Refresh rules.

Frontend commands are `npm run dev`, `npm run build`, `npm run lint`, `npm test`,
and `npm run preview` from `frontend/`.

## 7. Backend architecture

### Process and middleware

- `backend/src/app.js` builds and exports Express without listening.
- `backend/src/server.js` creates the Node HTTP server and owns startup/shutdown.
- `backend/src/config.js` validates runtime port and database-path configuration.

The middleware order is request ID/logging, Helmet, JSON parsing with a `100kb`
limit, route mounting, `/api` JSON 404 handling, and centralized error handling.
`X-Powered-By` is disabled.

### Routes, controllers, and services

The backend uses a route -> controller -> service -> database split:

- `backend/src/routes/players_routes.js`, `monsters_routes.js`, and
  `enemies_routes.js` declare paths and methods.
- `backend/src/controllers/` validates HTTP inputs and maps expected outcomes to
  status codes and JSON.
- `backend/src/services/` owns SQL, domain checks, and transactions.
- Services import the singleton connection from `backend/src/db/database.js`.

The API exposes 12 endpoints across players, encyclopedia species, recipes,
monster instances/fusion, and enemies. The SPA consumes only player creation and
lookup, player collection, monster details, and fusion.

### Validation and errors

- `backend/src/http/validation.js` validates request objects, non-empty strings,
  integer ranges, route integers, and UUIDs.
- `backend/src/http/errors.js` defines trusted `HttpError` values and helpers for
  `400`, `404`, and `409` outcomes.
- Domain-specific species/recipe normalization remains in
  `backend/src/controllers/monsters_controller.js`.
- Expected errors retain their status/message. Unknown errors return a generic
  JSON `500`.

### Logging, timeouts, and shutdown

`backend/src/http/request_logging.js` generates a server-owned UUID for each
request, returns it as `X-Request-ID`, and writes structured completion, abort,
and correlated unexpected-error events. Logs use route templates and omit request
bodies and arbitrary exception messages.

`backend/src/server.js` configures a 15-second request timeout, 10-second header
timeout, 5-second keep-alive timeout, and 10-second shutdown grace period. Signal
handling stops new connections, lets active requests drain within the grace
period, destroys remaining sockets, and closes SQLite. Concurrent shutdown calls
share one shutdown operation.

### Backend tests

`backend/test/api.test.js` uses Node's built-in test runner and native `fetch`.
It points `DATABASE_PATH` at a disposable database copy and covers application,
API, persistence, initialization, logging, timeout configuration, executable
startup, and shutdown behavior.

Backend commands are `npm run dev`, `npm start`, `npm run seed`, and `npm test`
from `backend/`.

## 8. Database and persistence

The backend uses SQLite through a singleton `better-sqlite3` connection.
`backend/src/config.js` resolves the default path to `backend/game.db` relative
to the backend module location. A nonblank `DATABASE_PATH` override is resolved
with `path.resolve`, so database location does not depend on the launch directory.

`backend/src/db/database.js`:

- Opens the connection with a five-second busy timeout.
- Enables foreign keys.
- Creates missing tables with idempotent statements.
- Rejects existing unordered duplicate recipe pairs.
- Creates the unordered-parent unique recipe index.
- Runs schema/index initialization in one transaction.
- Closes the connection if initialization fails and during graceful shutdown.

| Table | Purpose |
|---|---|
| `players` | Username, public UUID, slot count, and resource values. |
| `monster_encyclopedia` | Species definitions, display metadata, stats, tier, type, and image path. |
| `monsters` | Owned monster instances linked to a player and species. |
| `monster_recipes` | Two parent species and one result species. |
| `enemies` | Enemy definitions, difficulty, stats, and image path. |

Important integrity behavior includes foreign-key enforcement, unique player
UUIDs, unique enemy names, an expression index that treats recipe parent order as
equivalent, full recipe-set validation before replacement, and transactional
fusion. Fusion requires distinct owned instances and exactly one matching recipe.
Several numeric/domain constraints remain application-level rather than SQL
`CHECK` constraints; foreign keys do not declare cascades.

Seed data lives in `backend/src/data/monsters.json`. Running `npm run seed` calls
`backend/src/scripts/seed.js`, which adds missing species and recipes. It skips
existing species and does not create players, owned monster instances, or
enemies. Server startup initializes schema but does not run this seed command or
a versioned migration system.

## 9. Important project conventions

- Read `doc/AGENT.md` for agent behavior, workflow, verification, and contribution
  rules. This file intentionally does not repeat them.
- Architecture audits and completed implementation plans live under `doc/`.
- `doc/features/` is the documented location for substantial feature
  specifications when used; it is not currently present.
- Frontend backend access is centralized in `frontend/src/services/api.js`.
- Player identity is the UUID stored under `localStorage.playerUuid`; it is a
  local bearer-style capability, not authentication.
- Frontend generated API errors carry fields such as `status`, optional
  `requestId`, and `uncertain` where applicable.
- Backend expected HTTP errors use `HttpError`; unknown exceptions are hidden
  behind generic `500` responses.
- Frontend tests are colocated with source modules. Backend integration and
  lifecycle tests are concentrated in `backend/test/api.test.js`.
- Frontend responsibilities follow pages/components/context/services. Backend
  responsibilities follow routes/controllers/services/http/db.
- The backend is CommonJS; the frontend is an ES module package.
- API response envelopes vary by endpoint. Consumers rely on the current
  endpoint-specific shapes rather than one universal envelope.
