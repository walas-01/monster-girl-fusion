# Monster Girl Fusion — Backend

A minimal standalone HTTP backend. Feature 001 provides startup, configuration, health, JSON errors, bounded shutdown, and tests. It does **not** include SQLite, accounts, authentication, sessions, catalogs, or gameplay endpoints yet.

## Requirements

- Node.js `>=24.19.0 <25`.
- npm; verified with `11.17.0`, as recorded in `package.json`.
- Install dependencies on the machine/platform where they will be used. Do not copy Windows `node_modules` to Linux.

Direct versions are pinned in `package.json` and transitive versions in `package-lock.json`. Express `5.3.0` is the only direct runtime dependency. TypeScript `7.0.2`, `@types/express` `5.0.6`, and `@types/node` `24.19.2` are development dependencies.

## Install and develop

From the repository root:

```sh
cd backend
npm ci
```

All remaining commands run from `backend/`. `npm ci` uses the existing lockfile and replaces the installed `node_modules`; it does not update dependency versions.

### Optional local configuration

If you do not already have `.env`, copy the example. Do not overwrite existing local settings.

PowerShell:

```powershell
Copy-Item .env.example .env
```

POSIX shell:

```sh
cp .env.example .env
```

The example contains:

```dotenv
PORT=3000
```

`.env` is ignored by Git; `.env.example` is safe to share. No Google credentials or session secrets are needed for this feature. Never commit real secrets.

Start development:

```sh
npm run dev
```

This executes `node --env-file-if-exists=.env --watch src/index.ts`:

- Node loads the optional local `.env`; missing files do not prevent startup.
- Existing process environment variables override file values.
- Imported TypeScript source changes restart the application without a manual build.
- Restart development manually after editing `.env`; automatic reload of that file is not promised.
- Native TypeScript execution does not check types. Run the typecheck separately.

Use Ctrl+C in the terminal to request shutdown. Do not run development and compiled startup on the same port simultaneously.

## Configuration

| Variable | Default | Validation |
| --- | --- | --- |
| `PORT` | `3000` when absent | Digits representing a safe integer between 1 and 65535. Empty, whitespace, fractional, signed, exponent, hexadecimal, out-of-range, and trailing-junk values are rejected. |

There is no automatic fallback to another port. An invalid port or occupied address produces an error and unsuccessful exit status without a successful-startup message.

Example process overrides:

```powershell
$env:PORT = "4000"
npm run dev
# Remove this override when no longer wanted:
Remove-Item Env:PORT
```

```sh
PORT=4000 npm run dev
```

The server uses Node's default bind address: unspecified IPv6 when available, otherwise unspecified IPv4. It may be reachable beyond loopback. This is **not** a production network-exposure setup; do not expose it publicly without a separately reviewed deployment/security configuration. Express proxy trust remains disabled.

## Check, build, and start compiled code

```sh
npm run typecheck
npm run build
npm test
```

Build **before** testing: subprocess tests require `dist/index.js` and fail clearly if it is absent. Rebuild after source changes so those tests exercise current code.

Then, with development stopped or a different port configured:

```sh
npm start
```

`npm start` executes `node dist/index.js`. It does **not** read `.env`; provide process environment variables, or the default port is used.

For an explicit local compiled run that loads `.env`:

```sh
node --env-file=.env dist/index.js
```

The explicit `--env-file` command requires that file. Production should receive configuration from its runtime environment, not depend on a developer's local file. `NODE_ENV=production` can be supplied by that environment for Node/Express conventions; it does not load configuration files or add infrastructure.

### Runtime-only installation

Build in an environment containing development dependencies. A **separate runtime directory** needs only `package.json`, `package-lock.json`, and `dist/`, plus its installed runtime dependencies:

```sh
npm ci --omit=dev
npm start
```

There is no need to ship `src/`, tests, TypeScript, a development loader, or `.env`. Do not omit development dependencies before attempting to compile. Docker, Caddy, HTTPS, firewall rules, and cloud deployment are outside this feature.

## HTTP behavior

### Health

`GET /api/health` returns HTTP `200` with:

```json
{ "status": "ok" }
```

This checks the responding HTTP process only, not future dependencies. It needs no authentication and creates no sessions or database files.

With the server running on port 3000, open `http://localhost:3000/api/health` in a browser or use:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

```sh
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/missing
```

### Errors

Unknown routes return HTTP `404`:

```json
{ "error": { "code": "NOT_FOUND", "message": "Route not found." } }
```

Unhandled request errors before a response starts return HTTP `500`:

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Internal server error." } }
```

These responses use `application/json; charset=utf-8`. Internal errors produce a fixed diagnostic log rather than dumping request data or the full error object. Private error messages, stacks, and attached properties are not returned. Once response headers have been sent, the handler delegates to Express; it cannot replace the existing response and the connection may be closed instead. No public endpoint deliberately triggers an error.

## Source map

| File | Responsibility |
| --- | --- |
| `src/app.ts` | `createApp`, health, 404 fallback, and exported error handler. No listener starts on import. |
| `src/server.ts` | `readPort`, `startServer`, and `registerShutdown`. Configuration and HTTP lifecycle stay together. |
| `src/index.ts` | Executable entry point and startup-failure exit status. |
| `tests/app.test.ts` | Application isolation and HTTP response contracts. |
| `tests/server.test.ts` | Port validation, source/compiled subprocesses, draining, timeout, repeated shutdown, and platform-aware signal tests. |
| `tsconfig.json` | Strict checking of source and tests without emitting output. |
| `tsconfig.build.json` | Emits application source only into `dist/`, not tests. |

TypeScript uses ESM/NodeNext, explicit relative `.ts` imports rewritten to `.js` at build time, and erasable syntax compatible with Node. Avoid enums, parameter properties, and path aliases that require a development transformer. No empty domain-layer directories, ORM, global configuration framework, or custom test framework is included.

## Shutdown

`SIGINT`/`SIGTERM` request a guarded close: stop accepting new connections, allow active requests to finish, and force-close remaining HTTP connections after 10 seconds. Repeated shutdown calls share one promise. Timers and owned signal listeners are removed; signal-triggered shutdown failure sets an unsuccessful exit status.

Idle persistent connections can affect how long the close takes. The controlled draining test uses `Connection: close`; it does not certify immediate completion for arbitrary keep-alive clients. Shutdown does not replace future database transactions or a safe retry policy.

Windows `child.kill('SIGINT')`/`child.kill('SIGTERM')` force termination rather than exercise POSIX handlers. The suite explicitly skips those two real-signal tests on Windows while still running direct lifecycle tests. Automated real POSIX delivery remains unverified until run on Linux/macOS; forced cleanup of test processes is not evidence of graceful signal handling.

## Verification and limits

Verified on **2026-11-11, Windows x64, Node 24.19.0 / npm 11.17.0**:

- Clean `npm ci`, typecheck, build, and full suite: **37 passed, two POSIX-signal skips, zero failures**.
- Both full and isolated runtime-only installs reported zero vulnerabilities at check time; this is not a permanent security guarantee.
- Source and compiled startup, port validation/bind failures, health, JSON errors, no session cookies, and controlled error-leakage checks.
- Direct active-request draining, shortened forced deadline, repeated shutdown, and signal-listener cleanup.
- Isolated `npm start` with only package files, `dist/`, and runtime dependencies; no source, `.env`, compiler, or development types. Health/404 passed with TypeScript execution disabled.
- Isolated `npm run dev` loaded a safe fixture `.env`, restarted after a source edit, and restarted again after byte-exact restoration. Workspace code/config/test fingerprints were unchanged. All temporary process trees stopped and their HTTP ports closed.

Not verified: Linux ARM64 execution/build, real POSIX signals, real HTTPS/reverse-proxy behavior, and any Google/database integration. TypeScript 7 uses a native platform compiler; its Linux ARM64 package exists, but has not been executed here. Install build dependencies for the build host and runtime dependencies for the runtime host. No production infrastructure was created.

The feature specification and implementation results are in [`../specs/001-backend-foundation/`](../specs/001-backend-foundation/). Future persistence and gameplay require their own reviewed scope; [`../database.md`](../database.md) remains a planned design, not implemented schema.
