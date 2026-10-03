# Create a campaign by copying an existing one (DRAFT PLAN, no code yet)

## Request

On **Create campaign**, the manager can start from scratch or **copy from** an existing campaign. After picking the source,
the form lists what can be copied (eligibility rules, provinces, information sessions, ...) and the manager ticks
each part one by one.

## What exists today (checked in the code)

- The create dialog already has a **Copy** radio, disabled, and `startMode: "copy"` already travels to the API.
  `CampaignValidator.ValidateCreate` rejects `copy` with "available once you have completed a campaign", and three
  tests pin that. This feature replaces that stub.
- There is **no activate or close endpoint**, so every campaign is a Draft today. A "copy from a completed campaign"
  rule would offer nothing to copy. (Open question 1.)
- A campaign owns: Step 1 info (name, year, description, dates, expected candidates, seats) and its **target provinces**
  (Campaigns module); the **rule set** and the **exam subjects** (Eligibility); the **information sessions** (Sessions).
  Steps 4 and 5 (candidates, exam) have no module yet.
- Eligibility and Sessions both depend on `Campaigns.Application`. Campaigns therefore **cannot** call them
  (that would be a cycle), and each module has its own DbContext, so there is **no single transaction** across them.
- Rules refer to exam subjects by field key (`FieldDefinition` per campaign). Copying rules without their subjects
  would leave rules pointing at fields the new campaign does not have.
- The same host cannot run overlapping sessions on the same date in any campaign, and a session today **must** have a
  date, times, a host and a person responsible (`InformationSession.Validate`, plus NOT NULL columns and check
  constraints). Copying sessions "with the sensitive fields blank" therefore needs a new state (see Decisions).

## Phase 1-2: Requirements and business rules (proposed, to confirm)

**Stakeholders:** system-admin and selection-manager (create campaigns). Officers and committee users: no access.

**Parts a manager can tick** (each independent unless noted):

| Part | What is copied | Notes |
|---|---|---|
| Target provinces | the province list | no dependency |
| Campaign details | description, expected candidates, seats | name and year are always the new ones; **dates are never copied** |
| Eligibility rules | the rule set (groups, rules, age reference date) **and the exam subjects the rules use** | one tick, subjects ride along; shown in the list as "(includes exam subjects)" |
| Information sessions | title, format, venue, link, province, notes | copied as **Unscheduled**: date, times, host and person responsible are left **blank**. Never attendance, expected number, cancellation or audit |

**Rules**
- R1. Copy is **read-only on the source**: the source is never changed, locked or re-versioned.
- R2. Only admin and manager can copy (same as create). The server re-checks; the UI hiding is cosmetic.
- R3. Nothing is ticked by default except what the manager chooses; at least the form's name and year are required as today.
- R4. Copied steps are marked **In progress, never Complete**: a copy still has to be reviewed and saved on its own
  page, so the checklist cannot be passed by cloning alone.
- R5. Target provinces are applied first. A session whose province is not in the new campaign's provinces keeps no
  province (it is not dropped); rules and sessions never bring a province the manager did not tick.
- R6. **Unscheduled sessions.** A copied session has status *Unscheduled*: its date, start and end time, host and
  person responsible are empty, and they are filled in later with a **Schedule** action. Scheduling is all at once
  (confirmed with the requester): there is no half-scheduled state. It becomes *Planned* only when someone gives all of them (the existing validation
  applies at that moment, including the host-clash check). Because no host or date is copied, there is nothing to
  skip and nothing that can clash with the source campaign. The expected number is not copied (a last cycle's figure
  would mislead).
- R6a. While Unscheduled a session can be edited, scheduled or cancelled, but numbers cannot be entered (there is no
  date yet). It is left out of "Coming up", of the clash check and of the *planned* count, and it is listed after the
  scheduled ones in the table. Only admin and manager can schedule it (same as editing today).
- R7. The result lists every part as Copied (with a count), Partly copied (with the reason per item) or Not copied,
  so nothing fails silently.
- R8. Audit: each copied rule set and session gets an audit entry "copied from <source name>".

**Decisions made with the requester:** any campaign can be a source (any status); session date, host and person
responsible are blanked on copy; a new *Unscheduled* status carries those sessions.

**Out of scope:** copying candidates, exam results or scores; shifting dates automatically; copying between
environments; "merge into an existing campaign" (a later feature, but the design allows it).

## Phase 3-4: Domain and architecture

- **No new aggregate.** Campaign, RuleSet and InformationSession keep their invariants. `Campaign.Create` and
  `RuleSet.Apply` are reused as they are. `InformationSession` gets one new factory, `CreateUnscheduled(campaignId,
  template, ...)`, and one new operation, `Schedule(details, now)` (Unscheduled -> Planned, running the full existing
  `Validate`). The invariant becomes: *Planned and Done sessions always have date, times, host and assignee;
  only Unscheduled ones may lack them.* Cancel, SetExpected and Update accept Unscheduled where it makes sense;
  `RecordAttendance` refuses it.
- **A port, not a dependency.** `Campaigns.Application` publishes `ICampaignCopyPart` (like the existing
  `ICampaignSetupGateway`, in the other direction):
  `Key`, `DescribeAsync(sourceId)` (counts for the preview) and `CopyAsync(sourceId, target, options)`.
  Eligibility and Sessions each implement and register one. `CampaignService` receives `IEnumerable<ICampaignCopyPart>`
  and runs the ticked ones in a fixed order: provinces and details (own module), then eligibility, then sessions.
  The dependency direction stays Eligibility/Sessions -> Campaigns. Steps 4 and 5 plug in later by adding a part.
- **Failure model (no cross-module transaction).** The campaign is created and saved first (name uniqueness is
  checked up front as today). Each part then copies in its own transaction. If one part fails, the campaign still
  exists, the other parts stand, and the response says which part failed and why. The manager can retry that part
  from the campaign's own page (the retry endpoint is the same call with the existing campaign id). This avoids a
  distributed transaction in a monolith that does not need one.
- Decision records to write: ADR-1 port-based copy parts; ADR-2 per-part transactions with a reported result.

## Phase 5: Database

- **No new tables.** Copied rows get new ids (rules and groups too, so the audit log and the test panel never point
  at the source's ids). Indexes already cover the lookups (`campaign_id`); the preview counts use those.
- **One Sessions migration** (the only schema change): `date`, `start_time`, `end_time`, `assignee_id`, `assignee_name`
  and `host_type` become nullable; the status check constraint gains `Unscheduled`; the existing check constraints
  that tie the columns together are rewritten as "required unless status is Unscheduled", so the database keeps
  enforcing the invariant and not only the code. Existing rows are all Planned/Done/Cancelled and already full, so
  nothing needs backfilling. The clash query and the "mine" list must ignore rows with a null date. Reversible
  (down: refuse if Unscheduled rows exist, else restore NOT NULL).

## Phase 6: Security

- `POST /api/campaigns` stays **ManagementTier**. The new preview endpoint is also ManagementTier (it reveals the
  source's contents).
- Server checks: source exists; the caller may see it; every ticked part is a known key (unknown key is a 400);
  string sizes are unchanged because the copy reuses the domain validation.
- Scheduling an Unscheduled session is a state change on a management-tier endpoint (the existing `PUT` for
  details), so it needs ManagementTier like any edit; an officer still cannot schedule, only enter numbers on a
  scheduled session. Names of people on sessions are looked up on the server, never taken from the request (as today).
- Threat notes: tampering with `parts` to copy something not offered (rejected by the known-key check); cloning to
  exfiltrate another campaign (every campaign is visible to the management tier already, so no new exposure);
  double submit creating two campaigns (name uniqueness already blocks the second).

## Phase 7: API (proposed)

- `GET /api/campaigns/{id}/copy-preview` -> `{ name, academicYear, parts: [{ key, label, available, count, note }] }`.
  Drives the checklist so the counts are real ("12 sessions", "9 rules + 4 exam subjects").
- `POST /api/campaigns` (extended): adds `copyFrom?: { sourceCampaignId, parts: ["Provinces","Details","EligibilityRules","InformationSessions"] }`.
  `startMode: "copy"` requires `copyFrom`. 201 returns the campaign plus `copyResult: [{ part, outcome, count, issues[] }]`.
- `POST /api/campaigns/{id}/copy` (retry a part into an existing Draft; same body). Optional for v1; see implementation order.
- Errors: 400 field errors (`copyFrom.sourceCampaignId`, `copyFrom.parts`), 404 source not found, 409 target not editable.
- **Sessions API changes (contract change, not only additive):** `SessionRequest` already carries every field; the
  existing `PUT` on an Unscheduled session with all fields present is what schedules it. `InformationSessionDto`
  gets nullable `date`, `startTime`, `endTime`, `assignee` and `host`, and `status` gains `"Unscheduled"`;
  `SessionSummary` gains an `unscheduled` count. The web types and every screen that reads these fields must handle
  null (see the frontend commits).

## Phase 8: Tests (what must be proved)

- Each part alone, every combination of two, and all four; the source unchanged afterwards (rows, versions).
- Rules copied with new ids and with their exam subjects; a rule never points at a missing subject.
- Sessions: copies are Unscheduled with date, times, host and assignee empty; attendance, expected number and
  cancellation never copied; a province outside the new campaign's list is dropped to none; an Unscheduled
  session can be edited, cancelled and scheduled (Planned, with the clash check), cannot take attendance; a
  Planned session still cannot lose its date (domain and database); Unscheduled sessions do not appear in
  "Coming up", mine, clash checks or the planned count; existing session tests keep passing unchanged.
- Steps end In progress, not Complete. Officer cannot copy (403). Unknown part (400). Unknown source (404).
- One part failing leaves the campaign and the other parts, with the failure reported.
- Frontend: picking Copy shows the source list; ticking and unticking; counts shown; disabled parts explained;
  submit sends exactly the ticked parts; result banner lists outcomes; keyboard and screen reader order.

## Phase 9: Performance

- A copy is a handful of inserts (60 sessions and dozens of rules at most). One query per part to read the source,
  one `SaveChanges` per part. Expected well under a second; no caching needed. The preview is three count queries.

## Phase 10: Implementation plan (commits, each building and passing tests)

1. Campaigns: `ICampaignCopyPart`, request/response contracts, validator rules (replace the "copy rejected" stub and
   its three tests). Provinces and details parts live here.
2. Campaigns: `CampaignService.CreateAsync` runs ticked parts; `GET .../copy-preview`; API tests.
3. Eligibility: copy part (rule set + exam subjects, new ids, audit). Tests.
4. Sessions domain: `Unscheduled` status, `CreateUnscheduled`, `Schedule`, relaxed invariants, unit tests.
5. Sessions persistence: the migration above, clash and "mine" queries ignore null dates, API tests for the new
   status and for scheduling.
6. Sessions API and DTOs: nullable fields, `unscheduled` count; then the Sessions copy part. Tests.
7. Frontend, sessions: types allow null; cards and table show "Not scheduled" and sort them last; "Schedule"
   action opens the edit form with the date, host and assignee empty; the status badge and filter gain
   Unscheduled; "Coming up" ignores them.
8. Frontend, create dialog: enable Copy, source select, checklist with counts, messages in `en.ts`.
9. Frontend: result banner on the new campaign, retry for a failed part (if retry is in scope).
10. Docs: update this README and `features/information-sessions/README.md` to what was built.

**Rollout:** one reversible migration (applied by the existing database initializer). Deploy backend and frontend
together: an older frontend reading a null date would break, so the Unscheduled status must not be created before the
new frontend is live (the Copy radio stays disabled until commit 8, and only the sessions copy creates such rows).
**Rollback:** revert the frontend commits to hide Copy; Unscheduled rows already created must be scheduled or
cancelled first (the down migration refuses otherwise). `startMode: "scratch"` is unchanged throughout.

## Risks

- Making date, host and assignee nullable touches a feature that is built and tested (22 commits). It is the largest
  part of this work and the only place a regression is likely; the plan keeps the "Planned/Done are always full"
  invariant in the domain and the database so existing behaviour is unchanged.
- Cross-module copy is not atomic; the reported per-part result and retry are the mitigation.
- Rules without their exam subjects would dangle, so the two always travel together.
