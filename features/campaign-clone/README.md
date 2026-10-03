# Create a campaign by copying an existing one

## Request

On **Create campaign**, the manager can start from scratch or **copy from** an existing campaign. After picking the source,
the form lists what can be copied (eligibility rules, provinces, information sessions, ...) and the manager ticks each
part one by one.

## What was built

**The flow.** Create campaign, then *Copy settings from an existing campaign*, then a **Copy from** box listing the other
campaigns (name, year, status). Picking one loads what it has; each part is a box with its count, nothing ticked at first,
and a part with nothing to copy is shown disabled with the reason. After *Create and continue* the dialog says how each part
went (Copied, Copied with something to check, Not copied, with the reasons) before the manager opens the campaign.

| Part | What is copied | Never copied |
|---|---|---|
| Target provinces | the list | |
| Description, expected candidates and seats | expected candidates, seats, and the description *only if the new campaign's is empty* | name, academic year, **dates** |
| Eligibility rules | the rule set (groups, rules, age reference date) **and the exam subjects the rules use**, with new ids | |
| Information sessions | every session that is not cancelled, as **Unscheduled**: title, format, venue or link, province, notes | date, times, host, person responsible, expected number, attendance, cancelled sessions |

**Rules as built**
- Any campaign can be a source, whatever its status. Copying only reads it; the source is never changed.
- Admin and manager only (the create endpoint and the preview). Officers get 403.
- Copied steps are **In progress, never Complete**: rules and sessions set it themselves, and Step 1 stays In progress.
- A rule on a province the new campaign does not target is copied and reported as *Partly* (tick the provinces too, or fix
  the rule). A session whose province is not targeted is copied with no province and reported *Partly*.
- A source with nothing for a part is reported *Failed* for that part. **The campaign and the other parts stay.**
- Each copied session gets an audit line saying which campaign it was copied from; copied rules are audited like any change.
- Unscheduled sessions: see `features/information-sessions/README.md`. Scheduling is all at once (confirmed).

**Backend**
- `Campaign.CopySettingsFrom` (provinces, details). `ICampaignCopyPart` (published by Campaigns, in
  `Campaigns.Application/CopyContracts.cs`) is implemented by `EligibilityCopyPart` (a thin adapter over the existing
  `CopyRulesAsync`) and `SessionCopyPart`; `CampaignService.CreateAsync` runs the ticked parts in a fixed order after the
  campaign is saved. Campaigns never references the other modules.
- `POST /api/campaigns` takes `startMode: "copy"` and `copyFrom: { sourceCampaignId, parts }` and answers with
  `copyResults: [{ part, outcome, count, issues[] }]`. `GET /api/campaigns/{id}/copy-preview` gives the checklist.
- One migration (Sessions): `AllowUnscheduledSessions`. Nothing else changed in the schema.

**Frontend**
- `CreateCampaignDialog` (the copy flow and the results view), `lib/campaigns/copy.ts`, `createCampaignAction` and
  `loadCopyPreviewAction`, and the Unscheduled handling on the sessions page. All copy is in `lib/messages/en.ts`.

## Where this differs from the first plan

- **No retry for a failed part.** The plan listed `POST /api/campaigns/{id}/copy` as optional; it was not built. A part that
  failed has to be done by hand from the campaign's own pages.
- **The results are shown in the dialog**, not as a banner on the new campaign's page, so closing the dialog without
  pressing *Open campaign* loses the report (the campaign is still created and listed).
- Part labels are in the frontend (`en.ts`); the backend's labels in the preview are not used.
- Cancelled sessions are left behind, and the expected number is not copied (not in the plan; a stale figure would mislead).
- When scheduling a copy the form starts with the person scheduling as both responsible and host, as for a new session.
- The sessions "enter numbers" action is hidden for an Unscheduled session, although the API would accept an expected number.

## Tests

`cd backend && dotnet test` (Campaigns 127, Sessions 294, Eligibility 534, Identity 14; Docker needed) and
`cd apps/web && npm test && npx tsc --noEmit && npm run lint` (781 tests). They cover each part alone and together through
the real API and database, the source left unchanged, the steps left In progress, officers refused, a failing part not
undoing the campaign, the database constraints for Unscheduled sessions, and the dialog (checklist, validation, the exact
request, the results view).

## What was not verified

- **No browser.** Nothing was looked at: the dialog, the checklist, the results view, the Schedule form, the table with
  Not scheduled rows, phone width, keyboard and screen reader use. The running Docker stack still has the old build.
- The new migration was applied only to the test databases (a fresh PostgreSQL per test run), **not to the running dev
  database**, and the `Down` guard (refusing while a session has no date) was not run.
- Copying was not tried with a real campaign's data, only with test fixtures.
- The Keycloak staff-list 401 from earlier still empties the officer lists, so scheduling a copy for someone other than
  yourself needs that fixed first.
