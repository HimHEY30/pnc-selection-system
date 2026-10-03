# Candidates (Step 4 of campaign setup)

Status: **BUILT, not yet confirmed by PNC and never run in a browser** (see "Not verified" at the end). Every decision
below was made on my recommendation after "use your recommendation"; PNC has not confirmed any of them. Where the build
differs from the plan, the table and the notes say so.

## Request

Manage the candidates of a campaign. A candidate has: Khmer name, English name, date of birth, phone number, address
(province, district, commune, village, chosen from a Cambodia address API in the frontend), the high school they come
from, the information session they attended (chosen from the campaign's sessions, never typed), and whether an NGO
supports them (and the NGO's name if so).

## Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | What does the session link mean? | "The session this candidate says they came to." Chosen from the campaign's sessions. It is **not** proof of attendance and does **not** change the session's female/male totals. | Sessions hold only totals. A per-person attendance list is a larger change to Sessions and is out of scope. Can be added later without changing this record. |
| 2 | Gender | Added, required (female / male) | Eligibility rules and session counts both use it. Not in the original list, so PNC must confirm. |
| 3 | Scope | A candidate belongs to **one campaign**. The same person in a later year is a new record. | Keeps each campaign's list clean and its rule results (age, grade) tied to that year. |
| 4 | Village | Optional. Province, district, commune required. | Public address data is thinner at village level. |
| 5 | High school | Pick from the partner directory (type "High school"), or "Other" with a typed name. | Schools repeat a lot, so a list gives clean counts. Names the directory lacks are not blocked. |
| 6 | Address source | **Changed in the build:** asked through the **web server**, not the browser. The public address service ([Pumi](https://github.com/dwilkie/pumi/)) sends no CORS headers, so a browser on our site cannot read its answers (checked 2026-10-03). The browser asks `/api/address/{level}` on our own web server, which asks Pumi, keeps each list for a day and serves the last copy if Pumi is down. Both the code and the name of each level are saved with the candidate. Fallback: type the place names by hand when the lists cannot be loaded. | Only place codes go to Pumi; nothing about a candidate leaves our system. The backend never calls the API, so it can only check shape, not that a code exists. Saving names keeps old records readable if the data changes. |
| 7 | Who may do what | Admin, manager, officer: add and change. Admin, manager: delete. | Officers meet candidates at sessions. Same tiers as Sessions (`OperationsTier`, `ManagementTier`). |
| 8 | Left out | Photo, ID-card number, parent contact, Excel import, per-person attendance, duplicate merge, candidate self-service, Khmer UI text. | Not asked for. Each can be added later. |
| 9 | Language | English screen text in `lib/messages/en.ts`. | As in earlier features. |

## Scope

In: the Candidates module (backend), the Step 4 screens, the address picker, turning on the Step 4 link and the sidebar
**Candidates** item, the Guide text, tests, an audit trail.
Out: see decision 8, and the entrance exam (Step 5), and checking candidates against eligibility rules (the record only
makes that possible later).

## Candidate fields and rules

| Field | Rule |
|---|---|
| Khmer name | Required, up to 100 characters, must contain at least one Khmer character (U+1780 to U+17FF); no Latin letters or digits. |
| English name | Required, up to 100 characters, letters, spaces, hyphen, apostrophe and full stop only. |
| Gender | Required: female or male. |
| Date of birth | Required, a real date, not in the future, age 10 to 80 on the day it is entered. |
| Phone | Required. Cambodian number, typed with `0`, `+855` or `00855` in front (spaces, dashes and brackets allowed) and stored in one form: `0` followed by 8 or 9 digits. **One phone per campaign:** a second candidate with the same phone in the same campaign is refused and the screen names the existing one. |
| Address | Province, district, commune each a code and a name (both required together); village code and name both given or both empty. Or, in fallback mode, the three names typed and `codes = null`. |
| Came from high school | Either a partner host from the directory (stored by id, and its name copied at that moment) or "Other" with a typed name up to 150 characters. Exactly one of the two. |
| Information session | Optional. Must be a session of **the same campaign**. A Cancelled session is not offered; if a chosen session is cancelled later the link stays and is shown as cancelled. |
| NGO support | Yes or no. Yes: NGO name required, up to 150 characters. No: the name must be empty. |

When it can change: while the campaign is Draft or Active; not once it is Closed (same as sessions). A candidate is
**deleted for real** by management; the audit entry stays and holds what the record looked like.

Every create, change and delete is written to an append-only audit log: who, when, before and after.

## User stories and acceptance criteria

1. **Add a candidate.** An officer, manager or admin opens a campaign's Candidates step, chooses **Add candidate**, fills the form, saves.
   - AC: Missing or invalid fields show a message beside the field and nothing is saved.
   - AC: A saved candidate appears at the top of the list without a page reload.
   - AC: Closing the form with typing in it asks "Discard your changes?".
2. **Pick an address.** The person chooses a province, then a district, commune and village.
   - AC: Each list is empty and disabled until the one above is chosen; changing a higher level clears the lower ones.
   - AC: A slow list shows a loading state; a failed one shows "could not load" with **Try again** and **Type it instead**.
3. **Pick the school and the session.**
   - AC: The school list shows active high-school partners; "Other" reveals a text box.
   - AC: The session list shows only this campaign's sessions that are not cancelled, by date and title, and can be left empty.
4. **Record NGO support.**
   - AC: Choosing Yes shows a required name box; choosing No hides and clears it.
5. **Find candidates.** Anyone allowed to read opens the list.
   - AC: 20 per page; search by Khmer name, English name or phone; filter by province, session, NGO support; sorted newest first.
   - AC: An empty campaign shows a message with **Add candidate**, not an empty table.
6. **Change a candidate.** Same form, filled in. AC: two people saving the same record at once: the second is told it changed and nothing is overwritten.
7. **Delete a candidate.** Management only, after a confirmation. AC: officers do not see the option and the server refuses them.
8. **Duplicate phone.** AC: adding a candidate whose phone is already in this campaign is refused with the existing candidate's name.
9. **Step 4 opens.** AC: the campaign overview and step tabs link to Candidates; the sidebar **Candidates** item works and shows the active campaign's list.

Edge cases covered by these: Khmer name typed in Latin, a phone with spaces or dashes, a future birth date, a school
typed that exists in the directory, a session from another campaign sent by hand (refused by the server), address API
down, a campaign closed while the form is open (the save is refused with the reason).

## Risks and assumptions

- **Personal data of young people.** Names, birth dates, phones and home addresses. Needs: login for every call (done by the policies above), no candidate data in logs, audit entries kept as long as the record, and a rule from PNC on how long candidate data is kept. **Not decided; PNC must answer.**
- **Address API is a third party, and a fragile one.** [Pumi](https://github.com/dwilkie/pumi/) is an open-source Cambodia geodata project whose public instance (`pumi.onrender.com`) runs on a free-tier host. I called it on 2026-10-03 and 2026-10-04: 25 provinces, all with English names; Phnom Penh has 14 districts; codes keep a leading zero (`02` is Battambang); it matches the province ids the campaigns already use (`2` Battambang, `17` Siem Reap). Awake it answered in about 0.2 s (villages about 1.6 s). **It sleeps when idle: one request after a quiet spell took more than 20 seconds and timed out, and one test run of the real code took 14 seconds in total.** I did not check every village in the country. If PNC relies on this, it should self-host the data (the wrapper `lib/address/source.ts` makes that one file) rather than depend on a free instance. The setting `ADDRESS_API_URL` points the web server at another copy.
- Duplicate people with different phones, or one phone shared by two family members, are not caught.
- Khmer script validation is by Unicode range only; it does not check that the name is a real name.
- Gender, the 10 to 80 age range, the phone limit of one per campaign and the retention rule are my assumptions.

## Glossary

Candidate: a person applying in one campaign. Partner host: an NGO, high school or other organisation in the Sessions
host directory. Commune and village: the third and fourth address levels below province and district (in Phnom Penh,
districts are *khan* and communes *sangkat*; the picker uses the API's own labels).

Technical design, security, tests and build order: [design.md](design.md).

## What was built

**Backend** (`backend/src/Modules/Candidates`, a new module beside Sessions; schema `candidates`)
- **Domain.** `Candidate` holds every rule about its own fields: Khmer letters only (no Latin letters or digits), English
  letters, hyphen, apostrophe and full stop only, age 10 to 80 counted on Cambodia's calendar (UTC+7), a Cambodian phone
  typed as `0…`, `+855…` or `00855…` and stored as `0` plus 8 or 9 digits, the three upper address levels all picked or all
  typed, a village that is picked or typed to match, the school's name, and the NGO's name if and only if there is support.
  `Validate` checks without changing, so the service can check everything before touching a loaded candidate.
- **Service.** Checks the campaign exists and is not Closed, that the phone is not another candidate's in the same campaign
  (the message names who has it), that a picked school is an **active high school** from the partner directory (its name
  comes from there, never from the form), and that the session belongs to the same campaign and is **Planned or Done**
  (not cancelled, not undated). A school or session a candidate already has may stay even if it was switched off or cancelled
  later. A change must carry the version the person was looking at. Every add, change and delete writes an audit line; a
  change that alters nothing writes none.
- **Database.** `candidates` and an append-only `audit_log`. The database repeats the rules as check constraints (phone form,
  address codes all-or-none, NGO name if and only if supported). One phone per campaign is a unique index. Hand-written
  foreign keys: deleting a campaign removes its candidates; deleting a session only clears the link.
- **API** under `/api/campaigns/{id}/candidates`: list (search names and phone in any form, filters for province, session and
  NGO, paging up to 100), get, add, change, delete, `session-choices`; and `/api/candidate-schools`. Admin, manager and officer
  read, add and change; only admin and manager delete; committee users get 403, anonymous callers 401. Every response is
  `no-store`.
- Sessions publishes two small read-only interfaces for this, `ISessionChoices` and `ISchoolDirectory`, so Candidates never
  touches session tables or entities. `backend/ownership-matrix.md` describes the module.

**Web** (`apps/web`)
- `/admin/campaigns/{id}/candidates` (Step 4): table with both names, gender, birth date, phone, address, school, session
  and NGO; three-dots menu (Edit, Delete); search; filters; Previous/Next; the search, filters and page live in the web
  address. Step 4 in the setup overview is now a link.
- The **Candidates** sidebar item opens `/admin/candidates`, which sends the person to the running campaign (the newest if
  several run), else the newest campaign, else the campaigns page.
- **Form dialog** with the unsaved-changes guard: names, gender, birth date, phone, the address picker, the school (pick or
  Other), the session (optional), NGO support (yes shows a required name, no forgets it). Missing fields are named beside each
  one; the server's messages land beside their fields.
- **Address picker**: four lists that open one after another, clear below when a higher one changes, with Loading, Try again
  and **Type it instead**. It asks `/api/address/{level}`, a small route on our web server (see decision 6).
- The Guide and the welcome tour now describe Step 4 (an Add candidates section for each role) and the glossary has Candidate.
- Shared change: the backend client now reads a `204 No Content` reply (a delete has no body).

## Differences from the plan

- The address service is asked by the web server, not the browser (decision 6; no CORS).
- The phone rule is `0` plus 8 or 9 digits, not "8 to 10 digits after the prefix".
- Concurrent edits are caught by a version in the request (the person's screen may be minutes old), as well as by the
  database's own row version at save time.
- The Candidates step's status in the campaign (Not started / In progress / Complete) is **not** updated yet: the plan did
  not include it, and what "complete" means for candidates (a minimum number? a closing date?) is a business rule to ask PNC.
- `design.md` names a frontend-performance gate and an observability gate; neither was run (see below).

## Tests

- Backend `cd backend && dotnet test Backend.slnx`: **1,153** tests, 175 of them in `Candidates.Tests` (62 domain, 55 service
  with in-memory stand-ins, 21 schema and 18 repository tests against a real PostgreSQL in a container, 19 HTTP tests for the
  role table and the whole journey). Sessions gained 9.
- Web `cd apps/web && npm test && npx tsc --noEmit && npm run lint`: **1,032** tests; `npx next build` compiles and lists the
  candidates page, `/admin/candidates` and `/api/address/[level]`.
- Break-checks: for the rules that matter most (the version check, duplicate phone, officer cannot delete, no-store, the
  campaign filter, clearing lower address levels, sharing one request for the same list, and others) I removed or inverted the
  rule and confirmed a test fails, then restored it.

## Not verified

- **No browser. The screens have never been seen.** The tests render the form, the picker and the list in jsdom, which has
  no layout: nothing checks how it looks, the table at phone width, the dialog's length on a small screen, or keyboard and
  screen-reader use. The running Docker stack still has the old build, and the new migration has not been applied to the
  dev database (it applies by itself when the backend starts).
- **The address lists through the real route and the real browser.** I ran the server-side code against the live service
  (25 provinces, Phnom Penh's 14 districts, 5 communes, 16 villages), but not the route inside a running Next.js server (it
  needs a signed-in session) and not the picker talking to it. The route handler and the page have no unit test of their
  own; the build covers them.
- **The address service is slow to wake and not ours** (see Risks). With the early wake-up and a 40-second wait the first form
  after a quiet spell should usually work, but a cold start can still push a person to typing the address.
- **The web container must reach the internet** to ask the address service. Not checked.
- **Intermittent test failures I could not explain:** the Candidates database tests failed in 2 of my 6 whole-suite runs with
  "No such container" from the test-container library (a rerun passed each time), and one web test
  (`CampaignInfoForm`, "updates the last-saved time") failed once in a whole-suite run and passes alone, with and without
  this work. Neither points at the feature, but I did not find the cause.
- **A concurrent edit across minutes** is proved at the API (a stale version gives 409) and in the form (the version is sent),
  not by two people in two browsers.
- **Not run:** frontend performance checks, observability, and a review by someone other than me. `design.md` is my own
  plan in all the specialist roles.
- **Not decided by PNC:** gender as a required field, the 10 to 80 age range, one phone per campaign, officers adding and
  changing, how long candidate data is kept, and the wording of the screens.
