# Information sessions (Step 3 of campaign setup)

## Request

Admins and managers create information sessions for a campaign and assign each one to an officer or to themselves.
A session is hosted by an officer, an alumnus or a partner (an NGO, a high school, ...). Admins, managers and officers
can record how many candidates are **expected** to join and, afterwards, how many **actually** joined, as a number of
females and a number of males.

## What was built

**Backend** (`backend/src/Modules/Sessions`, a new module beside Identity, Campaigns and Eligibility; schema `sessions`)
- **Sessions.** `information_sessions`: title, date, start and end time (Cambodia time), format (in person, online,
  hybrid), venue or link, an optional target province, notes, the person responsible, who runs it, status (Planned, Done,
  Cancelled), the expected number, and the actual attendance (females and males, who entered it and when).
- **Hosts.** `hosts` is the directory of alumni and partners, so they can run sessions again later. An officer is not a
  directory record: the session points at the staff member.
- **Audit.** `audit_log` is append-only: who changed which session or host, when, and what it looked like before and after.
- The database repeats the rules as check constraints and links to `campaigns.campaigns` and `campaigns.provinces` by
  hand-written foreign keys (another module's tables); deleting a campaign deletes its sessions.
- **Staff directory.** Users live only in Keycloak, so `Identity` publishes `IStaffDirectory`, implemented against
  Keycloak's admin API (members of the `system-admin`, `selection-manager` and `selection-officer` groups, read with a
  read-only service client, kept for a minute). `GET /api/staff/assignable` (admin, manager) returns the caller plus the
  staff, and still offers the caller when Keycloak cannot be asked.
- **Endpoints:** per campaign list/get/create/change/cancel, `PUT .../expected`, `PUT .../attendance`;
  `GET /api/sessions/mine`; `GET/POST/PUT /api/session-hosts` and `PUT /api/session-hosts/{id}/active`.

**Frontend** (`apps/web`)
- `/admin/campaigns/[id]/sessions` (Step 3): totals, session cards, filters (status, run by, responsible), and dialogs to
  add or edit a session, cancel it (with a reason), and enter numbers. Step 3 in the setup overview is now a link.
- `/admin/sessions` (the sidebar's **Information sessions**): the sessions I am responsible for or run, across campaigns.
- `/admin/sessions/hosts`: the alumni and partner directory (add, edit, switch off or on).
- A shared `FormDialog` (native `<dialog>`), all copy in `lib/messages`, no new colours or one-off controls.

## Who can do what

| Role | Read sessions | Add, change, cancel | Enter expected and actual numbers | Host directory |
|---|---|---|---|---|
| system-admin, selection-manager | yes | yes | yes | read and change |
| selection-officer | yes | no | **yes** | read |
| committee-user | no | no | no | no |

Any officer can enter the numbers on any session, not only their own: the request said "admin, manager or officer".

## Rules (as implemented)

- **Assignee and host.** The person responsible is an admin, a manager or an officer (the person adding it is the
  default, and always works, even when Keycloak is down). The host is an officer (often the same person, one click),
  an alumnus or a partner from the directory. Names of staff are looked up by the server, never taken from the form.
- **A session needs** a title (up to 120 characters), a date, a start and an end time with the end after the start, a
  format, a venue (in person, hybrid) and/or a web link (online, hybrid), a person responsible and a host. A province is
  optional and must be one of the campaign's target provinces. Past dates are allowed, so a session that already
  happened can be recorded.
- **Clash.** The same host cannot run two sessions whose times overlap on the same date, in any campaign (sessions that
  only touch, 09:00-11:00 then 11:00-12:00, do not overlap; cancelled sessions do not count).
- **When it can change.** Details, cancelling and the host follow the campaign: allowed while it is a Draft or Active,
  not once it is Closed. Only a Planned session can be edited. Cancelling needs a reason and is final; a Done session
  cannot be cancelled. A host that was switched off after a session was planned stays on it.
- **Expected** is one whole number from 0 to 5000, optional, and can be changed or cleared until the session is
  cancelled. **Actual** is two whole numbers from 0 to 5000, females and males, both required (0 is a real answer); the
  total is their sum. It can be entered once the session's date has arrived on the Cambodia clock (UTC+7), marks the
  session Done, and can be corrected later (each correction is audited). The numbers stay open while the campaign runs and
  after it closes, because sessions happen while a campaign runs.
- **Step 3's status** is Complete while the campaign has a session that is not cancelled, In progress when it only has
  cancelled ones. The campaign only lets a draft change its steps, so a running campaign's step is left alone.
- **Hosts** are alumni (a name) or partners (an organisation name, a kind: NGO, high school, university, other, and an
  optional contact person). Each needs a phone number or an email address. A name is unique per type, ignoring case.
  Hosts are switched off, never deleted, so the sessions they ran keep them.
- The totals on the page add up expected and actual numbers over sessions that are not cancelled.

## How to run

```bash
docker compose up -d --build    # starts ssms-db, keycloak, backend, frontend (migrations run at startup)
```

Open http://localhost:3000, sign in as `manager.demo`, open a campaign and choose **Information sessions** (Step 3), or
use the sidebar for your own sessions and the host directory.

**The staff picker needs a Keycloak client.** `infra/keycloak/realm-export.json` now has
`selection-system-staff-reader`, a read-only service client (roles `view-users`, `query-users`, `query-groups`), and
`docker-compose.yml` passes its credentials to the backend (`KEYCLOAK_STAFF_CLIENT_ID` and `KEYCLOAK_STAFF_CLIENT_SECRET`
in `.env.example`, with the dev values as defaults). A Keycloak that **already imported the realm does not pick up the
file**. Either recreate its volume, or add the client to the running one:

```bash
KC="docker compose exec keycloak /opt/keycloak/bin/kcadm.sh"
$KC config credentials --server http://localhost:8080 --realm master --user admin --password admin
$KC create clients -r pnc-selection -s clientId=selection-system-staff-reader -s enabled=true \
    -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false -s secret=dev-staff-client-secret-change-me
$KC add-roles -r pnc-selection --uusername service-account-selection-system-staff-reader \
    --cclientid realm-management --rolename view-users --rolename query-users --rolename query-groups
```

Until then the staff list is empty and the form says so; a manager can still assign sessions to themselves. Change the
secret for anything beyond local development.

## How to test

```bash
# Backend: 887 tests (14 Identity, 106 Campaigns, 520 Eligibility, 247 Sessions). Needs Docker: a real PostgreSQL starts.
cd backend && dotnet test

# Frontend: 717 tests, plus type-check and lint. (`npx next typegen` first if a new route's type is missing.)
cd apps/web && npm test && npx tsc --noEmit && npm run lint
```

The Sessions backend tests cover the domain rules (every refusal and boundary, including the Cambodia midnight), the
services against in-memory fakes, the staff directory against a fake Keycloak, the database constraints against a real
PostgreSQL, and the HTTP API end to end: the lifecycle, the audit lines, Step 3's status, a running and a closed campaign,
two people saving at once, and every role. The web tests cover the form logic, each dialog, the list with its filters and
what each role is offered, My sessions, the host directory, and the server actions' role checks.

## Sessions that are not scheduled yet (added with "create a campaign by copying")

A session now has a fourth status, **Unscheduled**: a copy from another campaign that has a title, format, venue or link,
province and notes, but no date, times, person responsible or host. It is made only by copying. `Schedule` (the Edit
form, relabelled) gives all four at once and makes it Planned, running the same checks and clash test as a new session.
It can also be cancelled. It has no attendance (the date comes first), is not in Coming up or My sessions, and Step 3 is
Complete only once a session is Planned or Done. In the database the date, times, person and host are all there or all
empty (`ck_sessions_scheduled`), and a Planned or Done session always has them. The migration's `Down` refuses to run
while any session has no date.

## What was actually verified

- Both test suites pass (numbers above), `tsc` and lint are clean. Weakening the attendance date check was caught by four
  tests at three layers (domain, service, API), then reverted.
- The new migration applied to the running dev database that already held the Campaigns and Eligibility migrations (the
  `sessions` schema has its four tables), and the backend image builds and starts. The four routes answer 401 without a token.
- Keycloak's admin API was read with read-only calls on the running Keycloak (group search by exact name, group members):
  the shapes are the ones `KeycloakStaffDirectory` reads.
- **Not verified:** no browser was available, so none of the new pages was looked at (layout, the dialogs, phone width,
  keyboard use, screen readers). A live run through Keycloak login was not done either, so the staff client and the staff
  picker were only tested against a fake Keycloak, and the service client was not created in the running Keycloak.
  Please click through it once.

## Assumptions (please confirm with PNC)

- A session has one host, and one person responsible. Alumni and partners are not system users and cannot sign in.
- Any officer may enter the numbers on any session (not only their own).
- Sessions can be added and changed while a campaign is a Draft or Active, and the numbers stay open after it closes.
- Attendance is only two numbers (females and males). No other gender is recorded, and there is no list of attendees.
- Dates are on the Cambodia calendar. There is no limit on how far ahead or back a session can be, and no capacity.
- Names of officers come from the members of the Keycloak groups `system-admin`, `selection-manager` and
  `selection-officer` (how the realm hands out roles). Someone given a role directly, without the group, is not listed.

## Not done / known limits

- **No list of who attended.** Candidates are Step 4: the numbers are not linked to individual candidates, and "attended
  an information session" (the optional starter eligibility rule) is not computed from these numbers yet.
- **No notifications** to the person responsible or the host, no recurring sessions, no reminders, no host portal.
- **No history screen** for sessions or hosts: every change is in the audit log, but nothing shows it.
- **A clash is checked by the service, not the database.** Two managers saving overlapping sessions for the same host at
  the very same moment could both succeed; an exclusion constraint would need a PostgreSQL extension.
- The host directory is shared by all campaigns. Sessions are copied into a new campaign without a date, host or person
  responsible (see `features/campaign-clone`), so they have to be scheduled one by one; there is no "schedule many at once".
- The staff list is cached for a minute, so a person added in Keycloak shows up within a minute.
- Two people editing the same session at once: the second is told to reload (the server holds a version), but the form does
  not offer to merge.
- The sidebar's "Information sessions" now opens My sessions for everyone, including managers; a campaign's sessions are
  reached from its setup overview.
