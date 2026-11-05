# Feature 004 — Frontend foundation and Google authentication plan

Status: Approved and implemented — all three batches locally verified; live Google and platform/deployment limitations remain explicit below.

## Approach

Create one independent npm package under `frontend/`, using the official Vite React/TypeScript template as a starting point. Remove demo assets/components/styles and replace them with one minimal authentication view. Keep authentication API calls, Google SDK loading, and translations separate from React presentation. No routing, SDK wrapper, component library, or global-state dependency is needed.

The backend remains unchanged. Its existing account/session response and error envelopes are the contract. Existing developer configuration and databases must not be modified.

## Dependencies and compatibility

Registry metadata checked during planning:

| Package | Proposed pinned version | Purpose |
| --- | --- | --- |
| `react`, `react-dom` | 19.3.1 | UI/runtime. |
| `vite` | 8.3.6 | Development server/static production build. |
| `@vitejs/plugin-react` | 6.2.1 | Official React integration. |
| `typescript` | 6.0.3 | Match the backend's approved compiler rather than introduce TypeScript 7 in this feature. |
| `@types/react`, `@types/react-dom` | 19.3.0 | React declarations. |
| `@types/node` | 24.19.2 | Match backend/Node 24 tooling. |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.4 | Minimal project-convention styling through the official Vite plugin. |
| `tsx` | 4.23.15 | Match the backend's Node test-runner loader. |
| `jsdom` | 31.0.0 | Test-only DOM for React interactions. |
| `@testing-library/react` | 16.3.3 | Test rendered states, accessible controls, and user interactions. |
| `@testing-library/dom` | 10.4.2 | Required Testing Library peer. |

Only React/React DOM are application runtime dependencies; all other packages above are development dependencies. Scaffold with `create-vite` 9.3.4 as a one-time tool, not an application dependency. Inspect the generated files before removing anything; do not overwrite an unexpectedly existing frontend.

Use Node 24.19+ within Node 24 and npm, consistent with the verified backend environment. Vite/plugin metadata accepts Node 24; jsdom requires Node >=24.15 within Node 24. React/Testing Library peers match. Keep the scaffold's useful strict TypeScript settings; omit generated ESLint tooling/configuration rather than add another toolchain in this batch. Provide explicit typecheck, test, build, dev, and preview scripts; build must include type checking.

**Build compatibility caveat:** Vite 8's Rolldown and Tailwind's compiler/CSS toolchain use platform-specific optional native packages. These are build-time dependencies, not backend runtime drivers; install them for each target rather than copying Windows node_modules. Inspect resolved versions, engine/peer requirements, install scripts, audit results, and Linux ARM64 optional-package metadata during installation. Actual ARM64 execution remains unverified without that platform. Do not install compilers, approve scripts broadly, suppress dependency scripts, or change major versions silently if installation fails. jsdom's optional canvas peer is unnecessary and must not be installed.

## Proposed files

- `frontend/package.json`, lockfile, TypeScript configuration, `vite.config.ts`, `index.html`.
- `frontend/src/main.tsx`, `App.tsx`, and `styles.css`: React StrictMode entry point and compact mobile-first view.
- `frontend/src/auth/api.ts`: fixed relative auth URLs, bounded fetch operations, safe response validation/error mapping, and CSRF acquisition.
- `frontend/src/auth/google.ts`: small official Google Identity Services script loader and narrowly scoped SDK types.
- `frontend/src/auth/useAuth.ts`: session restoration and explicit pending/signed-out/signed-in/unavailable states, mutation locking, and reconciliation.
- `frontend/src/auth/GoogleSignInButton.tsx`: official Google button lifecycle, error/retry state, and language changes.
- `frontend/src/i18n.ts`: typed English keys/dictionaries, browser-language selection, and translation helpers.
- `frontend/src/config.ts` and Vite client declarations: public client-ID validation, kept separate from testable API/controller modules.
- `frontend/tests/`: Node built-in tests using tsx; JS/JSX DOM integration tests can avoid extra jsdom type declarations. Explicit DOM setup before importing React test utilities and explicit cleanup after each test.
- `frontend/.env.example`, `frontend/README.md`; extend root `.gitignore` for frontend environment/build/dependency artifacts while retaining `.env.example`.
- Update `project.md`, feature checklists, and `MEMORY.md` after implementation/verification.

No empty architectural folders, demo counter, React/Vite logos, sample images, new fonts, or scaffold README. A single main region, application title, compact EN/ES selector, official Google button or signed-in status, logout, and localized status/error/retry feedback are sufficient. Use dark backgrounds and restrained purple accents, no visual-reference assets or game artwork.

## Configuration and development proxy

- `VITE_GOOGLE_CLIENT_ID`: public web client ID, matching backend `GOOGLE_CLIENT_ID`. Missing/invalid configuration shows localized sign-in-unavailable feedback; it must not prevent an existing session from being inspected or logged out.
- `DEV_API_TARGET`: server-only HTTP(S) backend target, default `http://localhost:3000`. Validate it in Vite configuration; never give it the `VITE_` prefix or expose all loaded environment settings to client code.
- `DEV_PORT`: server-only development port, default 5173, validated. Enable `strictPort` so Vite cannot silently switch to an origin unauthorized by Google/backend. Bind to localhost by default; do not enable broad host/CORS permissions.
- Proxy `/api` without removing its prefix, rewriting Origin, or injecting trusted forwarded protocol. Preserve the browser-facing Origin (`changeOrigin: false`); verify with an actual development-proxy test rather than relying on documentation alone.
- All React requests use relative URLs and `credentials: 'same-origin'`. Use JSON and `X-CSRF-Token` on mutations, allowing the browser to provide Origin.
- Explain aligned `http://localhost:5173`, backend `APP_ORIGIN`, and Google authorized JavaScript origins. Different ports/hostnames require deliberate configuration. A public client ID is not a secret; never expose `SESSION_SECRET` or copy the backend environment into the frontend.
- `preview` previews static assets only; it is not the supported API deployment or production server. Document that production serves static assets and `/api` from the same public origin through the future reverse proxy.

## Authentication behavior

1. Inspect `/api/auth/session` on mount. Validate the discriminated response and minimal user/onboarding fields. Show sign-in only for a confirmed anonymous session; network, invalid response, and server failures show an unavailable/retry state.
2. Load Google's `https://accounts.google.com/gsi/client` asynchronously only when sign-in is needed/configured. Share an in-flight loader across StrictMode effects; handle script errors and a bounded SDK-load timeout, allow an explicit retry, and ignore callbacks after unmount. Do not log SDK credentials or include an access-token OAuth flow.
3. Initialize Google's ID API and render its official button with popup UX, `auto_select: false`, no One Tap prompt, and the selected supported locale. Use supported button options; do not imitate/replace Google's branding with a custom login button. Clean up rendered containers on effect reruns and ensure language changes do not submit or cancel active authentication accidentally. Google's own popup text may follow Google/browser preferences rather than every app label.
4. When a credential callback is accepted, synchronously lock submission before awaiting anything. Obtain the current CSRF token from `/api/auth/csrf` immediately before POST `/api/auth/google`; keep credentials/tokens only in short-lived memory. Confirm signed-in state only from a valid backend response. Avoid a persistent CSRF cache so reloads/other-tab rotation recover on the next deliberate action.
5. Logout similarly acquires a fresh CSRF token before POST `/api/auth/logout`. On confirmed 204, discard user state and call Google's `disableAutoSelect` if loaded; SDK failure cannot invalidate successful backend logout. Do not revoke Google grants or log the user out of Google itself.
6. For a rejected CSRF token, reconcile the session and show a retryable localized security/session message. Do not automatically loop mutation retries; a new deliberate action gets a fresh token. If inspection confirms expiration, display signed-out state honestly.
7. On a timed-out/network-failed mutation or malformed/unexpected response, inspect the session before permitting another mutation. The server might have committed even if the client did not receive success; aborting fetch does not undo it. If reconciliation fails, show unknown/unavailable state and require a read-only retry first. Never automatically repost the credential or logout.
8. Bound API requests with an AbortController timeout (proposed 10 seconds, above Google's backend certificate timeout). Abort/ignore obsolete reads using request generations; do not let late callbacks or unmounts change current state. No initial-effect mutation; avoid duplicate submissions under StrictMode or rapid callback delivery.
9. Map API codes to translation keys, with a generic fallback for unknown codes and no raw backend/Google error details rendered or logged. Keep the backend authoritative even if the SDK indicates a Google account is present.

## Localization

Use a small typed translation dictionary and React state, not a new i18n dependency. Select the first supported language from `navigator.languages` (including regional `en-*`/`es-*` tags), then English fallback. Translate all application labels/status/errors, set document language/title, and preserve auth state across manual language changes. Language preference remains in memory only for this feature; document this decision in `project.md`. Do not display raw account IDs/emails as the default success screen. For onboarded users, a supplied username may be rendered as React text; otherwise use generic signed-in status plus the pending-onboarding notice.

## API, database, and deployment impact

- No backend schema, migrations, API contract changes, new server storage, or authoritative game logic.
- One configurable local frontend development port; no new production service or public port.
- Browser runtime needs Google's official HTTPS SDK/sign-in services; npm downloads/build steps need target-compatible optional native binaries. Document Google authorized-origin/account setup as manual prerequisites, without creating cloud resources.
- Public client ID is a build-time frontend value; changing it requires rebuilding. DEV settings are not production configuration or bundled backend secrets.
- Keep production output static; do not add Dockerfiles, Compose, Caddy, TLS settings, reverse-proxy trust changes, or infrastructure.
- Real browser popup/FedCM behavior, actual Google account sign-in, target Linux ARM64 builds, and Caddy security headers/TLS cannot be certified by DOM mocks. Report separately what is and is not exercised. Never weaken backend CSRF/cookies to make local testing pass.

## Ordered batches

### 1. Clean frontend foundation

- [x] Scaffold and inspect the React/TypeScript package, pin approved dependencies, and remove only unused generated demo/lint files.
- [x] Add Tailwind, strict checks, package scripts, environment placeholders, frontend ignore rules, and validated development-proxy configuration.
- [x] Check clean install, dependency/platform metadata/audit, typecheck, and static build; verify secret/private DEV settings do not appear in built assets using disposable sentinel values.

### 2. Auth client and minimal localized view

- [x] Implement API/session controller, official SDK loader/button, and guarded async lifecycles.
- [x] Add minimal mobile-first view, English/Spanish dictionaries/selector, loading/errors/retry/logout, and pending-onboarding notice.
- [x] Test backend-confirmed login/logout/restore, unknown session failures, duplicate callbacks, mutation ambiguity/reconciliation, CSRF refresh/failures, stale reads/unmount, and SDK load/configuration failures with controlled fetch/SDK responses. No live credentials or runtime bypass.
- [x] Test browser-language priorities/fallback, manual switching without auth loss, translated errors, accessible controls/feedback, and StrictMode cleanup using DOM interaction tests.

### 3. Integration, documentation, and handoff

- [x] Exercise the actual Vite proxy with a controlled backend: relative `/api`, unchanged path/Origin, cookies, allowed-origin POST and rejected-origin POST. Verify busy-port failure rather than silent port fallback.
- [x] Run frontend clean install/typecheck/tests/build and backend regression tests. Smoke-test development/static output without modifying developer `.env`/database. Inspect diff/ignore rules and built assets.
- [x] If browser tooling is available, inspect narrow/mobile and desktop layout, keyboard flow, and absence of horizontal overflow. Actual live Google login is optional/manual with user-owned configuration; do not claim it passed from mocked tests.
- [x] Document exact setup and Google authorized origins, scripts, proxy/production differences, build-time configuration, security assumptions, dependency warnings, and verification limitations. Update `project.md`, checklists, and `MEMORY.md`.

## Approval gate

The user approved all batches, pinned dependencies/test-only DOM tooling, direct SDK integration, and in-memory language choice before implementation. No database/API/security-policy changes or material dependency substitutions were required. The pinned current scaffold generated Oxlint rather than ESLint; unused Oxlint configuration/dependency was removed under the same approved no-extra-lint-toolchain decision.

## Verification results

- Windows x64 / Node 24.19.0 / npm 11.17.0: clean `npm ci`, strict typecheck, production build, and **31 frontend tests** passed. Backend regressions: **172 passed, two POSIX skips**; backend source/contracts/schema were not changed.
- API/controller tests cover validation, fixed error mapping, relative URLs/cookies/CSRF, timeout/cancellation, duplicate callbacks, ambiguous mutation reconciliation without replay, rejected CSRF recovery, unknown-session lockout, and obsolete read/mutation results across unmount/StrictMode cleanup.
- DOM tests cover login/onboarding notice/logout, language switching/auth preservation, missing client ID without blocking restoration, translated safe errors, pending controls, SDK script failure/retry/timeout, initialization reuse, and inactive callbacks.
- Real Vite tests confirm preserved `/api`/Origin/cookies/CSRF, hostile-Origin rejection by the controlled upstream, no injected HTTPS forwarding, occupied-port failure, static build/preview, and exclusion of private environment sentinel values from production assets.
- Headless Chrome smoke exercised actual Vite plus the existing backend/auth/session store with isolated SQLite storage. Google SDK responses and verifier were test-controlled only. Login, reload restoration, logout, language switching, keyboard Tab/focus/Enter, and absence of horizontal overflow were verified. Reviewed screenshots at 375×812 and 1280×800 match the intended small dark panel/minimal UI; no visual reference was supplied. The one-off browser harness was removed after verification, not shipped as a runtime/test-auth endpoint.
- Live Google account/popup/FedCM, actual official-button rendering, Caddy TLS/security headers, non-Chrome browsers, and Linux ARM64 execution remain unverified. Google client configuration and live verification are manual next steps, not completed by test mocks.
- Lock metadata includes Linux ARM64 GNU/musl optional binaries for Rolldown 1.2.16, Tailwind Oxide 4.3.4, Lightning CSS 1.33.0, and esbuild 0.28.2. No source toolchain, optional canvas, or script-policy bypass was introduced. npm reported zero known vulnerabilities and an esbuild install-script-policy warning.
- Developer environment/database files were untouched; temporary storage/configuration supplied all checks. No infrastructure, game UI, onboarding mutations, or backend refactors were added.
