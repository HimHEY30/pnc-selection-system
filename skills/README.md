# Backend Governance Skills

Each subdirectory is a standalone Claude Code skill: `skills/<skill-name>/SKILL.md`,
with `name`/`description` frontmatter so Claude can discover and invoke it directly
(`/skill-name` or via the Skill tool). This replaces the previous flat, numbered-file
layout (`skills/00-master-orchestrator.md`, `skills/01-business-analyst.md`, ...),
which Claude Code does not scan for skills — only `skills/<name>/SKILL.md` is picked up.

## Intended workflow order

The numeric prefixes on the old filenames encoded the sequence
[master-backend-orchestrator](master-backend-orchestrator/SKILL.md) expects for every
feature request. That sequence, preserved here for reference:

| # | Skill | Phase |
|---|-------|-------|
| 1 | [business-analyst](business-analyst/SKILL.md) | Requirement analysis, business rules, user stories, acceptance criteria |
| 2 | [solution-architect](solution-architect/SKILL.md) | System architecture from approved requirements |
| 3 | [modular-monolith-enforcer](modular-monolith-enforcer/SKILL.md) | Module boundary / dependency governance |
| 4 | [domain-driven-design](domain-driven-design/SKILL.md) | Aggregates, invariants, domain modeling |
| 5 | [database-architect](database-architect/SKILL.md) | Schema design aligned to DDD aggregates |
| 6 | [api-architect](api-architect/SKILL.md) | REST API / contract design |
| 7 | [security-architect](security-architect/SKILL.md) | AuthN/AuthZ, data protection, compliance |
| 8 | [performance-engineer](performance-engineer/SKILL.md) | Scalability, throughput, caching review |
| 9 | [clean-code-reviewer](clean-code-reviewer/SKILL.md) | SOLID, readability, maintainability |
| 10 | [test-engineer](test-engineer/SKILL.md) | Test strategy and coverage design |

Supporting / on-demand skills (not part of the fixed sequence):

- [swagger-expert](swagger-expert/SKILL.md) — OpenAPI/Swagger documentation
- [devops-engineer](devops-engineer/SKILL.md) — CI/CD, deployment, release readiness
- [code-reviewer](code-reviewer/SKILL.md) — pre-merge comprehensive review
- [refactoring-specialist](refactoring-specialist/SKILL.md) — technical debt reduction
- [graphql-architect](graphql-architect/SKILL.md) — GraphQL schema/federation design
- [postgresql-expert](postgresql-expert/SKILL.md) — PostgreSQL tuning and operations
- [event-driven-architect](event-driven-architect/SKILL.md) — async/event contracts
- [observability-engineer](observability-engineer/SKILL.md) — logging, metrics, tracing
- [identity-access-expert](identity-access-expert/SKILL.md) — IAM, RBAC, access governance

## Known issue

[master-backend-orchestrator/SKILL.md](master-backend-orchestrator/SKILL.md) ends
mid-sentence inside an unclosed code block (`Phase 1 Requirement Analysis` section) —
this was already true before the restructure and wasn't rewritten here since the
intended full content isn't known. Worth finishing out that file's Phase 2-10
sections to match the detail level of the other skills.
