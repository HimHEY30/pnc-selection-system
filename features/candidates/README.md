# Candidates (Step 4 of campaign setup)

Status: **PLAN, not yet approved. No code written.** Every decision below was made on my recommendation after
"use your recommendation"; PNC has not confirmed any of them.

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
| 6 | Address source | Called from the **browser** only, through one wrapper file. Both the code and the name of each level are saved with the candidate. Fallback: type the place names by hand when the service cannot be reached. | The backend never calls the API, so it can only check shape, not that a code exists. Saving names keeps old records readable if the data changes. |
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
- **Address API is a third party.** The candidate list I found is [Pumi](https://github.com/dwilkie/pumi/), an open-source Cambodia geodata project that says it offers a JSON API. **I have not called it, so I do not know its endpoints, its uptime, or whether it covers every village.** First coding step: try it and, if it is not reliable, bundle the data in the web app instead (the wrapper makes that a one-file change). Because the browser calls it, the app's content-security settings may need that host allowed.
- Duplicate people with different phones, or one phone shared by two family members, are not caught.
- Khmer script validation is by Unicode range only; it does not check that the name is a real name.
- Gender, the 10 to 80 age range, the phone limit of one per campaign and the retention rule are my assumptions.

## Glossary

Candidate: a person applying in one campaign. Partner host: an NGO, high school or other organisation in the Sessions
host directory. Commune and village: the third and fourth address levels below province and district (in Phnom Penh,
districts are *khan* and communes *sangkat*; the picker uses the API's own labels).

Technical design, security, tests and build order: [design.md](design.md).
