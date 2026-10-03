# Candidates: technical design and build order

Companion to [README.md](README.md) (requirements and decisions). Plan only; nothing here is built.

How this was produced: I wrote it myself, in the roles the orchestrator names (analyst, architect, database, security,
API, test, performance). No separate specialist agents were run, and the phases are merged into this one file instead of
the 40 files the skill lists. The gates were checked by me, not by an independent reviewer.

## Domain

**Aggregate: `Candidate`** (one per person per campaign). Fields as in the README. Invariants the class enforces, so
no caller can break them:
- Khmer and English name, gender, birth date and phone follow the README rules (the phone is normalised inside).
- Exactly one school source: a partner host (`SchoolHostId` + copied `SchoolName`) or a typed name (`SchoolHostId = null`).
- NGO name present if and only if `HasNgoSupport`.
- Address codes: province, district and commune present together, village code and name together, or all codes null with names typed.
- `Version` (PostgreSQL `xmin`) for two people saving at once.

**Value objects:** `PersonName` (Khmer + English), `PhoneNumber`, `AddressLine` (levels as code + name), `SchoolOrigin`,
`NgoSupport`. **Factory:** `Candidate.Create(details, user, now)` returns `Result<Candidate>`; `Change(details, ...)` the same.
Errors are `Error` values like in Sessions (`CandidateErrors`), never exceptions for rule failures.

**Rules that need other data stay in the application service**, not the aggregate: duplicate phone in the campaign
(repository query), the campaign being open for change, the session belonging to the campaign and not cancelled, the host
being an active high-school partner.

**Domain events:** none. Nothing else reacts to candidates yet, so I am not adding a bus for it.
Audit is written by the service, as in Sessions.

## Module and boundaries

New module `Candidates` beside Identity, Campaigns, Eligibility and Sessions: `Candidates.Domain`, `.Application`,
`.Infrastructure`, `.Api`, tests in `Candidates.Tests`; registered in `Backend.slnx` and `Program.cs`
(`AddCandidatesInfrastructure`, initializer after Sessions, because it points at sessions' tables).

Dependencies, one direction only: Api → Application → Domain; Infrastructure → Application. Candidates depends on:
- **Campaigns.Application**: `ICampaignSetupGateway` (already used by Sessions) to know a campaign exists and is open.
- **Sessions.Application**: two **new small read interfaces** that Sessions publishes, so Candidates never touches Sessions' entities or tables through code:
  - `ISessionChoices.ForCampaignAsync(campaignId)` → id, title, date, status of sessions that can be chosen; `ExistsInCampaignAsync(sessionId, campaignId)`.
  - `ISchoolDirectory.FindActiveHighSchoolAsync(hostId)` and `ListActiveHighSchoolsAsync()` → id, name.
- **Identity.Application**: `AuthorizationPolicies` and the caller's id and name.

Nothing depends on Candidates yet. No cycle: Sessions does not reference Candidates. (The list screen shows a session's
title by calling the same `ISessionChoices` through the Candidates API, not by joining across schemas.)
**Gate to check before coding:** the new interfaces sit in `Sessions.Application` and are the only cross-module
surface; no `using Sessions.Domain` in Candidates.

## Database (schema `candidates`, same PostgreSQL database; EF Core migrations like the other modules)

`candidates.candidates` — one table, one aggregate:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| campaign_id | uuid not null | hand-written FK to `campaigns.campaigns`, `ON DELETE CASCADE` (as Sessions does) |
| name_km, name_en | varchar(100) not null | |
| gender | smallint not null | 1 female, 2 male; check constraint |
| date_of_birth | date not null | |
| phone | varchar(20) not null | normalised digits |
| province_code, district_code, commune_code, village_code | varchar(10) null | |
| province_name, district_name, commune_name, village_name | varchar(100) | names required for the first three |
| school_host_id | uuid null | no FK: hosts are switched off, never deleted, and the name is copied |
| school_name | varchar(150) not null | |
| session_id | uuid null | hand-written FK to `sessions.information_sessions`, `ON DELETE SET NULL` |
| has_ngo_support | boolean not null | |
| ngo_name | varchar(150) null | check: not null ⇔ has_ngo_support |
| created_at/by/by_name, updated_at | | as Sessions |
| xmin | concurrency token | |

`candidates.audit_log` — append-only, same shape as `sessions.audit_log` (entity id, action, user, time, before/after JSON). Justified: Sessions has the same table and the README requires an audit trail.

**Indexes:** unique `(campaign_id, phone)`; `(campaign_id, created_at desc)` for the default list; `(campaign_id, province_code)`;
`(campaign_id, session_id)`; trigram (`pg_trgm`) on `name_en` and `name_km` for search. At a few thousand rows per
campaign the trigram indexes are optional; I would start with `ILIKE` on the campaign's rows and add them only if a
real query is slow, so the first migration does not need the extension. The database repeats the README rules as check constraints.

**Migration order:** one `InitialCandidates` migration, after the Sessions migrations. Nothing existing is altered.
Rollback is dropping the `candidates` schema (no other module reads it).
Reminder: the dev database has not yet had the Sessions `AllowUnscheduledSessions` migration applied; it applies automatically at start-up.

## Security

- Every endpoint requires login. Read, create, change: `OperationsTier`. Delete: `ManagementTier`. The server decides; hiding buttons is only a convenience.
- Access matrix:

| Endpoint | admin | manager | officer | committee-user |
|---|---|---|---|---|
| list, get | ✔ | ✔ | ✔ | ✘ |
| create, change | ✔ | ✔ | ✔ | ✘ |
| delete | ✔ | ✔ | ✘ | ✘ |

- A candidate is always fetched by `(campaign_id, id)`, so an id from another campaign returns 404 (no guessing across campaigns).
- All input is validated again on the server, including that the `sessionId` is in the same campaign and the `schoolHostId` is an active high-school partner. Names of the user doing the action come from the token, never the form.
- Candidate data is **not** written to logs (log ids only). Responses are not cached by the browser or by a shared cache (`Cache-Control: no-store`).
- Threats considered: a logged-in officer reading another campaign's list (allowed by design, same as sessions); id guessing (blocked above); lost updates (xmin); script in a name field (React escapes; the server also rejects characters outside the allowed sets); CSV/formula injection is not applicable until an export exists; mass listing (page size capped at 100).
- Open item: how long to keep candidate data (README). Blocks go-live, not coding.

## API (routes under `api/campaigns/{campaignId}/candidates`)

| Method and path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /` `?q&province&sessionId&ngo&page&pageSize` | list, newest first | 200 `PagedResult<CandidateListItem>` | 400, 404 campaign |
| `GET /{id}` | one candidate | 200 `CandidateDto` | 404 |
| `POST /` | create | 201 `CandidateDto` | 400 field errors, 404, 409 duplicate phone (names the existing candidate), 409 campaign closed |
| `PUT /{id}` | change (sends `version`) | 200 | 400, 404, 409 stale version, 409 duplicate phone, 409 closed |
| `DELETE /{id}` | delete | 204 | 404, 409 closed |
| `GET /session-choices` | sessions that can be chosen | 200 list | 404 |
| `GET /api/candidate-schools` | active high-school partners | 200 list | |

Problem-details errors with the same shape as Sessions; field errors keyed by field name so the form can show them
beside the field. Documented in Swagger by the same attributes the other controllers use. `openapi` is generated, so
there is no separate hand-written spec.

## Frontend

- Routes: `/admin/campaigns/[id]/candidates` (list), and the add/change form as a dialog on that page (same pattern as the session form; no separate page needed). `STEP_HREFS.Candidates` is set, the sidebar item enabled and pointed at the active campaign, the Guide text updated (it now says Candidates are "not open yet").
- **Address picker** (`components/AddressPicker`): one new shared component, four cascading selects, built on the existing `Select`/field components. Data comes from `lib/address/client.ts`, the only file that knows the API's URL and response shape, so swapping the source or bundling the data is a one-file change. Loading, error with **Try again** and **Type it instead** states.
- Form uses `FormDialog` with the `dirty` guard and `useReportDirty`; copy in `lib/messages/en.ts`; no new colours.
- List: table in the style of the Sessions table, three-dots row menu, search box, filters, paging, empty state.
- Server actions in `candidates-actions.ts` next to `sessions-actions.ts`, typed client in `lib/candidates/`.
- If the form needs a control the design system lacks (a searchable select for long school lists), it is added to the shared components first, not built inside the feature.

## Tests

| Layer | What |
|---|---|
| Domain | every field rule in the README (Khmer vs Latin, phone forms, future birth date, age bounds, school either/or, NGO iff yes, address combinations) |
| Application | duplicate phone, closed campaign, session in another campaign, cancelled session, inactive or non-school host, stale version, audit entry written |
| Integration (HTTP) | each endpoint for each role in the access matrix (including officer delete = 403), campaign isolation (404), paging and filters |
| Frontend | address picker cascade and failure states (API mocked), form validation and field errors, NGO toggle, dirty guard, list search/filter/paging, role-based menu items, the Step 4 link |
| Traceability | every acceptance criterion in the README maps to at least one test; I will keep that table in the final README |

Mutation-style checks on the rules that are easy to get wrong (duplicate phone, NGO iff yes, campaign isolation).

## Performance

Expected load is small (hundreds to a few thousand candidates per campaign, a handful of staff). List query is one
indexed query with a page limit, no N+1; session titles are resolved with one batched call per page. Address lists
are fetched once per level and kept in memory for the dialog. No cache is added. No load test is planned at this
size; I will check the list query plan on a few thousand generated rows and say so in the README.
Frontend: the picker and form load with the dialog, not on the list page, so the list's first load does not grow.

## Build order (small commits, each builds and passes tests)

1. Plan documents (this commit).
2. Domain: `Candidate`, value objects, errors, and their tests.
3. Sessions publishes `ISessionChoices` and `ISchoolDirectory`, with tests.
4. Candidates infrastructure: DbContext, configuration, `InitialCandidates` migration, repository.
5. Application service, audit, and tests.
6. API controller, Program.cs registration, integration tests.
7. Frontend client, types, messages, server actions.
8. Address client and `AddressPicker`, with tests (first thing: call the real address API once and record what it returns).
9. Candidate form dialog.
10. List page, filters, row menu.
11. Turn on Step 4 and the sidebar item; update the Guide.
12. README: what was built and what was not verified.

**Rollout:** the migration only adds a schema; deploy backend first, then web. **Rollback:** redeploy the previous web
build (Step 4 goes back to "coming soon"), then drop the `candidates` schema if wanted. Nothing else depends on it.

## Delivery readiness (checked at the end, not now)

CI already runs the backend and web tests; no new pipeline is needed. Logs: ids and outcomes only. The address API's
failures are visible only in the browser, so I would count them in the form (a "could not load" event) once the
project has frontend error tracking, which it does not today.
