# Backend Foundation — Implementation Plan

Status: Approved and implemented — all three batches completed with platform verification limits recorded below.

## Approach

Create a standalone npm project in `backend/`, with no root workspace or frontend scaffolding. Keep Express application composition separate from configuration and the listening server so HTTP behavior can be tested without process-level side effects.

The user approved the specification and this plan before implementation. The decisions below describe the implemented foundation.

## Technical decisions

### Runtime and tooling

- Target Node.js 24 LTS, matching the locally available major version. Declare Node `>=24 <25` in package metadata and document the supported baseline.
- Use npm with a committed `backend/package-lock.json`; use `npm ci` for reproducible installs after the initial lockfile is generated.
- Use Express 5 as the only direct runtime dependency.
- Development dependencies: TypeScript, `tsx`, `@types/node` aligned to Node 24, and `@types/express` aligned to Express 5. Resolve compatible stable versions during implementation and record them in the lockfile.
- Before adopting those versions, check Node 24 and Linux ARM64 support for runtime and development/build dependencies, including platform-specific transitive binaries used by `tsx`. Record evidence and any native build requirements; a Windows install alone does not verify ARM64 compatibility. Do not copy Windows `node_modules` into a future Linux deployment.
- Use native ESM (`type: module`), strict TypeScript, NodeNext module resolution, and `.js` relative import specifiers that work in compiled output.
- Compile application source to `backend/dist/`; exclude tests from production output. A separate build configuration can extend the main configuration, which type-checks both source and tests.
- Use Node's built-in test runner and assertions, with `tsx` to execute TypeScript tests. Use built-in HTTP clients or `fetch` against ephemeral local ports instead of adding Supertest or another test framework.
- No linter, formatter, bundler, validation library, logging library, or environment-loading dependency in this batch. These can be considered later when there is a demonstrated need.

Trade-off: `tsx` adds one development dependency, but provides straightforward TypeScript development and test execution without depending on the narrower syntax support of Node's native type stripping. Production runs compiled JavaScript with plain Node.

### Commands

All commands run from `backend/`:

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the committed dependency set. |
| `npm run dev` | Run source with watch mode and optional local `.env` loading. |
| `npm run typecheck` | Check source and tests without emitting files. |
| `npm test` | Run automated configuration, HTTP, and lifecycle tests. |
| `npm run build` | Compile source to `dist/`. |
| `npm start` | Run `dist/server.js` with optional local `.env` loading and no development loader. |

Use Node's `--env-file-if-exists=.env` flag for development and startup; process environment variables take precedence. Scripts must work on Windows and Linux without shell-specific variable assignments. Tests use explicitly controlled configuration rather than loading a developer's `.env`.

### Configuration

Implement a small pure configuration parser accepting an environment object. Only the server entry point reads `process.env`.

| Setting | Default | Validation |
| --- | --- | --- |
| `PORT` | `3000` | Decimal integer from 1 through 65535. Reject empty strings, whitespace, fractions, signs, nonnumeric values, and out-of-range values. |
| `NODE_ENV` | `development` | Exactly `development`, `test`, or `production`. Reject empty or unsupported values. |

Defaults apply only when a variable is absent. Tests may bind directly to port `0` to request an ephemeral port; this is not a supported runtime `PORT` value.

Listen on `0.0.0.0` to remain reachable in a future container. Document that this also exposes the local service to reachable network interfaces; no public deployment is configured by this feature.

Include `backend/.env.example` with the non-secret defaults. Add narrowly scoped ignore rules for dependencies, build output, local environment files, and TypeScript build artifacts, retaining example configuration. No persistent runtime files are introduced.

### HTTP contract and errors

- `GET /api/health`: HTTP `200`, JSON `{ "status": "ok" }`.
- Unknown routes: HTTP `404`, JSON `{ "error": { "code": "NOT_FOUND", "message": "Route not found." } }`. Apply the same fallback outside `/api` so this API-only service never serves Express's default HTML 404 page.
- Unexpected request-handling errors before response headers are sent: HTTP `500`, JSON `{ "error": { "code": "INTERNAL_ERROR", "message": "An unexpected error occurred." } }`.
- Install the four-argument Express error middleware last. If headers have already been sent, delegate to Express's error handling rather than attempting a second response; an already-started response cannot be replaced with a JSON envelope.
- Cover synchronous throws and rejected async handlers using Express 5's native error propagation, without an async-wrapper dependency.
- Disable `X-Powered-By`. Do not enable CORS, proxy trust, authentication, body parsing, or unrelated middleware before an actual consumer requires it.
- Keep Express's default proxy trust disabled in this foundation. Do not introduce HTTPS-only redirects or decisions based on untrusted forwarded headers. Environment-configurable, narrowly scoped proxy trust and secure-cookie integration will be added when proxy/authentication support is implemented, not speculatively now.
- No diagnostic routes that deliberately fail are exposed by the application.

There are no existing API consumers or contracts to migrate. Error codes are stable English identifiers; no player-facing translations are added in this backend-only feature.

### Lifecycle and diagnostics

- Keep listening and signal registration in the server entry point/lifecycle code, not in the application factory.
- Log concise startup, shutdown, configuration-failure, request-error, and server-failure events using built-in console output. Use fixed/sanitized diagnostics and safe error codes; do not dump arbitrary error objects, stacks, environment values, URLs with query strings, or request bodies.
- Handle `SIGINT` and `SIGTERM` through a single idempotent shutdown path.
- On shutdown, call the HTTP server's `close()` to stop accepting connections and drain active requests. Node 24 also closes idle connections through this API.
- Allow up to 10 seconds to drain. At the deadline, force-close remaining HTTP connections and exit with status `1`; successful signal-triggered shutdown exits with status `0`.
- Clear shutdown timers and remove lifecycle listeners when finished. Repeated shutdown requests must not create competing timers or restart cleanup.
- Configuration errors, listen failures such as an occupied port, and unrecoverable server/process failures terminate with status `1`. Fatal process errors must not resume normal operation; attempt bounded cleanup if the server has started.
- Allow a shorter deadline as an internal lifecycle-test parameter, not a new public environment variable.

## Likely files

```text
.gitignore
backend/
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.build.json
  .env.example
  README.md
  src/
    app.ts
    config.ts
    server.ts
    lifecycle.ts
    middleware/
      error-handler.ts
  tests/
    app.test.ts
    config.test.ts
    lifecycle.test.ts
    startup.test.ts
```

The exact small helper boundaries may be adjusted during implementation without introducing speculative abstraction layers. Reuse the actual error middleware in test-only Express fixtures to exercise failures; do not add production test routes or environment-controlled failure switches.

## API, database, and deployment impact

- Introduces the public health contract and error envelope described above.
- No database, migrations, sessions, credentials, or persistent storage.
- One configurable HTTP port, with a proposed default of `3000`.
- Production requires Node 24, installed runtime dependencies, and the compiled backend. Build tools are needed only during development/build.
- Compatibility target: Docker Compose and Caddy on an Oracle Cloud Linux ARM64 VM, as documented in `project.md`. This feature checks application/tooling portability only; it does not implement or validate that deployment.
- Environment settings are `PORT` and `NODE_ENV` only; future authentication and persistence will extend this deliberately.
- No placeholder secret, SQLite-path, or proxy-trust settings are added. Future persistence must use environment-configured paths outside source/build directories and persistent session storage, never in-memory sessions.
- Preserve `/api` paths for future reverse-proxy forwarding. Relative React requests and Vite's development proxy remain frontend work; no frontend or CORS configuration is needed here.
- No Docker, Caddy, Oracle-specific, CI, or other infrastructure files are created.
- Leave the future sibling `frontend/` project untouched and uncreated.

## Ordered task batches

### Batch 1 — Project and configuration

- [x] Create the standalone npm package, lockfile, strict TypeScript configurations, scripts, and ignore rules.
- [x] Check selected dependency versions and platform-specific transitive tooling for Node 24/Linux ARM64 support before adoption; document evidence and distinguish documented support from execution verified on ARM64.
- [x] Implement and test configuration defaults and validation; add `.env.example`.
- [x] Verify dependency installation, configuration tests, and type checking. Verify source compilation once the minimal source files exist.

### Batch 2 — HTTP application

- [x] Add the application factory, health endpoint, JSON 404 fallback, and shared safe error middleware.
- [x] Add HTTP tests for health status/body/content type, unknown routes inside and outside `/api`, safe synchronous and asynchronous error responses, and continued health responses after a handled failure.
- [x] Verify proxy trust remains disabled and spoofed forwarded headers do not change Express's perceived client protocol/address. Keep this verification in test-only composition; do not expose a diagnostic endpoint.
- [x] Use test-only composition with the production error middleware for failure scenarios; ensure listeners and connections are always cleaned up.
- [x] Run the HTTP tests and type checking.

### Batch 3 — Runtime lifecycle and handoff

- [x] Add production startup, sanitized operational diagnostics, server-failure handling, and bounded shutdown.
- [x] Test startup defaults/custom configuration, invalid configuration exit status, and occupied-port startup failure using isolated child processes and controlled environments.
- [x] Test shutdown with idle connections, a completing in-flight request, a deliberately stalled request, and repeated shutdown requests. Exercise shutdown directly on Windows; verify actual signal delivery in a child process where supported.
- [x] Run a production build and smoke-test the compiled entry point for health, JSON 404, configuration handling, and exit behavior. Confirm production startup works without `tsx` or other development-only execution tools.
- [x] Verify `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`; record results and platform limitations. Check development watch startup separately.
- [x] Document setup, commands, configuration, local network binding, health semantics, and shutdown in `backend/README.md`.
- [x] Record Linux ARM64 compatibility evidence, any native build requirements, and any unverified ARM64 execution or POSIX signal behavior without adding infrastructure or claiming deployment readiness has been runtime-tested.
- [x] Add approved foundation decisions to `project.md` without overwriting pre-existing edits; update specification acceptance criteria and `MEMORY.md` with verified results.
- [x] Review the complete diff for scope, secrets, generated artifacts, and unintended changes.

## Verification results

- On Windows x64 / Node 24.19.0 / npm 11.17.0, `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` pass. The suite reports 41 passed and two explicitly skipped POSIX signal tests.
- Lifecycle tests caught a completing request's keep-alive connection delaying shutdown. The implementation now reaps connections that become idle during draining, with regression coverage.
- Source watch-mode startup was smoke-tested using `npm run dev`; restart after source edits was not separately exercised.
- An isolated production-only install (`npm ci --omit=dev`) served compiled health/404 responses without `tsx` or TypeScript and respected environment-over-file configuration precedence.
- Dependency metadata/lockfile checks establish expected ARM64 support; actual Linux ARM64 execution and real Linux signal delivery remain unverified. Registered signal handlers are also tested using simulated process events in isolated children on Windows.
- No database/schema, authentication, frontend, or infrastructure changes were introduced. Exact package versions and dependency evidence are in `backend/README.md`.

## Risks and verification limitations

- Windows process termination is not equivalent to POSIX signal delivery. Direct lifecycle tests can verify draining and deadlines locally, but they do not prove Linux signal integration. Any unverified POSIX behavior must be reported, not marked complete implicitly.
- Dependency metadata or upstream support documentation can establish expected ARM64 compatibility, but cannot substitute for an ARM64 install/build/test run. If no ARM64 environment is available, report that limitation; do not add cloud resources or Docker infrastructure to perform this feature's checks.
- HTTP tests must use ephemeral ports, bounded waits, and cleanup in failure paths to avoid collisions or hanging processes.
- Tests must not inherit an unrelated developer port or `.env` contents; preserve only the OS environment required to launch Node while explicitly controlling application configuration.
- Native ESM import paths must be valid in emitted JavaScript; production smoke tests are required even when source tests pass.
- Future persistence will need its own shutdown cleanup and readiness design; this feature must not imply that those already exist.

## Approval checkpoint

All three batches were approved and implemented. Future material changes to dependencies, architecture, API behavior, or scope require another review.
