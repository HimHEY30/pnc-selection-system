# Feature: Custom Keycloak Login Theme (`pnc-ssms`)

## Request

Design and implement a branded Keycloak login experience for PNC SSMS,
following the PNC design system (brand colors, Open Sans, clean enterprise
look), covering the login form and its related screens (forgot password,
session expired, errors, etc.), with English/Khmer localization, while
leaving Keycloak fully responsible for authentication, CSRF, and the
password-reset flow.

## Design concept

Keycloak 26 ships a PatternFly-based theme (`keycloak.v2`) with its own
accessible form components (labeled inputs, password-visibility toggle,
focus-visible states, ARIA attributes) already built and tested. Rebuilding
that from scratch in a custom theme would both be wasted effort and a
regression risk, so this theme is `keycloak.v2`'s *child* theme
(`parent=keycloak.v2`), and only adds:

1. **A left branding panel** (desktop) / compact branding bar (mobile),
   sibling to Keycloak's own unmodified login card — logo, "PNC Staff
   Portal" badge, app name, one-line description, a restrained geometric
   shape (no illustration asset, no gradients).
2. **A recolor** of the ~10 PatternFly global CSS variables every component
   already reads through (`--pf-v5-global--primary-color--*`,
   `--pf-v5-global--link--Color`, danger/success colors, font family) to the
   PNC palette — this is the mechanism PatternFly/Keycloak's own theming is
   built for, so buttons, links, focus rings and validation colors all pick
   up the brand without fighting component-level CSS.
3. **A "Welcome back" / supporting-text header** on the login page only, and
   a footer (copyright + placeholder Privacy/Help links) — both via small,
   additive changes described below.
4. **English/Khmer localization** via `supportedLocales` + a
   `messages_km.properties` override.

Everything else — field labels, validation/error copy, forgot-password and
reset-password screens, session-expired and generic-error pages, password
visibility toggle, remember-me, required-field markers — is Keycloak's own
`keycloak.v2` behavior, untouched, because every one of those screens is
rendered through the same `template.ftl` this theme modifies minimally.

## Brand tokens used

| Token | Value |
|---|---|
| Primary blue | `#009DE1` |
| Secondary blue | `#179BD7` |
| Text | `#1F2937` |
| Secondary text | `#6B7280` |
| Page background | `#F5F9FC` |
| Border | `#E5E7EB` |
| Error | `#DC2626` |
| Success | `#16A34A` |
| Font | Open Sans (Google Fonts) |

## What was built

```text
infra/keycloak/themes/pnc-ssms/login/
├── theme.properties          parent=keycloak.v2, registers login.css + loginState.js,
│                              declares locales=en,km
├── template.ftl               Copied from the real keycloak.v2/login/template.ftl
│                              (extracted from the actual quay.io/keycloak/keycloak:26.0
│                              image running in this stack, not reproduced from memory)
│                              with two additive changes, marked PNC-CUSTOM:
│                                - a branding <aside> rendered as a sibling of the
│                                  untouched .pf-v5-c-login card
│                                - a subtitle <p> under the page <h1>, shown only when
│                                  the calling template passes bodyClass="login"
├── login.ftl                   Copied from keycloak.v2/login/login.ftl; the only change
│                              is adding bodyClass="login" to the existing layout call,
│                              so every other screen (reset password, error, etc.) that
│                              reuses the same layout is unaffected
├── footer.ftl                  Keycloak's own footer.content macro is empty by design,
│                              meant to be overridden - this fills it with the
│                              copyright/product line + placeholder Privacy/Help links
├── messages/
│   ├── messages_en.properties  Overrides loginAccountTitle ("Welcome back") + adds the
│   │                           PNC-specific keys the templates above reference
│   └── messages_km.properties  Starter Khmer translations for those same keys (see
│                               "Known limitations" below)
└── resources/
    ├── css/login.css           PatternFly global-token recolor + branding panel layout
    │                           + responsive rules + the loading-spinner button state
    ├── js/loginState.js        Progressive enhancement: swaps the sign-in button to a
    │                           spinner + "Signing in..." on submit
    └── img/pnc-logo-circle.png  The actual org logo (Passerelles Numériques), provided
                                 mid-task - not a placeholder. images.png (the full
                                 lockup with wordmark) is also in this directory but
                                 unused by the theme itself.
```

**Wiring:**
- `docker-compose.yml` mounts `./infra/keycloak/themes/pnc-ssms` into the
  `keycloak` container at `/opt/keycloak/themes/pnc-ssms`.
- `infra/keycloak/realm-export.json` sets `loginTheme: "pnc-ssms"`,
  `internationalizationEnabled: true`, `supportedLocales: ["en", "km"]`,
  `defaultLocale: "en"`, `rememberMe: true`, `resetPasswordAllowed: true`.
  These only take effect on a *first* import of the realm — see "Updating an
  already-imported realm" below, since this stack had already imported
  `pnc-selection` before this feature was added.

## Why not rewrite every screen's FTL

The brief's deliverable list covers ten+ states (locked account, session
expired, IdP error, password-update-required, etc.). All of them already
render through `registrationLayout` in `template.ftl` — the same macro
`login.ftl` and `error.ftl` both call — so the branding panel, recolored
buttons/links, and footer apply to every one of them automatically, without
writing or maintaining ten separate template overrides. The only FTL files
in this theme are the two (`template.ftl`, `login.ftl`) needed for that
shared layout and the login-specific subtitle; everything else is CSS,
messages, and theme.properties.

## Verified locally

Against the live stack (`docker compose up -d --build`, same containers this
project already runs with), after mounting the theme and recreating the
`keycloak` container:
- `GET /realms/pnc-selection/protocol/openid-connect/auth?...` returns the
  themed page: branding panel markup present, `loginAccountTitle` renders as
  "Welcome back", `login.css`/`loginState.js`/the placeholder logo all serve
  `200` from `/resources/<cache-key>/login/pnc-ssms/...`.
- `?ui_locales=km` (the OIDC-standard param — not Keycloak's non-standard
  `kc_locale`, which does *not* switch the login page's locale) correctly
  renders `<html lang="km">` and the Khmer-translated title, and the
  language switcher `<select>` appears once two locales are configured.
- A real invalid-password submission (via a manual authenticate POST, not a
  stub) returns the same alert markup Keycloak always renders
  (`kc-feedback-text`, the message bundle's `invalidUserMessage` copy),
  confirming the error path isn't broken by the template changes.
- `docker compose config` is clean.

**Not independently re-verified in this pass** (inherited from
`keycloak.v2` unchanged, not re-tested here): password-visibility toggle,
remember-me persistence, and an actual browser click-through (all
verification above was via curl against the live container, same caveat as
the rest of this project's auth testing — see
[features/keycloak-authentication/README.md](../keycloak-authentication/README.md)).
Forgot-password email delivery itself is now wired up and verified — see
[features/keycloak-forgot-password-email/README.md](../keycloak-forgot-password-email/README.md).

## Updating an already-imported realm

`--import-realm` only applies `realm-export.json` on a realm's *first*
import — Keycloak logs `Realm 'pnc-selection' already exists. Import
skipped` on every later start. For a realm that already exists (as it did
in this stack when this feature was added), the new settings were applied
once via the admin REST API instead:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$KEYCLOAK_ADMIN&password=$KEYCLOAK_ADMIN_PASSWORD&grant_type=password&client_id=admin-cli" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

curl -X PUT http://localhost:8080/admin/realms/pnc-selection \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"loginTheme":"pnc-ssms","internationalizationEnabled":true,"supportedLocales":["en","km"],"defaultLocale":"en","rememberMe":true,"resetPasswordAllowed":true}'
```

A fresh environment (empty `keycloak-db` volume) picks up all of this
automatically from `realm-export.json` on first boot — no manual step
needed there.

## Installation and testing guide

1. **Theme files** already live at `infra/keycloak/themes/pnc-ssms/login/`
   and are mounted by `docker-compose.yml` — nothing to copy by hand in this
   repo. (For a *different* Keycloak deployment, copy that directory to
   `<KC_HOME>/themes/pnc-ssms/`.)
2. **Enable it on the realm** — either let `realm-export.json` do it on
   first import, or run the `curl` above against an existing realm.
3. **Start/restart Keycloak** so the volume mount takes effect:
   `docker compose up -d --build keycloak` (a plain `restart` is not enough
   if the mount itself is new — it needs the container recreated).
4. **Verify the theme is served**: open
   `http://localhost:8080/realms/pnc-selection/account/` or trigger a login
   from the frontend at `http://localhost:3000` and confirm the branding
   panel appears.
5. **Test localization**: append `&ui_locales=km` to the authorization URL,
   or use the language dropdown once on the page.
6. **Test successful/failed auth**: sign in with one of the demo users from
   [features/keycloak-authentication/README.md](../keycloak-authentication/README.md)
   for the success path; a wrong password for the themed error-alert path.
7. **Test responsiveness**: resize below 992px (or use browser device
   emulation) — the branding panel should collapse to a compact horizontal
   bar above the form.
8. **Accessibility**: tab through the form (focus rings use the recolored
   `--pf-v5-global--active-color--100` token), confirm the branding panel's
   text is readable by a screen reader (only the decorative shape is
   `aria-hidden`), and confirm error text isn't conveyed by color alone (it
   also has an icon + text, inherited from `keycloak.v2`).
9. **Upgrade safety check**: if the Keycloak image version changes in
   `docker-compose.yml`, re-extract that version's `keycloak.v2/login/`
   templates (e.g. `docker cp` the `org.keycloak.keycloak-themes-*.jar` out
   of the container and diff against `template.ftl`/`login.ftl` in this
   theme) before assuming the two FTL overrides here still apply cleanly —
   they were hand-verified against Keycloak 26.0.8, not guaranteed for other
   versions.

## Known limitations / not yet done

- **Khmer translations are a starting point**, not reviewed by a native
  speaker — verify `messages_km.properties` before this is user-facing in
  Khmer.
- **Footer's Privacy/Help links point at `#`** — there's no real privacy
  policy or support page in this project yet; wire these up once one exists
  (or remove them).
- A real browser click-through (not curl) of every state listed in the
  original brief — particularly the loading-spinner button state and the
  dark-mode toggle's effect on the branding panel — hasn't been done.
