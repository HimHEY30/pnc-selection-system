# Campaigns

## Request

Build the Campaign feature of SSMS from the approved UI (empty dashboard, create-campaign
dialog, setup overview, Step 1 "Campaign info"). One campaign is one selection cycle, for
example "Selection 2027". Staff configure it from the UI with no code changes.

## What was built

**Backend** (`backend/src/Modules/Campaigns`, a new module beside Identity)
- Own database, `ssms-db` (Postgres 16), separate from Keycloak's. Tables in schema `campaigns`:
  `campaigns`, `campaign_setup_steps`, `provinces` (25 seeded), `campaign_provinces`.
- Foreign keys with cascade from a campaign to its steps and provinces, check constraints
  (end after start, positive numbers, seats within expected, known statuses), a unique name
  index, and an optimistic-concurrency token (`xmin`).
- Status is an enum (`Draft`, `Active`, `Closed`); only Draft is reachable today.
- Step status is stored per campaign per step, so steps 2-5 can set their own later.
- `CampaignService` holds the rules; controllers only translate HTTP. Validation errors come
  back as RFC 7807 with a message per field.

**Frontend** (`apps/web`)
- Pages: `/admin` (empty state, or opens the newest campaign), `/admin/campaigns/[id]`
  (setup overview), `/admin/campaigns/[id]/info` (Step 1). Each has loading and error states;
  an unknown campaign shows a not-found page.
- Components: app shell, campaign switcher, empty state, create-campaign dialog, setup step
  list, status badge, form field, province multi-select, timeline preview.
- The Next.js server calls the backend with the user's access token (refreshed before it
  expires), so the browser never holds an API token of its own.
- Theme tokens in `globals.css`; all copy in `lib/messages/en.ts` so Khmer can be added later.

## Who can do what

| Role | Read campaigns | Create / edit |
|---|---|---|
| system-admin, selection-manager | yes | yes |
| selection-officer | yes (read-only screens) | no |
| committee-user | no | no |

The backend enforces this (policies `OperationsTier` and `ManagementTier`). The UI hides what
a role cannot do. `proxy.ts` now lets manager and officer into `/admin` (before, only admin).

## Rules (as implemented)

- Name: required, 1-100 characters, unique ignoring case and surrounding spaces.
- Academic year: required, free text up to 20 characters (the UI offers a pick-list).
- Description: optional, up to 500 characters.
- End date must be after the start date (the same day is not allowed). Start may be in the past.
- Expected candidates and seats: whole numbers above 0; seats may equal but not exceed expected.
- "Save draft": only name and academic year are required; anything entered must still be valid.
  Marks Step 1 In progress.
- "Save and continue": every field required, at least one province. Marks Step 1 Complete.
- Saving a draft on a Complete step puts it back to In progress.
- Creating a campaign sets Step 1 In progress (name and year are already stored) and steps 2-5 Not started.
- Only a Draft can be edited.
- "Copy settings from a previous campaign" is shown disabled: no campaign can be Closed yet.

## How to run

```bash
cp .env.example .env            # first time only
docker compose up -d --build    # starts ssms-db, keycloak, backend, frontend
```

Open http://localhost:3000 and sign in as `manager.demo` or `admin.demo` (password in
`infra/keycloak/realm-export.json`; Keycloak asks for a new one on first login).
The backend applies its migrations at startup. Set `SEED_DEMO_CAMPAIGNS=true` in `.env`
to start with three sample campaigns (only used when the database has none).

Running the apps outside Docker: start `ssms-db` with compose, then `dotnet run` in
`backend/src/Host` (uses port 5433 from `appsettings.Development.json`) and `npm run dev`
in `apps/web` (calls the backend at `http://localhost:5000` unless `BACKEND_API_URL` is set).

## How to test

```bash
# Backend: 98 tests. Needs Docker: a real PostgreSQL starts in a container for the run.
cd backend && dotnet test

# Frontend: 142 tests (Vitest + Testing Library), plus type-check and lint.
cd apps/web && npm test && npx tsc --noEmit && npm run lint
```

Backend tests cover domain rules, validation, the API (create, duplicates, draft, complete,
step status changes, concurrency), authorization per role, and the database constraints.

## What was actually verified

- Both test suites pass (numbers above).
- Against the running Docker stack with **real Keycloak tokens**: no token gives 401, an
  officer can read but gets 403 on create, a manager creates and completes a campaign, and
  the creator's name on the campaign comes from the token.
- In a real Chrome browser, through the real login page: the empty state, the dialog (focus
  stays inside, Escape returns focus to the button), inline errors, duplicate-name error,
  the live end-date error and timeline, province selection, draft save and reload, completing
  Step 1, the officer's read-only view, and a phone-width layout with no horizontal scroll.
  All 30 checks passed. This was a one-off run; those browser checks are not part of the repo.

## Not verified / known limits

- Screen readers were not tried. Accessibility rests on real buttons, labels, `aria-*`, a
  native `<dialog>` and automated checks, not on a manual audit.
- "Review and activate" stays disabled until all five steps are complete. Activation itself
  is out of scope, so even the enabled button has no action yet.
- Steps 2-5 have no pages; their buttons are disabled.
- Error messages from the server are English. For Khmer they will need codes mapped to
  `lib/messages`.
- "Draft saved at" is always shown in Cambodia time (Asia/Phnom_Penh).
- The access token is also part of the Auth.js session object on the server (as the Auth.js
  docs show for calling an API). It is not used in the browser, but `/api/auth/session` returns
  that session to the signed-in user's own browser.
