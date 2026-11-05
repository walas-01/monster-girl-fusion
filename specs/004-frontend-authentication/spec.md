# Feature 004 — Frontend foundation and Google authentication

Status: Approved and implemented — locally verified; live Google integration and deployment/platform limitations are documented in the plan and frontend README.

## Goal

Create the minimal player-facing frontend so a player can sign in with Google, restore an existing application session, and sign out through the implemented backend. Establish a clean frontend foundation without building game screens.

## Scope

- Initialize `frontend/` with Vite, React, and TypeScript, using the project's Tailwind styling convention.
- Remove generated demo components, logos, sample assets, and unused starter styles; retain configuration needed for development, checking, and production builds.
- Provide only a compact authentication view: application title, Google sign-in button, session/loading/error feedback, signed-in status, and logout.
- Support English and Spanish with browser-language detection, English fallback, and a small manual language selector.
- Integrate the existing backend auth API without changing its contracts or database schema.
- Document local configuration, running the two packages, and Google authorized-origin prerequisites.

## User-facing behavior

1. On opening the app, inspect the existing application session before presenting sign-in or signed-in controls. A failed inspection must show a retryable error, not pretend the player is signed out.
2. Signed-out players can use Google's official sign-in button. No automatic One Tap login is required.
3. Exchange the Google ID token through the backend's existing CSRF-protected flow. Display signed-in state only after backend confirmation.
4. Reloading the page restores a valid backend session without another Google sign-in.
5. Signed-in players can log out. Confirm signed-out state only after backend confirmation; failures remain visible and retryable.
6. Accounts requiring onboarding see a short notice that account setup is not implemented yet. No username form, starter grants, or navigation to nonexistent game screens is included.
7. Loading and mutation states prevent duplicate actions. SDK/configuration/network/API failures produce understandable localized feedback and an appropriate recovery action.
8. Initial language follows supported browser preferences, defaulting to English. Players can switch between English and Spanish without changing authentication state. Cross-reload language preference persistence is not required in this feature.

## Requirements

### Minimal presentation

- Mobile-first, keyboard-accessible layout with readable contrast, visible focus, labeled controls, and accessible status/error feedback.
- Restrained dark styling consistent with project conventions; no illustrations, sprite generation, dashboards, decorative game panels, or additional screens.
- Player-facing application strings use English translation keys with both English and Spanish translations. Google's button uses its supported localization behavior.

### Authentication and security

- Use the backend as the authority for account/session state; never derive application authentication from Google SDK state alone.
- Use relative `/api` requests and same-origin session cookies. Development forwards these requests to the independently running backend.
- Respect Origin and synchronizer-token requirements for login/logout, including token rotation and expired-session recovery. Never blindly replay a login/logout mutation after an ambiguous network failure; reconcile session state first.
- Do not persist Google credentials, CSRF tokens, or session identifiers in browser storage, URLs, or logs. HttpOnly session cookies remain backend-managed.
- Only the public Google client ID may enter browser configuration; no session secret, Google client secret, or backend-private settings may be exposed.
- No fake-login path, authentication bypass, permissive CORS change, or backend cookie/security relaxation.

### Setup and deployment compatibility

- Keep `frontend/` an independently runnable/buildable npm package, compatible with the project's Node 24 environment.
- Configure the development backend target through environment settings, not React source. Keep the browser origin aligned with backend `APP_ORIGIN` and Google authorized JavaScript origins.
- Produce static production assets suitable for the documented future Caddy deployment. Production must not depend on Vite's development proxy/server.
- No infrastructure files, cloud resources, new persistent server storage, database changes, or additional runtime services.

## Non-goals

- Username selection, onboarding completion, monsters, resources, eggs, upgrades, or other game behavior.
- Routing framework, component library, global state framework, elaborate design system, or unrelated backend refactors.
- Google Cloud configuration automation, deployment, or production-infrastructure setup.
- Cross-device language preferences and broad frontend/public-deployment security hardening.

## Acceptance criteria

- [x] Vite/React/TypeScript frontend starts and builds independently; unused demo files are absent.
- [x] Only minimal authentication UI and language selection are rendered, including loading/error/disabled states.
- [x] Google login, session restoration, and logout use the existing backend contracts and CSRF policy.
- [x] Session failures are not mistaken for confirmed signed-out state; ambiguous mutation outcomes are reconciled safely.
- [x] New accounts receive only an onboarding-pending notice, with no game mutations.
- [x] English/Spanish detection, fallback, manual switching, and translated feedback work.
- [x] Configuration/proxy setup is documented without exposing secrets or modifying developer environment files.
- [x] Relevant automated checks and production build pass; live Google/browser, visual, and Linux ARM64 verification performed or explicitly reported as unverified.
- [x] No database/API breaking changes, extra application screens, or deployment infrastructure are introduced.

## Decisions and approval

- The user approved this scope before drafting `plan.md`.
- The user approved the complete plan and all three implementation batches before coding, including dependencies, direct SDK integration, testing, configuration, and memory-only language selection.
