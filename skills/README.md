# Full-Stack Delivery Skills

Each subdirectory is a standalone Claude Code skill: `skills/<skill-name>/SKILL.md`,
with `name`/`description` frontmatter so Claude can discover and invoke it directly
(`/skill-name` or via the Skill tool). Originally a flat, numbered-file layout
(`skills/00-master-orchestrator.md`, `skills/01-business-analyst.md`, ...) that Claude
Code never scanned for skills — only `skills/<name>/SKILL.md` is picked up — so nothing
here was actually discoverable until the move to per-directory `SKILL.md` files.

Entry point for a whole feature, frontend and backend together:

```
/master-fullstack-orchestrator
```

That skill coordinates every other one below. You can also invoke any individual
skill directly (e.g. `/api-architect`) when you only need one phase.

## Backend track

Sequence [master-backend-orchestrator](master-backend-orchestrator/SKILL.md) drives
for every feature:

| # | Skill | Phase |
|---|-------|-------|
| 1 | [business-analyst](business-analyst/SKILL.md) | Requirement analysis, business rules, user stories, acceptance criteria |
| 2 | — | Business validation (orchestrator re-reads Phase 1 output) |
| 3 | [domain-driven-design](domain-driven-design/SKILL.md) | Aggregates, invariants, domain modeling |
| 4 | [solution-architect](solution-architect/SKILL.md) + [modular-monolith-enforcer](modular-monolith-enforcer/SKILL.md) | System architecture + module boundary governance |
| 5 | [database-architect](database-architect/SKILL.md) (+ [postgresql-expert](postgresql-expert/SKILL.md)) | Schema design aligned to DDD aggregates |
| 6 | [security-architect](security-architect/SKILL.md) + [identity-access-expert](identity-access-expert/SKILL.md) | AuthN/AuthZ, data protection, access control |
| 7 | [api-architect](api-architect/SKILL.md) (+ [swagger-expert](swagger-expert/SKILL.md), [graphql-architect](graphql-architect/SKILL.md), [event-driven-architect](event-driven-architect/SKILL.md) as needed) | REST/GraphQL/event contract design — produces `api-contract.md`, the hand-off point for the frontend track |
| 8 | [test-engineer](test-engineer/SKILL.md) | Test strategy and coverage design |
| 9 | [performance-engineer](performance-engineer/SKILL.md) | Scalability, throughput, caching review |
| 10 | — | Implementation planning gate ([clean-code-reviewer](clean-code-reviewer/SKILL.md) design-time check) |

Post-implementation: [code-reviewer](code-reviewer/SKILL.md) →
[devops-engineer](devops-engineer/SKILL.md) →
[observability-engineer](observability-engineer/SKILL.md).
[refactoring-specialist](refactoring-specialist/SKILL.md) is on-demand technical-debt cleanup.

## Frontend track (React + Next.js + Tailwind/shadcn-ui)

Starts in parallel with the backend track at Phase 2, but frontend
*implementation* waits for the backend's `api-contract.md` (Phase 7):

| Skill | Responsibility |
|-------|-----------------|
| [ui-ux-designer](ui-ux-designer/SKILL.md) | Screen inventory, user flows, interaction states, a11y requirements — runs right after business-analyst |
| [design-system-architect](design-system-architect/SKILL.md) | Owns design tokens and the shared component library/contracts — the single source of visual truth |
| [design-system-enforcer](design-system-enforcer/SKILL.md) | Governance gate: rejects hardcoded styling, duplicate components, missing dark-mode/a11y support |
| [frontend-architect](frontend-architect/SKILL.md) | Next.js routing, data fetching, state management, typed API client from the backend's OpenAPI spec |
| [frontend-test-engineer](frontend-test-engineer/SKILL.md) | Component, integration, e2e, accessibility, visual-regression test design |
| [frontend-performance-engineer](frontend-performance-engineer/SKILL.md) | Core Web Vitals, bundle budgets, hydration cost, caching/revalidation |
| [frontend-code-reviewer](frontend-code-reviewer/SKILL.md) | Server/Client boundary correctness, hooks correctness, type safety, design-system compliance |

## Known issue

None currently tracked. Previously `master-backend-orchestrator/SKILL.md` ended
mid-sentence with only Phase 1 written out — Phases 2-10 have since been completed
to match the detail level of the other skills, and a prior character-corruption bug
in `clean-code-reviewer/SKILL.md` has been fixed.
