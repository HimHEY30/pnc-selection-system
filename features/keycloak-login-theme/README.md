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

## Visual bugs found after a real screenshot review

The first pass was verified only with curl (markup/asset presence), which
doesn't catch rendering bugs. A real screenshot surfaced three, all now
fixed:

1. **Illegible title/card in dark mode.** Keycloak's stock `template.ftl`
   toggles a `.pf-v5-theme-dark` class on `<html>` based on
   `prefers-color-scheme`, which makes PatternFly swap the card and input
   backgrounds to dark gray. This theme's CSS forced title/label text to
   `--pnc-text` (near-black) unconditionally, so on a dark-mode visitor's
   browser the card rendered dark-gray with near-invisible near-black text.
   Fixed by dropping the dark-mode-toggle script from `template.ftl`
   (marked `PNC-CUSTOM`) rather than patching each PatternFly component's
   dark-mode background individually — the PNC brand spec defines one light
   palette, not a second dark one, so the theme now renders consistently in
   it regardless of OS preference.
2. **Headings silently fell back to the browser's default serif font.** The
   `--pf-v5-global--FontFamily--heading`/`--text` overrides referenced
   *themselves* as a fallback (`"Open Sans", var(--pf-v5-global--FontFamily--heading)`)
   — a CSS custom-property self-reference cycle, which makes the whole
   property invalid at computed-value time. Fixed by using PatternFly's
   actual base stack (`RedHatText`/`RedHatDisplay`, helvetica, arial,
   sans-serif) as the literal fallback instead of trying to extend the
   variable being defined.
3. **A raw realm slug ("pnc-selection") floated in the top-right of the
   page.** That's Keycloak's own realm-brand header
   (`#kc-header`/`loginTitleHtml`), which falls back to the realm's
   technical name when `displayName` isn't set, and was never styled by
   this theme. Fixed two ways: `realm-export.json` now sets
   `"displayName": "PNC Selection System"` (also fixes the browser tab
   title, previously "Sign in to pnc-selection"), and `#kc-header` is
   hidden outright in `login.css` since it's redundant with the branding
   panel this theme already renders.

Re-verified live after these fixes: `<title>` now reads "Sign in to PNC
Selection System", the served `login.css` contains the `RedHatDisplay`
fallback and the `#kc-header { display: none; }` rule, and no
`pf-v5-theme-dark` references remain in the rendered page.

## Redesign toward a reference login layout

A second round of feedback pointed at a reference screenshot (a split
blue/white "Employer Medical Portal" login) and asked for that visual style —
split layout, boxed/labeled inputs, a gradient button — while keeping PNC's
own font and palette, and swapping in `resources/img/images.png` (Passerelles
Numériques logo) as the logo. Changes, all in `template.ftl`/`login.css`
(`messages_*.properties` gained four new keys for the feature list):

- **Logo moved from the branding panel to the top of the white card.**
  `images.png` is a wide wordmark lockup, not the small circular mark
  (`pnc-logo-circle.png`) the branding panel used before — it reads better on
  white than cramped into the blue panel's small badge row, and matches where
  the reference puts its logo. `pnc-logo-circle.png` is no longer referenced
  anywhere in the theme (left in `resources/img/` unused, not deleted).
- **A decorative dot-grid pattern** (pure CSS `radial-gradient`, no new image
  asset) in the branding panel's top-left corner, echoing the reference.
- **A 4-item feature bullet list** added below the branding panel's
  description (candidate screening, committee evaluation, role-based access,
  selection analytics — this project's own content, not the reference's
  medical-portal copy), each with a FontAwesome icon in a translucent circle,
  matching the reference's icon-list pattern. Icons are from the FontAwesome
  set PatternFly already vendors (`fa-user-check`/`fa-users`/`fa-shield-alt`/
  `fa-chart-line`, confirmed present in the extracted theme jar's
  `_variables.scss` before use) — no new font/asset dependency.
- **The right-hand panel is now solid white** (`.pf-v5-c-login { background:
  #fff }`) instead of a bordered card floating on the page background, to
  match the reference's flat two-panel look. `.pf-v5-c-login__main` dropped
  its border/radius accordingly.
- **Inputs restyled** via PatternFly's own `--pf-v5-c-form-control--*`
  component variables (same re-point-the-variable strategy as the rest of
  this file — PatternFly draws the input border with its own `:before`/
  `:after` pseudo-elements, so a blunt `border:` override would've been
  painted over) for a boxed, rounded, white-background look, plus an explicit
  `border-radius` on the control and both pseudo-elements.
- **Primary button** gets a PNC-blue gradient (`--pnc-blue` →
  `--pnc-blue-secondary`), bold uppercase label, and rounded corners.
- **"Remember me" / "Forgot password?"** got minor spacing/typography
  polish, but intentionally were **not** moved into the same row as in the
  reference: the forgot-password link renders as helper text nested inside
  the password field's own form-group (`field.ftl`, inherited from
  `keycloak.v2`, unmodified), not as a sibling of the remember-me checkbox's
  group — moving it would mean restructuring `login.ftl`'s stock markup, which
  this project avoids (see "Why not rewrite every screen's FTL" above) for a
  cosmetic-only gain.
- **No tab switcher or "Register" button** — the reference's "Business
  Login / Clinic Login" tabs and top-right "Register" button don't apply:
  this realm has one login method and `registrationAllowed: false`.

Re-verified live via curl: the rendered login page contains the new
`pnc-card-logo`, `pnc-branding__features`, `pnc-branding__dots` markup and
resolves `images.png` (HTTP 200); the served `login.css` contains the new
button/input/feature-list rules; `pnc-logo-circle`/`pnc-branding__logo` no
longer appear anywhere in the rendered page.

## Production-readiness audit (accessibility, responsive, technical quality)

A full audit against WCAG 2.2 AA, the required-viewport matrix, and technical
quality found and fixed four real, concrete defects (all verified against the
live container, not just read from source):

1. **The brand blue fails WCAG AA text contrast.** Computed via actual WCAG
   relative-luminance math (not eyeballed): white text on `--pnc-blue`
   (#009DE1) is 3.04:1, and on `--pnc-blue-secondary` (#179BD7) is 3.13:1 —
   both fail the 4.5:1 minimum for normal-size text (SC 1.4.3), which matters
   because `--pnc-blue` is literally the sign-in button's fill and the link
   color. Added `--pnc-blue-accessible` (#0077A8, 5.00:1) and
   `--pnc-blue-accessible-dark` (#005F87, 7.03:1) — both verified — and
   switched only the button background and link color to them. The original
   tokens are untouched everywhere else (large/bold headings already clear
   the lower 3:1 large-text threshold; non-text UI like checkbox fills only
   needs 3:1 per SC 1.4.11), per this audit's brief: preserve the existing
   design tokens unless there's a clear, documented reason to deviate.
2. **Same failure in the branding panel's body text.** White text at reduced
   opacity (description 0.88, feature list 0.92) on raw `--pnc-blue`
   similarly failed. Fixed two ways: a flat 22% black scrim layered behind
   the panel (`--pnc-blue` → 4.74:1, verified) rather than swapping the brand
   color, plus making the description/feature-list text solid white instead
   of translucent. The eyebrow badge chip went from translucent-white-on-
   white-text (previously the LARGEST shortfall) to a near-solid white chip
   with dark `--pnc-text`.
3. **The top-level auth message had no live region.** `message.summary` (used
   for account-disabled, expired-session, password-reset-confirmation, and
   other non-field-specific feedback — confirmed live via the actual
   reset-credentials confirmation page) rendered as a plain `<div>` with no
   `role`/`aria-live`, so screen readers wouldn't reliably announce it
   (SC 4.1.3 Status Messages). Added `role="alert"` in `template.ftl`.
   Per-field errors (e.g. invalid username/password) were already correctly
   wrapped in `aria-live="polite"` by stock `field.ftl` — unchanged, no fix
   needed there.
4. **PatternFly's own `.pf-v5-c-login__container` silently changes layout
   strategy at 1200px** (confirmed in the extracted theme jar) — switching
   from a simple centered block to a 2-column CSS grid
   (`grid-template-areas: "main header" "main footer" "main ."`) meant for
   pairing the card with a PatternFly-rendered header/footer column. This
   theme hides `#kc-header` and its `footer.ftl` output carries no
   `grid-area`, so without an explicit override, the footer would be
   auto-placed by the grid into the unclaimed "header" cell (top-right of the
   card) on any viewport ≥ 1200px — which includes both the 1366×768 and
   1920×1080 viewports in the required test matrix. Forced a single
   predictable block layout at every width instead, capped at 440px (within
   the brief's 380–440px comfortable-reading-width target; PatternFly's own
   default is an uncapped 500px below 1200px and literally unconstrained at
   /above it).
5. **Mobile had ~90px of unnecessary scroll on every load.** PatternFly sets
   an unconditional `min-height: 100vh` on `.pf-v5-c-login`; below 992px,
   `.pnc-shell` stacks the branding bar above it in a column, so that 100vh
   stacked on top of the branding bar's own height overflowed the viewport.
   `.pnc-shell`'s own `min-height: 100vh` already covers "fill the viewport"
   at every width (desktop's flex-row default stretch handles the two-panel
   full-height look without it), so this was just dropped.
6. **Touch targets.** The "remember me" checkbox's native control is ~16px,
   under SC 2.5.8's 24px guidance. Padded the shared `.pf-v5-c-check`
   class (used by both the wrapping `<div>` and the clickable `<label>`) to
   enlarge the real hit area, and added `cursor: pointer`.
7. **Loading state wasn't announced.** `loginState.js` already prevents
   double-submit via stock Keycloak's own `login.disabled = true` (native,
   unmodified) and visually swaps in a spinner, but didn't tell assistive
   tech the page was busy. Added `aria-busy="true"` alongside the existing
   behavior.

Already-correct and left unchanged (verified, not assumed): `autocomplete`
attributes on username/password (`login.ftl`), labels-not-placeholders on
every field, the password visibility toggle's `aria-label`/`aria-controls`
(`field.ftl`), the full-width sign-in button (`kcButtonBlockClass`),
`prefers-reduced-motion` handling on the loading spinner, and `<html lang>`/
`dir` reflecting the active locale.

**Verified live** against the running container: a real failed-login POST
(confirms per-field `aria-live` error rendering, unchanged); a real
forgot-password POST through to its confirmation page (confirms
`role="alert"` actually renders, and that this change didn't regress the
SMTP/Mailpit flow from `features/keycloak-forgot-password-email`); a real
locale-switch request (confirms `lang="km"` and the new feature-list strings
render in Khmer); served `login.css` brace-balance and rule presence; served
`loginState.js` parses as valid JS and contains `aria-busy`;
`docker compose config`/`ps` clean.

**Not verified — no browser automation tool was available in this
environment.** Everything above was checked via curl against the live
container plus manual/scripted WCAG contrast computation, not a rendered
browser. Specifically unverified: actual pixel-level rendering at the
320/375/430/768/1366/1920 viewport matrix, real keyboard-navigation
tab order and focus-visible appearance, real screen-reader output (NVDA/
VoiceOver), the on-screen-keyboard-obscuring-the-field concern on a real
phone, and the `:has()` CSS support note below in an actual old browser.
These should be spot-checked in a real browser before sign-off.

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
- `.pf-v5-c-form__helper-text:has(a)` (right-aligning the forgot-password
  link) relies on `:has()`, unsupported in older browsers; it degrades
  harmlessly to left-aligned, not broken, if unsupported.
- No browser automation tool was available to validate actual rendering,
  keyboard navigation, or screen-reader output — see the audit section above
  for exactly what was and wasn't checked.
