# Monster Girl Fusion

## Current reboot status

The current checkout implements only **feature 001: the minimal backend foundation**. It provides an independent Express/TypeScript package, health, JSON errors, validated PORT configuration, native development `.env` loading/watch mode, compiled startup, bounded shutdown, and automated tests. There is no implemented frontend, SQLite schema, authentication, session store, catalog importer, or gameplay API in this reboot.

Setup and verified behavior are documented in [`backend/README.md`](backend/README.md); acceptance/results are in [`specs/001-backend-foundation/`](specs/001-backend-foundation/). [`database.md`](database.md) is the newer planned schema design, not an implemented database.

The remaining document combines the intended product architecture with **historical pre-reboot implementation notes**. References below to features 002–007, installed frontend/auth/SQLite packages, migrations, explicit egg pools, or catalog snapshots do not describe current executable code or newly approved implementation. They need separate reconciliation when those features are planned; this foundation update does not recreate them.

## Purpose

Monster Girl Fusion is a mobile-first collection game where players obtain monster girls, send parties on expeditions, hatch eggs, and consume monsters in deterministic fusions to discover new and stronger species.

The project is a learning and portfolio project. The priority is a clear, working MVP rather than premature complexity. The central appeal is discovering fusion recipes and expanding the player's collection.

The owner is learning development. Being able to understand and explain the code is a core project requirement. Prefer fewer purposeful files and explicit code over architectural sophistication. A mechanism must be critically necessary for current approved functionality, security, or data integrity, not merely useful for hypothetical growth. Simplicity does not justify removing essential protections or putting unrelated features into one enormous file.

## Product Scope

### Core loop

1. The player signs in with Google.
2. A first-time player chooses a unique permanent username. Starter acquisition is a separate future step: eligible accounts will receive one instance of every starting species exactly once, independently of whether they already have a username.
3. The player sends a party of up to three available monsters on an expedition.
4. The server simulates the complete expedition and awards resources and eggs based on difficulty, progress, and party composition.
5. Dispatched monsters become tired and cannot join another expedition until their recovery time has elapsed.
6. The player manually hatches ready eggs when monster storage has capacity.
7. The player consumes pairs of compatible monsters to discover deterministic fusion results.
8. The player spends resources on account-wide capacity, speed, and progression upgrades.

### MVP screens

- Home and monster collection
- Fusion
- Eggs
- Expeditions
- Authentication and first-login username setup
- Language selection available from the player-facing application

### Non-goals

- PvP and other social features
- Password authentication and email verification
- Monster experience or levels
- Player-controlled actions during an expedition
- Persistent expedition history or replay
- Horizontal backend scaling for the initial SQLite deployment

## Game Model

### Monster species and owned monsters

A monster species is static catalog content. It defines:

- A stable identifier used for localized display data
- Tier from 1 through 6
- Type
- Aspect or ability identifier
- Base HP, ATK, SPD, and AIM
- A stable relative path or asset key for its frontend image
- Whether and how the species is obtainable

An owned monster is a distinct player-owned instance linked to a species. Monsters do not have experience or levels. Future hatched/fused acquisitions vary each stat independently by 20% below to 20% above its species base, then round up and persist integer stats. The random distribution and exact interpretation of post-rounding percentage boundaries remain acquisition-feature decisions; no rolling/acquisition code ships in foundation 006.

HP represents maximum combat HP. Current HP is temporary simulation state and is not persisted on the owned monster. Tired state is represented by a server timestamp so recovery does not depend on a running client timer.

Type names, the six-type weakness cycle, resource mappings, and the initial aspect catalog will be defined in the combat specification. Each type deals double damage to one type, takes double damage from another, and has a normal matchup against the remaining four.

### Acquisition and fusion

Starting species are lower-tier monsters that do not require fusion. Eligible accounts will receive one of every starting species exactly once. The starter feature must define durable grant tracking for both new accounts and existing accounts that already completed username setup; a username is not proof of a prior grant. No starter grants are implemented yet.

Fusion uses two different owned monsters. The input order is irrelevant, so A + B is the same recipe as B + A. Two monsters of the same species cannot be fused.

Valid recipes are deterministic and consume both input monsters to create one new owned monster. Multiple recipes may produce the same species. An invalid pair is rejected without consuming either input. Tired monsters may be consumed in fusion.

Fusion recipes belong in a separate catalog from monster species so that a species can have multiple input combinations. Fusion must execute in a database transaction to prevent duplicate requests from consuming or creating monsters more than once.

### Eggs

Each expedition difficulty awards a corresponding egg tier:

| Difficulty | Egg tier |
| --- | --- |
| Easy | 1 |
| Normal | 2 |
| Hard | 3 |
| Very Hard | 4 |

Each egg tier hatches from a defined pool of egg-exclusive monster species. These species have no fusion recipe.

Egg rewards accumulate fractionally during expedition reward calculation, but only whole eggs are added to inventory. For example, a calculated reward of 1.3 produces one egg, and the remaining 0.3 is discarded rather than carried into another expedition.

Eggs require server time to become ready and must be manually hatched. A ready egg cannot be hatched while the player is at monster capacity. Players may discard either incubating or ready eggs without receiving a monster. Any resource return for discarding an egg is a future balance decision.

Egg inventory has an account-wide maximum that can be upgraded. Hatching-speed upgrades apply when a new egg is obtained and do not alter the ready timestamp of existing eggs.

If egg storage is already full when expedition rewards are granted, the player receives no eggs. The expedition result must clearly report that the eggs were lost because storage was full.

### Resources and upgrades

The three resources are:

- Crystals
- Mushrooms
- Souls

Each monster type contributes one associated resource to expedition rewards. Every party member contributes independently, so sending two monsters associated with the same resource increases that resource's reward. Exact type mappings and formulas will be defined later.

Upgrades and unlocks may cost one, two, or all three resources. Upgrades are account-wide and include at least:

- Maximum owned monsters
- Maximum stored eggs
- Hatching speed
- Expedition difficulty unlocks

Costs, level limits, and effects are balance data to define in feature specifications rather than architectural constants.

## Expeditions and Combat

### Server authority

An expedition is a transactional server action. The client submits an ordered party of one to three owned monsters and a difficulty. The server validates ownership, tired state, party composition, capacity constraints, and unlocked difficulty before simulation.

The server then simulates every encounter, commits rewards and tired timestamps atomically, and returns an ordered event stream and summary. The client only renders and animates that already-decided result as if it were happening in real time. Skipping, closing, or slowing the animation cannot change the outcome.

Expedition records and combat logs are not persisted for the MVP. Consequently, a result animation cannot be recovered after its response is lost or the page is refreshed. A safe policy for network retries must be decided before implementing the expedition mutation so a lost response cannot cause accidental duplicate expeditions or rewards.

### Expedition progression

- A party contains one to three monsters.
- Each encounter contains one to three enemies according to difficulty and expedition progress.
- Enemies become harder as the party advances.
- Difficulty defines a maximum encounter count.
- Defeating the final encounter is a successful completed expedition.
- There is no retreat or player input after the expedition starts.
- Resources and eggs are calculated from completed progress, difficulty, and party composition.
- The expedition normally ends when all party members are knocked out.
- Every dispatched monster becomes tired, including survivors.
- Recovery duration is based on monster tier; higher tiers recover more slowly.

Enemy species are static catalog content with combat data, aspect identifiers, and stable frontend image references. Enemy instances exist only in memory during simulation and are never persisted.

### Encounter rules

- Every living combatant acts once per round in descending SPD order.
- When a monster and enemy have equal SPD, the monster acts first.
- A combatant knocked out before its turn does not act.
- Current HP, knocked-out state, and status effects carry between encounters.
- Status durations advance once per round.
- Healing cannot revive a knocked-out ally.
- A successful hit deals `ATK * type multiplier` damage with no random damage variance.
- Type advantage has a 2x multiplier; all other matchups have a 1x multiplier.
- AIM controls hit chance: AIM 0 hits 65% of the time and AIM 10 hits 95% of the time. Interpolation and bounds will be finalized in the combat specification.
- Each side targets living opponents using formation-biased weights: 50% for the first target, 35% for the second, and 15% for the third. Exact normalization when fewer than three targets remain will be finalized in the combat specification.
- Aspects may replace or modify normal actions and may use AIM. Monsters and enemies may share aspects, while some aspects may be enemy-only.

Each encounter needs a high round limit as a safety bound once healing and status effects exist. Reaching that limit should not silently advance the party. The exact limit and stalemate result remain combat-spec decisions.

The simulation engine should accept a controlled random source so hit checks, target selection, stat rolls, and SPD tie behavior can be tested deterministically. The production server remains the sole authority over randomness.

## Application Architecture

### Simplicity and readability policy

- Keep related behavior together and introduce separation only when it clearly improves understanding, actual reuse, or manageable file size. Do not create a file per helper, type, endpoint, or small component by default.
- Use descriptive names, normal multi-line conditionals, and one meaningful operation per line. Avoid nested ternaries, multiple statements on one line, and clever or compressed control flow. Optimize for a beginner following a user action through the code.
- Before adding files, layers, dependencies, or reliability mechanisms, explain their current necessity and the simpler alternative in plain language. Avoid generic frameworks, speculative extension points, and pass-through abstractions.
- Keep documentation focused on its purpose and link to the authoritative explanation instead of repeating detailed implementation history across documents.
- The organization below is the agreed direction for future work, not a claim that existing code already follows it. Reorganizing existing code or simplifying existing mechanisms requires a separately approved scope and verification that behavior, security, and player data remain protected.

### Frontend

The frontend is a React, Vite, TypeScript, and Tailwind CSS application. It is responsible for:

- Responsive mobile-first presentation
- Localized player-facing text
- API request state and user input
- Expedition playback and animation from server events
- Displaying server-provided inventory, timers, resources, and outcomes

The frontend must not calculate authoritative combat, rewards, timers, fusion results, upgrade costs, or capacity rules. API requests use relative `/api` URLs without environment-specific hostnames.

The desired page convention is one `.jsx` entry component per actual page under `frontend/src/pages/`. Page-specific components should normally live in that same file when this keeps the page understandable. A local component can likewise remain in an existing `.tsx` file. Extract a component only for real reuse or a clear readability benefit; do not build a component directory tree for small pieces used once. Do not create pages for unimplemented features.

Prefer local page state and straightforward request functions. Custom hooks, controller classes, global stores, and extra API abstraction layers require a demonstrated current need rather than being default scaffolding. Keep necessary request sequencing, error handling, and authentication protections even when reducing files.

The current application remains TypeScript/TSX. Adopting `.jsx` pages alongside it will require review of the compiler configuration and associated tests in a future approved implementation plan. This documentation does not convert existing files, remove TypeScript, or authorize changes to the backend language.

Local development will use Vite's development proxy to forward `/api` to the independently running backend, preserving the same browser-facing paths as production. The development proxy target is configurable through environment-based Vite configuration, not embedded in React code. Production does not depend on Vite's development server or proxy.

Vite builds static production assets suitable for serving through Caddy. Catalog image references should be stable relative paths or asset keys rather than database blobs or machine-specific filesystem paths.

The implemented `frontend/` is an independent npm package targeting Node 24.19+ within Node 24: React 19.3.1, Vite 8.3.6, TypeScript 6.0.3, and Tailwind 4.3.4. Features 004/005 supply one minimal authentication/username-setup view; game screens and starter grants are not implemented. Generated demo components/assets/styles and unused lint tooling were removed. Runtime packages are limited to React/React DOM; the official Google Identity Services SDK loads directly in the browser without a wrapper dependency.

Client calls use relative `/api` URLs. Development proxy settings are server-only `DEV_API_TARGET`/`DEV_PORT` (defaults localhost:3000/5173), with strict-port failure and unchanged request Origin/path/cookies. `VITE_GOOGLE_CLIENT_ID` is the sole intended public app configuration and must match the backend client ID. Secrets never enter browser configuration. Production output is static and does not depend on Vite's proxy/server. Setup, exact dependencies, tests, native build-tool compatibility, and remaining live-Google/platform checks are in `frontend/README.md`.

### Backend

The backend is an independent Express and TypeScript service; the reboot currently exposes only `GET /api/health`, with JSON 404/500 handling. As future features are implemented, it will own:

- Authentication and authorization
- Player onboarding
- Inventory and capacity enforcement
- Fusion validation and execution
- Egg timers and hatching
- Expedition simulation and rewards
- Tired recovery rules
- Resources, upgrades, and unlocks
- Database transactions and migrations

Routes should remain thin. Game rules should be organized separately from HTTP handling and separately from authentication. Mutations that consume inventory or award value must be transactional.

The desired backend organization uses three clearly named directories, grouped by relevant endpoint domain:

```text
backend/src/
  routes/         # HTTP paths, methods, and required middleware
  controllers/    # HTTP input, service calls, and HTTP responses
  services/       # Business operations, SQL, and transactions
```

For an implemented users domain, this might mean `routes/users.ts`, `controllers/users.ts`, and `services/users.ts`; monsters, eggs, and other domains follow the same pattern when implemented. These are examples, not instructions to create empty modules or move authentication under a misleading name. Prefer a file per relevant domain in each needed layer rather than a file per endpoint. Trivial endpoints such as health checks do not need three pass-through files.

Services do not depend on Express request/response objects. Keep domain-specific validation, helpers, types, and SQL in their owning module when practical. Do not add repositories, DTO layers, use-case classes, factories, or generic interfaces by default. Shared database startup/migrations and genuinely cross-cutting security/error handling may remain separate. The goal is a short, visible path from route to controller to business operation, not layers for their own sake.

The current foundation has only `src/app.ts` (HTTP behavior), `src/server.ts` (configuration/startup/shutdown), and `src/index.ts` (executable entry point). It does not create empty domain layers. Historical authentication/catalog implementations are absent from this reboot; reinstating them or adopting their persistence formats would require a separate approved scope.

The API should use a consistent JSON error shape and appropriate HTTP status codes. Exact endpoint contracts belong in feature specifications and plans, where affected consumers can be reviewed before implementation.

The implemented foundation is a standalone npm package targeting Node `>=24.19.0 <25`, with Express 5.3.0 and development-only TypeScript 7.0.2. Strict ESM/NodeNext compilation emits application source to `dist/`, excluding tests. Development uses Node's native TypeScript execution/watch mode and optional `.env` loading, without `tsx` or `dotenv`; process environment variables override file values. Compiled startup reads process environment only. Tests use Node's built-in runner/assertions and require a build first. Clean Windows installation, source-change restart in an isolated copy, and isolated compiled startup with runtime dependencies only are verified. Actual POSIX signals and Linux ARM64 remain unverified. Exact commands, contracts, dependency versions, native compiler requirements, and limits are in `backend/README.md` and `specs/001-backend-foundation/`.

### Persistence

The table-by-table reboot design is [`database.md`](database.md). It describes nine planned tables and unresolved decisions; none is implemented by feature 001, and the document does not authorize migrations by itself. The persistence implementation claims below are historical, not executable migrations in this checkout.

SQLite is the MVP database. The conceptual data model includes:

- Users
- Static monster species
- Fusion recipes
- Owned monsters
- Static enemy species
- Eggs
- Resource balances
- Account-wide upgrades and unlocks
- Sessions

There is no expedition-history table in the MVP. Static game catalogs must be reproducibly seeded or migrated. Exact schemas, indexes, constraints, and migration tooling require explicit review and approval in the relevant feature plan before implementation.

The implemented persistence foundation uses one synchronous `better-sqlite3` 12.11.1 application connection with foreign keys enabled, WAL journaling, FULL synchronization, and a 1,000 ms lock-wait timeout. The driver version was explicitly approved after v13.0.3 failed clean Windows installation without native build tools. Native transactions and parameter binding are reused directly; callbacks must be synchronous and short. No ORM or repository framework is introduced.

`DATABASE_PATH` selects the file. Development/test defaults to `backend/data/game.sqlite` with relative paths resolved against the backend package directory, independent of source/compiled execution and the shell working directory. Production requires an explicit absolute path in an existing writable directory; there is no fallback database. Storage cannot be inside `src/` or `dist/`.

Application schema contains `schema_migrations`, `users`, and `sessions`, with an expiration index on sessions. Approved migration 1 (`create_authentication_tables`) creates the two authentication tables/index atomically through the existing catalog. Explicitly imported TypeScript migrations compile with the application and run before HTTP startup; recorded versions/names/SQL hashes must match a catalog prefix. Initialization/listen failures release resources, and shutdown disposes the session timer after HTTP draining before closing the shared connection once. Exact schemas and operational details are in feature plans 002/003 and `backend/README.md`.

Approved migration 2 (`create_case_insensitive_username_index`) adds a partial unique index on non-NULL `users.username COLLATE NOCASE`, retaining migration 1/original UNIQUE constraint and preserving user/session data. Existing ASCII-case collisions stop migration/startup safely, with no silent renames/merges. Legacy out-of-policy names are preserved; new API assignments enforce ASCII rules. The exact index, data policy, and private diagnostic query are documented in feature 005 and `backend/README.md`.

Approved migration 3 (`create_monster_egg_foundation`) adds `monster_species`, `monsters`, `monster_recipe`, `egg_pool_species`, and `eggs`, plus six owner/foreign-key indexes. Type is TEXT, aspect nullable TEXT, species tier 1–6, egg tier 1–4, images are relative paths, stats/timestamps use safe integers (positive HP, nonnegative ATK/SPD/AIM). Canonically ordered distinct recipe parents form a composite primary key. Explicit pool membership defines eligible hatch species, not matching tier or the lack of recipes; pools cannot contain fusion-result species. No type/aspect/egg-definition/localization tables, acquisition flags, grants, or game UI are added. Exact SQL is in feature 006.

Catalog content is exclusively user-authored in two JSONs: nested species/recipes/bilingual text in `monsters.json`, and one to four supplied egg-tier images/timings/bilingual text/explicit pools in `eggs.json` (tier range 1–4). No made-up catalog or synthetic catalog fixtures are authorized. Under feature 007, the offline compiled/dev importer synchronizes the complete desired catalog: additions, definition updates, recipe/pool replacement, and safe omissions. It rejects inventory-referenced species/tier removals and never grants items or modifies accounts/sessions/owned instance values. Base-stat/timing edits affect future acquisitions, while shared species metadata and hatch pools update for existing inventory; dry-run reports changes and affected owned eggs. It uses one owned write connection to the same DB/catalog, not a second persistent store. See `backend/CATALOG.md` for recovery and operator requirements.

Egg timing/translations are published as a generated `${DATABASE_PATH}.catalog.snapshot.json` with a canonical SHA-256 digest, alongside the existing persistent DB. Exclusive `${DATABASE_PATH}.catalog.pending.json` staging and explicit same-input recovery handle interrupted SQL/file publication; SQL commit and filesystem rename are not claimed atomic together. Normal startup validates the active snapshot against DB species/recipes/pools, fails safely on pending/corrupt/mismatched states, and never seeds data. With empty catalogs and no snapshot, auth/username/health remain available and public `GET /api/catalog` returns no-store 503. When populated, this endpoint exposes bilingual display/egg timing metadata, not recipes, pools, private paths, players, or base stats. Existing auth UI does not fetch it.

The importer's dry-run inspects only an offline temporary copy (including WAL when present), verifies source fingerprints, and never opens the original target with SQLite or creates target SHM/WAL/snapshot files. Offline operation is mandatory; hashes are not a live-backup guarantee. Pending publication is a versioned journal holding prior/desired snapshots; active publication uses a short-lived same-directory temporary file and rename, retaining pending through final verification. Derived active/pending files must be backed up/restored consistently with the database; no new mount/service is needed. User-derived tier-1 import/update/inventory/recovery/localization tests now run in isolated storage. Full authored-input validity, actual player-database import, ARM64 and power-loss behavior are not implied by those tests. See `backend/CATALOG.md`.

The portfolio MVP uses **one SQLite database and one shared connection** for users, future game data, sessions, and migration history. `DATABASE_PATH` is the only database-path setting; do not add a separate session database, connection, migration catalog, or mount. The existing migration runner owns all table creation. The implemented session adapter borrows the application connection and owns only its operations/cleanup timer; startup/lifecycle closes the database once after request draining and adapter disposal, attempting close even if disposal fails.

This choice favors simple development, configuration, and backup/restore over isolating session-write churn. Keep session cleanup limited to expired session rows and transactions short. Separate storage is a future option only if measured load warrants it, not an MVP requirement. Persistent storage must cover the shared database's containing directory and journal/WAL sidecars, not just its main file. Rebuilding or replacing application code must not recreate or erase player/session data. Backups contain session data and must remain private. The initial production deployment uses one backend process because SQLite is not intended for horizontally scaled concurrent writers.

Sessions and authoritative player state must survive process restarts; Express's in-memory session store and other process-local essential state are not acceptable. Transient combat simulation state and disposable caches may remain in memory where their loss does not lose committed state or change an already committed outcome. This does not add expedition-history persistence to the MVP.

## Authentication

Authentication is Google-only: the backend uses `google-auth-library` 11.3.3 and `express-session` 1.19.0 with a small local `SQLiteSessionStore` borrowing the existing `better-sqlite3` connection. The user approved this replacement for `connect-sqlite3` after its lifecycle/error behavior was reviewed. The adapter implements get/set/destroy/touch, guarded callbacks/serialization, absolute expiration, and a cancellable 15-minute expired-row cleanup timer; it never opens/closes a database. Better Auth is not used. The backend API and minimal React/Google Identity Services UI are implemented; live Google account/popup integration remains unverified.

1. React obtains a Google ID token.
2. React sends the token to the Express authentication endpoint.
3. Express verifies its signature, issuer, audience, and expiry through `google-auth-library`.
4. The first verified login creates the user and begins username onboarding.
5. Subsequent logins reuse the user identified by the stable Google subject identifier.
6. After authentication and onboarding, protected routes authorize through `req.session.userId`.

The user record contains a UUID, unique Google subject, verified profile email (not a unique identity/linking key), nullable unique username, and creation timestamp. New authenticated accounts have no username and require username setup. Google authentication updates verified email for the same subject but never assigns a username or grants resources/monsters. Feature 005 implements permanent username-only setup, deliberately separate from future starter grants. Neither a non-null username nor `requiresOnboarding: false` proves any monster/resource grant. Future grants need independent approved durable eligibility/exactly-once tracking and must cover existing named accounts.

`POST /api/auth/username` accepts only a username, authorizes the session's internal account, and uses existing Origin/CSRF/HTTPS/body/error conventions. It trims surrounding whitespace and requires 3–20 ASCII letters/digits/underscores including one alphanumeric. A short immediate SQLite transaction re-reads the account and conditionally assigns only when NULL; the persistent NOCASE index handles cross-account collisions. Saved capitalization is preserved. Same-name resubmission confirms existing spelling; a different name cannot overwrite it. No extra dependencies or session-expiry changes. Existing `requireOnboarded` checks username completion only and must not stand in for future game-access/starter rules.

Sessions use persistent SQLite rows and the signed opaque `mgf.sid` cookie (host-only, path `/api`, HttpOnly, SameSite=Lax; always Secure in production). Login verifies Google signature/audience/issuer/expiry plus subject and verified-email claims, regenerates the SID and CSRF token, and awaits persistent save. Sessions default to seven-day absolute expiration configured by `SESSION_TTL_SECONDS`; reads do not extend the deadline. Anonymous CSRF sessions expire after 15 minutes. Logout deletes the stored session and clears the cookie.

`/api/auth/csrf`, `/api/auth/google`, `/api/auth/session`, and `/api/auth/logout` provide bootstrap/login/inspection/logout with no-store responses. State-changing auth requests require both an exact configured `APP_ORIGIN` and a server-side synchronizer token in `X-CSRF-Token`, including login CSRF protection. Google credentials and unnecessary profile data never enter sessions or logs. `requireAuthenticated` and `requireOnboarded` helpers perform current-user checks for future routes; no protected game endpoint is implemented. Health stays public and bypasses session/database access.

`GOOGLE_CLIENT_ID` and a stable randomly generated 64-hex-character `SESSION_SECRET` are required at service startup, including local development. Google client secrets/service accounts are not needed. Outbound certificate fetching has a five-second aborting timeout with retries disabled; verification transport failures fail closed. Accounts and session saving use separate short operations, not a SQL transaction across asynchronous verification/callbacks; retries reuse any already-created account.

Authentication code must remain separate from game logic. The application stores no passwords and performs no email verification of its own.

The frontend restores session state before showing sign-in controls and treats failed inspection as unknown, not anonymous. Its official Google button uses popup/callback sign-in without One Tap or automatic selection. Each deliberate login/logout gets a fresh CSRF token. Duplicate submissions and obsolete callbacks are guarded, and ambiguous mutation failures trigger a read-only session reconciliation rather than automatic mutation replay. Credentials/tokens are never persisted in browser storage or URLs. Following the approved readability refactor, `App.tsx` owns local session/pending/error state and explicit restore/sign-in/sign-out/username actions; page-only components live alongside it. The controller class, subscription hook, and separate page-only component/helper files were removed. HTTP requests and Google SDK integration remain separate purposeful modules; no language, dependency, backend, or storage change was introduced. Earlier headless Chrome checks used temporary storage and controlled Google dependencies; the refactor is checked through rendered-page/HTTP/proxy/build tests, not newly certified live Google sign-in.

## Localization

All player-facing text supports English and Spanish. Code, identifiers, logs, database names, and API contracts remain in English.

The frontend selects its initial language from browser preferences, defaults to English for unsupported languages, and allows manual switching. React components must use translation keys rather than hardcoded player-facing strings. Catalog records should expose stable identifiers so names and descriptions can be translated without embedding one language into game rules.

Feature 004 implements a typed English/Spanish dictionary (`frontend/src/i18n.ts`) and React-local language state without an i18n dependency. It chooses the first supported browser preference (including regional tags), otherwise English; manual switching updates labels/document language/title without losing auth state. Manual choice is intentionally memory-only and resets on reload for this feature. Persisting it in localStorage or across devices remains a future decision. Google's own dialogs may follow Google/browser language preferences.

Feature 006 keeps species/egg names and optional descriptions in the two user-authored JSONs, not English display columns/translation tables or duplicate hand-maintained frontend rosters. The validated snapshot/read endpoint supplies both languages; `frontend/src/catalog/` validates the response and selects localized display records by stable ID/tier for future screens. Missing entries are unavailable-data errors, not fabricated text or raw identifiers shown as names. Type/aspect labels/behavior require separately supplied definitions before display/use; usernames are never translated.

## Deployment and Operations

The production target is an Oracle Cloud Linux ARM64 VM running containers managed by Docker Compose, with Caddy as the public reverse proxy. This is an application compatibility target, not authorization to create infrastructure.

The intended shape is:

- Caddy serves the built frontend static files.
- Caddy terminates public HTTPS and proxies `/api` requests to the Express backend without stripping the `/api` prefix. The backend can serve internal HTTP without managing public TLS certificates.
- The backend runs independently from the Vite development server.
- The shared SQLite database directory, including sidecar files, lives on persistent mounted storage, not a container's writable layer. One persistent database mount is sufficient; session storage adds no mount or service.

Environment variables provide deployment-specific configuration, including Google client IDs, session secrets, cookie settings, the sole `DATABASE_PATH`, port, and runtime environment. Secrets must never be committed or exposed through Vite except for values explicitly safe for browser use.

Express reverse-proxy trust is disabled by default and configured only through explicit IP/CIDR entries in `TRUST_PROXY_CIDRS`; unconditional trust, hop counts, aliases, and `/0` are rejected. Production auth endpoints require secure protocol detection, supporting HTTPS termination at a narrowly trusted proxy without weakening production cookies for local HTTP development. The trusted proxy must replace untrusted forwarded headers, and backend exposure must not bypass that boundary. `APP_ORIGIN` is configured independently of Host/forwarded headers. No Caddy/network configuration has been added or tested; runtime safeguards do not constitute deployment infrastructure.

Runtime dependencies and build tooling must support Linux ARM64 and the chosen Node version. Do not assume Windows-installed dependencies or native binaries can be copied into production. Compatibility evidence is recorded in `backend/README.md`: Node 24 SQLite prebuilds exist for Linux ARM64, but actual target execution remains unverified. Auth packages add no native runtime driver; the session adapter reuses the installed one. Clean Windows and isolated production-only auth installs are verified with local signing keys/controlled certificates. Actual Google/browser integration, Caddy TLS, and POSIX signal delivery remain unverified. Deprecated prebuild-install/node-domexception and install-script policy warnings are recorded maintenance caveats; no script bypass was added.

Backend requirements include:

- Reproducible startup and database migrations
- A lightweight health-check endpoint
- Bounded graceful shutdown on `SIGTERM` and `SIGINT`, stopping new requests and draining active work before closing database/session resources when those exist
- No hardcoded local or production URLs
- No machine-specific filesystem paths or platform-specific startup assumptions
- Recovery-safe database transactions

Dockerfiles, Compose files, Caddy configuration, and Oracle Cloud resources will be introduced only through an explicitly approved infrastructure plan. Application code should remain deployable in this target environment from the beginning.

## Testing Strategy

Testing should prioritize authoritative game rules and high-value user flows:

- Unit tests for recipes, stat generation, hit checks, targeting, turn order, status duration, and reward calculations
- Deterministic combat tests using a controlled random source
- Database integration tests for onboarding, fusion transactions, capacity enforcement, resource spending, and timers
- API tests for authentication requirements and validation failures
- Frontend tests for critical state transitions and localized rendering where practical
- Production build verification for frontend and backend

Each feature plan must identify its relevant tests and report what was actually run.

## Open Decisions

The following decisions are intentionally deferred rather than assumed:

- Type names, weakness order, and resource mapping
- Aspect name, initial abilities, and detailed status rules
- Starting-monster stat generation
- Stat-roll distribution and rounding
- AIM interpolation and bounds (to be done in combat feature)
- Target-weight normalization after knockouts (to be done in combat feature)
- Same-side SPD tie ordering (to be done in combat feature)
- Encounter round limit and stalemate outcome  (to be done in combat feature)
- Enemy progression and encounter composition formulas  (to be done in combat feature)
- Resource and egg reward formulas
- Egg hatch durations and discard compensation
- Upgrade costs, effects, and maximum levels
- Safe retry behavior for an expedition response lost after commit
- Persistence of the player's language preference (probably localStorage)
