# MEMORY.md — Context for Next Sessions or Agents

## Current state

- Reboot feature 001 (minimal backend foundation) is complete: all three batches were authorized and finished. `frontend/` remains empty. There is no database, authentication, session store, catalog importer, or gameplay API.
- `backend/src/app.ts` owns health/JSON errors; `server.ts` owns PORT/startup/shutdown; `index.ts` starts the process. Preserve the user's annotations, formatting, startup log, and req/res/next names. No unnecessary domain layers were created.
- Node 24 native TypeScript/watch/test tooling, Express 5.3.0, development TypeScript 7.0.2; no tsx/dotenv. `npm run dev` optionally loads `.env`; real environment wins. `npm start` runs compiled code and does not load `.env`. Build before running the full tests.
- Created `backend/README.md`; scoped `project.md` changes describe the current foundation and flag unrelated pre-reboot implementation claims as historical. Read current code/spec/README instead of assuming old features 002–007 exist.

## Verification

- 2026-11-11, Windows x64 / Node 24.19.0 / npm 11.17.0: clean `npm ci`, typecheck, build, and **37 tests passed / two explicit POSIX-signal skips**. Full and isolated runtime-only installs reported zero vulnerabilities at check time.
- Isolated `npm start` passed health/JSON 404 with only package/lock/dist and runtime dependencies, no src/tests/.env/compiler/dev types, and TypeScript execution disabled. Isolated `npm run dev` loaded a safe generated `.env` and restarted after an edited health response and its byte-exact restoration. Workspace source/test/config/lock fingerprints unchanged. All owned temporary process trees stopped and ports checked closed; no unrelated service was stopped.
- Windows occupied-port reservations must match the backend's wildcard bind; loopback-only listeners can coexist with it. Draining test sends Connection: close to isolate active-response completion; immediate arbitrary keep-alive draining is not certified. Runtime shutdown limit remains 10 seconds.
- Real POSIX signals, Linux ARM64, and actual HTTPS/proxy deployment remain unverified. Forced Windows process cleanup does not certify graceful signal handling. No production infrastructure, schema, dependency, source, or test changes were needed for batch 3; no commits made.

## Agreed future database design

- `database.md` describes nine planned tables, not implemented schema: resources in `users`, one-to-one upgrades/progress/starter marker in `player_progress`, plural `monster_recipes`, and `enemy_species` with one difficulty per species.
- No egg-pool table or species egg_tier column: tier N eggs derive results from species of tier N absent a producing fusion recipe. User accepts starter overlap, current-catalog changes affecting existing eggs, and no tier-5/6 egg results. Available/owned egg tiers must retain nonempty pools.
- Type advantages/resources, aspects, expedition simulation/rewards, upgrade/unlock prices/limits, and starter/egg/recovery definitions belong in server rules. No persistent expedition history.

## Next work

- User requested the next major step: SQLite setup and all planned tables, and asked how migrations work. Drafted Spanish `specs/002-database-foundation/spec.md`, awaiting approval; no plan, driver install, schema, or DB file created. Scope proposes one persistent DB/shared connection, all nine empty tables, ordered transactional startup migrations with schema_migrations/checksums, and lifecycle/tests/docs. No auth/session adapter, CRUD/gameplay, seeding, or production infrastructure.
- Driver (`node:sqlite` release-candidate API versus external native `better-sqlite3`), exact SQL/defaults/indexes, difficulty encoding, path rules and SQLite settings require review in the subsequent plan. Schema/API/infrastructure approvals remain mandatory. Balance, starter roster/stats, random distributions, catalog workflow, and mutation retry policy remain future decisions.
