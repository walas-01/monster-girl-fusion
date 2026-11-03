---
description: Implement only one approved batch from a feature plan
---

Implement a single batch of an approved Monster Girl feature plan.

Feature and batch request: $ARGUMENTS

## Prerequisites
1. Read `AGENTS.md`, `MEMORY.md`, and `project.md` if present.
2. Resolve the referenced feature to `specs/NNN-feature-name/` and read both `spec.md` and `plan.md`.
3. Determine exactly which numbered batch is requested. If no batch is supplied, ask for one; never implement the entire plan by default.
4. Verify that the current spec AND plan were explicitly approved by the user, either in the current conversation or recorded explicitly in the files. If approval is unclear, stop before changing code.
5. Inspect the existing implementation, test setup, and git working tree. Respect pre-existing user changes.

## Implementation
1. Briefly identify the batch scope and expected files.
2. Implement ONLY the requested batch and any strictly necessary prerequisites already covered by the approved plan.
3. Reuse established Express + TypeScript, React + Vite + TypeScript, Tailwind, and SQLite patterns.
4. Keep validation, authorization, API behavior, and frontend/backend responsibilities aligned with existing conventions.
5. For database changes, follow the approved migration/backup approach; do not improvise schema changes.
6. Run relevant tests, type checks, and builds where available. If checks cannot run, report why.
7. Review the diff for unrelated edits, security problems, and spec mismatches.
8. Mark completed tasks in the selected batch of `plan.md`; leave incomplete tasks unchecked, including any that could not be verified.
9. Update `MEMORY.md` concisely with the work completed, outstanding issues, and next step.

## Stop conditions
- An unapproved database schema, API contract, dependency, security, or architecture change is required.
- The implementation would contradict the approved spec or plan.
- The requested batch is unclear or required prerequisites are missing.

When blocked, explain the decision needed and wait for user approval. Do not quietly broaden scope or move on to later batches.

## Final response
Report the batch completed, files changed, checks actually run and results, outstanding tasks, any deviations/risks, and the next batch. Do not claim completion if validation failed.
