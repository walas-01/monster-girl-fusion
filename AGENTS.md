# AGENTS.md — Monster Girl App

Mobile-first, full-stack game where players collect monster girls, send them on expeditions to earn resources and eggs, hatch eggs, and fuse monsters to discover new ones. This is a learning and portfolio project: favor clarity, simplicity, and a working MVP over premature complexity. PvP or other social featurees are outside the MVP.

## Stack

- Frontend: React (Vite) + TypeScript + Tailwind CSS
- Backend: Express + TypeScript; REST API under `/api`
- Database: SQLite
- Authentication: Google Identity Services + `express-session`
- Deployment target: Docker Compose on an Oracle Cloud Linux ARM64 VM; Caddy as reverse proxy
- Testing: JavaScript/TypeScript scripts and existing project test tools

## Project navigation

- `frontend/` — React application.
- `backend/` — Express API and game logic.
- `specs/` — Feature specifications and implementation plans.
- `project.md` — Architecture, directory structure, and technical decisions.
- `MEMORY.md` — Context and unfinished work from previous sessions.

Before making changes, inspect the relevant directories and existing patterns. Do not assume the documented structure matches the current codebase.

## Project documents

- `AGENTS.md`: instructions for agents and development workflow (this file)
- `project.md`: architecture and important technical decisions
- `specs/<number>-<slug>/spec.md`: feature requirements and acceptance criteria
- `specs/<number>-<slug>/plan.md`: implementation design and small, ordered task batches
- `specs/<number>-<slug>/references/`: images to use a reference for UI, not all specs have them
- `MEMORY.md`: brief handoff context for the next session or agent

Read the relevant project documents and existing code before planning or changing a feature. If a document does not exist yet, do not invent its contents.

## Development rules

- Inspect existing code and conventions before introducing new patterns or dependencies.
- Keep changes small, understandable, and scoped to the active specification.
- Prefer extending existing routes, services, and components when appropriate.
- Do not rewrite working features or perform unrelated refactors without a concrete reason.
- Keep frontend display/state responsibilities separate from backend authorization and game rules. Treat the backend as authoritative for player state, rewards, and progression.
- Reuse existing validation, error handling, and authentication patterns.
- Keep database schemas as simple as practical. Propose and explain schema changes, then **wait for approval** before implementing them.
- Document schema migrations and identify affected code before changing the database.
- Identify affected consumers and obtain approval before making breaking API contract changes.
- Present trade-offs and a recommendation for significant architecture, dependency, or game-logic decisions; do not silently commit to one.
- Do not add infrastructure, libraries, or abstraction layers without a demonstrated need.
- Never commit credentials, secrets, SQLite database files, or other private data.
- Add or update tests for changed behavior where practical; report what was and was not verified.


## Spec-driven development (SDD)

Create one directory per feature, such as:

```text
specs/
  001-login-page/
    spec.md
    plan.md
  002-monster-collection/
    spec.md
    plan.md
```

Use the next available sequential number. `spec.md` describes **what and why**; `plan.md` describes **how and in what order**.

### `spec.md` should contain

- Goal and user-facing behavior
- Scope and non-goals
- Requirements and acceptance criteria
- Open questions or decisions requiring approval

Avoid implementation details here unless they constrain expected behavior.

### `plan.md` should contain

- Brief approach and files/components likely to change
- API and database impact, if any
- Ordered, small task batches with checkboxes
- Testing and verification for each meaningful batch
- Risks, dependencies, and decisions needing approval

Keep batches small enough to implement and review independently. Do not create a huge task list for a simple feature.

## Language and localization
- English is the default for all code, identifiers, filenames, comments, commit messages, API contracts, database names, logs, and technical documentation.
- Exception: spec.md may be written in Spanish or English. Preserve the existing language when editing specifications.
- The player-facing application must support both English and Spanish.
- Select an initial language from the visitor's browser preferences, defaulting to English for unsupported languages.
- Allow players to switch languages manually.
- Avoid hardcoding player-facing text in React components.
- Use English translation keys and maintain translations for both supported languages.
- Document localization implementation decisions in project.md.


## Feature workflow

1. Read `MEMORY.md`, relevant specs, `project.md` if present, and affected code.
2. Clarify only material uncertainties; otherwise state reasonable assumptions.
3. Draft or update `spec.md`. **Request approval before planning.**
4. Draft or update `plan.md` based on the approved spec. **Request approval before implementing.**
5. Implement only the approved batch or scope. Stop if new design or schema decisions need approval.
6. Run relevant checks/tests and inspect the diff; report results and any limitations.
7. Update the spec/plan if approved behavior or decisions changed.
8. Update `MEMORY.md` with a short, factual handoff.

When a user explicitly asks only for discussion, documentation, or planning, do not modify application code.

## Agent communication

- Be concise and concrete. Explain important trade-offs without overengineering.
- Distinguish facts observed in the repository from assumptions and suggestions.
- Before coding, summarize the intended changes and any required approvals.
- After coding, summarize changes, tests run, outstanding issues, and next recommended step.
- Do not claim a feature or test is complete unless it was actually implemented or verified.

## Memory handoff

Treat `MEMORY.md` as a short working handoff, **not** as the source of truth. The code, approved specifications, and documented decisions take precedence. Update it at the end of meaningful work, keep it current, and remove stale notes rather than letting it become a running diary.

## Deployment readiness

Design new code for the deployment architecture in `project.md`, even when developing locally without Docker. Keep technical deployment decisions there rather than duplicating them here.

- Configure deployment-specific ports, secrets, storage paths, and proxy settings through environment variables; never rely on machine-specific paths or shell behavior.
- Keep essential state restart-safe and independent of application source/build files. Do not use in-memory sessions or volatile storage for authoritative player state.
- Preserve relative frontend `/api` requests and independent backend operation in development and production.
- Keep the backend compatible with HTTPS behind a narrowly trusted reverse proxy; do not blindly trust forwarded headers.
- Check new dependencies and build steps for Linux ARM64 support, especially native SQLite/session modules. Report unverified compatibility or required native build tooling before adoption.
- Preserve bounded graceful shutdown, reproducible startup/migrations, and a lightweight health check as features are added.

### During feature planning

For each feature, evaluate whether it introduces:

- Environment variables or secrets.
- Persistent files or storage requirements.
- New ports, services, or infrastructure dependencies.
- Build or startup requirements.
- Linux ARM64 compatibility and native build requirements.
- Reverse-proxy trust, HTTPS/cookie behavior, or development proxy integration.
- Changes affecting Docker or production deployment.

Document relevant impacts and verification limitations in the feature's `plan.md`. Report existing incompatibilities before changing application code.

Constraints

- Do not create or modify production infrastructure without explicit approval.
- Do not add Dockerfiles, Compose files, Caddy configuration, or cloud resources until explicitly approved.
- Prefer simple solutions that work both locally and in the intended deployment environment.
- Document detailed infrastructure decisions in project.md.
