# Feature 005 — Username-only account setup

Status: Approved and implemented — username-only setup locally verified; starter grants remain deferred.

## Goal

Let a Google-authenticated player choose their permanent, unique username through a small account-setup form. Keep this feature independent of monster acquisition so account identity can be completed before game tables and starter content exist.

Google remains the only sign-in method. A username is a player-facing name, not a credential; it never replaces the stable internal user ID used for ownership and authorization.

## Scope

- Replace the current onboarding-pending notice with a minimal username form for authenticated accounts without a username.
- Validate, reserve, and persist the username on the backend.
- Show the saved username after successful setup, across page reloads, backend restarts, and later Google sign-ins.
- Preserve logout and English/Spanish language selection throughout setup.
- Keep the existing compact, accessible, mobile-first authentication view; no game navigation or new game screens.

## Approved username rules

- After trimming surrounding whitespace, a name must contain 3–20 characters.
- Allow ASCII letters (`A–Z`, `a–z`), digits (`0–9`), and underscore (`_`) only. Spaces within a name, accented letters, emoji, and other punctuation are not supported in this initial feature. Explain the allowed format in both languages.
- Require at least one letter or digit; underscores alone are invalid.
- Uniqueness is case-insensitive: `Luna`, `luna`, and `LUNA` cannot belong to different accounts.
- Preserve the accepted spelling/capitalization for display.
- A saved username cannot be changed through the MVP. Explain permanence before submission.
- Do not introduce reserved-name/profanity catalogs, account impersonation badges, or administrative renaming tools in this feature. Such policies require separate decisions before public release.

The user approved these rules with this specification; they are implemented in backend validation and frontend guidance/validation.

## User-facing behavior

1. A signed-out visitor sees the existing Google sign-in view, not a username/password login form.
2. After Google login or session restoration, an account without a username sees one labeled username input, concise format/permanence guidance, and a save button. Logout and language selection remain available when no mutation is pending.
3. Basic client-side validation helps the player correct invalid input; the backend repeats validation and is authoritative.
4. Invalid names and names owned by another account show specific localized feedback. Preserve the player's input after a recoverable error.
5. During submission, prevent duplicate saves and conflicting actions. Never report success or hide the setup form until confirmed by the backend or a subsequent authoritative session check.
6. On success, show signed-in status and the saved username in the existing view; do not navigate to a nonexistent game screen or imply any monsters were granted.
7. Reloading, logging out/in, or restarting the backend retains the name and does not show setup again for that account.
8. A lost or timed-out save response triggers a session check rather than automatically repeating the save. If the name was saved, show the backend's saved name; if state remains unknown, block mutations and offer a read-only retry.
9. Expired/stale sessions cannot save a name. Recover to the existing confirmed signed-out/error flow rather than trusting stale client state.
10. Setup completed in another tab is reflected on the next session check or submission. A stale form must never overwrite an already-selected username.

## Backend correctness and security

- Use the authenticated session's internal user ID, never an account ID supplied by the client.
- Apply the existing exact-Origin, synchronizer-token CSRF, secure-cookie, bounded-body, no-store, and safe-error conventions to the new mutation.
- Reserve the name and transition the account from unset to set atomically, with case-insensitive uniqueness enforced persistently. Concurrent requests cannot claim the same name for two accounts or change a name already assigned.
- A repeat submission of the account's already-selected name, ignoring capitalization and surrounding whitespace, may confirm the existing result without changing its saved spelling. A different name is rejected as already configured. This is not permission for automatic frontend mutation retries.
- Existing Google login, session inspection, and logout contracts continue working. Session inspection must return the current saved username rather than a stale session copy.
- Do not modify existing user IDs, Google identities, session lifetimes, or authentication policy.
- No new dependencies, services, ports, secrets, infrastructure, or game state are required by the behavior.

## Separation from starter monsters

This feature deliberately revises the earlier combined onboarding direction:

- Username setup is complete when the account has a username; the current `requiresOnboarding` flag continues to represent whether username setup is required.
- A non-null username or `requiresOnboarding: false` does **not** mean starter monsters have been granted or that future game-entry conditions are satisfied.
- No monsters/resources/eggs are created, and no starter-grant marker/schema is introduced here.
- The future starter-monster feature must define its own durable, exactly-once grant eligibility/state, including accounts that already selected usernames. It must not infer prior grants from username presence or depend on every player going through this form after that feature ships.
- Update `project.md` to distinguish username setup from the deferred grant step once this scope is approved and implemented. Exact future grant tables and game-access policy remain outside this feature.

## Non-goals

- Username/password authentication, account linking, username search/availability-check endpoints, profile screens, or username editing.
- Monster catalogs/ownership, starter grants, collection UI, eggs, resources, upgrades, expeditions, or other gameplay.
- Persistent language preferences, new app routing/state frameworks, moderation tooling, public deployment hardening, or infrastructure.

## Acceptance criteria

- [x] Authenticated users without usernames can submit the minimal localized form; other users do not see it.
- [x] Backend and client agree on the approved format rules; taken/invalid/permanent-name errors are understandable in English and Spanish.
- [x] Case-insensitive uniqueness and one-time assignment hold under concurrent and repeated requests; no existing name can be overwritten.
- [x] Saved capitalization and stable user ID survive reload, later login, and backend restart.
- [x] Anonymous/expired sessions and invalid Origin/CSRF requests cannot mutate usernames.
- [x] Duplicate submissions, ambiguous network results, and stale-tab submissions recover safely without blind replay or false success.
- [x] Existing authentication/logout/language behavior remains functional; tests use isolated storage and no developer credentials/database.
- [x] No starter/game data is granted, and documentation explicitly separates username completion from future exactly-once starter eligibility.
- [x] Relevant backend/frontend tests, type checks, builds, and available browser checks are run with limitations reported.

## Decisions requiring approval

- The user approved the username-only scope, naming rules, and explicit separation from starter grants before planning.
- The user subsequently approved the plan and exact migration 2, including the additional NOCASE index, safe collision failure/legacy-data policy, additive API, and four implementation batches before coding.
- Verification and remaining manual/platform limitations are documented in `plan.md` and the package READMEs. No future starter schema or game-access policy is approved by this feature.
