---
name: monster-ui
description: Implement and review mobile-first React and Tailwind UI for the Monster Girl game using project design conventions and visual references.
---

# Monster Girl UI

## Before implementation
1. Read AGENTS.md and the relevant feature spec.md and plan.md.
2. Inspect existing components, styles, assets, and UI patterns.
3. Read any available visual references.
4. Identify ambiguities before implementation.
5. Follow the project's approval workflow.

## Visual direction
- Mobile-first dark fantasy game UI.
- Dark backgrounds with purple-pink accents.
- Pixel-art monster sprites, preserving crisp edges.
- Compact, readable cards displaying game information.
- Consistent spacing, typography, borders, and UI states.
- Avoid generic dashboard styling.

## Implementation
- Use React, TypeScript, and Tailwind.
- Reuse existing components and design tokens.
- Prefer responsive layouts over fixed screen dimensions.
- Use real project assets where available.
- Do not invent final monster artwork or silently replace missing assets.
- Keep UI components separate from API and game logic.
- Implement loading, empty, error, and disabled states.

## Visual verification
1. Run relevant checks.
2. If browser tooling is available, capture the implemented page.
3. Compare it to the visual reference.
4. Report major layout and styling differences.
5. Fix issues within the approved scope.
6. Report any unverified visual requirements.

## Constraints
- Do not introduce a component library without approval.
- Do not change unrelated screens.
- Do not invent new gameplay requirements.
- Do not implement without an approved plan.