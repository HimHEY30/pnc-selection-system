# PNC Selection System

A full-stack system for running PNC's candidate selection process: screening,
evaluation, and committee decisions, gated by role. Keycloak is the identity
provider for all authentication and authorization; the backend is an ASP.NET
Core API; the frontend is a Next.js app.

## Architecture

```text
┌─────────────┐        ┌──────────────┐        ┌────────────────────┐
│  Next.js     │  OIDC  │   Keycloak    │        │  ASP.NET Core      │
│  frontend    │◄──────►│  (pnc-ssms    │        │  backend API       │
│  (apps/web)  │        │   theme)      │        │  (backend/)        │
└──────┬───────┘        └──────┬───────┘        └─────────┬──────────┘
       │ Bearer token          │                           │
       └────────────────────────────────────────────────────►
                     validates JWT (realm_access.roles)

Keycloak-db (Postgres)   Mailpit (fake SMTP, dev only)
```

- **Keycloak** owns authentication end-to-end: login form, password reset,
  sessions. Neither app ever sees or stores a password.
- **Frontend** (`apps/web/`) is a confidential OIDC client (Next.js server
  performs the token exchange, so the client secret never reaches the
  browser) using [Auth.js](https://authjs.dev) (NextAuth v5).
- **Backend** (`backend/`) is `bearerOnly` — it only ever validates the
  `Authorization: Bearer` token the frontend sends it; it never issues
  tokens itself.
- Both apps read the same four Keycloak **groups** — `system-admin`,
  `selection-manager`, `selection-officer`, `committee-user` — flattened
  from the token into role-based authorization on each side.

## Repository layout

```text
.
├── apps/web/                  Next.js 16 (App Router) frontend
├── backend/                   ASP.NET Core 10 API, Modular Monolith
│   ├── src/
│   │   ├── SharedKernel/      Cross-module primitives (Result<T>, Error, ...)
│   │   ├── Modules/Identity/  Auth/authorization module (Domain/Application/
│   │   │                      Infrastructure/Api split - see below)
│   │   ├── Modules/Campaigns/ Campaigns, setup steps, provinces (own database)
│   │   ├── Modules/Eligibility/ Eligibility rules and the evaluator (Step 2)
│   │   ├── Modules/Sessions/    Information sessions, hosts and attendance (Step 3)
│   │   └── Host/              Composition root: wires modules together,
│   │                           contains no business logic of its own
│   ├── tests/                 xUnit + Testcontainers (real PostgreSQL):
│   │                          Campaigns.Tests, Eligibility.Tests, Identity.Tests, Sessions.Tests, Ssms.TestSupport (shared)
│   └── ownership-matrix.md    Which module owns what, what it publishes
├── infra/keycloak/
│   ├── realm-export.json      The pnc-selection realm: roles, groups,
│   │                           clients, demo users - imported on first boot
│   └── themes/pnc-ssms/       Custom branded login theme (child of
│                               keycloak.v2), bind-mounted live into Keycloak
├── features/                  One README per feature: request, what was
│   │                           built, why, and what was actually verified
│   ├── keycloak-authentication/
│   ├── keycloak-login-theme/
│   └── keycloak-forgot-password-email/
├── docker-compose.yml         The whole stack: keycloak, keycloak-db,
│                               mailpit, backend, frontend
└── .env.example               Single source of truth for all configuration
```

The backend follows a **Modular Monolith**: every module (currently just
`Identity`) is split into `Domain` / `Application` / `Infrastructure` / `Api`
projects. Other modules may only depend on a module's `Application`
contracts and `Domain` types — never its `Infrastructure` directly. See
[backend/ownership-matrix.md](backend/ownership-matrix.md).

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- For native (non-Docker) backend/frontend development: [.NET 10 SDK](https://dotnet.microsoft.com/) and [Node.js](https://nodejs.org/) 20+

## Running it

**Option A — everything in Docker (recommended):**

```bash
cp .env.example .env    # defaults work as-is for local dev
docker compose up -d --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API (OpenAPI at `/openapi`) | http://localhost:5000 |
| Keycloak | http://localhost:8080 |
| Mailpit (catches password-reset emails) | http://localhost:8025 |

Demo logins (all with **temporary** password `ChangeMe123!` — you'll be
forced to set a new one on first login):

| Username | Group |
|---|---|
| `admin.demo` | `system-admin` |
| `manager.demo` | `selection-manager` |
| `officer.demo` | `selection-officer` |
| `committee.demo` | `committee-user` |

**Option B — infra in Docker, backend/frontend run natively** (faster
edit-reload loop while developing):

```bash
# 1. Keycloak + its database only
docker compose up -d keycloak-db keycloak

# 2. Backend
cd backend/src/Host && dotnet run
#   -> http://localhost:5xxx (see console), Swagger/OpenAPI at /openapi

# 3. Frontend
cd apps/web
cp .env.local.example .env.local
npx auth secret            # fills in AUTH_SECRET
npm run dev
#   -> http://localhost:3000
```

All configuration lives in the one root `.env` (copied from `.env.example`)
— `docker-compose.yml` forwards it into every container, so there's exactly
one place to change a port, secret, or origin.

## Authentication & authorization

- Sign-in goes straight to Keycloak's own (PNC-branded) login form — no
  intermediate "Sign in with Keycloak" screen.
- Sign-out ends both the app's session **and** Keycloak's SSO session (OIDC
  RP-Initiated Logout), so it's a real logout, not just a local cookie clear.
- Route protection: `apps/web/proxy.ts` requires a session for every page and
  additionally restricts `/admin` to `system-admin` and `/committee` to
  `committee-user`/`system-admin`. The backend mirrors this with
  `[Authorize(Policy = ...)]` against the same realm roles.

See [features/keycloak-authentication/README.md](features/keycloak-authentication/README.md)
for the full design (including why there are two Keycloak clients, and the
public/internal issuer-address split needed to run it all under Docker).

## Feature documentation

Each feature under [`features/`](features/) is documented as: the original
request, what was actually built and why, and what was verified and how
(and what wasn't, flagged explicitly rather than implied). Start there for
the reasoning behind any non-obvious decision in the code.

- [keycloak-authentication](features/keycloak-authentication/README.md) — identity provider setup, group-based authorization, sign-in/sign-out.
- [keycloak-login-theme](features/keycloak-login-theme/README.md) — the branded `pnc-ssms` login theme.
- [keycloak-forgot-password-email](features/keycloak-forgot-password-email/README.md) — SMTP delivery for password-reset emails (Mailpit in dev).
- [campaigns](features/campaigns/README.md) — create a campaign, the 5-step setup overview, and Step 1 (Campaign info).
- [eligibility-rules](features/eligibility-rules/README.md) — Step 2: who may apply, the rule builder, the test panel, and the evaluator the Candidates step will reuse.
- [information-sessions](features/information-sessions/README.md) — Step 3: sessions assigned to staff and run by officers, alumni or partners, with expected and actual (female/male) attendance.

## Security note

`infra/keycloak/realm-export.json` contains **demo credentials and a dev
client secret for local use only** (e.g. `ChangeMe123!`, `dev-web-client-secret-change-me`).
Do not import this file into a shared or production realm as-is — rotate
every secret and remove the demo users first.
