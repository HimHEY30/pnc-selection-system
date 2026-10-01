# Feature: Forgot-Password Email Delivery (SMTP)

## Request

`resetPasswordAllowed` was already on (see
[features/keycloak-login-theme](../keycloak-login-theme/README.md)), so the
"Forgot password?" flow worked up to generating a reset link — but with no
SMTP server configured, that link was never actually emailed anywhere. Set
up an email server and put all its configuration in `.env`.

## Approach

This stack has no real mail account to send from, and inventing one would
mean either hardcoding a real credential (a secret) or asking for one before
there's any real production mail requirement to size it against. For local
dev, the standard, zero-secret fix is a **fake SMTP catcher**: Keycloak sends
real SMTP traffic to it, nothing leaves the Docker network, and every
message is visible in a web inbox instead of a real mailbox. This project
uses [Mailpit](https://github.com/axllent/mailpit) for that.

Keycloak's SMTP settings are realm-level configuration (stored in its DB),
not a server environment variable — there is no `KC_SMTP_*` startup flag.
So the actual values live in two places, same convention this project
already uses for `KEYCLOAK_WEB_CLIENT_SECRET`:
- `.env` (and `.env.example`) — the canonical source for local dev, and
  where a real provider's settings would go for a non-local environment.
- `infra/keycloak/realm-export.json`'s new `smtpServer` block — a literal
  copy, applied automatically only on a realm's *first* import. There's no
  `${env.VAR}` substitution in this file, so if you change `.env`'s SMTP
  values, update this block too and re-apply (see below) for an
  already-imported realm.

## What was built

- **`docker-compose.yml`** — new `mailpit` service (`axllent/mailpit`),
  publishing `MAILPIT_SMTP_PORT` (SMTP, default `1025`) and
  `MAILPIT_UI_PORT` (web inbox, default `8025`). `keycloak` now
  `depends_on` it (`service_started` — SMTP is only used at request time, so
  this isn't a hard startup-ordering requirement, just makes the dependency
  explicit).
- **`.env` / `.env.example`** — new keys: `MAILPIT_SMTP_PORT`,
  `MAILPIT_UI_PORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`,
  `SMTP_FROM_DISPLAY_NAME`, `SMTP_AUTH`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_STARTTLS`, `SMTP_SSL`. `SMTP_USER`/`SMTP_PASSWORD` are empty because
  Mailpit doesn't require auth; they're there so swapping in a real provider
  later is a value change, not a schema change.
- **`infra/keycloak/realm-export.json`** — `smtpServer` block: host
  `mailpit` (the Docker service name — Keycloak reaches it over the compose
  network, never through the published host port), port `1025`, `from`
  `no-reply@pnc-ssms.local`, `fromDisplayName` `PNC Selection System`,
  `ssl`/`starttls`/`auth` all `"false"`.

## Updating an already-imported realm

Same situation as `features/keycloak-login-theme`: this stack's
`pnc-selection` realm already existed, so `realm-export.json`'s new
`smtpServer` block won't be picked up automatically. Applied once via the
admin REST API:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$KEYCLOAK_ADMIN&password=$KEYCLOAK_ADMIN_PASSWORD&grant_type=password&client_id=admin-cli" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

curl -X PUT http://localhost:8080/admin/realms/pnc-selection \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"smtpServer":{"host":"mailpit","port":"1025","from":"no-reply@pnc-ssms.local","fromDisplayName":"PNC Selection System","ssl":"false","starttls":"false","auth":"false"}}'
```

A fresh environment (empty `keycloak-db` volume) picks this up automatically
from `realm-export.json` on first boot.

## Verified locally

Against the live stack, after starting `mailpit` and applying the config
above:
- `docker compose ps` shows `mailpit` healthy alongside the other 4
  services.
- `GET /admin/realms/pnc-selection` (admin API) confirms the `smtpServer`
  block persisted with the values above.
- Drove the real "forgot password" flow with curl, the same way as the
  rest of this project's auth testing: fetched
  `/realms/pnc-selection/login-actions/reset-credentials?client_id=selection-system-web`
  for its session cookie + form action URL, then POSTed
  `username=admin.demo@example.com` to it — got back Keycloak's own `200`
  confirmation page (unmodified Keycloak behavior; nothing about the reset
  flow itself was changed by this feature).
- Confirmed the email actually arrived: `GET http://localhost:8025/api/v1/messages`
  (Mailpit's API) showed one message, `From: "PNC Selection System"
  <no-reply@pnc-ssms.local>`, `To: admin.demo@example.com`, `Subject: Reset
  password` — i.e. Keycloak really sent it over SMTP to Mailpit, not just
  generated a link.
- To check visually instead of via the API: open
  `http://localhost:8025` after triggering "Forgot password?" from the
  login form at `http://localhost:3000`.

## Known limitations / not yet done

- **Mailpit is dev-only.** It is not an email provider — messages never
  leave the Docker network. Before any non-local environment, replace
  `SMTP_HOST`/`SMTP_PORT` with a real provider's and set `SMTP_AUTH=true`
  with real `SMTP_USER`/`SMTP_PASSWORD` (never commit those).
- The reset email's content/branding is Keycloak's own default template
  (`messages_en.properties`' `emailSubjectResetPassword` etc.) — not
  restyled to match the PNC login theme. Would need
  `login/resources/img` + email-specific `.ftl` overrides in the
  `pnc-ssms` theme (email is a separate theme type from login) if that's
  wanted.
- Khmer-localized reset emails were not verified — `messages_km.properties`
  in the login theme only covers login-page strings, not email subject/body
  keys.
- No real browser click-through (all verification above is curl + Mailpit's
  API).
