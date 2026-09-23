# AGENTS.md
This repository contains a React frontend and an Express backend.

Agents working in this repository should prioritize preserving existing behavior, making small well-scoped changes, and documenting decisions that affect architecture, APIs, data, or feature behavior.

## Development rules

* Inspect the existing implementation before introducing new patterns, abstractions, dependencies, or architecture.
* Prefer extending existing services, routes, utilities, and components when they already fit the requirement.
* Do not rewrite working features without a specific reason tied to the task.
* Keep changes scoped to the requested feature, fix, or implementation batch.
* Avoid unrelated refactoring during feature work.
* Prefer small, reviewable changes over broad rewrites.
* Preserve existing behavior unless the task explicitly requires changing it.
* Keep frontend and backend responsibilities clear.
* Do not move responsibilities across layers without explaining why.

## Data and API rules

* Do not change the database schema unless the task requires it.
* Document every database schema change, including migration or compatibility implications.
* Do not change API contracts without identifying affected consumers.
* Preserve response shapes and status-code behavior unless a contract change is intentional.
* When changing an API contract, update all known consumers in the same task or clearly document remaining work.
* Reuse existing validation, error-handling, authentication, and authorization patterns where they exist.
* Do not silently introduce incompatible data assumptions.

## Error handling and state integrity

* Treat crashes, invalid state, duplicate mutations, unintended data loss, and inconsistent persisted state as high-priority correctness issues.
* Validate inputs at appropriate boundaries.
* Handle expected failure states explicitly rather than relying on uncaught exceptions.
* Prevent duplicate or repeated mutations when a request is already in progress where appropriate.
* Do not hide errors that affect correctness or persisted state.

## Repository structure

* `frontend/` — React frontend
* `backend/` — Express backend
* `doc/` — technical documentation created for the project, including audits and stabilization plans
* `doc/features/` — feature specifications and feature-specific implementation notes

Before adding a new top-level directory or moving existing files, inspect the current structure and justify the change.

## Feature workflow

For substantial features or behavior changes:

1. Inspect the relevant existing code.
2. Clarify the requirement and identify affected behavior.
3. Write or update the feature specification in `doc/features/` when appropriate.
4. Create an implementation plan.
5. Review the plan before implementation.
6. Implement the work in small, coherent steps.
7. Verify each step with appropriate tests or manual checks.
8. Review the final diff for unrelated changes, regressions, and accidental contract changes.

Do not begin implementation while explicitly asked to remain in planning mode.

## Stabilization and bug-fix workflow

When implementing work from an audit or stabilization plan:

* Work on one approved batch at a time.
* Do not expand the batch with unrelated audit findings.
* Prefer the smallest change that resolves the documented issue.
* Verify the original failure condition no longer occurs.
* Add or update tests when practical.
* Do not combine stabilization work with unrelated feature development unless explicitly requested.

## Verification

Before considering a task complete:

* Run the relevant checks, or build commands available for the affected area.
* Verify the specific behavior described by the task.
* Check for obvious regressions in directly affected flows.
* Review the diff for unrelated edits.
* Report any verification that could not be performed.

Do not claim a behavior is verified if it was only inferred from code inspection.

## Documentation

* Keep audit findings, plans, and feature specifications in `doc/`.
* Update documentation when implementation changes documented behavior.
* Do not rewrite historical audit findings merely because an issue was fixed; prefer recording the resolution in the relevant stabilization plan or implementation notes.

## General decision rule

When multiple approaches are possible, prefer the option that:

1. Fits the existing codebase.
2. Changes the fewest unrelated things.
3. Is easy to verify.
4. Preserves existing contracts and behavior.
5. Leaves the code easier to understand without introducing unnecessary abstraction.
