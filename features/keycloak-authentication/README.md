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
  session for every route except the auth routes and `/login` itself, and
  additionally restricts `/admin` to `system-admin` and `/committee` to
  `committee-user` / `system-admin`, redirecting elsewhere to
  `/unauthorized`. Everything not listed in `PROTECTED_ROUTES` just needs *a*
  session — add a route there when a page needs a narrower group.
- `app/login/page.tsx` + `app/login/AutoSubmit.tsx` — where `proxy.ts` sends
  every unauthenticated request. Renders the same `signIn("keycloak")`
  Server Action the old `app/page.tsx` button used, but a tiny client
  component (`AutoSubmit`) calls `form.requestSubmit()` on mount instead of
  waiting for a click. Still 100% Auth.js's own `signIn()` — no custom OAuth
  handling — it's just submitted automatically. See "Skip the generic
  sign-in page" below for why this exists.
- `app/page.tsx` — sign-in/sign-out, shows the caller's groups, links to the
  group-gated pages that exist so far (`/admin`, `/committee`). Its own
  unauthenticated branch was removed since `proxy.ts` now redirects to
  `/login` before this page ever renders without a session; what's left is a
  defensive `redirect("/login")` fallback.

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

### The public/internal Keycloak address split

Keycloak is reachable at **two different addresses** that point at the same
server: `KEYCLOAK_PUBLIC_URL` (`http://localhost:8080`, the published port
the *browser* uses) and `KEYCLOAK_INTERNAL_URL` (`http://keycloak:8080`, the
Docker service DNS name the *backend and frontend containers* use to reach it
without leaving the Docker network).

This isn't just a performance nicety — without handling it, the login flow
actively breaks. Keycloak, by default, stamps every token and OAuth response
with whichever hostname was used to reach it, so a browser hitting the public
address and a container hitting the internal address end up with two
different, mismatched issuer identities. Auth.js (and most OIDC clients)
reject that as a security violation (`unexpected "iss" (issuer) response
parameter value`) — this is exactly the failure first seen when this was
tried naively (just overriding the `authorization` endpoint to the public
URL) and is why the fix below is two-sided, not one override in `auth.ts`.

The actual fix, found by testing live against a running stack rather than by
inspection alone:
1. **`docker-compose.yml`, `keycloak` service** — `KC_HOSTNAME` is pinned to
   `KEYCLOAK_PUBLIC_URL`, so the `issuer` identity in every token and OAuth
   response is *always* the public address, no matter which address was used
   to reach Keycloak. `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` lets the
   *service* URLs (token/userinfo/jwks endpoints) still adapt to whoever is
   asking, so an internal caller gets back a reachable internal URL instead
   of the public one it can't resolve to itself.
2. **Backend** (`Identity.Infrastructure/DependencyInjection.cs`) — `Authority`
   (where it fetches JWKS) stays the internal address; a new, separate
   `Issuer` config key (`Keycloak:Issuer`, wired to `ValidIssuer`) is the
   public address, matching what's actually in the `iss` claim.
3. **Frontend** (`auth.ts`) — `AUTH_KEYCLOAK_ISSUER` is the public address
   (the identity Auth.js validates against). `AUTH_KEYCLOAK_INTERNAL_ISSUER`
   is only set inside Docker; when present, a `[customFetch]` override on the
   Keycloak provider rewrites requests that would otherwise target the
   (unreachable-from-a-container) public address to the internal one,
   without changing what issuer Auth.js expects back.

Outside Docker (native `npm run dev` / `dotnet run`), there's only one
address, so none of this does anything — `Keycloak:Issuer` falls back to
`Keycloak:Authority`, and `AUTH_KEYCLOAK_INTERNAL_ISSUER` is simply unset.

## Skip the generic sign-in page

By default, visiting `http://localhost:3000` unauthenticated landed on
Auth.js's own built-in `/api/auth/signin` page — a plain, unbranded card with
a single "Sign in with Keycloak" button the visitor had to click before ever
seeing Keycloak's (now PNC-themed, see
[features/keycloak-login-theme](../keycloak-login-theme/README.md)) login
form. With only one provider configured, that extra click-through adds
nothing, so the app now skips it:

1. `proxy.ts` redirects an unauthenticated request to `/login` (our own
   route) instead of `/api/auth/signin` (Auth.js's generic one).
2. `app/login/page.tsx` renders a `signIn("keycloak")` Server Action inside a
   `<form>`, exactly like the old sign-in button did — this is still
   Auth.js's own, unmodified sign-in flow, nothing OAuth-specific was
   reimplemented.
3. `AutoSubmit.tsx`, a client component, calls that form's
   `requestSubmit()` once on mount, so the POST happens automatically instead
   of waiting for a click.
4. The POST runs through Auth.js's normal `signin` action, which redirects
   straight to Keycloak's `/realms/pnc-selection/protocol/openid-connect/auth`
   — i.e. the real login form — with the correct PKCE/state cookies already
   set.

A GET request can't trigger this directly (Auth.js only starts an OAuth
redirect on a CSRF-token-verified POST, by design, to prevent login-CSRF —
confirmed by reading `@auth/core`'s `signin` action and reproducing the
`Configuration` error a bare `GET /api/auth/signin/keycloak` produces), which
is why this goes through an auto-submitting form rather than a plain
redirect. `<noscript>` keeps a manual "Continue to sign in" button for
visitors without JavaScript.

**Verified locally**: `GET /` returns a `307` to `/login?callbackUrl=...`;
`/login` renders `200` with the auto-submit form and id present in the
server-rendered HTML (the actual click-free submit itself needs a real
browser to exercise the `useEffect` — not re-tested here, same curl-only
caveat as the rest of this doc).

## Sign-out also ends the Keycloak SSO session, not just this app's

`signOut()` (Auth.js) only deletes this app's own session cookie. Keycloak
keeps a separate SSO session alive on its own domain (its `KEYCLOAK_SESSION`
cookie), so without more, clicking "Sign out" and then revisiting the app
would bounce to `/login`, which auto-submits `signIn("keycloak")` — and
since Keycloak still considered the browser logged in, it would silently
re-issue a code with no login form ever shown. The user would appear signed
out for one page load and then immediately be signed back in, with no way
to actually log out or switch accounts. This was found and fixed, not
reported by request, but the request to "make logout work" implied this
was already broken.

Fix (`auth.ts`, `app/page.tsx`): proper OIDC **RP-Initiated Logout**.
1. The Keycloak provider's `account.id_token` is captured in the `jwt`
   callback and threaded onto the session as `session.idToken` — needed
   because the sign-out action has to hand it back to Keycloak as proof of
   which SSO session to end (`id_token_hint`).
2. `keycloakLogoutUrl()` builds Keycloak's
   `/protocol/openid-connect/logout` URL with that `id_token_hint`, plus
   `post_logout_redirect_uri` (`AUTH_URL`, the app's own public origin) and
   `client_id`.
3. The sign-out Server Action in `app/page.tsx` calls
   `signOut({ redirect: false })` (clears our cookie, doesn't redirect
   itself), then `redirect(keycloakLogoutUrl(idToken))` — sending the
   *browser* to Keycloak so it's Keycloak's own cookie that gets cleared,
   not a server-to-server call that couldn't touch it.

`post_logout_redirect_uri` needed no realm config change: Keycloak already
defaults a client's `post.logout.redirect.uris` attribute to `"+"` (same as
its `redirectUris`) when none is set explicitly — confirmed by reading the
live client's representation via the Admin REST API rather than assuming.

**Verified locally** with Playwright driving a real browser against the
full Docker stack (not curl — this round-trip depends on real browser
cookies on two different origins): signed in as `admin.demo`, clicked
"Sign out", captured the actual network request fired and confirmed it hit
`http://localhost:8080/realms/pnc-selection/protocol/openid-connect/logout`
with both `id_token_hint` and `post_logout_redirect_uri` set, got back a
`302` from Keycloak. Then revisited `http://localhost:3000/` in the same
browser context: it bounced through `/login` to Keycloak's real,
interactive login form again (a `#username` field actually present in the
page) rather than silently re-authenticating — proof the Keycloak-side SSO
session was genuinely cleared, not just this app's own cookie.

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

Verified locally with `docker compose up -d --build` (Option A, full stack),
including the full login round-trip, driven end-to-end with curl against the
live containers (not just inspected or unit-tested in isolation):
- All 4 containers build and start cleanly; Keycloak imports the
  `pnc-selection` realm on first boot.
- Signed in as `admin.demo` through the real authorization-code + PKCE flow
  (Keycloak's actual login form, not a stub) and got back a valid Auth.js
  session with `roles: ["system-admin"]` — the public/internal issuer split
  above was what made this pass; it failed with the exact `iss` mismatch
  described above before the `KC_HOSTNAME`/`customFetch` fix.
- Took the access token from that same flow and called the backend directly:
  `/api/auth/me` correctly returned `{"username":"admin.demo","groups":
  ["SystemAdmin"]}` and the system-admin-only ping endpoint returned `200` —
  confirming the backend's separate `Authority`/`Issuer` split also works
  against a real token, not just the unauthenticated `401` case.
- The backend still returns `401` from every policy-gated endpoint without a
  token, and serves its OpenAPI doc at `/openapi/v1.json`.
- Also verified earlier with `dotnet build` across all 6 backend projects run
  natively (Option B).

**Not yet done**, flagged so it isn't mistaken for finished:
- The login round-trip above was driven with curl, not an actual browser —
  worth a quick manual click-through at `http://localhost:3000` to catch
  anything curl wouldn't (cookie `SameSite`/`Secure` behavior in a real
  browser, the `/admin` and `/committee` route guards in `proxy.ts`). Sign-in
  and sign-out specifically have since been verified with a real browser
  (Playwright) — see "Sign-out also ends the Keycloak SSO session" above.
- `security-architect` and `identity-access-expert` deep review (token
  lifetime/refresh strategy, session fixation, CSRF on the Next.js side,
  secrets management for `AUTH_KEYCLOAK_SECRET` in real environments) has
  not been run.
- `test-engineer` / `frontend-test-engineer` coverage has not been written.
- `devops-engineer` production deployment (Keycloak isn't meant to run via
  this dev `docker-compose.yml` in production) has not been designed.
- The demo users/passwords in `realm-export.json` are for local dev only —
  do not import this file into a shared or production realm as-is.
