---
description: Plan an approved spec in small, verifiable implementation batches
---

Create or revise an implementation plan for this feature: $ARGUMENTS

## Prerequisites
1. Read `AGENTS.md`, `MEMORY.md`, and `project.md` if present.
2. Resolve the feature argument to `specs/NNN-feature-name/spec.md` (accept an ID, name, or path). If ambiguous, ask which feature.
3. Read its specification and relevant code, tests, dependencies, and existing UI patterns.
4. Verify explicit user approval of the current specification. Do not infer approval from the existence of a file. If approval is not established in the current conversation or recorded explicitly in the spec, stop and ask the user to approve the spec.

## Output
Create or revise `specs/NNN-feature-name/plan.md` with:
- Feature reference and status: `Draft — awaiting approval`
- Summary of the technical approach and rationale
- Existing components/services to reuse
- Files/modules likely to be touched
- API contracts, validation, and authentication/authorization implications
- Database schema and migration changes, if any (clearly flagged as proposed)
- UI assets, responsiveness, loading/empty/error states, if relevant
- Risks, alternatives, assumptions, and questions requiring approval
- Numbered implementation batches, ordered by dependency, with checkbox tasks
- Test/verification steps and completion criteria for each batch
- Overall acceptance-criteria coverage mapping

Make batches small enough to implement and review independently. Prefer end-to-end vertical slices over large unverified rewrites.

## Rules
- Do NOT implement, modify application code, install dependencies, or perform migrations.
- Do NOT silently approve architecture, schema, new dependencies, or API contract changes.
- Do NOT mark the plan approved yourself; explicit user approval is required.
- Do not change `spec.md` to fit implementation convenience; flag mismatches for the user.
- Avoid unrelated refactoring and excessive abstractions.

## Final response
Summarize the plan, numbered batches, proposed decisions, and file path. Request approval before `/implement`.
