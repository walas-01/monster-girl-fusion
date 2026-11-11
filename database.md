# Database Design — Monster Girl Fusion

## Status and scope

This document describes the agreed database design for the project reboot. The minimal HTTP backend (feature 001) is implemented and `frontend/` remains empty, but these tables are **planned, not implemented or verified in a local database**. The proposed persistence scope is in `specs/002-database-foundation/spec.md`, pending approval.

The design favors a small number of explicit tables. Exact SQL, initial values, balance rules, migrations, and existing-player handling still need review before implementation. Historical implementation details in `project.md` and `MEMORY.md` are not evidence of executable code in this checkout.

## 1. General rules

- Use one SQLite database for accounts, sessions, catalog data, inventory, and progression.
- Use English identifiers. Player-facing text supports English and Spanish.
- Use UUIDs for players and owned items, and stable identifiers for species.
- Store resource balances, purchased levels, actual monster stats, and absolute deadlines. Derive capacities, readiness, and tired state instead of storing duplicate values.
- Store integer quantities within JavaScript's safe integer range. Resource balances, levels, and deadlines must not be negative; maximum HP must be positive.
- Use UTC Unix milliseconds for timestamps. Convert catalog durations to milliseconds safely when creating eggs.
- The backend authorizes ownership and controls game rules, randomness, costs, and rewards. Browser values are never authoritative.
- Use short transactions for related changes. Do not keep a transaction open during external requests or client animations.
- Use foreign keys to prevent deleting referenced users or species. Account deletion requires an explicit workflow; do not add automatic cascading deletion by default.

## 2. Table overview

Nine tables are planned:

| Table | Responsibility |
| --- | --- |
| `users` | Google identity, permanent username, and three resource balances. |
| `player_progress` | Purchased upgrade levels, difficulty progression, and starter-grant marker. |
| `sessions` | Persistent authentication and anonymous CSRF sessions. |
| `monster_species` | Shared species definitions and base stats. |
| `enemy_species` | Shared enemy definitions and the difficulty where each species appears. |
| `monsters` | Individual player-owned monsters and their actual stats. |
| `monster_recipes` | Valid species-level fusion inputs and results. |
| `eggs` | Individual player-owned eggs and readiness deadlines. |
| `schema_migrations` | Applied schema versions. |

There are no separate resource, egg-definition, egg-pool, type, aspect, or upgrade-definition tables. See the rules below for where those responsibilities live.

## 3. Tables

### `users`

One row per Google-linked player. Three fixed resource balances do not require another table.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `id` | TEXT, primary key | Internal player UUID. |
| `google_id` | TEXT, unique, required | Stable Google subject used to identify the account. |
| `email` | TEXT, required | Verified profile email; not an account-linking key. |
| `username` | TEXT, nullable | Permanent display name; NULL before username setup. |
| `crystals` | INTEGER, required | Nonnegative safe integer balance. |
| `mushrooms` | INTEGER, required | Nonnegative safe integer balance. |
| `souls` | INTEGER, required | Nonnegative safe integer balance. |
| `created_at` | INTEGER, required | Account-creation timestamp. |

Usernames are case-insensitively unique. Application validation trims surrounding whitespace and accepts 3–20 ASCII letters, digits, and underscores, including at least one letter or digit. Once assigned, a username cannot be changed through the normal application.

Starting resource balances remain undecided. Awards and purchases must prevent overflow and negative balances. Do not duplicate balances in progression, sessions, or browser storage.

### `player_progress`

One row per initialized player. Separating this small group keeps account data distinct from game progression without creating a table for every upgrade.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `user_id` | TEXT, primary key and foreign key to `users.id` | Player owning this progression record. |
| `monster_capacity_level` | INTEGER, required | Purchased monster-storage level. |
| `egg_capacity_level` | INTEGER, required | Purchased egg-storage level. |
| `incubation_speed_level` | INTEGER, required | Purchased incubation-speed level. |
| `highest_expedition_difficulty` | INTEGER, required | Highest unlocked difficulty under sequential progression. |
| `starters_granted_at` | INTEGER, nullable | Timestamp of completed starter distribution; NULL before the grant. |

`user_id` is sufficient as the primary key: no separate progression ID or duplicate owner index is needed.

Store purchased levels, not calculated capacities or timing multipliers. Costs, maximum levels, unlock requirements, and level effects belong in backend game definitions. Their exact values and initial progression remain undecided.

Starter creation and `starters_granted_at` must commit together. Recheck the marker inside the transaction. A username is not proof of starter delivery, and consuming starters must not make the player eligible again. Changing the starter roster must not silently regrant it to existing players.

The implementation plan must define when this row is created, how game access handles missing progression, and how any existing accounts are initialized without resetting inventory or granting twice.

### `sessions`

Persistent sessions survive backend restarts and may represent either an authenticated player or anonymous CSRF bootstrap.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `sid` | TEXT, primary key | Opaque session identifier. |
| `expires_at` | INTEGER, required | Absolute expiration timestamp. |
| `data` | TEXT, required | Validated serialized session JSON. |

Index `expires_at` for expired-session cleanup. The browser receives a signed opaque HttpOnly cookie, not the stored JSON.

An authenticated session contains the internal user ID, not balances, inventory, Google credentials, or unnecessary profile information. The session's JSON user reference is not a SQL foreign key; authorization must verify the current account. Reads must not silently extend an absolute session deadline.

### `monster_species`

One row per shared species definition, not per owned monster.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `id` | TEXT, primary key | Stable species identifier. |
| `tier` | INTEGER, required | Species tier, from 1 through 6. |
| `type` | TEXT, required | Type identifier. |
| `aspect` | TEXT, nullable | Ability identifier, or NULL. |
| `base_hp` | INTEGER, required | Positive base maximum HP. |
| `base_atk` | INTEGER, required | Nonnegative base attack. |
| `base_spd` | INTEGER, required | Nonnegative base speed. |
| `base_aim` | INTEGER, required | Nonnegative base AIM. |
| `image_path` | TEXT, required | Portable relative frontend asset path. |

No `egg_tier`, `is_egg_obtainable`, or stored egg pool is needed: egg eligibility follows the rule in section 4. No `is_starter` column is proposed; the initial roster must be explicitly defined in backend game configuration.

Type and aspect identifiers do not require lookup tables just to store their names. Their behavior and localized labels belong in approved game definitions and display data.

Species names and optional descriptions are bilingual catalog data, not single-language database columns. The reboot's catalog authoring and loading workflow remains to be specified; this document does not require the historical snapshot/import system.

### `enemy_species`

One row per enemy species definition. Each species appears in exactly one expedition difficulty; this does not require a difficulty-membership table.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `id` | TEXT, primary key | Stable enemy species identifier. |
| `difficulty` | INTEGER, required | Expedition difficulty where this species can appear. |
| `type` | TEXT, required | Type identifier from the shared backend definitions. |
| `aspect` | TEXT, nullable | Ability identifier, or NULL. |
| `base_hp` | INTEGER, required | Positive base maximum HP. |
| `base_atk` | INTEGER, required | Nonnegative base attack. |
| `base_spd` | INTEGER, required | Nonnegative base speed. |
| `base_aim` | INTEGER, required | Nonnegative base AIM. |
| `image_path` | TEXT, required | Portable relative frontend asset path. |

Use the same difficulty identifiers as `player_progress.highest_expedition_difficulty`; their exact numeric encoding remains to be defined. Filter enemy selection by `difficulty`. No enemy `tier` is proposed: difficulty classifies availability, while backend rules determine encounter selection and any stat scaling as the expedition advances.

Names and optional descriptions belong in bilingual catalog/display definitions, as with monster species. Validate type/aspect identifiers against backend definitions; no type or aspect foreign-key tables are required.

There is no `enemies` instance table. Each encounter creates enemies in server memory from these definitions. Actual combat HP, scaled stats, targets, and status effects exist only for the simulation. Enemy definitions have no player owner and do not participate in fusion recipes or egg eligibility.

### `monsters`

One row per owned instance. A player may own multiple monsters of the same species.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `id` | TEXT, primary key | Instance UUID. |
| `user_id` | TEXT, required, foreign key to `users.id` | Owner. |
| `species_id` | TEXT, required, foreign key to `monster_species.id` | Shared species definition. |
| `max_hp` | INTEGER, required | Actual maximum HP. |
| `atk` | INTEGER, required | Actual attack. |
| `spd` | INTEGER, required | Actual speed. |
| `aim` | INTEGER, required | Actual AIM. |
| `tired_until` | INTEGER, required | Recovery deadline; 0 means no recovery pending. |
| `created_at` | INTEGER, required | Acquisition timestamp. |

Index `user_id` for collection queries and `species_id` for referenced-species checks.

Actual stats are generated once on acquisition and stored, rather than recalculated whenever base stats change. Hatched/fused monsters use independently varied stats with upward rounding; exact distribution, rounding boundaries, and starter stats still need approval.

Do not store level, experience, current combat HP, or an `is_tired` flag. Recovery is derived from server time and `tired_until`; combat HP exists only during simulation.

### `monster_recipes`

One valid unordered pair of species and its deterministic fusion result.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `input_a_species_id` | TEXT, required, foreign key to `monster_species.id` | Canonically first parent. |
| `input_b_species_id` | TEXT, required, foreign key to `monster_species.id` | Canonically second parent. |
| `result_species_id` | TEXT, required, foreign key to `monster_species.id` | Result species. |

- Composite primary key: `(input_a_species_id, input_b_species_id)`.
- Store parents in stable identifier order and require `input_a_species_id < input_b_species_id`, so inputs differ and reversed duplicates cannot exist.
- Multiple different pairs may produce the same species.
- Index `input_b_species_id` for reference checks and `result_species_id` for result checks, including egg eligibility. The primary key already covers lookups beginning with input A.
- Recipes reference species. Fusion consumes two concrete owned instances, not these catalog rows.

The plural name `monster_recipes` is intentional for the reboot. It is not a rename migration against the historical singular table.

### `eggs`

One row per owned egg. A tier identifies its shared definition; it is not a separate egg instance ID.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `id` | TEXT, primary key | Egg UUID. |
| `user_id` | TEXT, required, foreign key to `users.id` | Owner. |
| `tier` | INTEGER, required | Egg tier, from 1 through 4. |
| `created_at` | INTEGER, required | Acquisition timestamp. |
| `ready_at` | INTEGER, required | Readiness deadline, at least `created_at`. |

Index `user_id` for inventory queries.

Egg images, bilingual text, and base durations belong in shared backend/catalog definitions, not repeated on every egg row. Speed upgrades affect newly acquired eggs only: existing `ready_at` values remain unchanged.

Do not store an `is_ready` flag, preselected result species, or hatched-history row. Readiness follows server time; a successful hatch or discard deletes the egg. Hatching is manual and requires monster-storage capacity.

### `schema_migrations`

One row per applied schema migration.

| Column | Proposed storage | Meaning |
| --- | --- | --- |
| `version` | INTEGER, primary key | Ordered migration version. |
| `name` | TEXT, unique, required | Descriptive migration name. |
| `sql_hash` | TEXT, required | Checksum of the reviewed migration SQL. |
| `applied_at` | INTEGER, required | Application timestamp. |

Schema changes and their history entry must commit together. Do not rewrite already-applied migrations or erase player data to change the schema.

## 4. Egg results: a derived pool

**An egg of tier N can hatch any species of tier N that is not the result of any fusion recipe.**

The backend queries `monster_species` and excludes species referenced by `monster_recipes.result_species_id`. Being an ingredient in a recipe does not exclude a species.

This fixed rule replaces both an `egg_pool_species` table and an `egg_tier` column. It also means the same species cannot belong to different egg tiers.

### Accepted consequences

- Starting species may also hatch from eggs when they satisfy this rule. Receiving a starter does not make its species starter-exclusive.
- Adding a recipe that produces a species removes that species from egg results. Removing its final producing recipe makes it eligible again, provided its tier has an available egg definition.
- Species-tier changes also change eligibility. Eggs use the current catalog at hatch time, including eggs already owned before a catalog change.
- With egg tiers 1–4, species of tiers 5–6 never hatch from eggs.
- Every available egg tier must have at least one eligible species. Validate this when accepting catalog changes, including tiers referenced by owned eggs; reject invalid changes rather than consuming an egg with no possible result.

The result is selected by the server when hatching. Selection probabilities remain undecided; the derived membership rule does not imply an approved random distribution.

## 5. Relationships

```text
users.id
  ├── player_progress.user_id             zero or one row before initialization; one afterward
  ├── monsters.user_id                    many owned monsters
  └── eggs.user_id                        many owned eggs

monster_species.id
  ├── monsters.species_id                 many owned instances
  ├── monster_recipes.input_a_species_id  many recipes
  ├── monster_recipes.input_b_species_id  many recipes
  └── monster_recipes.result_species_id   potentially several producing recipes

sessions.data.userId                      logical account reference inside session JSON

eggs.tier + monster_species.tier
  + absence of a producing recipe        derived hatch eligibility, not a foreign key

enemy_species.difficulty                  filters in-memory encounter generation;
                                         no persistent enemy instances or expeditions
```

Game foreign keys should use `ON DELETE RESTRICT / ON UPDATE RESTRICT`. Catalog updates must not delete species referenced by owned monsters or recipes, or remove an egg definition still needed by owned eggs.

## 6. Backend rules and atomic operations

### Balance definitions stay in the server

The backend defines upgrade prices, level limits, resulting capacities, incubation effects, difficulty requirements, and unlock costs. These are game rules, not per-player database rows. Start with straightforward code/configuration; no balance tables or extra authoring framework are required.

The frontend receives the applicable prices, limits, and effects for display. It cannot decide whether a purchase or reward is valid.

### Changes that must commit together

| Operation | Atomic changes and checks |
| --- | --- |
| Starter grant | Recheck eligibility, create starter instances, and set `starters_granted_at`; initialize required player state as specified by the onboarding feature. |
| Fusion | Verify ownership and recipe, consume both monsters, and create one result. An invalid pair consumes nothing. Tired monsters may be fused. |
| Hatch | Verify ownership, readiness, capacity, and current eligible results; select/generate a monster, create it, and delete the egg. Failure consumes nothing. |
| Egg discard | Delete the owned egg and apply a refund only if an explicit refund policy is approved. |
| Expedition | Validate the party and difficulty; commit resource rewards, permitted egg rewards, and all dispatched monsters' tired deadlines together. |
| Upgrade purchase | Validate the expected current level, limits, and balances; deduct costs and increment the purchased level. |
| Difficulty unlock | Validate the expected current progression and requirements; deduct costs and advance the sequential unlock. |

Always obtain ownership from the authenticated internal user ID. Recheck mutable state inside the transaction: an earlier screen read is not a reservation. Resource arithmetic must preserve nonnegative safe integers.

A transaction prevents partial changes, but does not by itself prevent executing an action again after a lost response. Safe retry behavior remains a required decision before valuable gameplay mutations ship. No mutation-receipt table is added by this design; add one only through an explicitly reviewed contract if needed. Do not automatically replay ambiguous mutations.

## 7. Decisions still needed before implementation

- Exact SQL constraints, indexes, migrations, and initialization behavior.
- Starting resources, capacities, levels, and unlocked difficulty.
- Explicit starter roster and starter-stat initialization.
- Stat-roll distribution, rounding boundaries, and egg-result selection probabilities.
- Egg durations, discard/refund policy, and upgrade balance.
- Type/resource mappings, aspects, enemy definitions, and combat/reward formulas.
- Safe retry behavior for mutations whose response may be lost.
- Catalog authoring, validation, and loading, including empty-pool rejection.

These open values do not require extra tables by default. Resolve them in small approved features while preserving the structure above.

## 8. What is not added to the database

### Fixed rules and configuration stay in the backend

| No additional table for | Backend responsibility |
| --- | --- |
| Types and weaknesses | Explicit definitions for the six-type cycle: each type identifies the type it deals double damage to. Derive its weakness rather than maintaining a second conflicting mapping. Validate that every type has exactly one advantage and one weakness. Exact type identifiers and cycle remain undecided. |
| Type-to-resource mapping | Each type maps to exactly one of `crystals`, `mushrooms`, or `souls`. Multiple types may map to the same resource. Validate species type identifiers against these definitions. |
| Resource reward definitions | Each dispatched player monster contributes its type's associated resource; repeated types/resources contribute independently. The server calculates amounts from approved expedition rules and sums them into the persisted `users` balances. Rewards are not determined by the defeated enemies' types. |
| Aspects and status-effect definitions | Server code defines ability behavior, targeting, durations, and combat effects. Species store only an aspect identifier. |
| Expedition and difficulty definitions | Configuration defines encounter limits, eligible enemy selection within the chosen difficulty, progression/scaling, reward formulas, and egg rewards. The server simulates the expedition; the client only presents its result. |
| Upgrade prices and limits | Backend definitions specify costs per level, maximum levels, resulting capacities, and incubation-speed effects. `player_progress` stores only purchased levels. |
| Unlock prices and requirements | Backend definitions specify difficulty-unlock costs and prerequisites. `player_progress` stores the highest unlocked difficulty, not copies of those rules. |
| Starter definitions | An explicit backend roster and approved stat-generation rules determine the initial monsters. The completed grant marker remains in `player_progress`, independently of username setup and egg eligibility. |
| Egg definitions and pools | Shared definitions provide base durations; the backend derives eligible species from matching tier and absence of a producing fusion recipe. The selection distribution remains undecided. |
| Recovery and acquisition formulas | Server rules calculate tired deadlines and acquired-monster stats. The resulting deadlines and actual stats are persisted on owned instances. |

Prefer straightforward backend code/configuration over extra definition tables or a generic rules framework. The frontend may receive prices, limits, labels, and effects for display, but never authorizes actions or calculates authoritative outcomes.

### Temporary simulation state is not persisted

- No `expeditions`, encounter-history, combat-log, or expedition-party tables. The selected ordered party belongs to the request, and the simulation runs in server memory.
- No `enemies` instance table. Only reusable definitions are stored in `enemy_species`.
- Current combat HP, targets, turn order, rounds, and status effects are temporary simulation state, not columns on owned monsters or enemy definitions.
- The server commits rewards, eggs, and recovery deadlines, then returns the result for frontend playback. Refreshing the page or losing the response cannot recover the animation from expedition history, because no such history is stored.
- Safe handling of lost responses/retries remains an implementation decision; not storing expeditions does not remove that requirement.

### Display data and other omitted tables

- Species/enemy/egg names and optional descriptions live in bilingual catalog/display definitions; no localization tables are proposed.
- Actual images live in frontend assets. Species store relative paths, not image blobs; shared egg display definitions provide egg image references.
- No generic resource-definition table or resource ledger is needed for the three current balances.
- No separate table per upgrade, upgrade level, unlock, or resource, and no separate session database.
- No stored `is_ready` or `is_tired` flags: derive them from deadlines and server time.

The precise catalog format/loading workflow is a separate implementation decision. These simplifications do not authorize silently reinterpreting historical catalog files or migrating an existing database.
