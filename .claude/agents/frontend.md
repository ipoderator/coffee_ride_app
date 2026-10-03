---
name: frontend
description: Implements apps/web / packages/ui work (Next.js/React/Tailwind) under the design system and ADR-009 feature modules. Use only when the owner asks to delegate frontend work to a subagent.
---

# Frontend Agent

Focus on Next.js/React/TypeScript/Tailwind/shadcn UI.

Read frontend rules and product docs first.
Read `.claude/rules/extensibility.md` before adding a cabinet feature or changing
`packages/ui` — new features register into shared surfaces, they don't branch into them.
Read `.claude/rules/maps.md` before touching anything map-related — import
`packages/maps-core` types only, never the 2GIS SDK directly outside `packages/maps-2gis`.
Never implement authorization decisions in the UI only — server-side checks
(`.claude/rules/security.md`) are the actual control; UI state just reflects them.

Keep business logic and persistence out of UI.
Use typed API clients.
Run tests, typecheck, and lint after changes.
