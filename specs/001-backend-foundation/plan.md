# 001 — Backend Foundation Implementation Plan

**Status:** all three batches are complete within the approved foundation scope. The user authorized batch 3 in full and explicitly added native `.env` support earlier. Actual POSIX signals and Linux ARM64 execution remain unverified, documented platform limits. No later feature or production infrastructure is authorized by this completion.

**UI mockups:** Decision: no (no UI).

## 1. Approach

The implementation started from an empty `backend/` directory and created a standalone npm package. It uses Express for HTTP, strict TypeScript for checking/building, and Node's built-in development watcher and test runner.

Keep three purposeful source files: HTTP behavior, server configuration/lifecycle, and the executable entry point. This lets tests import application and lifecycle functions without accidentally starting a process. No routes/controllers/services directories are needed for a health check; add domain files only when actual features require them.

The approved specification defines behavior and API responses. This plan does not add authentication, persistence, gameplay, frontend work, or deployment infrastructure.

## 2. Runtime and dependencies

Local inspection found Node **24.19.0** and npm **11.17.0**. Use Node `>=24.19.0 <25` for this first package, with the inspected npm version recorded for reproducibility. This is a project compatibility range, not a recommendation to ignore subsequent Node security updates.

Registry metadata checked while preparing this plan:

| Package | Proposed version | Purpose |
| --- | --- | --- |
| `express` | `5.3.0` | The only direct runtime dependency; required by the approved stack. |
| `typescript` | `7.0.2` | Development-only type checking and JavaScript compilation. |
| `@types/express` | `5.0.6` | Development-only Express type declarations. |
| `@types/node` | `24.19.2` | Development-only declarations for the selected Node major. |

Pin direct versions and commit the generated `package-lock.json` during implementation. Verify installation, engine requirements, and basic compilation before proceeding; metadata is not a successful-install claim. If a package fails compatibility checks, report the issue and agree on any version/tool substitution rather than silently changing the plan.

### Why no development loader or test framework?

Node 24 can execute erasable TypeScript directly and watch imported files. Use that capability rather than adding `tsx`, `nodemon`, Jest, Vitest, or Supertest. Node's `node:test`, `node:assert/strict`, HTTP server, and `fetch` cover the current tests.

Use native ESM (`"type": "module"`), `NodeNext` module resolution, strict checking, `erasableSyntaxOnly`, `verbatimModuleSyntax`, and `rewriteRelativeImportExtensions`. Relative source imports end in `.ts`; compilation rewrites them to `.js`. Avoid enums, parameter properties, import aliases, and other syntax/configuration that native type stripping cannot execute. Type stripping does not check types: retain a separate typecheck command.

TypeScript 7 uses platform-specific native compiler packages. Registry metadata confirms a `7.0.2` Linux ARM64 package, but installation/execution there remains unverified. Runtime Express does not require that compiler. Install build dependencies on the build platform; never copy Windows `node_modules` into Linux.

## 3. Files and commands

Files added during this implementation:

| File | Responsibility and reason |
| --- | --- |
| `backend/package.json` / `package-lock.json` | Independent package, pinned dependencies, engine range, and repeatable commands/install. No root workspace is needed. |
| `backend/tsconfig.json` | Shared strict configuration checking source and tests without emitting files. |
| `backend/tsconfig.build.json` | Extends the shared options and emits only application source into `dist/`; avoids shipping compiled tests or rewriting build settings in scripts. |
| `backend/src/app.ts` | Application factory, health endpoint, JSON 404, and a reusable Express error handler in the same module. Importing it does not listen on a port. |
| `backend/src/server.ts` | Port validation, HTTP startup/error handling, and bounded shutdown. Keeping the related runtime functions together avoids separate config/lifecycle/helper files. |
| `backend/src/index.ts` | Small executable entry point that starts the application and handles startup failure. Separating this side effect lets tests import `server.ts` safely. |
| `backend/.env.example` | Safe local-development settings and loading instructions. The actual `.env` is ignored by Git and contains only the local port at this stage. |
| `backend/tests/app.test.ts` | HTTP contracts and isolated error-handler tests. |
| `backend/tests/server.test.ts` | Configuration, binding failures, lifecycle, and compiled-process checks. Keep related test utilities here unless size genuinely requires separation. |
| `backend/README.md` | Setup, commands, contracts, manual smoke checks, and verification limitations. |

Two compiler configurations are needed only because tests should be typechecked but excluded from production output. No additional build system is proposed.

Implemented npm scripts, executable from `backend/` without shell-specific environment assignments:

| Script | Command |
| --- | --- |
| `dev` | `node --env-file-if-exists=.env --watch src/index.ts` |
| `typecheck` | `tsc --noEmit -p tsconfig.json` |
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `node dist/index.js` |
| `test` | `node --test tests/app.test.ts tests/server.test.ts` |

Run `npm run build` before `npm test`: the suite must exercise the compiled entry point, not skip that check when `dist/` is missing. Document this ordering. Keep scripts explicit and portable; no Bash helpers, chained cleanup commands, or dependency on PowerShell in the package.

Read `process.env.PORT` directly. At the user's request, development now loads an optional package-local `.env` through Node's native `--env-file-if-exists=.env`; no `dotenv` dependency or custom loader is needed. Real process environment variables take precedence. Missing `.env` leaves the default port available; invalid `PORT` still fails validation. Create an ignored local `.env` containing `PORT=3000` and a tracked `.env.example`. Restart development after editing `.env`; watcher-based reload of that file is not promised. `npm start` intentionally reads only the process environment so production does not depend on a local file. For an explicit local compiled check, use `node --env-file=.env dist/index.js`. Paths passed to the Node flag resolve from the working directory; npm scripts run from the backend package. Document PowerShell and POSIX override examples without putting shell-specific assignments into scripts.

## 4. HTTP and lifecycle implementation

- `createApp()` configures the health route, then JSON 404 handling, then the four-argument Express error handler. Export the error handler from this same module so a test-only Express app can install a throwing route before it. Do not add production route-registration hooks or diagnostic endpoints.
- Keep Express proxy trust disabled. Do not enable CORS, sessions, body parsing, or authentication before a feature requires them. Disable the unnecessary `X-Powered-By` header.
- Return exactly the health/error contracts in the spec. If response headers were already sent, delegate to Express rather than attempting a second JSON response.
- Validate the entire `PORT` string before conversion; reject empty, whitespace-only, fractional, negative, zero, out-of-range, or trailing-junk values. Missing `PORT` selects `3000`. Do not use a permissive `parseInt` fallback.
- Report listening success only after the listener is bound. Handle `EADDRINUSE` and other startup errors, release resources acquired during failed startup, and exit unsuccessfully without retrying another port.
- Log controlled startup/shutdown messages and safe diagnostic information. For HTTP errors, avoid logging arbitrary request bodies, environment variables, or full error objects with potentially sensitive attached properties; keep stack details out of HTTP responses.
- Use a single guarded shutdown path for `SIGINT` and `SIGTERM`. Call `server.close()` to stop accepting connections and drain active requests. Cancel the deadline timer and remove owned signal listeners after completion.
- After 10 seconds, close remaining HTTP connections with `server.closeAllConnections()` and terminate unsuccessfully. A normal shutdown exits successfully. A repeated signal must not start a second close sequence.
- Use a small named shutdown function in `server.ts`, testable with a shorter internal timeout argument. Runtime startup always supplies the approved 10-second limit; do not add an environment variable or generic resource-disposal framework for testing.

## 5. Implementation batches and checks

### Batch 1 — Package and HTTP behavior

- [x] Create the package, lockfile, compiler configuration, application factory, and initial HTTP tests.
- [x] Implement the health response, JSON 404, and safe JSON 500 handler.
- [x] Typecheck and build the current application module; run the HTTP test file directly until the full package suite exists.
- [x] Verify HTTP 200/404/500 status, JSON content type and exact response bodies, no session cookies, and no internal-error leakage.

Tests use real loopback HTTP servers with automatically assigned test ports and guaranteed cleanup. The public `PORT` setting still rejects zero; internal test listeners may use port zero without changing that contract. The 500 case uses only a test-local throwing route.

Task 1 results: installed the pinned dependencies and generated the lockfile on Windows x64; npm reported zero vulnerabilities. Added the two compiler configurations and a minimal `createApp()` with `X-Powered-By` disabled and default proxy trust preserved. Its three initial tests passed. TypeScript's installed compiler reports `7.0.2`. `npm test` currently runs only `app.test.ts`; add `server.test.ts` and the dev/start scripts when batch 2 creates their targets. These application tests do not require a build; the full compiled-process suite will.

Task 2 results: implemented `GET /api/health`, the JSON 404 fallback, and exported `handleError` in `app.ts`. The handler logs a fixed diagnostic message without dumping error/request data, returns the generic JSON 500 response, and delegates when headers have already been sent. Updated HTTP tests to use the actual health route and a separate test-only throwing app; no diagnostic endpoint exists in the application. All five tests passed at that step. No executable server entry point or lifecycle implementation exists yet.

Task 3 results: on Windows x64 / Node 24.19.0, `npm run typecheck` and `npm run build` both passed without configuration/source changes. Build output contains only `dist/app.js`, not tests. Direct `node --test tests/app.test.ts` execution passed all five tests with zero skips. Existing user comments and formatting in `app.ts` were preserved. No compiled-process startup was attempted because the executable entry point belongs to batch 2.

Task 4 results: extended the existing three HTTP tests to assert `application/json; charset=utf-8`, absence of `Set-Cookie`, exact response bodies, and expected 200/404/500 statuses. The isolated failure now includes a private-message marker, a synthetic stack/path, and an attached dummy secret. Its response excludes those markers; exact-body and fixed-log assertions prevent dumping internal fields in the response or test-covered diagnostic log. Typecheck, build, and all five tests pass with zero skips. No production source, dependency, or user annotations changed; no executable server was added. Batch 1 is complete.

### Batch 2 — Executable startup and bounded shutdown

- [x] Add `server.ts` and `index.ts`, port validation, startup diagnostics, bind failure handling, and shutdown.
- [x] Test missing/valid/invalid ports, including both valid boundaries and rejection of empty, fractional, out-of-range, and trailing-junk values without assuming privileged/occupied ports can be bound.
- [x] Hold a controlled listener open, accessed through loopback, to verify occupied-port failure without stopping any existing service. Match the backend's bind scope for a real conflict. Test child processes must have bounded waits and guaranteed termination.
- [x] Verify graceful draining with a controlled test-local slow response, forced timeout with an unfinished response, and repeated close calls. Use a shortened test timeout, not a ten-second wait per test.
- [x] Add actual `SIGINT`/`SIGTERM` checks in child processes for POSIX. On Windows, run the shared lifecycle tests directly and explicitly mark OS-signal delivery checks as skipped/unverified; forced child termination is not evidence of graceful signal handling.
- [x] Run typecheck, build, and the full suite, including a compiled-process health smoke check and startup-failure exit status. No public test-only route is introduced.

Task 1 results: added `readPort`, `registerShutdown`, and `startServer` in `server.ts`, plus the executable `index.ts`. Missing PORT defaults to 3000; explicit values must be digits representing a safe integer in 1–65535. Binding must succeed before logging success or registering shutdown listeners. Startup failures set a nonzero exit status without retrying another port. Shutdown guards repeated calls, drains HTTP work, clears its timer/listeners, and rejects after forcing remaining connections closed at the 10-second deadline; signal-triggered failure sets a nonzero exit status. Source modules remain importable without automatic startup. Added native-env development and compiled start scripts, `.env.example`, and ignored local `.env`; no dependencies changed.

Verification for task 1: typecheck/build and the five existing application tests pass on Windows x64 / Node 24.19.0. Bounded one-off child-process checks verified local `.env` loading, real-environment precedence, both source/compiled entry points returning health 200, successful signal-handler shutdown using `process.emit('SIGTERM')`, and unsuccessful startup for one invalid PORT value. All temporary processes exited. These are smoke checks, not completion of the remaining dedicated test tasks: actual OS-signal delivery, exhaustive port/bind cases, active-request draining, repeated shutdown, timeout behavior, watcher restart, and runtime-only install remain unverified here.

Task 2 results: added `tests/server.test.ts` with 24 direct `readPort` tests: absent input, four valid ports including 1 and 65535, and 19 invalid inputs covering empty/whitespace, zero, negative, out-of-range, fractional, trailing junk, surrounding whitespace/newlines, signed/exponent/hex notation, NaN/Infinity, and unsafe integers. Every rejection checks the exact error name/message. These tests do not bind sockets, change process environment, load `.env`, or assume a particular port is free. `npm test` now includes both test files: all 29 tests pass with zero skips; typecheck/build pass. No production-source change was needed; user comments and startup log were preserved. Occupied-port and lifecycle test tasks remain pending.

Task 3 results: added a controlled occupied-port test to `server.test.ts`. A temporary HTTP listener reserves a system-assigned port while a child runs the real source entry point with that PORT. The test verifies exit code 1, EADDRINUSE diagnostics, no success output, and that the original listener still answers its fixed marker over loopback. The child must exit on its own rather than be killed; a 5-second SIGKILL deadline and cleanup hook guard regressions, within a 10-second test limit. The listener and child are disposed without touching existing services or `.env`.

Platform finding: on this Windows environment, reservations bound specifically to either 127.0.0.1 or ::1 coexist with the backend's wildcard bind. Those initial test attempts correctly failed and their children were terminated by the timeout. The final reservation uses the same default bind as the backend, with requests made through IPv4/IPv6 loopback as appropriate. It is briefly reachable on the default interfaces but serves only a fixed test marker, never private data. No production binding behavior changed. The focused test and full suite now pass: 30 tests, zero skips; typecheck/build pass. Dedicated shutdown and actual OS-signal tests remain pending.

Task 4 results: added three tests and one local fixture helper in `server.test.ts`, using real loopback HTTP servers and the actual `registerShutdown` function. A response is held until shutdown starts; new connections fail while the original response completes without forced closure. A deliberately unfinished response is forcibly disconnected after a shortened 50ms shutdown deadline, with the expected shutdown rejection and a failed response-body read. Repeated calls before/after completion return the same promise, invoke `server.close` only once, and restore the original process signal listeners. Cleanup releases connections even after assertion failures or expected shutdown rejection. Full suite: 33 passed, zero skips; typecheck/build pass. No production changes or real OS signals in this task.

Keep-alive limitation: the first drain-test version completed its response but retained one idle persistent connection, exceeding the shortened 3-second shutdown deadline. A bounded diagnostic confirmed this. The final controlled client sends `Connection: close` to isolate active-request completion from idle keep-alive expiry. The timeout test deliberately leaves its response open. This verifies active-request draining and forced disconnection, not immediate draining of arbitrary persistent connections; runtime keeps its existing 10-second deadline. Actual OS-signal and remaining compiled-process checks are still pending.

Task 5 results: added one POSIX-only child-process test per signal (`SIGINT`, `SIGTERM`) in `server.test.ts`. A small inline child fixture uses the real application and `registerShutdown` with an already-bound ephemeral loopback port, reports readiness over IPC, and disconnects that channel so it cannot prevent process exit. The parent verifies health, sends the real signal using `child.kill(signal)`, and expects successful exit code 0, no terminating signal, exact normal shutdown logs, and no stderr. Each wait is bounded; a cleanup hook force-kills only a leftover test child. No public diagnostic routes or production changes were added.

Windows verification: all 33 runnable tests pass and two signal tests are explicitly skipped because Windows `child.kill` terminates abruptly rather than exercising POSIX signal handling. Direct lifecycle tests from task 4 still run. Typecheck/build pass; the inline child fixture also passes a separate JavaScript syntax check without executing signal tests. Actual POSIX signal delivery, readiness/IPC execution on that branch, and graceful signal-exit assertions must still be run on Linux/macOS. Do not count the skips or forced cleanup as verified signal handling.

Task 6 results: added persistent compiled-entry tests in the existing `server.test.ts`. The occupied-port test now runs against both source and compiled entry points with shared local reservation/child-cleanup helpers. Compiled startup rejects empty and invalid PORT values with exit code 1, the exact diagnostic, no success output, and no forced timeout. The health test runs `dist/index.js` with `NODE_ENV=production` and `--no-strip-types`, waits for its startup log, and checks HTTP 200, JSON content type and the exact body. It uses an ephemeral reservation released just before startup; a competing bind causes a bounded failure, never a retry or fallback to another port. Missing compiled output fails with an explicit instruction to build first, rather than skipping checks. No production hooks, endpoints, dependencies, or source changes were added.

Final batch 2 verification on Windows x64 / Node 24.19.0: `npm run typecheck`, `npm run build`, then `npm test` pass; **37 tests passed, two POSIX-signal skips, zero failures**. Test children/listeners are disposed; forced cleanup of the healthy compiled child is not claimed as graceful OS-signal verification. This is not the isolated runtime-only install check, which remains in batch 3. Batch 2 is complete with actual POSIX-signal delivery and Linux ARM64 still explicitly unverified.

### Batch 3 — Reproducibility, developer workflow, and documentation

- [x] Verify `npm ci`, typecheck, build, and all tests after the lockfile is established. Record actual results, skips, and warnings.
- [x] Start development mode on an available port and confirm an intentional source change causes a restart; restore only that temporary edit. Do not stop unrelated services or assume port 3000 is free.
- [x] Verify compiled startup in an isolated temporary copy with runtime dependencies only (`npm ci --omit=dev`) and no TypeScript source/compiler/loader; request health and 404, then cleanly dispose of the test process.
- [x] Write `backend/README.md` with prerequisites, command ordering, configuration, API examples, development restart behavior, shutdown, and platform limitations.
- [x] Update the backend-foundation statements in `project.md` to reflect only what this reboot actually implemented and verified. Do not rewrite unrelated historical sections as part of this feature.
- [x] Update spec acceptance checks, this plan, and `MEMORY.md` with factual results. Review changes and whitespace; make no automatic commit.

Batch 3 results (2026-11-11, Windows x64 / Node 24.19.0 / npm 11.17.0):

- A clean `npm ci` installed 78 packages and reported zero vulnerabilities, followed by successful typecheck/build and **37 passed / two explicit POSIX-signal skips**. No dependency/lockfile changes were required. npm displayed funding notices, not installation or compiler warnings.
- An isolated runtime directory contained only package/lock files, `dist/`, and dependencies from `npm ci --omit=dev` (65 packages installed, zero vulnerabilities reported). Assertions confirmed no `src/`, tests, `.env`, TypeScript, tsx, or direct development types. Actual `npm start` returned health 200 and the exact JSON 404 with `NODE_ENV=production` and TypeScript execution disabled.
- A separate temporary source copy, using the same npm dev script and runtime dependencies, loaded a generated safe `.env` on an available port. Editing only that copy's health response triggered a restart and changed the HTTP result; byte-exact restoration triggered another restart and restored the result. Workspace source was never edited for this check. Source/test/package/lock/compiler-configuration fingerprints remained identical.
- Own temporary npm/watcher process trees were stopped, and subsequent requests confirmed their HTTP ports were closed. Windows process-tree cleanup was forced; it is not claimed as graceful POSIX-signal verification. No unrelated service was stopped.
- Created `backend/README.md`; updated only scoped backend-foundation/current-status statements in `project.md`, including a warning that unrelated pre-reboot frontend/auth/persistence claims are historical. The planned `database.md` schema was not changed or implemented. Spec and memory now reflect completion and remaining limits.
- Verification fixtures/report were generated outside the repository in the approved temporary area. No production source, tests, dependency files, secrets, or infrastructure were changed for batch 3. No commits were created.

Each batch should remain independently reviewable. Stop and discuss concrete compatibility failures or scope expansion rather than adding fallback frameworks or unrelated features.

## 6. API, database, and deployment impact

| Area | Impact / limit |
| --- | --- |
| API | Adds the approved public health endpoint and JSON 404/500 shapes. There are no implemented frontend consumers in this checkout and no existing API to migrate. |
| Database and persistence | None. No database driver, file, migration, sessions, or catalog artifacts. The nine-table design remains future work. |
| Variables and secrets | `PORT` only; default `3000`, validated as specified. Development optionally loads ignored `.env` through Node; `.env.example` contains no secrets. Real environment wins; production start does not read local files. No Google configuration or secrets. |
| Ports and services | One standalone HTTP backend; no additional persistent service. The README warns the default bind may be reachable beyond loopback and is not a production exposure setup. Most fixtures bind to loopback; occupied-port reservations and real-entry checks match the backend's default bind and serve no private data. |
| Build and startup | Compile application source to `dist/`; start with Node, not a development watcher/loader. Isolated runtime-only install/start and native development restart are verified on Windows. |
| Linux ARM64 | Node/Express target is compatible in principle; TypeScript's Linux ARM64 native build package exists. Actual target installation, compilation, signal behavior, and runtime are unverified until run there. No claim of production certification. |
| Proxy, HTTPS, cookies | No cookies or auth; proxy trust stays disabled. A future trusted-proxy/HTTPS configuration needs its own scope. |
| Development proxy | No frontend exists; no Vite proxy or CORS configuration is added. API paths already use `/api`. |
| Docker and production | No Dockerfile, Compose, Caddy, cloud, firewall, or production deployment changes. The compiled start path is preparation, not infrastructure authorization. |

## 7. Approval and remaining limits

Approval of this plan authorizes the listed backend files/dependencies, scoped documentation updates, and isolated checks only. Exact table definitions and later roadmap stages are not included.

Risks to report during implementation: TypeScript 7 native package installation restrictions, port races in child-process tests, watcher/signal differences on Windows, and untested Linux ARM64 execution. Prefer clear bounded tests and explicit limitations to generic process-management abstractions.

**Next step:** this foundation feature is complete with the documented platform limits. Discuss/specify persistence separately if the user wants to follow the roadmap; do not add a database or start another feature automatically. Actual POSIX-signal execution and Linux ARM64 verification remain pending target-platform work.
