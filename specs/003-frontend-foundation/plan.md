# 003 — Frontend Foundation Implementation Plan

**Status:** all three batches complete (2026-11-12). The user approved implementation incrementally and final closure. A subsequent explicitly approved minimatch security follow-up now passes audit with zero vulnerabilities and 25 tests; direct tool versions/rules remain unchanged. Clean installation, static preview, development/HMR and real-backend proxy checks passed; current documentation is reconciled. Platform/override maintenance limits remain documented. Earlier per-batch pending/audit notes below are historical snapshots.

**UI references:** not required for the provisional technical view. Final game screens/navigation need separate visual review.

## 1. Observed starting point

- The user already initialized React/TypeScript with Vite. Extend this package; do not run the generator again or overwrite the scaffold wholesale.
- `App.tsx` has a named `App` export returning an empty fragment, an unused `useState` import and an import of demo `App.css`. `main.tsx` still expects a default export. Align the import with the user's named export; keep StrictMode.
- `index.css` and `App.css` still contain template layout/counter/promotion styles. No Vite/React logo files remain in the inspected asset directories.
- `index.html` already has the user's title `MonsterFusion` and favicon `/icons/mon_icon1.png`. Preserve these, along with all existing images in `public/icons/` and `src/assets/mon_icon1.png`. An unused user asset is not automatically disposable template content.
- Tailwind is not installed. Vite currently configures only the React plugin; there is no API proxy or adopted frontend environment configuration.
- ESLint and its configuration exist. The three TypeScript configs separate browser code, Node-based Vite configuration, and project references. Neither child config explicitly enables `strict`.
- Backend feature 002 is complete; the backend exposes health but no authentication/gameplay endpoints. Its real `.env` and storage must remain untouched.

These are inspection findings, not a build/lint result. No frontend checks or installations were run to prepare this plan.

## 2. Recommended organization

Create only files needed by this feature:

```text
frontend/
  public/icons/          Existing user assets; preserve
  src/
    assets/             Existing user asset; preserve
    main.tsx            Mount React, import the global stylesheet
    App.tsx             Provisional view, language state and UI events
    i18n.ts             en/es text, Language type and language/storage helpers
    index.css           Tailwind import and a small global base
  tests/
    i18n.test.mjs        Node-run tests of the TypeScript localization module
  index.html            Existing title/favicon, root element and entry script
  vite.config.ts        React/Tailwind plugins, development port and API proxy
  tsconfig*.json        Existing browser/tool configuration and references
  eslint.config.js      Existing lint/React Hooks checks
  .env.example          Only the adopted development variables
  package.json
  package-lock.json
  README.md
```

### Why these separations

- `App.tsx` is enough for one provisional view. The language selector can stay in this file: extracting a component used once would add navigation through files without reducing meaningful complexity.
- `i18n.ts` keeps player text and deterministic language selection separate from JSX, and makes those rules testable without a browser or React test framework. Keeping everything in App would be smaller in file count but harder to read/test. Use one typed dictionary module now, not one file per label/language/helper.
- `index.css` is already the global entry. Add Tailwind there and replace the template base rather than adding a second stylesheet/configuration layer. `App.css` becomes unnecessary.
- `tests/i18n.test.mjs` uses Node 24's test runner and native TypeScript loading to import the dependency-free `i18n.ts`. JavaScript is limited to this small test harness; application files stay TypeScript/TSX. No Vitest, jsdom or React testing library is needed for these pure/storage checks. Browser checks cover React integration.

### When actual pages and API consumers exist — guidance, not files to create now

- Add one `.tsx` file per real page under `src/pages/`. Keep its small exclusive components/types beside the page code, often in the same file. Do not convert to JSX or introduce a router until navigation requires it.
- Add `src/components/` only for actual reusable UI or a component whose extraction materially improves reading. A shared button is not mandatory merely because it might be reused later.
- Start API operations in **`src/api.ts`**, with concrete named functions such as `getCurrentUser` or `getMonsters`, only after those endpoints/contracts exist. Use native `fetch` and relative `/api/...` URLs. A single file is easier to trace than `api client → service → hook → controller` for the same request. Split by domain only when size or independent consumers justify it; do not create both an aggregate wrapper and domain wrappers by default.
- API functions handle transport, HTTP status and parsing; they do not import React, manipulate UI state or contain authoritative game rules. Keep response types with the operations until actual sharing warrants extraction. Translate player-visible errors in the UI from stable error categories, not by displaying arbitrary server/network exception text.
- Pages own loading/error/data state and call these functions from events or a necessary effect. Pass an AbortSignal when cancellation is needed and prevent stale responses/unmounted updates. No global store, automatic retries, generic request framework, Axios, controller classes or custom request hooks for hypothetical needs.
- Small request logic used once could remain beside a page, but a concrete `api.ts` is the recommended first separation when real endpoints arrive, because it clearly separates transport from presentation without extra layers. **This foundation creates no API module and makes no automatic API calls.** Health is exercised by verification tools, not a permanent diagnostic screen.

## 3. Files to clean up and configuration to retain

| Action | Reason / smallest alternative |
| --- | --- |
| Remove `src/App.css` and its import after replacing the demo | Its contents only style template features; Tailwind plus the existing global CSS suffice. |
| Replace template contents of `src/index.css` | Remove example widths, counters, promotional selectors and light/dark demo variables, not the stylesheet entry itself. |
| Remove unused demo imports; align App's named import/export | Fix the observed mismatch without undoing the user's component choice. |
| Preserve all user icons/images and HTML branding | They are user additions, not generator logos. No blanket asset deletion or empty-directory cleanup. |
| Keep `vite.config.ts` and `@vitejs/plugin-react` | They provide development/build integration and React refresh; add Tailwind/proxy here, not another tool layer. |
| Keep all three `tsconfig` files | Browser code and Node config have different libraries/globals. Merging saves filenames but complicates the environment boundary. Enable explicit strict checking in both child configs. |
| Keep ESLint config, dependencies and lint script | Already present; Hooks/refresh rules catch issues typechecking does not. Removing it is possible, but loses these checks for little gain. No extra lint/style tooling. |
| Replace generator README with project instructions | Record actual commands, retained tooling, assets, environment, independent backend operation and verification limits. |
| Retain package/lock/gitignore/index/main | Required project infrastructure, not disposable demonstration. Ensure `.env` is ignored without ignoring `.env.example`; do not create/overwrite real `.env`. |

No other deletion is authorized by this list. If an unfamiliar/customized file appears during implementation, inspect it before changing it.

### Authorized learning-focused lint adjustment

The user requested explicit parameter and return types to practice TypeScript, and selected **all parameters and returns**, including callbacks, after the deprecation trade-off was explained. Implemented directly in the existing eslint.config.js, without dependencies or unrelated source fixes:

- `@typescript-eslint/typedef`: require annotations on regular and arrow-function parameters, including destructuring/rest/default-value parameters. Do not require annotations on every local variable.
- `@typescript-eslint/explicit-function-return-type`: require returns on functions/components/callbacks; disable exemptions for contextually typed expressions, higher-order functions and direct const-assertion arrows. Use `void` when nothing is returned and `Promise<T>` for async functions.
- `@typescript-eslint/no-explicit-any`: explicitly retain an error for `any` (already included in the recommended preset), so it is not an escape hatch for the exercise.

`typedef` is deprecated upstream but supported by the installed version. This was explicitly accepted for learning; review replacement/removal before a future major typescript-eslint upgrade. No custom lint rule or extra dependency is introduced. TypeScript `strict` remains part of batch 1, not a claim that linting alone enables strict compiler checks. Inline callbacks now need their own signatures even if a variable/event context already supplies a type. Existing user code is not automatically rewritten to satisfy the rules.

Verification of this scoped adjustment: the installed ESLint API rejected 11 in-memory negative cases covering omitted parameters/returns, callback and return exemptions, default/destructured/rest parameters and explicit any; fully annotated regular/arrow/async/void examples passed. Full lint reports one existing unused `useState` import in App.tsx; it was not auto-fixed. No build/typecheck was run for this config-only change and no full-foundation completion is claimed.

## 4. Dependencies and commands

Observed exact versions from the **current lockfile**, not merely package ranges:

| Package | Planned version | Treatment |
| --- | --- | --- |
| react / react-dom | 19.3.1 | Keep; pin manifest to existing resolution. |
| vite | 8.3.8 | Keep current locked version (manifest currently starts at ^8.3.6). |
| @vitejs/plugin-react | 6.3.0 | Keep current locked version (manifest currently starts at ^6.1.2). |
| typescript | 6.0.3 | Keep frontend version; no backend TypeScript migration. |
| @types/node | 24.19.2 | Keep. |
| @types/react / @types/react-dom | 19.3.0 | Keep. |
| tailwindcss / @tailwindcss/vite | 4.3.5 | Added as exact development dependencies; Vite 8 integration and clean install/build verified in batch 3. |
| Existing ESLint packages | Current lockfile resolutions | Keep and pin existing direct resolutions; no speculative upgrade/replacement. |

Target Node `>=24.19.0 <25` and npm `>=12.2.2 <13`, recording `packageManager: npm@12.2.2` for consistency with the backend. This changes only the future frontend manifest, not global npm. Invoke through `npx --yes npm@12.2.2` when the global tool differs.

npm 12 blocks unapproved dependency install scripts. Do **not** copy the backend's SQLite deny entry into the frontend or blanket-approve scripts. Review any required build-tool scripts reported by a clean install before proposing a narrowly scoped approval; stop if a new policy decision is necessary. Native optional packages can still be required even when no lifecycle script runs.

Proposed package scripts:

- `dev`: Vite development server.
- `typecheck`: `tsc -b`, using the retained noEmit project configurations; incremental metadata remains under node_modules.
- `build`: run typecheck, then Vite build, preserving the existing typecheck-before-build guarantee.
- `lint`: existing ESLint command.
- `test`: `node --test tests/i18n.test.mjs`.
- `preview`: Vite's local build preview, not production hosting.

Integrate Tailwind through `@tailwindcss/vite` and `@import "tailwindcss"` in index.css. No `tailwind.config.js`, PostCSS config, separate PostCSS/autoprefixer packages, component library, router or i18n dependency is needed for the chosen setup.

## 5. Localization and provisional view

- Use an English-keyed typed en/es dictionary; require matching keys at typecheck time. Keep species names out of it.
- Keep the `Language` value in App local state. Derive active text from it; do not store a second synchronized text object or introduce a provider/store/custom hook.
- A small initialization helper reads a valid saved `en`/`es` value from `localStorage` key `monster-girl.language`; otherwise inspect ordered `navigator.languages` (navigator.language fallback), accepting regional forms, and fall back to English. Invalid saved values are ignored. Storage access failures must not block startup or manual switching.
- Initialize once; synchronize document language and localized title with the selected language. Keep the existing `MonsterFusion` branding. Save a manual selection through guarded storage access; no account synchronization or cross-tab listener is required.
- Render only a heading, preparation message and explicitly labelled language control. Use semantic HTML, system fonts, a small dark/purple-pink base, visible focus and responsive spacing. No fake resource counts, navigation, login, monster cards or final game composition.

## 6. Environment, proxy and deployment impact

| Area | Planned effect / limit |
| --- | --- |
| Development variables | `.env.example` documents `DEV_PORT=5173` and `DEV_API_TARGET=http://localhost:3000`. Read through Vite loadEnv with the `DEV_` prefix; process environment wins. Do not expose these through `VITE_`, define substitutions, or an empty client envPrefix. |
| Port behavior | `server.strictPort: true`; an explicitly configured port must be an integer 1–65535, otherwise fail clearly. Absent value uses 5173; no custom generic environment validator. Keep preview local on its normal port with strict conflict failure; CLI can select its port. |
| Proxy | Forward `/api` unchanged to the configured target, without path/Origin/cookie rewriting or enabling changeOrigin. No CORS/backend modifications; no browser base-URL variable. Let the proxy library report malformed target configuration rather than adding speculative URL validation. |
| API/schema/secrets | No contract, route, schema, migration, authentication/session/CSRF or backend-source changes. No new secrets or Google variables. |
| Persistent storage | Only a browser UI-language preference. No authoritative player state, database file or new server volume. Backend verification uses temporary absolute storage with an existing parent, never the real .env/default DB. |
| Services/ports | Existing separate Vite/backend processes; no root workspace orchestration, worker or service. Dev port remains private/local by default; no host-all exposure configuration. |
| Build/start | npm clean install, typecheck/lint/tests, Vite static dist. Preview is local validation only; production must route /api independently of Vite. No preview proxy is relied on. |
| Native/Linux ARM64 | Vite 8 uses Rolldown/Oxc; Tailwind uses Oxide. Target-specific native optional dependencies must install on the target platform. Node engine/peer metadata is compatible with the selected Node/Vite, but actual Linux ARM64 install/build/runtime is not verified. Do not copy Windows node_modules. Missing prebuild/source-build needs must be reported and reviewed. |
| Proxy/HTTPS/cookies | No production proxy trust/HTTPS/cookie changes. Preserving dev request paths/Origin is not proof of future login/session integration. |
| Docker/cloud | No Dockerfile, Compose, Caddy, VM, firewall or production resource changes. The approved future shape remains static frontend assets plus independent /api backend behind Caddy. |

## 7. Implementation batches — after approval

### Batch 1 — Preserve and simplify the existing package

- [x] Recheck diffs/assets and keep the user's changes. Record/pin actual existing resolutions and approved Node/npm requirements; add Tailwind 4.3.5/plugin and synchronize lock without unrelated upgrades.
- [x] Align named App import/export, remove only App.css/demo imports, replace global demo CSS and keep HTML branding/user assets.
- [x] Retain/reactivate lint and strict browser/tool typechecking; add the typecheck script and keep build checking types. Configure React/Tailwind, private dev server, strict ports and the environment-driven /api proxy. Add .env.example without touching real .env.
- [x] Verify typecheck, lint, build and dev startup, plus a Tailwind utility taking effect. Inspect dependency/script/native warnings; if installation requires a new policy approval, stop and explain it.

Batch 1 results (2026-11-12, Windows x64 / Node 24.19.0 / npm 12.2.2):

- Rechecked the user scaffold: main.tsx already had the correct named import, and src/assets had been removed independently before this batch. Preserved both changes; all public icons and index.html retained byte-identical hashes. Removed only the demo App.css and unused useState/import. App remains an empty main shell with the `min-h-svh` utility; no player text, i18n or API requests were introduced.
- Pinned every existing direct dependency to its actual current lock resolution, including globals 17.14.0 and typescript-eslint 8.72.2. Added Tailwind/plugin 4.3.5 using npm 12.2.2; every existing lock package version remained unchanged. Install added 17 packages on this host, with no install-script/native-build warnings and no new allowScripts policy. Retained ESLint/StrictMode/three tsconfigs and enabled strict in both child configs. Added typecheck; build runs it before Vite. Root gitignore already protects frontend .env while allowing .env.example, so no ignore changes were needed.
- Configured loadEnv with DEV_ prefix, default/configurable port/target and strict port conflict behavior. No client envPrefix/define exposure or path/Origin/cookie rewriting. Preview explicitly uses an empty proxy because Vite otherwise inherits server.proxy; preview is not a production/API proxy.
- Lint and build (including typecheck) pass. Configuration checks passed for defaults/private host/strict ports, no preview proxy, generated .env values and process priority, seven invalid port values, and preserved explicit-parameter/return lint enforcement. An actual second Vite CLI invocation failed on the occupied configured port instead of switching.
- Browser check against the actual Vite CLI passed: React mounts, title is MonsterFusion, main height equals viewport height via Tailwind, global dark background applies, no API requests or console errors. Screenshot captured in the tool output directory. This deliberately empty batch-1 shell has no final visual reference to compare. Owned server tree stopped, port checked closed and generated env fixture removed; technical script/reports remain in approved temp storage at `frontend-batch1-LlpN50`.
- Audit reports **10 moderate findings**, propagated from existing minimatch 10.2.6 in development lint tooling (the same version was in the starting lock). Runtime-only `npm audit --omit=dev` reports zero vulnerabilities at check time. No audit fix/force, tool downgrades, unrelated upgrades or transitive overrides were applied. These development-tool findings remain unresolved and need separate dependency review.
- No clean-install reproducibility claim yet: isolated ci, preview/HMR/full mobile-localization checks and real-backend proxy integration belong to batches 2–3. Linux ARM64/native target support remains unverified. No real .env, backend/database, production infrastructure or user images were changed; no commit was created.

### Batch 2 — Small localized foundation view

- [x] Add i18n.ts, language helpers and typed dictionaries. Implement the provisional accessible view/local state, saved preference, document lang/title and manual control without API calls.
- [x] Add dependency-free Node tests for saved-value priority, invalid/absent values, browser preference ordering, regional/case variants, English fallback and storage read/write failures. Use fake storage rather than editing the user's browser data in unit tests.
- [x] Verify typecheck/lint/tests/build; in browser check en/es switching, reload persistence, document language/title, mobile 360px and desktop, keyboard/focus, no horizontal overflow and no API requests. Use a fresh test browser context; report console/network errors. No final-screen reference comparison is implied.

Batch 2 results (2026-11-12, Windows x64 / Node 24.19.0 / npm 12.2.2):

- Added only src/i18n.ts and tests/i18n.test.mjs as planned, plus the package test script. No dependency installation, lockfile/configuration/backend/API/production changes. Typed dictionaries require the same English-keyed text shape in both languages; App keeps one local language state and derives the active dictionary. All function/callback signatures in TypeScript remain explicit.
- Initial detection reads a valid exact en/es value from monster-girl.language, then ordered browser preferences (case-insensitive regional tags), then English; an empty navigator.languages uses navigator.language. Detection does not write storage. Only a manual selection saves the language. A try/catch covers both the storage getter and its read/write operations; unavailable storage still permits normal UI use. An effect synchronizes document lang and localized title, keeping MonsterFusion branding.
- Lint and build (including typecheck) pass; **22 Node tests passed, zero skipped/failed**. Tests use a disposable fake window/storage, restore the original global descriptor after each test and never touch real browser/player storage. Coverage includes saved priority, absent/invalid values, ordered/regional/case preferences, fallback, no initial write, manual persistence, getter/read/write errors and dictionary text completeness.
- Browser checks in six fresh contexts passed: English desktop 1280x800, Spanish regional mobile 360x800, invalid saved/unsupported fallback, saved-English override of Spanish browser, blocked storage getter and failed storage writes. Verified keyboard Tab/visible focus/arrow-key selection, changes in both directions, document lang/title, reload persistence, no mobile horizontal overflow, no console/page errors and **zero /api requests**, with the backend unavailable. Desktop/mobile screenshots were inspected; this is a small technical view, not a final game screen or approved navigation design.
- All fresh contexts closed; owned Vite tree stopped and port checked closed. Browser screenshots/log/snapshot moved out of the workspace to approved temp reports at `frontend-batch2-zFyTEe`. No user images, index.html, real .env or backend storage changed; no commit. Existing development-tool audit warnings from batch 1 were not addressed or re-audited here. Clean ci, build preview/HMR and real-backend proxy checks remain batch 3; Linux ARM64 remains unverified.

### Batch 3 — Reproducibility, integration and handoff

- [x] In an isolated package copy, run clean pinned npm ci, typecheck, lint, tests and build. Do not replace the user's working node_modules for this check. Verify no manifest/lock changes from ci and report actual vulnerabilities/warnings, not permanent guarantees.
- [x] Serve the built dist through local preview and check rendering/style/language persistence without backend.
- [x] Verify actual development HMR after a temporary source edit and exact restoration in the isolated copy, plus occupied-port failure, defaults and environment overrides.
- [x] Start the already-built real backend with a dedicated temporary DATABASE_PATH and available port, no real .env or dependency reinstall. Through the Vite dev origin, verify `/api/health` status/body and unchanged path. If only a stub is feasible, label it and leave real integration unverified. Stop/wait for owned processes and close storage before deleting fixtures; forced Windows cleanup is not evidence of POSIX graceful shutdown.
- [x] Replace frontend README, update scoped current frontend/localization status in project.md and spec/plan/MEMORY with actual outcomes and limits. Review diffs; no automatic commit or production infrastructure work.

Partial batch-3 results (2026-11-12, Windows x64 / Node 24.19.0 / npm 12.2.2): the user limited this increment to the first three steps of the explanation, not the original third checkbox (real backend). No application/configuration/dependency files were changed in the workspace and no backend was started. Only this progress record and memory were updated; final README/project/spec reconciliation is still pending.

- A fresh temporary package copied source/tests/public/config/package files, not workspace node_modules, dist or real .env. Clean pinned ci installed 171 packages/audited 178; typecheck, lint, **22 tests (zero failures/skips)** and build passed. Copied manifest/lock remained byte-identical to the workspace. No install-script exception, native compilation or install warnings beyond the known audit report. Audit again reports ten moderate development-tool findings; omit-dev audit reports zero at check time. No forced dependency changes.
- Actual preview served compiled assets from dist, with no source/Vite development client. English/Spanish selection, localized title/lang, persistence after reload, Tailwind/global styles and 360px mobile/1280px desktop checks passed in a fresh browser context. Screenshots inspected, no overflow/errors/API requests. Backend remained unavailable.
- Defaults/private host/strict ports, generated temporary .env and process-environment priority, six invalid port values and actual port override were checked. Both actual dev and preview CLI invocations rejected an occupied configured port with exit 1. Copied App's heading utility was changed then restored byte-for-byte: browser HMR updated and restored its computed color without reloading the document or losing Spanish state. No workspace source edit or new test framework.
- Workspace frontend files (including any real environment file) retained their initial fingerprints. Owned dev/preview process trees stopped, both ports checked closed, browser contexts closed; copied package/dependencies/generated .env removed. Technical scripts/reports/screenshots remain outside the repository at `frontend-batch3-checks-MklNwu`. Real-backend proxy integration, final documentation cleanup, Linux ARM64 and production behavior are not verified by these checks.

Real-backend proxy step (subsequently authorized, 2026-11-12, Windows x64 / Node 24.19.0): used the existing compiled backend's startServer and the real Vite configuration, with process DEV_PORT/DEV_API_TARGET overrides, production-mode absolute temporary DATABASE_PATH and existing parent. Both applications were started through their actual exported lifecycle APIs; no stub, source changes, build, dependency installation or real .env loading. Current source/compiled migration definitions matched.

Direct backend and proxied `/api/health?probe=unchanged` returned 200 with `{ "status": "ok" }`. An observer on the real backend listener verified the unchanged /api path/query, frontend Origin/Host and synthetic test cookie. The unknown proxied /api route returned the real backend's JSON 404; health had no Set-Cookie or X-Powered-By. These were controlled HTTP requests through the Vite origin, not a new automatic API call in React or authentication/session/CSRF verification.

Closed Vite through close() and the backend through its normal exported shutdown(), then checked both ports closed. A readonly inspector verified migration versions 1/2 and all eight domain tables empty, closed its connection, and the dedicated DB directory was removed. Frontend/backend file fingerprints (including dist and any real .env, excluding node_modules caches) stayed unchanged. Technical script/report retained outside the repository at `frontend-proxy-real-P1lXSw`. No backend/player data or production infrastructure changes. Only plan/memory progress recorded; final README/project/spec cleanup remains pending. Linux ARM64, POSIX signal delivery and production HTTPS/proxy behavior remain unverified.

Final closure (explicitly authorized): replaced the generator README with actual pinned commands, configuration, independent backend operation, static-build/preview distinction, file layout/localization, native tooling caveats and complete verification/maintenance limits. Reconciled current project/spec/plan/memory, leaving unrelated historical implementation notes labelled rather than rewriting them. Re-ran current frontend lint, all 22 tests (zero failures/skips) and build/typecheck successfully; checked documentation differences/links. No application/configuration/dependency/real .env/backend/production files were changed for this documentation step (only ignored frontend build outputs were regenerated). User JSX formatting/annotations/styles were preserved; no commit created.

## 8. Approval record

The user authorized batches 1 and 2, then each verification increment and final closure of batch 3. The following choices are implemented:

1. Reuse the existing scaffold and user icons; delete only demo App.css/imports and replace demo global styles.
2. Keep the three TypeScript configs, StrictMode and existing ESLint; enable explicit strict checking rather than stripping useful checks.
3. Add only Tailwind/plugin and small localization tests; keep state/selector in App and put localization in i18n.ts.
4. Use the dependency versions, Node/npm target and two server-only DEV_ variables above. Any required dependency-script exception needs separate review.
5. No API client file/pages/component hierarchy now; adopt the simple concrete api.ts/page organization when real approved consumers exist.

All batches are closed. Next work requires a separately agreed scope; no automatic authentication/game screen/dependency/production changes.

## 9. Authorized security follow-up — minimatch overrides

The user urgently requested fixing the ten audit alerts. Registry checks found no newer corrective ESLint or typescript-eslint release: latest ESLint 10.14.0, @eslint/js 10.0.1 and typescript-eslint 8.72.2 still require vulnerable minimatch 10.x. Explained that minimatch 11 removes APIs/changes matching behavior and that forcing it outside parent ranges needs compatibility checks. After a disposable candidate reached zero audit findings and passed existing checks, the user explicitly selected **Apply correction** for three narrow overrides:

- eslint@10.14.0 → minimatch 11.0.8
- @eslint/config-array@0.23.5 → minimatch 11.0.8
- @typescript-eslint/typescript-estree@8.72.2 → minimatch 11.0.8

Updated manifest and lock to match npm's generated candidate, then updated the working installation without ci/resetting the user's node_modules. Direct tool versions remain pinned/unchanged; no lint suppression, force downgrade, new script approval or backend/application/real .env/infrastructure change. The lock only replaces minimatch 10.2.6 and adds @isaacs/nonrecursive-glob-match 1.1.0, which its new implementation requires.

Added tests/lint.test.mjs (using existing ESLint/Node APIs, no new test framework) and included it in the test script. Three regressions check current source/Vite file discovery via brace/globstar patterns, nested TSX configuration plus dist ignore, and real diagnostics for missing parameter/return annotations or explicit any. This makes a silent loss of lint coverage visible; no wrappers or replacement matcher were added.

Verification: candidate install and repeated clean ci **172 packages/audited 179, zero vulnerabilities**; workspace npm install and full audit JSON **zero vulnerabilities**; npm ls confirms all three consumers resolve minimatch 11.0.8. Workspace lint/build (including typecheck) pass, and **25 tests pass / zero failures/skips** in both workspace and clean candidate. No native/script warnings. No full upstream compatibility or Linux ARM64 claim. Remove/review these version-specific overrides as parent dependencies gain supported patched ranges or change versions; repeat clean ci/audit/regressions then. Previous ten-warning results are historical, not the current state. Changes remain uncommitted.
