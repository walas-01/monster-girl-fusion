# MonsterFusion frontend

Feature 003 is complete: a standalone React/TypeScript/Vite/Tailwind foundation with a provisional English/Spanish view. It is not a login screen or game interface, requires no backend to render and makes no automatic API calls.

## Requirements and installation

- Node `>=24.19.0 <25` and npm `>=12.2.2 <13`, verified with Node 24.19.0/npm 12.2.2 on Windows x64.
- React/React DOM 19.3.1, Vite 8.3.8, plugin-react 6.3.0, TypeScript 6.0.3 and Tailwind/Vite plugin 4.3.5. Direct versions are exact; package-lock.json records the dependency tree.
- Install for the machine where the tools run. Vite's Rolldown/Oxc and Tailwind's Oxide use platform-specific native packages. Do not copy Windows node_modules to Linux. Linux ARM64 install/build has not been executed here.

From the repository root:

```sh
cd frontend
npx --yes npm@12.2.2 ci
```

All remaining commands run from frontend/. `ci` replaces this package's node_modules, uses the lockfile and does not update dependency versions. The pinned invocation avoids changing global npm; packageManager alone does not switch the installed tool. Registry access is needed when packages/tooling are not cached. Frontend installation does not install or migrate the backend.

npm 12 blocks unapproved dependency install scripts. No frontend script exception was needed for verification. Review future requirements individually; do not blanket-approve scripts or copy the backend's SQLite policy into this package.

## Development and configuration

```sh
npx --yes npm@12.2.2 run dev
```

Vite binds locally by default, uses port 5173 and fails instead of silently changing ports. Source edits update the page through HMR. Optional local configuration is documented in [.env.example](.env.example); copy it only if you have no .env, and never overwrite existing local settings. Real .env files are ignored by Git. Restart Vite after changing configuration.

| Variable | Default | Purpose |
| --- | --- | --- |
| DEV_PORT | 5173 | Development port; must represent an integer from 1 through 65535. Occupied ports fail. |
| DEV_API_TARGET | http://localhost:3000 | Target of the development /api proxy. |

Vite reads these DEV_ settings in its server configuration; process environment values override file values. They are not browser API-base URLs or bundled configuration. Do not put secrets in VITE_ variables: those are public client configuration. This feature needs no Google credentials, session secret or frontend database setting.

The backend runs separately; see [its README](../backend/README.md) for setup, build and storage rules. Start it only with an understood DATABASE_PATH: normal backend startup initializes/migrates that database. No backend is needed for the provisional view. For manual proxy verification with the backend running, request http://localhost:5173/api/health (adjust ports/target as configured); expected JSON is `{ "status": "ok" }`.

The development proxy preserves /api paths, query strings, Origin, Host and cookies. It does not rewrite paths or enable changeOrigin. Future browser requests must use relative /api URLs, not hardcoded backend hosts. There is no API-client module or health widget yet, and health does not authenticate users or check ongoing database integrity.

## Checks, build and preview

```sh
npx --yes npm@12.2.2 run typecheck
npx --yes npm@12.2.2 run lint
npx --yes npm@12.2.2 test
npx --yes npm@12.2.2 run build
npx --yes npm@12.2.2 run preview
```

- Typecheck uses the existing browser/tool TypeScript project references with strict checking and no emitted application code. Build runs typecheck before Vite and emits static files to dist/.
- ESLint checks React Hooks/refresh and requires explicit function parameters and return types, including callbacks; explicit any is an error. The deprecated typedef rule is deliberately retained for the user's learning convention. Revisit it before a major typescript-eslint upgrade; no custom lint rule or type-aware lint framework was added.
- The Node test runner runs 25 tests: 22 localization checks using fake browser/storage objects and three lint compatibility regressions. No DOM framework or real player/browser data is used.
- Preview serves dist locally, normally on port 4173, with strict conflict failure and no API proxy. It is a build check, **not a production server**. Production must serve the static files and independently route /api to the backend. No Docker/Caddy/cloud configuration was created.

## File organization and localization

| File | Responsibility |
| --- | --- |
| src/main.tsx | Mount React in StrictMode and import global CSS. |
| src/App.tsx | Provisional heading/message, labelled native language selector and local language state. |
| src/i18n.ts | Typed English-keyed en/es text and initialization/save helpers. |
| src/index.css | Tailwind import, small dark global base and visible focus. |
| tests/i18n.test.mjs | Language resolution, storage failure/persistence and dictionary tests. |
| tests/lint.test.mjs | Source/config glob discovery, nested TSX rules/output ignores and explicit-type enforcement after the security override. |
| vite.config.ts | React/Tailwind plugins, server-only environment configuration, dev proxy and strict ports. |

Demo App.css/imports/global template styles were removed. User icons, favicon and MonsterFusion branding were preserved. ESLint and all three TypeScript configs remain useful tooling. Tailwind uses its Vite plugin; no extra PostCSS/tailwind configuration, router, store, UI library, request hooks or empty page/component folders were added.

A valid saved en/es value under localStorage key monster-girl.language wins over ordered browser preferences (including regional tags/case), then English. An empty browser preference list uses navigator.language. Only manual selection writes this preference. Document lang and localized title follow the choice without reload. Storage getter/read/write failures do not prevent startup or switching. No player state or credentials are stored, and there is no account synchronization. Catalog species names remain separate from interface text.

Future real pages can use TSX entries with their exclusive components kept together; extract shared components only for actual reuse/readability. Add concrete fetch functions in api.ts only when approved endpoints have real consumers. Keep JSX attributes together on one line, except a long Tailwind className may be placed separately, following the user's readability preference.

## Verification and limits

Verified on **2026-11-12, Windows x64, Node 24.19.0/npm 12.2.2**:

- Fresh isolated ci installed 171 packages/audited 178; typecheck, lint, all **22 tests (zero failures/skips)** and build passed. Manifest/lock remained byte-identical; the working installation was not replaced. No install-script exception or native compilation was required.
- Fresh browser contexts checked English/Spanish, regional/saved/fallback preferences, reload persistence, document lang/title, blocked storage, keyboard/focus and 360px mobile/desktop layout. No page/console errors or automatic /api requests; screenshots inspected. This is not a final-screen design approval.
- Static preview loaded compiled assets, not source/Vite's dev client; styles, language selection and persistence worked without a backend. Actual development HMR applied and exactly restored a temporary copied-source edit without document reload or lost language state. Configuration defaults, file/process priority, invalid values and occupied dev/preview ports were checked.
- The actual compiled backend and actual Vite configuration returned matching direct/proxied health 200 JSON and proxied JSON 404. An observer on the real backend verified unchanged path/query/Origin/Host/synthetic cookie, no session cookie or Express fingerprint. This was a controlled HTTP integration check, not an automatic React request or login/session test.
- Tests used dedicated temporary storage/configuration. Owned processes/connections were closed, ports checked closed and temporary packages/databases removed; workspace application/configuration/real .env fingerprints stayed unchanged. Real backend closure used exported shutdown(), not Windows forced termination. Technical reports/screenshots remain outside the repository.

### Security follow-up: minimatch

The original ten moderate findings all traced to [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): crafted glob patterns could consume excessive CPU/memory in minimatch 10.2.6. This was development lint tooling, not a runtime React dependency.

Registry checks on 2026-11-12 found that the latest ESLint 10.14.0 and typescript-eslint 8.72.2 still require affected minimatch versions. After the major-version compatibility risk was explained and tested, the user approved three narrow, version-specific overrides: ESLint 10.14.0, @eslint/config-array 0.23.5 and @typescript-eslint/typescript-estree 8.72.2 use **minimatch 11.0.8**. No direct tool version was changed, no lint rule was removed, and no audit force fix/global setting was used.

The generated lock changes only minimatch and adds its required @isaacs/nonrecursive-glob-match dependency. Candidate install/repeated clean ci and workspace audit report **zero vulnerabilities** at check time. Lint, typecheck/build and all **25 tests (zero failures/skips)** pass; new regressions exercise file discovery, configuration matching, generated-output ignores and explicit-type diagnostics. This tests the project's current use, not every upstream API or a permanent security guarantee.

These overrides intentionally cross minimatch's major-version range and are pinned to the current parent versions. Review them when upgrading ESLint/typescript-eslint/config-array; remove them once supported upstream ranges resolve safely, then repeat clean installation, audit and lint regression checks. Do not assume the override applies to a new parent version or silently replace it with a blanket override. Actual Linux ARM64 execution remains unverified.

Not verified: Linux ARM64 native installation/build, real POSIX signal delivery, production HTTPS/Caddy/cookies, Google authentication, or deployment. No production infrastructure or authoritative player behavior is part of this feature. Full scope and per-batch evidence are in [the spec](../specs/003-frontend-foundation/spec.md) and [plan](../specs/003-frontend-foundation/plan.md).
