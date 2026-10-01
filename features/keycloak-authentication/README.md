# Feature: Keycloak Authentication & Group-Based Authorization

## Request

Set up Keycloak for authentication. Users belong to one of four groups:
`system-admin`, `selection-manager`, `selection-officer`, `committee-user`.

This is the foundation feature for the whole system: it also scaffolds the
backend API project and the frontend Next.js app, since neither existed yet.

## Assumptions (not specified by the request — confirm or correct)

The request named the four groups but not what each one is allowed to do.
The following was assumed so authorization policies could actually be built,
and should be treated as a draft RBAC matrix, not a finished one:

| Group | Assumed scope |
|---|---|
| `system-admin` | Full access: everything below, plus user/group/system administration. |
| `selection-manager` | Owns a selection campaign end-to-end: create/configure it, assign officers, finalize/publish results. |
| `selection-officer` | Executes selection work day-to-day: screens candidates, records evaluations, prepares committee packets. |
| `committee-user` | Reviews prepared packets and records committee decisions/votes. Read-mostly, decision-write. |

Nothing beyond "who's in the group" is enforced yet at the business-rule
level (e.g. "an officer can only act on campaigns they're assigned to") —
that's domain/business logic for each future feature, not something
authentication sets up on its own.

## What was built

**Identity provider** — `infra/keycloak/realm-export.json`, loaded by
`docker-compose.yml`:
- Realm `pnc-selection` with 4 realm roles (one per group) and 4 matching
  Keycloak Groups, so role assignment is managed via group membership.
- Client `selection-system-api` — confidential, `bearerOnly`: the backend
  only ever validates tokens, it never issues them.
- Client `selection-system-web` — confidential, authorization-code flow.
  Confidential (not public/PKCE) because the Next.js server, not the
  browser, performs the token exchange — the client secret never reaches
  the browser. Has an audience mapper so tokens it obtains are accepted by
  `selection-system-api`.
- 4 demo users (one per group) with temporary passwords, for local testing
  only — see "Local setup" below.

**Backend** (`backend/`) — ASP.NET Core on .NET 10, structured as a Modular
Monolith per `modular-monolith-enforcer`: every module is 4 projects
(`Domain`/`Application`/`Infrastructure`/`Api`), composed by a thin `Host`
that contains no business logic of its own. See `backend/ownership-matrix.md`.

```text
backend/src/
├── SharedKernel/                    BaseEntity, Result<T>, Error, IClock, PagedResult
├── Modules/
│   └── Identity/
│       ├── Identity.Domain/         Group (enum), AuthenticatedUser (value object)
│       ├── Identity.Application/    ICurrentUserService, AuthorizationPolicies — the
│       │                            only two things other modules may depend on
│       ├── Identity.Infrastructure/ Keycloak JWT Bearer wiring, realm_access.roles ->
│       │                            ClaimTypes.Role flattening, policy registration
│       └── Identity.Api/            AuthController (GET /api/auth/me + one ping per policy)
└── Host/                            Program.cs: calls AddIdentityInfrastructure() and
                                      registers Identity.Api as an MVC application part.
                                      Adding a module means adding one line of each here —
                                      nothing else in Host should change.
```

`KeycloakRoleClaimsTransformation` (in `Identity.Infrastructure`) flattens
Keycloak's nested `realm_access.roles` claim into standard ASP.NET
`ClaimTypes.Role` claims — without it, `[Authorize(Policy = ...)]` would
never match anything, since Keycloak doesn't emit role claims in the shape
ASP.NET expects by default.

**Frontend** (`apps/web/`) — `create-next-app`, Next.js 16 (App Router),
TypeScript, Tailwind:
- `auth.ts` — Auth.js (NextAuth v5) configured with the Keycloak provider.
  Decodes the access token once at sign-in to read `realm_access.roles` and
  persists them onto the session as `session.roles`.
- `proxy.ts` (Next.js 16's replacement for `middleware.ts`) — requires a
  session for every route except the auth routes, and additionally
  restricts `/admin` to `system-admin` and `/committee` to `committee-user`
  / `system-admin`, redirecting elsewhere to `/unauthorized`. Everything not
  listed in `PROTECTED_ROUTES` just needs *a* session — add a route there
  when a page needs a narrower group.
- `app/page.tsx` — sign-in/sign-out, shows the caller's groups, links to the
  group-gated pages that exist so far (`/admin`, `/committee`).

## Why two Keycloak clients instead of one

`selection-system-api` never issues tokens (`bearerOnly: true`) — it only
validates the `Authorization: Bearer` header the frontend sends it.
`selection-system-web` is the only thing that ever talks to Keycloak's
login/token endpoints. This keeps the API's job to exactly one thing
(validate + authorize) and avoids giving the browser-facing client
permissions it doesn't need.

## Configuration

All configuration for every service (Keycloak, Postgres, backend, frontend)
lives in one root `.env` file, copied from `.env.example`. `docker-compose.yml`
reads it automatically and forwards the relevant values into each container
— there's exactly one place to change a port, client secret, or origin.

The one subtlety: Keycloak is reachable at **two different addresses** that
both point at the same server —`KEYCLOAK_PUBLIC_URL` (`http://localhost:8080`,
the published port the *browser* uses) and `KEYCLOAK_INTERNAL_URL`
(`http://keycloak:8080`, the Docker service DNS name the *backend and
frontend containers* use). The backend only ever validates tokens
server-to-server, so it always uses the internal address. The frontend does
both: it exchanges tokens server-to-server (internal address) but also has to
redirect the browser to Keycloak's login page (public address) — see the
`authorization` override in `apps/web/auth.ts`.

## Local setup

**Option A — everything in Docker (recommended, one command):**

```bash
cp .env.example .env    # adjust AUTH_SECRET etc. if you want; defaults work
docker compose up -d --build
#   -> frontend:  http://localhost:3000  (FRONTEND_PORT)
#   -> backend:   http://localhost:5000  (BACKEND_PORT), OpenAPI at /openapi
#   -> keycloak:  http://localhost:8080  (KEYCLOAK_PORT)
```

**Option B — infra in Docker, backend/frontend run natively** (faster
edit-reload loop while actively developing):

```bash
# 1. Start just Keycloak + its database
docker compose up -d keycloak-db keycloak

# 2. Backend
cd backend/src/Host
dotnet run
#   -> http://localhost:5xxx (see console output), Swagger/OpenAPI at /openapi

# 3. Frontend
cd apps/web
cp .env.local.example .env.local
npx auth secret            # fills AUTH_SECRET into .env.local
npm run dev
#   -> http://localhost:3000
```

Demo logins (Keycloak sets these as **temporary** passwords — you'll be
forced to change them on first login): `admin.demo`, `manager.demo`,
`officer.demo`, `committee.demo`, all with password `ChangeMe123!`.

Verified locally: `dotnet build` across all 6 projects, and running `Host`
without any token returns `401` from both `/api/auth/me` and the
policy-gated ping endpoints (confirms the module wiring and
`AddApplicationPart` discovery work end-to-end). `docker compose config`
validates the compose file's variable substitution and resulting YAML.

**Not yet done**, flagged so it isn't mistaken for finished:
- Not tested against a live Keycloak instance, or the backend/frontend
  Docker images, in this environment — Docker Desktop's engine wasn't
  running here, so `docker compose up --build` itself is unverified beyond
  `docker compose config` validating the YAML/variable substitution and the
  realm JSON parsing cleanly. Run it locally and confirm login actually
  round-trips — including the public/internal Keycloak URL split in
  `auth.ts` — before relying on this.
- `security-architect` and `identity-access-expert` deep review (token
  lifetime/refresh strategy, session fixation, CSRF on the Next.js side,
  secrets management for `AUTH_KEYCLOAK_SECRET` in real environments) has
  not been run.
- `test-engineer` / `frontend-test-engineer` coverage has not been written.
- `devops-engineer` production deployment (Keycloak isn't meant to run via
  this dev `docker-compose.yml` in production) has not been designed.
- The demo users/passwords in `realm-export.json` are for local dev only —
  do not import this file into a shared or production realm as-is.
