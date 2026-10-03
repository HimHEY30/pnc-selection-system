# Module Ownership Matrix

## Identity

Owns:
- `Group` (enum), `AuthenticatedUser` (Identity.Domain)
- JWT Bearer authentication against Keycloak, realm-role claims flattening (Identity.Infrastructure)
- Authorization policies: `SystemAdmin`, `SelectionManager`, `SelectionOfficer`, `CommitteeUser`, `ManagementTier`, `OperationsTier`

Publishes (Application Contracts other modules may depend on):
- `ICurrentUserService` — who is making the current request
- `AuthorizationPolicies` — policy name constants for `[Authorize(Policy = ...)]`

Consumes:
- Keycloak (external identity provider) — never a local database for credentials

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
- `RuleSet` (one per campaign) with its `RuleGroup`s and `Rule`s, and the append-only `audit_log` of who changed what
- `EligibilityEvaluator` (Eligibility.Domain): decides whether a candidate is eligible under a rule set and returns
  the result of every rule. Pure (no database, no web request), so the Candidates step can call it for every candidate.
- Rule validation, contradiction and duplicate detection, the suggested starter rules (Eligibility.Domain / Application)

Publishes:
- HTTP API: `/api/eligibility/catalogue`, `/api/campaigns/{id}/eligibility[/draft|/test|/suggested]`
- `IEligibilityService` (Eligibility.Application), including `CopyRulesAsync` for the Create dialog's future
  "copy settings" option
- `EligibilityEvaluator`, `RuleSetContent`, `CandidateData`, `EligibilityResult` (Eligibility.Domain), for the
  Candidates step

Consumes:
- Campaigns: `ICampaignSetupGateway` (is the campaign a draft, its target provinces and start date; set Step 2's status)
- Identity: `ICurrentUserService`, `AuthorizationPolicies` (`OperationsTier` to read and test, `ManagementTier` to save)

Written by hand: the foreign keys from `rule_sets` and `audit_log` to `campaigns.campaigns` (that table belongs to
another module's context, so EF cannot model them). The Host runs the Campaigns migrations first for that reason.

---

## Host (composition root, not a module)

Owns nothing business-related. Only:
- Wires every module's `AddXInfrastructure()` into the DI container
- Registers every module's Api assembly as an MVC application part
- Cross-cutting middleware order (CORS, auth, routing)

Adding a new module means adding one `AddXInfrastructure()` call and one
`AddApplicationPart()` call here — nothing else in Host should change.
