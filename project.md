# Monster Girl Fusion

## Purpose

Monster Girl Fusion is a mobile-first collection game where players obtain monster girls, send parties on expeditions, hatch eggs, and consume monsters in deterministic fusions to discover new and stronger species.

The project is a learning and portfolio project. The priority is a clear, working MVP rather than premature complexity. The central appeal is discovering fusion recipes and expanding the player's collection.

## Product Scope

### Core loop

1. The player signs in with Google.
2. A first-time player chooses a unique username and receives one instance of every starting species.
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

An owned monster is a distinct player-owned instance linked to a species. Monsters do not have experience or levels. Hatched and fused monsters roll each stat independently within 20% below or above the species base stat, and the rolled values are persisted. The exact random distribution, numeric representation, and rounding rule will be defined with the monster acquisition feature.

HP represents maximum combat HP. Current HP is temporary simulation state and is not persisted on the owned monster. Tired state is represented by a server timestamp so recovery does not depend on a running client timer.

Type names, the six-type weakness cycle, resource mappings, and the initial aspect catalog will be defined in the combat specification. Each type deals double damage to one type, takes double damage from another, and has a normal matchup against the remaining four.

### Acquisition and fusion

Starting species are lower-tier monsters that do not require fusion. A first-time account receives one of every starting species.

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

### Frontend

The frontend is a React, Vite, TypeScript, and Tailwind CSS application. It is responsible for:

- Responsive mobile-first presentation
- Localized player-facing text
- API request state and user input
- Expedition playback and animation from server events
- Displaying server-provided inventory, timers, resources, and outcomes

The frontend must not calculate authoritative combat, rewards, timers, fusion results, upgrade costs, or capacity rules. API requests use relative `/api` URLs without environment-specific hostnames.

Vite builds static production assets suitable for serving through Caddy. Catalog image references should be stable relative paths or asset keys rather than database blobs or machine-specific filesystem paths.

### Backend

The backend is an independent Express and TypeScript service exposing REST endpoints under `/api`. It owns:

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

The API should use a consistent JSON error shape and appropriate HTTP status codes. Exact endpoint contracts belong in feature specifications and plans, where affected consumers can be reviewed before implementation.

### Persistence

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

Game data and session data should use configurable database paths. Separate SQLite files for game data and session storage are preferred to isolate session churn, while both remain on persistent storage. The initial production deployment uses one backend process because SQLite is not intended for horizontally scaled concurrent writers.

## Authentication

Authentication is Google-only and uses Google Identity Services in React, `google-auth-library` in Express, `express-session`, and `connect-sqlite3`. Better Auth is not used.

1. React obtains a Google ID token.
2. React sends the token to the Express authentication endpoint.
3. Express verifies its signature, issuer, audience, and expiry through `google-auth-library`.
4. The first verified login creates the user and begins username onboarding.
5. Subsequent logins reuse the user identified by the stable Google subject identifier.
6. After authentication and onboarding, protected routes authorize through `req.session.userId`.

The user record contains an internal ID, unique Google ID, email, unique username, and creation timestamp. The username is chosen during first login and is not editable in the MVP. Initial monsters must be granted exactly once as part of safe onboarding.

Sessions use persistent SQLite storage and secure HttpOnly cookies. Login regenerates the session to prevent fixation. Production cookies require HTTPS and suitable `Secure` and `SameSite` settings. The application supports persistent login, explicit expiration, and logout. State-changing routes require CSRF protection; the concrete origin-check or token strategy will be selected during authentication planning.

Authentication code must remain separate from game logic. The application stores no passwords and performs no email verification of its own.

## Localization

All player-facing text supports English and Spanish. Code, identifiers, logs, database names, and API contracts remain in English.

The frontend selects its initial language from browser preferences, defaults to English for unsupported languages, and allows manual switching. React components must use translation keys rather than hardcoded player-facing strings. Catalog records should expose stable identifiers so names and descriptions can be translated without embedding one language into game rules.

The persistence behavior for a player's manual language choice will be decided with the localization feature. It may begin as browser-local state unless cross-device persistence is required.

## Deployment and Operations

The production target is an Oracle Cloud Linux VM running Docker containers with Caddy as the public reverse proxy.

The intended shape is:

- Caddy serves the built frontend static files.
- Caddy proxies `/api` requests to the Express backend.
- The backend runs independently from the Vite development server.
- SQLite game and session files live on persistent mounted storage, not a container's writable layer.

Environment variables provide deployment-specific configuration, including Google client IDs, session secrets, cookie settings, database paths, port, and runtime environment. Secrets must never be committed or exposed through Vite except for values explicitly safe for browser use.

Backend requirements include:

- Reproducible startup and database migrations
- A lightweight health-check endpoint
- Graceful shutdown on container termination
- No hardcoded local or production URLs
- Recovery-safe database transactions

Docker, Caddy, and Oracle-specific files will be introduced only through an explicitly approved infrastructure plan. Application code should remain deployable in this target environment from the beginning.

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
- AIM interpolation and bounds
- Target-weight normalization after knockouts
- Same-side SPD tie ordering
- Encounter round limit and stalemate outcome
- Enemy progression and encounter composition formulas
- Resource and egg reward formulas
- Egg hatch durations and discard compensation
- Upgrade costs, effects, and maximum levels
- Safe retry behavior for an expedition response lost after commit
- CSRF implementation details
- Persistence of the player's language preference
