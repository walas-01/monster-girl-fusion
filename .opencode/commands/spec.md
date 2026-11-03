---
description: Draft or revise a feature specification without implementing it
---

You are defining a feature for the Monster Girl application using lightweight spec-driven development.

Feature request: $ARGUMENTS

## Context
1. Read `AGENTS.md` and `MEMORY.md` if they exist.
2. Read `project.md` if it exists; do not create it as part of this command.
3. Inspect relevant existing code, APIs, assets, and specifications before proposing behavior.
4. Use the project stack and conventions; do not invent architecture that hasn't been approved.

## Procedure
1. If the request identifies an existing specification, update that spec rather than creating a duplicate.
2. Otherwise choose the next available three-digit identifier and a short kebab-case slug, creating `specs/NNN-feature-name/`.
3. Create or update `specs/NNN-feature-name/spec.md` with:
   - Title and status: `Draft`
   - Goal and motivation
   - User stories / expected flow
   - Functional requirements
   - UI and responsive behavior, if relevant, with references to any supplied images
   - Non-goals / out of scope
   - Acceptance criteria that can be verified
   - Open questions and decisions requiring approval
4. Describe observable behavior and constraints, not detailed implementation steps. Technical planning belongs in `plan.md`.
5. Keep scope appropriate for the MVP; explicitly identify optional ideas as out of scope.
6. Ask only essential questions when a meaningful decision cannot be made safely. Otherwise document reasonable assumptions for review.

## Rules
- Do NOT implement or change application code, database schema, or dependencies.
- Do NOT create `plan.md` yet.
- Do NOT mark the specification approved yourself. User approval must be explicit.
- If a spec already has approved content, preserve it unless the user explicitly asks to revise it; explain when a revision will require renewed approval.
- Do not rewrite unrelated specs or `MEMORY.md`.

## Final response
Give the created/updated spec path, a short scope summary, key assumptions/open questions, and explicitly request approval before `/plan`.
