# MEMORY.md — Context for Next Sessions or Agents

## Current state

- Approved features 001–005 implemented: backend/persistence/Google auth, minimal Vite React frontend, and permanent username-only setup. One shared SQLite file/connection/catalog selected by `DATABASE_PATH`.
- Migration 1 creates auth tables; migration 2 adds partial UNIQUE `users_username_nocase_idx` (`username COLLATE NOCASE`). Old migration unchanged; existing case collisions fail startup without renaming/deleting accounts. Diagnostic/data policy in `backend/README.md` and feature 005 plan.
- `POST /api/auth/username` assigns the authenticated account's name once: trim, 3–20 ASCII letters/digits/underscores, at least one alphanumeric, case-insensitive uniqueness, preserved spelling. Same-name confirmations cannot rename. Existing Origin/CSRF/security/session expiry behavior retained.
- Frontend has Google sign-in/session/restore/logout, minimal localized username form, and memory-only EN/ES choice. Draft survives recoverable errors/reconciliation/language switch, clears on confirmed account/logout/completion. Ambiguous mutation failures reconcile before allowing retry, never auto-replay.
- **Username completion (`requiresOnboarding: false`/`requireOnboarded`) does not mean starter monsters were granted.** No game/starter tables/content/infrastructure. Future starter feature needs independent durable exactly-once eligibility, including already-named accounts.
- No new dependencies/configuration. Existing developer `.env` files not edited; verification used temporary storage/configuration, not the developer database. A service already occupies port 3000; it was not stopped. Watch-mode services may reload source changes automatically.

## Verification

- Windows x64 / Node 24.19.0 / npm 11.17.0: backend 194 passed, three skips (two POSIX signals + occupied default port), frontend 44 passed; both typechecks/builds pass.
- Tests cover migration collisions/rollback/startup refusal, concurrency/immutability/idempotency, safe storage errors, request security, stable names/IDs across process restart/sign-in, and localized form/async/draft behavior. No lockfile/package changes.
- Headless Chrome used actual Vite/backend with temporary SQLite and controlled Google SDK/verifier: validation/save, keyboard/focus, restart/reload, two-account case conflict, EN/ES draft retention, logout/login. Mobile/desktop screenshots reviewed; one-off harness removed.
- User previously reported local auth works. Live Google for the new flow, Caddy TLS/headers, Linux ARM64, and real POSIX signal handling were not independently reverified. Prior dependency maintenance/platform warnings remain in READMEs.

## Next work

- Manually check username setup with an existing unnamed Google account after restarting services/reloading frontend. Chosen usernames are permanent; do not reset/delete real data to rerun tests.
- Next candidate: monster catalog/ownership and exactly-once starter grants, with separate spec/plan/schema approvals. Localization stays English internally with EN/ES display dictionaries/stable species IDs.
- Preserve existing uncommitted user annotations/work (`AGENTS.md`, `project.md`, etc.); no commits made.
- Public deployment still requires separate security/ARM64/infrastructure review and approval.
