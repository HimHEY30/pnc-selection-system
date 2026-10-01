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

## Host (composition root, not a module)

Owns nothing business-related. Only:
- Wires every module's `AddXInfrastructure()` into the DI container
- Registers every module's Api assembly as an MVC application part
- Cross-cutting middleware order (CORS, auth, routing)

Adding a new module means adding one `AddXInfrastructure()` call and one
`AddApplicationPart()` call here — nothing else in Host should change.
