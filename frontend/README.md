# Frontend

Minimal React 19 / TypeScript / Vite 8 application with Tailwind CSS. Requires Node 24.19+ within Node 24 and npm. One view covers Google authentication/session status and permanent username setup. All game screens/starter rewards remain future features.

## Local setup

1. From `frontend/`, run `npm ci`.
2. If you do not already have `frontend/.env`, copy `.env.example` to `.env`. Do not overwrite existing settings. Set `VITE_GOOGLE_CLIENT_ID` to your Google **web application** client ID, matching backend `GOOGLE_CLIENT_ID`.
3. Configure/start the backend independently following [`../backend/README.md`](../backend/README.md). It needs its own Google client ID, stable private `SESSION_SECRET`, and `APP_ORIGIN=http://localhost:5173` for the default frontend origin.
4. Run `npm run dev` in `frontend/` and open **http://localhost:5173**. Start the backend in another terminal with `npm run dev` from `backend/`.

Use an existing Google Cloud web OAuth client or configure one manually in Google Cloud's authentication/client settings. Add `http://localhost:5173` to its **Authorized JavaScript origins** (including the correct scheme/port; no path). Follow Google's consent-screen/test-user requirements for your application's publishing status. The popup/callback integration does not require adding an application redirect route here. No Google resources are created by this repository.

The Google client ID is public, not a client secret. Never put `SESSION_SECRET`, a Google client secret, service-account material, or the backend `.env` in the frontend. Vite embeds `VITE_` values into browser assets; any such value must be safe for public disclosure.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | None | Public web client ID, embedded at build time; restart dev/rebuild production after changing. |
| `DEV_API_TARGET` | `http://localhost:3000` | Server-only development proxy target: one HTTP(S) origin, without credentials/path/query/fragment. |
| `DEV_PORT` | `5173` | Server-only integer port from 1 through 65535. Vite fails if occupied instead of silently changing origin. |

Vite reads optional `.env`/mode files; existing process environment values take precedence. All are ignored by Git except `.env.example`. No developer environment files are created or changed by tests.

Keep the browser URL, backend `APP_ORIGIN`, and Google authorized JavaScript origin aligned. `localhost` and `127.0.0.1` are different origins; opening the backend port directly is not the frontend flow. Nondefault frontend ports must be authorized in both backend and Google settings. Missing/invalid client-ID configuration blocks only new sign-in; existing session inspection/logout still work.

React uses relative `/api` requests and same-origin credentials. The development proxy preserves `/api`, browser Origin, cookies, and CSRF headers; it neither rewrites hostile origins nor fakes HTTPS/trusted forwarding. Do not solve origin failures by loosening backend security or adding permissive CORS.

## Commands

Run from `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked dependencies for this machine/architecture. |
| `npm run dev` | Run the localhost Vite development server with API proxy. |
| `npm run typecheck` | Check strict application/config TypeScript projects. |
| `npm test` | Run Node tests with tsx and a test-only DOM; no Google credentials/network calls needed. |
| `npm run build` | Typecheck and produce static `dist/` assets. |
| `npm run preview` | Inspect built static assets locally, not a production server or supported API deployment. |

Production serves `dist/` and proxies `/api` from the same HTTPS public origin using the future Caddy deployment. It does **not** use Vite's dev server/proxy or need a frontend Node runtime. Build-time development settings are not a replacement for deployment configuration. No Docker/Compose/Caddy files or cloud resources are included. Actual proxy/security headers, Google's popup/FedCM/browser policies, and production HTTPS still need deployment review.

## Behavior and boundaries

- On load, inspect the backend session before showing authentication controls. Failed inspection means **unknown**, not signed out; retry performs only a read.
- The official Google Identity Services button opens Google's popup and delivers an ID credential to the backend. No One Tap/automatic login, access-token flow, or frontend JWT-based authorization is implemented.
- Login/logout obtain a fresh synchronizer token before each deliberate mutation. The backend alone confirms authentication and owns HttpOnly cookies. Requests and SDK loading are bounded by ten-second timeouts.
- Pending operations prevent duplicate actions. On a failed/ambiguous mutation, recheck the session; never automatically replay the mutation. If rechecking fails, block new mutations until a read-only retry succeeds. A timed-out request may still have committed on the server.
- Google credentials and CSRF values stay in short-lived request memory, never browser storage, URLs, or logs. The app never reads the session cookie. Logout ends the current app session, not Google or other devices.
- Accounts with no username see a localized one-field setup form, format/permanence guidance, and inline invalid/taken feedback. Names use 3–20 ASCII letters/digits/underscores with at least one alphanumeric, trim surrounding whitespace, and ignore capitalization for uniqueness while retaining saved display spelling. The backend alone validates/reserves the name permanently.
- Username save uses a fresh CSRF token and the existing controller's pending/duplicate guards. The form, logout, and language controls are disabled during a mutation. A draft survives recoverable errors, language switches, and unknown-state reconciliation, but is hidden while identity is unknown and cleared after confirmed logout, account change, or completion. No browser-storage persistence.
- Lost save responses or another-tab completion are resolved by inspecting the session, never automatically replaying a save or overwriting an existing name. `requiresOnboarding: false` means username completion only: no starter rewards/inventory are created, and future starter eligibility must be tracked independently.
- English/Spanish strings live in `src/i18n.ts`, with typed English keys, first-supported browser preference detection, English fallback, and manual selection. Document language/title update with selection; auth state is retained. Language preference is intentionally memory-only and resets on reload. Google's own dialog may follow Google/browser language preferences.
- SDK/configuration/API failures show fixed localized feedback; raw server or Google diagnostics are not rendered. A blocked Google script can be retried. Google initialization is reused across StrictMode effect cleanup and locale rerenders.

## Layout and code

One small mobile-first dark panel contains the title, language selector, sign-in or account status, and logout/retry controls. No UI/component/router/state-management library, demo counter/logos, artwork, extra fonts, or game screens.

- `src/auth/api.ts`: relative API requests, timeout, response validation, and safe errors.
- `src/auth/controller.ts`, `useAuth.ts`: per-view async sequencing/cancellation and React subscription; no app-wide state framework.
- `src/auth/username.ts`, `UsernameForm.tsx`: client-side validation help and minimal accessible form. Server validation remains authoritative; boundary tests mirror its rules.
- `src/auth/google.ts`, `GoogleSignInButton.tsx`: direct official SDK loading, callbacks, and button lifecycle.
- `src/config.ts`: public client-ID validation; `main.tsx` is the Vite environment boundary.
- `src/i18n.ts`, `App.tsx`, `styles.css`: localization, minimal accessible view, and Tailwind styles.
- `tests/`: API/controller/DOM tests plus real Vite proxy/static-build checks. `register.mjs` selects the app JSX transform explicitly for the Node test runner. DOM tests do not execute Google's real SDK.

## Dependency/platform verification

Exact approved versions are in `package.json`/lockfile. TypeScript 6.0.3 and Node 24 declarations match the backend rather than introducing TypeScript 7. React/React DOM are the only runtime package dependencies. Test-only jsdom 31 requires Node >=24.15 within Node 24; optional canvas is not installed. Testing Library verifies rendered user-facing states without adding a browser framework.

Vite 8.3.6 uses Rolldown 1.2.16; Tailwind 4.3.4 uses Oxide 4.3.4 and Lightning CSS 1.33.0. The locked dependency metadata includes Linux ARM64 GNU/musl binaries for these native **build** tools and esbuild 0.28.2. Actual Linux ARM64 execution/system libraries remain unverified. Install on the target platform; never copy Windows node_modules. Stop/review if a native install needs a compiler or a dependency change instead of installing tooling or bypassing scripts silently.

Verified on Windows x64 / Node 24.19.0 / npm 11.17.0:

- Feature 004 clean `npm ci` remains the dependency baseline (feature 005 adds no packages). Current strict typecheck, production build, and **44 frontend tests** pass. Backend: **194 passed, three skips** (two Windows/POSIX and occupied default port 3000).
- Tests cover relative API/cookies/CSRF, malformed responses, timeout/abort, session recovery, duplicate callbacks, StrictMode/unmounts, SDK failure/retry, localized controls, actual Vite Origin/cookie forwarding, occupied-port failure, static preview, and private-environment sentinel exclusion from production assets.
- Headless Chrome exercised the actual Vite + backend with isolated temporary SQLite storage: keyboard focus/activation, login, reload restoration, EN/ES switching, and logout. Narrow/mobile (375×812) and desktop (1280×800) screenshots were reviewed; no horizontal overflow. Google SDK and verification were controlled test dependencies; no fake-auth path exists in application code.
- Live Google account/popup/FedCM integration, actual official-button rendering, Caddy TLS/security headers, Linux ARM64, and non-Chrome browsers remain unverified. Local mocked-browser success is not live Google sign-in certification.
- Feature 005 headless Chrome checks exercised real Vite/backend with temporary SQLite: username save/local validation, keyboard focus/submit, backend restart/reload, two-account case conflict, retained draft across EN/ES switching, and logout/login with stable IDs. Mobile 375×812 and desktop 1280×900 screenshots were reviewed. Google identity responses were controlled test dependencies; no live accounts or developer database were used.
- npm reported zero known vulnerabilities and an existing-style warning about esbuild's install script lacking an explicit allowScripts policy. No script-policy bypass, compiler installation, or optional canvas dependency was added.

Before public deployment, complete live Google/browser verification and frontend/proxy security review (including CSP, throttling, and popup-compatible headers). Those are not supplied by this minimal authentication feature.
