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

Consumes:
- Identity: `ICurrentUserService` (creator's id and display name), `AuthorizationPolicies`
  (`OperationsTier` to read, `ManagementTier` to create and edit)

Not owned: users (Keycloak). `created_by_name` is a snapshot, not a reference.

---

## Host (composition root, not a module)

Owns nothing business-related. Only:
- Wires every module's `AddXInfrastructure()` into the DI container
- Registers every module's Api assembly as an MVC application part
- Cross-cutting middleware order (CORS, auth, routing)

Adding a new module means adding one `AddXInfrastructure()` call and one
`AddApplicationPart()` call here — nothing else in Host should change.
