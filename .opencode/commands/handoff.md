---
description: Write a short, evidence-based handoff to MEMORY.md
---

Prepare a concise development handoff for the Monster Girl project.

Additional context or focus: $ARGUMENTS

## Procedure
1. Read `AGENTS.md`, `MEMORY.md` if present, the active feature's `spec.md` and `plan.md` if identifiable, and `project.md` if present.
2. Inspect relevant Git status/diff and recent completed work, without discarding or changing the working tree.
3. Distinguish verified completed work from plans, suggestions, and uncommitted or untested changes.
4. Update the root `MEMORY.md`, keeping exactly these main headings:

   # MEMORY.md - Context for next sessions or agents
   ## Last change or work done
   ## Unfinished work
   ## Possible next step
   ## Recommendations

5. Use brief bullet points, include feature IDs and paths where useful, and mention blockers or failing checks.
6. Prefer replacing stale handoff details over appending a chronological diary. Do not store tokens, credentials, private data, or lengthy code extracts.

## Rules
- Do NOT change application code, specs, plans, dependencies, or Git history.
- Do NOT assert that tests passed, features are finished, or approvals were granted without evidence.
- Do NOT erase important unfinished work simply to shorten the document.

## Final response
Summarize the updated handoff and call out the single most actionable next step.
