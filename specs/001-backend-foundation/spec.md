# Backend Foundation

Status: Approved and implemented — locally verified; Linux ARM64 execution and actual POSIX signal delivery remain unverified.

## Goal

Establish a small, independently runnable backend that future authentication and game features can build on. Developers must be able to start it locally, verify that it is responding, and produce a runnable production build without a frontend or database.

This feature establishes the `backend/` project boundary. A future `frontend/` application will be its sibling; creating or configuring the frontend is not part of this feature.

## User-facing behavior

There is no player-facing interface in this feature. Developers and operational checks can verify service availability through a public health endpoint. API consumers receive predictable JSON responses for errors rather than HTML or internal diagnostic details.

## Scope

- An Express service written in TypeScript under `backend/`.
- Local development, production compilation, and production startup workflows.
- Environment-based runtime configuration with validation.
- A lightweight health endpoint under `/api`.
- Consistent API error responses and handling for unknown API routes.
- Graceful shutdown and minimal operational diagnostics.
- Automated verification and concise setup documentation.

## Non-goals

- Frontend scaffolding or player-facing screens.
- Authentication, sessions, authorization, or player onboarding.
- SQLite integration, database schemas, migrations, or seed data.
- Combat, inventory, fusion, eggs, resources, or other game rules.
- General-purpose architecture for future features, such as speculative service or repository layers.
- Docker, Caddy, Oracle Cloud configuration, CI/CD, or other production infrastructure.
- Public cross-origin API access or a CORS policy for future frontend integration.

## Requirements

### 1. Independent backend project

- Backend source, configuration, scripts, and tests live under `backend/`.
- The backend runs without a frontend, Vite, external service, database, or credentials.
- Developers have documented commands to install dependencies, run in development, check types, run tests, build, and start the production build.
- The production build runs independently of development-only execution tools.
- Only dependencies needed for this foundation are introduced. Tooling choices belong in the implementation plan.

### 2. Runtime configuration

- The listening port and runtime environment are configurable through environment variables.
- Local development has documented defaults and requires no secrets.
- Invalid supported configuration causes startup to fail with an actionable diagnostic and a nonzero exit status, rather than silently using an unintended value.
- Example configuration contains no secrets or machine-specific paths. Local environment files and generated artifacts are excluded from version control.
- No database or session storage paths are introduced before persistence is implemented.

### 3. Health endpoint

- `GET /api/health` is public and returns HTTP `200` with JSON `{ "status": "ok" }` while the service is accepting requests.
- The endpoint is lightweight and performs no writes or external requests.
- It represents service availability only; it does not claim database or dependency readiness.
- The response exposes no secrets, environment configuration, or internal diagnostics.

### 4. API errors

- Unknown routes under `/api` return HTTP `404` in a consistent JSON error format.
- Unexpected request-handling failures return HTTP `500` using the same error format, without terminating the service.
- Error responses include a stable machine-readable code and an English technical message. Future player-facing clients will localize messages using codes rather than relying on backend text.
- Responses never expose stack traces, filesystem paths, or other sensitive internals.
- The exact shared error envelope is defined in the implementation plan before code is written.

### 5. Lifecycle and diagnostics

- Successful startup reports that the service is listening and identifies the configured port.
- Startup failures, unexpected server errors, and shutdown are diagnosable without logging secrets or complete request bodies.
- On supported termination signals, the service stops accepting new connections and allows active requests a bounded time to finish before exiting.
- Shutdown has a finite deadline so a stalled connection cannot leave the process running indefinitely.
- Startup and unrecoverable server failures result in a nonzero exit status.

### 6. Verification and documentation

- Automated tests cover the health response, unknown API routes, and safe unexpected-error responses.
- Configuration checks cover default, valid custom, and invalid values.
- Verification covers production compilation and startup, plus graceful shutdown where supported by the test environment.
- Setup documentation explains commands, supported environment variables, health semantics, and how to stop the service.
- Any platform-specific shutdown verification limitations are reported explicitly.

## Acceptance criteria

- [x] A clean checkout can install backend dependencies and start the service using documented commands.
- [x] The backend starts without a frontend, database, or credentials.
- [x] `GET /api/health` returns the specified status code and JSON body.
- [x] An unknown `/api` route returns a JSON `404` in the documented shared error format.
- [x] An unexpected request-handling error produces a safe JSON `500`, and subsequent health requests still succeed.
- [x] Valid custom configuration is respected; invalid configuration fails startup clearly with a nonzero exit status.
- [x] Type checks, automated tests, and the production build pass.
- [x] The production build starts without development-only execution tools.
- [x] Graceful shutdown is bounded and verified, with any platform limitations documented.
- [x] No application database, authentication, frontend, or production infrastructure is introduced.

## Decisions and approval

Recommended scope: establish the service foundation before adding persistence or authentication. This keeps the initial feature independently testable and avoids premature schema or game-logic decisions.

No database changes, credentials, persistent runtime files, or infrastructure services are required. The service needs one configurable HTTP listening port and must remain suitable for a future Linux container deployment.

The user approved this specification and its implementation plan before implementation. See `plan.md` and `backend/README.md` for verification results and remaining platform limitations.
