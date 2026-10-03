# Module Ownership Matrix

## Identity

Owns:
- `Group` (enum), `AuthenticatedUser` (Identity.Domain)
- JWT Bearer authentication against Keycloak, realm-role claims flattening (Identity.Infrastructure)
- Authorization policies: `SystemAdmin`, `SelectionManager`, `SelectionOfficer`, `CommitteeUser`, `ManagementTier`, `OperationsTier`

Publishes (Application Contracts other modules may depend on):
- `ICurrentUserService` — who is making the current request
- `AuthorizationPolicies` — policy name constants for `[Authorize(Policy = ...)]`
- `IStaffDirectory` — the admins, managers and officers, by name (who a session can be assigned to). Implemented against
  Keycloak's admin API with a read-only service client and cached for a minute; fails with an "unavailable" error when
  Keycloak cannot be asked. Also `GET /api/staff/assignable` (management tier).

Consumes:
- Keycloak (external identity provider) — never a local database for credentials. Credentials and roles come from the
  token; the staff list comes from the admin API (`selection-system-staff-reader`, roles `view-users`, `query-users`,
  `query-groups`).

No module may reference `Identity.Infrastructure` directly. Only `Identity.Application`'s
contracts (`ICurrentUserService`, `AuthorizationPolicies`) and `Identity.Domain`'s types
(`Group`, `AuthenticatedUser`) are safe for other modules to depend on.

---

## Campaigns

Owns (schema `campaigns` in the `ssms` database):
- `Campaign` aggregate with its `SetupStep`s and `CampaignProvince` links (Campaigns.Domain)
- `Province` reference data: Cambodia's 25 provinces, seeded by the first migration
- `CampaignStatus` (Draft/Active/Closed), `SetupStepKey`, `StepStatus`
- Campaign business rules: unique name, Step 1 validation, step status transitions (Campaigns.Application)
- EF Core `CampaignsDbContext`, migrations, repository (Campaigns.Infrastructure)

Publishes:
- HTTP API: `/api/campaigns`, `/api/campaigns/{id}`, `/api/campaigns/{id}/info[/draft]`, `/api/provinces`
- `ICampaignService` (Campaigns.Application), for modules that later need campaign data
- `ICampaignSetupGateway` (Campaigns.Application): what a setup step needs to know about its campaign (status, start
  date, target provinces, every step's status) and the way to report its own step's status. Eligibility, and later
  Sessions, Candidates and Exam, use this instead of reading the campaign tables.

Consumes:
- Identity: `ICurrentUserService` (creator's id and display name), `AuthorizationPolicies`
  (`OperationsTier` to read, `ManagementTier` to create and edit)

Not owned: users (Keycloak). `created_by_name` is a snapshot, not a reference.

---

## Eligibility

Owns (schema `eligibility` in the `ssms` database):
- The field catalogue: `fields`, `field_options`, `operators` (seeded by the first migration). A field is a row, so a
  new field needs no change to the rule builder. A new operator also needs code in the evaluator.
- Each campaign's **exam subjects** (Math, Logic, English, ...): rows of `fields` that carry a `campaign_id` and a
  `subject_name`, plus `exam_setups` (marks that a campaign's defaults were added). The shared catalogue also holds the
  total and average of a campaign's subjects. Subject rules live with the other rules; the subjects are Eligibility's, not
  a Campaigns concept.
- `RuleSet` (one per campaign) with its `RuleGroup`s and `Rule`s, and the append-only `audit_log` of who changed what
- `EligibilityEvaluator` (Eligibility.Domain): decides whether a candidate is eligible under a rule set and returns
  the result of every rule. Pure (no database, no web request), so the Candidates step can call it for every candidate.
- Rule validation, contradiction and duplicate detection, the suggested starter rules (Eligibility.Domain / Application)

Publishes:
- HTTP API: `/api/eligibility/catalogue`, `/api/campaigns/{id}/eligibility[/draft|/test|/suggested]`,
  `/api/campaigns/{id}/eligibility/exam-subjects[/{key}]` (the campaign's subjects and its own catalogue)
- `IEligibilityService` (Eligibility.Application), including `CopyRulesAsync` (which also copies the subjects) for the
  Create dialog's future "copy settings" option; `IExamSubjectService` for the subject list
- `EligibilityEvaluator`, `RuleSetContent`, `CandidateData`, `EligibilityResult` (Eligibility.Domain), for the
  Candidates step

Consumes:
- Campaigns: `ICampaignSetupGateway` (is the campaign a draft, its target provinces and start date; set Step 2's status)
- Identity: `ICurrentUserService`, `AuthorizationPolicies` (`OperationsTier` to read and test, `ManagementTier` to save)

Written by hand: the foreign keys from `rule_sets`, `audit_log`, `exam_setups` and a subject's `fields` row to
`campaigns.campaigns` (that table belongs to another module's context, so EF cannot model them). The Host runs the
Campaigns migrations first for that reason. Also by hand, because EF cannot describe them: the unique subject name per
campaign (an expression index) and the rule-to-field key, which is checked when the transaction commits so a campaign's
subjects and rules can be deleted together.

---

## Sessions

Owns (schema `sessions` in the `ssms` database):
- `InformationSession` (Sessions.Domain): when and where, who is responsible, who runs it, status (Planned, Done,
  Cancelled), the expected number and the actual attendance (females and males). Every change goes through it, so a
  session cannot hold an impossible combination.
- `SessionHost`: the directory of alumni and partners. Officers are not directory records: a session points at the staff
  member's Keycloak id and keeps a name snapshot.
- The append-only `audit_log` (sessions and hosts)
- The rules: validation, the host clash check, the attendance date rule on the Cambodia clock, Step 3's status
  (Sessions.Domain / Sessions.Application)

Publishes:
- HTTP API: `/api/campaigns/{id}/sessions[/{sessionId}[/cancel|/expected|/attendance]]`, `/api/sessions/mine`,
  `/api/session-hosts[/{id}[/active]]`
- `ISessionService`, `IHostService` (Sessions.Application), for the Candidates step later

Consumes:
- Campaigns: `ICampaignSetupGateway` (the campaign's status and target provinces; set Step 3's status)
- Identity: `ICurrentUserService`, `IStaffDirectory`, `AuthorizationPolicies` (`OperationsTier` to read and to enter
  the numbers, `ManagementTier` to add, change and cancel sessions and to change the host directory)

Written by hand: the foreign keys from `information_sessions` and `audit_log` to `campaigns.campaigns`, and from
`information_sessions` to `campaigns.provinces` (other modules' tables, which EF cannot model). The Host runs the
Campaigns migrations first for that reason.

---

## Host (composition root, not a module)

Owns nothing business-related. Only:
- Wires every module's `AddXInfrastructure()` into the DI container
- Registers every module's Api assembly as an MVC application part
- Cross-cutting middleware order (CORS, auth, routing)

Adding a new module means adding one `AddXInfrastructure()` call and one
`AddApplicationPart()` call here — nothing else in Host should change.
