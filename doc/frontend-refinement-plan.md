# Frontend Refinement Plan

This plan refines the existing frontend without adding product features,
redesigning screens, changing the established visual identity, or changing
backend behavior. Shared API and state correctness is addressed before
page-specific rendering and accessibility cleanup.

## Batch 1: Frontend Contract and Request Foundation - Completed

### 1. Add focused frontend regression coverage

**Audit finding:** The frontend has no automated test suite. Existing
correctness depends on API parsing, persisted identity recovery, race protection,
and non-idempotent fusion behavior.

**Why this phase:** The planned changes affect shared request and state
transitions. Focused tests are needed before changing those paths.

**Affected files:** `frontend/package.json`, lockfile,
`frontend/vite.config.js` or a small Vitest configuration, new files under
`frontend/src/test/` or `frontend/test/`.

**Concrete change:** Add Vitest with jsdom and React Testing Library. Add only
the setup needed to test `api.js`, `PlayerProvider`, and existing pages. Avoid
broad snapshot tests and visual-style assertions.

Initial coverage should include:

- JSON and non-JSON success/failure parsing.
- Malformed successful response rejection.
- Valid, malformed, absent, and transiently unavailable player identity.
- Collection loading, empty, malformed, and failed states.
- Duplicate player creation and fusion prevention.
- Navigation while fusion is pending.
- Fusion success, confirmed rejection, stale-parent rejection, timeout, and
  uncertain outcome.
- Detail request cancellation and retry.
- Unknown client routes.

**Dependencies:** None. Complete before changing shared API and context
behavior.

**Verification:** `npm test`, `npm run lint`, and `npm run build` must be
runnable independently.

**Behavior risk:** Low. Test-only behavior and development dependencies.

**Visible UI difference:** None.

### 2. Enforce complete endpoint-specific response contracts

**Audit finding:** `api.js` validates only top-level envelopes for player,
collection, and detail responses. Malformed nested data can reach context and
rendering code.

**Why this phase:** The API adapter is the narrowest place to prevent invalid
backend or proxy data from corrupting shared state.

**Affected files:** `frontend/src/services/api.js`, API tests.

**Concrete change:** Add small endpoint-specific predicates inside `api.js` for:

- Created player responses.
- Restored player responses.
- Collection monsters.
- Detail monsters and nested recipe parents.
- Fusion result monsters.

Require positive safe IDs, valid UUIDs, required non-empty strings, integral
numeric statistics, arrays where required, and valid nested recipes. Validate
`monsters_found` against the returned collection length. When restoring a
player, require the returned UUID to match the requested UUID after
canonicalization.

Keep response envelopes and exported API function names unchanged.

**Dependencies:** Item 1.

**Verification:** Mock each endpoint with a valid response and malformed
variants for every required nested field. Confirm malformed `2xx` responses
become explicit API errors and never reach context or page rendering.

**Behavior risk:** Medium. Responses previously tolerated despite violating the
backend contract will now fail explicitly.

**Visible UI difference:** Only when malformed data is received; the existing
flow will show an error rather than rendering corrupt data or crashing.

### 3. Add bounded request timeout and consistent cancellation behavior

**Audit finding:** None of the five frontend API operations has a timeout.
Detail cancellation handles route changes, but not indefinitely stalled
connections.

**Why this phase:** Shared request behavior should be consistent before
page-specific loading and pending states are refined.

**Affected files:** `frontend/src/services/api.js`, API tests.

**Concrete change:** Extend the existing internal response helper to perform
requests with a bounded timeout using browser `AbortController` APIs. Compose the
timeout with the detail page's existing lifecycle signal. Preserve status
information and distinguish timeout from caller cancellation.

Treat timeouts for non-idempotent operations as uncertain outcomes rather than
confirmed failures. Attach the backend `X-Request-ID` to generated errors when
available for diagnostics, without changing visible UI by default.

**Dependencies:** Items 1 and 2.

**Verification:** Test normal completion, caller cancellation, timeout, network
rejection, JSON errors, malformed success, and cleanup of timeout resources.
Confirm a detail route change does not render a timeout error.

**Behavior risk:** Low to medium. Extremely slow requests will now terminate
rather than remain pending indefinitely.

**Visible UI difference:** Stalled operations eventually enter an error or
reconciliation state instead of displaying a permanent loader.

## Batch 2: Player Identity and Collection State - Completed

### 4. Make player restoration and creation lifecycle durable

**Audit finding:** A malformed stored UUID causes an unrecoverable `400` retry
loop. Player creation pending/error state is page-local, and `refreshPlayer` is
dead and lacks race protection.

**Why this phase:** Player identity gates all current frontend flows and should
have one authoritative lifecycle.

**Affected files:** `frontend/src/context/PlayerContext.jsx`, potentially a small
non-component context/hook module, `frontend/src/services/api.js`, context tests.

**Concrete change:** Validate the stored UUID before restoration and remove
malformed values without making a request. Treat a player-lookup `400` as invalid
persisted identity and a `404` as absent identity. Preserve stored identity for
network and `5xx` failures.

Move player-creation pending and error state into `PlayerProvider`, backed by a
request ref so navigation or remounting cannot submit a second creation request
while the first remains pending. Expose a deliberate reset action for
unrecoverable restoration failures.

Remove the unused `refreshPlayer` action. Split the provider component from the
context/hook module if needed to satisfy Fast Refresh without disabling the lint
rule.

Represent player-creation timeout or malformed-success responses as uncertain
rather than claiming that no player was created.

**Dependencies:** Batch 1.

**Verification:** Cover no stored UUID, valid UUID, malformed stored UUID, lookup
`400`, lookup `404`, network failure, retry, explicit reset, creation success,
duplicate submission, navigation during creation, and uncertain creation
outcome.

**Behavior risk:** Medium. Persisted malformed identities will now be cleared,
and creation state will survive route changes.

**Visible UI difference:** Recovery/reset and uncertain-creation states become
available through the Home UI in Item 5.

### 5. Make the existing player form and Home collection states explicit

**Audit finding:** Player creation is not a semantic form, whitespace input
appears submittable, creation failures are console-only, and a valid empty
collection renders a blank list.

**Why this phase:** These are existing creation, validation, error, and empty
states, not new product behavior.

**Affected files:** `frontend/src/pages/HomePage.jsx`,
`frontend/src/components/Player/CreatePlayer.jsx`,
`frontend/src/components/MonsterItem/MonsterList.jsx`.

**Concrete change:** Use a semantic form with `onSubmit`, a programmatically
associated label, `name`, and `required`. Preserve current classes, adding only a
readable text color to the white input. Disable submission for blank input or
while context reports creation pending.

Render creation and restoration failures with `role="alert"`. Offer retry and
explicit local-session reset where appropriate. Render loading text with
`role="status"`.

When collection loading succeeds with zero monsters, render an honest Spanish
empty state without promising an acquisition mechanic that does not exist.

Use context-owned creation pending/error state rather than local page state.

**Dependencies:** Item 4.

**Verification:** Test Enter submission, whitespace input, double click,
creation success, backend validation error, network failure, uncertain creation,
retry/reset, populated collection, and valid empty collection.

**Behavior risk:** Low. Blank submissions become visibly unavailable rather
than silently ignored.

**Visible UI difference:** Necessary form labels, creation errors, recovery
controls, and empty-collection text become visible.

## Batch 3: Fusion Lifecycle and Interaction - Completed

### 6. Move fusion operation state into `PlayerProvider`

**Audit finding:** Fusion duplicate protection and pending state are local to
`FusionPage` and disappear when the route unmounts, while the non-idempotent
request can still commit.

**Why this phase:** Fusion mutates the shared collection and therefore belongs
with the collection lifecycle rather than a disposable page instance.

**Affected files:** `frontend/src/context/PlayerContext.jsx`,
`frontend/src/pages/FusionPage.jsx`, `frontend/src/services/api.js`, context/page
tests.

**Concrete change:** Move fusion submission, pending protection, parent IDs,
result, error, and operation status into `PlayerProvider`. Expose one guarded
fusion action and one action to acknowledge/clear the completed operation.

Use a small explicit operation state such as:

- `idle`
- `pending`
- `reconciling`
- `success`
- `confirmed-error`
- `uncertain`

Keep selection UI local, but derive pending parent information from context so
remounting cannot start a second request against the same cached parents.

Do not add a state-management library or a separate fusion store.

**Dependencies:** Items 1-4.

**Verification:** Start fusion, navigate away, return before completion, and
attempt another submission. Exactly one POST must occur. Verify operation result
and pending state survive remounting.

**Behavior risk:** Medium. Fusion result/error state will persist across
navigation until acknowledged.

**Visible UI difference:** Returning to Fusion while a request is active will
show the existing operation instead of an idle form.

### 7. Classify and reconcile fusion outcomes correctly

**Audit finding:** Every `4xx` is treated as cache-neutral, although `404` can
mean the cached parents are stale. Uncertain outcomes are refreshed but still
shown as definite failures.

**Why this phase:** Correctly representing a destructive request's outcome is
central to safe use of the existing fusion feature.

**Affected files:** `frontend/src/context/PlayerContext.jsx`,
`frontend/src/pages/FusionPage.jsx`, fusion tests.

**Concrete change:** Classify fusion outcomes as follows:

- Known cache-neutral `400` rejection: preserve the confirmed collection and
  show the backend message.
- `404`: refresh the collection because the player or parent instances may be
  stale.
- Network failure, timeout, `5xx`, or malformed successful response: mark the
  result uncertain and reconcile the collection.
- Failed reconciliation: preserve the last confirmed collection, mark it
  unresolved, and block another fusion attempt.
- Successful reconciliation with both parents present: report confirmed
  failure.
- Successful reconciliation with missing parents: report that the collection
  changed and avoid claiming a definite failed fusion.

Clear or revalidate selected IDs whenever reconciliation shows that a selected
parent no longer exists.

**Dependencies:** Item 6.

**Verification:** Cover no-recipe `400`, missing-parent `404`, deleted player,
timeout before response, connection loss after commit, malformed `201`,
successful reconciliation with parents present, successful reconciliation with
parents absent, and failed reconciliation.

**Behavior risk:** Medium. Some errors previously labelled simply "failed" will
become stale or uncertain outcomes.

**Visible UI difference:** Necessary "verifying result," stale-selection,
synchronized, and uncertain messages replace misleading definite failures.

### 8. Render complete Fusion states and accessible controls

**Audit finding:** Fusion omits player loading/error/guest and successful-empty
states. Selection is mouse-only, pending text is absent, and the result overlay
lacks dialog behavior.

**Why this phase:** These changes expose existing state safely and make existing
controls operable without changing fusion mechanics or visual identity.

**Affected files:** `frontend/src/pages/FusionPage.jsx`.

**Concrete change:** Render states in this order:

1. Player loading.
2. Player restoration error with retry/reset.
3. No player with a link to Home.
4. Collection loading.
5. Collection error with retry.
6. Valid empty collection.
7. Ready collection and fusion controls.

Render selectable monster cards as native buttons with `type="button"` and
`aria-pressed`. Allow selected monsters to be deselected. Once two are selected,
disable other choices and explain that one must be deselected before choosing
another.

Change the fusion button label while pending and reconciling, add `aria-busy` or
an `aria-live` status, and preserve the existing colors/classes.

Add dialog semantics, labelled title, initial focus, Escape handling, focus
containment/restoration, and narrow-screen width safety to the existing local
result window. Do not create a shared dialog component because this is the only
current dialog.

**Dependencies:** Items 6 and 7.

**Verification:** Test guest/loading/error/empty/populated states, keyboard
selection, deselection, third-choice behavior, duplicate submit protection,
pending labels, result/error dialog focus, Escape, focus restoration, and narrow
viewport width.

**Behavior risk:** Low to medium. Selection correction becomes explicit instead
of silently resetting both choices.

**Visible UI difference:** Necessary state explanations, pending text, keyboard
focus, selected-state semantics, and mobile-safe modal sizing.

## Batch 4: Existing Page Recovery and Shared Semantics - Completed

### 9. Preserve monster-detail status and add recovery

**Audit finding:** Monster detail collapses `400`, `404`, network, timeout,
malformed response, and `500` into one terminal English message.

**Why this phase:** The backend already provides meaningful status distinctions
that the current page discards.

**Affected files:** `frontend/src/pages/MonsterDetailPage.jsx`, detail tests.

**Concrete change:** Keep the API error object or normalized status in page
state. Render:

- Invalid-link text for `400`.
- Not-found/consumed text for `404`.
- Retry for network, timeout, and `5xx`.
- A generic malformed-response error when a successful body violates the
  contract.
- A Home link for terminal states.

Keep the existing `AbortController` route-change protection. Add status/alert
semantics without changing the detail layout.

**Dependencies:** Batch 1.

**Verification:** Cover valid detail, malformed route ID, missing/consumed
instance, malformed `2xx`, network failure, timeout, retry success, and rapid
navigation between IDs.

**Behavior risk:** Low.

**Visible UI difference:** Necessary status-specific Spanish errors, retry, and
route recovery controls.

### 10. Add existing-route navigation and a client not-found state

**Audit finding:** Unknown paths render only the navbar, and the navbar's `<nav>`
contains no navigation control.

**Why this phase:** This repairs navigation for the existing route set without
adding product functionality or redesigning navigation.

**Affected files:** `frontend/src/App.jsx`,
`frontend/src/components/Player/Navbar.jsx`, `frontend/index.html`, route tests.

**Concrete change:** Add a wildcard route whose element is defined locally in
`App.jsx`, with a short Spanish not-found message and Home link. Do not create a
standalone component used only once.

Make the existing navbar identity area a Home link while preserving its current
classes and appearance. Use status text consistently in Spanish.

Set document language to `es`, replace the generic browser title with the
existing product name, and remove or correct the missing favicon reference.

**Dependencies:** Item 1. Can proceed independently of fusion work.

**Verification:** Navigate directly to every existing route and an unknown
route. Verify keyboard activation of the Home link, browser title, language
metadata, and no missing favicon request.

**Behavior risk:** Low.

**Visible UI difference:** Invalid routes become understandable and recoverable;
the existing navbar gains a route back to Home without visual redesign.

### 11. Make the existing Portal screen honest and non-interactive

**Audit finding:** Expedition cards are inert but use arrows and acquisition
language that imply implemented actions. Portal also contains unused state and
render-time logging.

**Why this phase:** The current screen communicates functionality that does not
exist. Correcting that representation is safer than inventing a product feature.

**Affected file:** `frontend/src/pages/PortalPage.jsx`.

**Concrete change:** Remove unused loading state and render-time logging. Keep
the existing cards and styling, but remove the navigation arrow affordance or
replace it with a clear non-interactive "Próximamente"/"No disponible" label.
Remove text promising monster acquisition until that feature exists.

Do not add click handlers, API calls, expedition behavior, rewards, combat, or
acquisition.

**Dependencies:** None.

**Verification:** Confirm cards have non-interactive semantics, no
pointer/keyboard behavior suggesting activation, no console output, and
unchanged responsive layout.

**Behavior risk:** Low. The page becomes more explicit about its current
non-functional status.

**Visible UI difference:** Necessary availability wording replaces misleading
action/reward affordances.

### 12. Correct shared rendering semantics, known assets, and dead code

**Audit finding:** Shared collection rendering uses unstable index keys,
decorative images have misleading alt text, stat/type displays lack useful
accessibility semantics, two persisted asset paths do not resolve, and lint
reports dead imports/state.

**Why this phase:** These are small shared corrections affecting multiple
existing screens without changing their layout or design language.

**Affected files:** `frontend/src/imageHandler.js`,
`frontend/src/components/MonsterItem/MonsterList.jsx`, `MonsterItem.jsx`,
`Stat.jsx`, `TypeTag.jsx`, touched page image usages, and related tests.

**Concrete change:** Use `monster.id` as the collection key and remove the unused
state import. Add explicit frontend aliases from the persisted `pumpking` and
`phoenyx` image paths to the existing assets rather than changing the backend
contract.

Use `display_name` for informative monster portraits. Mark decorative arrows,
action icons, stat icons, placeholders, and type icons with empty alt text when
adjacent text already supplies the label. Give icon-only type tags an accessible
label.

Either add progressbar semantics to stat bars or hide the visual bar from
assistive technology when the adjacent numeric label is the authoritative
representation.

Correct user-facing spelling and language only in strings already touched by
state/accessibility work. Do not restyle components or extract new presentation
components solely for consistency.

**Dependencies:** Apply after the page-specific state wording is settled.

**Verification:** Run lint and build, test stable list identity after fusion
updates, verify both aliased monster images resolve, and inspect accessible names
for collection, detail, fusion, and Portal images.

**Behavior risk:** Low.

**Visible UI difference:** Pumpkin and phoenix artwork becomes visible;
assistive semantics improve. Other visual changes are limited to corrected text
already involved in functional state work.

## Final Verification

1. Run the frontend unit and interaction suite.
2. Run `npm run lint` with zero errors.
3. Run the production frontend build.
4. Run the backend suite to confirm no server contract was changed.
5. Exercise player creation, restoration, reset, and empty collection.
6. Exercise detail success, invalid ID, missing instance, timeout, and retry.
7. Exercise fusion success, confirmed rejection, stale parents, uncertain
   outcome, failed reconciliation, navigation during submission, and duplicate
   submission.
8. Navigate directly to all four routes and an unknown route.
9. Perform keyboard-only checks for creation, navigation, fusion selection,
   submission, and modal dismissal.
10. Verify mobile-width behavior without changing established desktop/mobile
    layout conventions.
11. Confirm no frontend request depends on removed `GET /api/players`.
12. Confirm no visible change introduces a new visual system, gameplay promise,
    or backend contract assumption.

## Blocked Backend Issues

No backend contract change is required for the proposed frontend work.

Player creation remains non-idempotent and cannot be fully reconciled if the
server commits but the browser loses or rejects the successful response before
receiving the new UUID. The frontend can represent that result as uncertain and
prevent automatic duplicate retries, but a complete solution would require a
separately reviewed backend idempotency or recovery contract. That backend
change is not included in this plan.

Authentication, CORS, listener binding, trusted-proxy behavior, rate limiting,
`405` semantics, schema migration, and the `qs` advisory remain separate
backend/deployment concerns.

## Explicit Exclusions

- Authentication or authorization.
- New gameplay, expeditions, combat, rewards, starter monsters, or acquisition
  mechanics.
- New pages for new functionality.
- Backend contract or database changes.
- UI redesign, new visual system, broad layout changes, or style-only component
  replacement.
- New state-management libraries.
- Broad frontend rewrites.
- General component extraction without multiple consumers or a concrete
  correctness need.
- Cosmetic consistency work unrelated to a documented state, accessibility,
  correctness, or usability finding.
- Automatic dependency upgrades unrelated to the focused frontend test setup.
