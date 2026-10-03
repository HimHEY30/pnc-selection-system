# Eligibility rules (Step 2 of campaign setup)

## Request

Let admins and managers say, for each campaign, who is allowed to apply, from the UI and with no code changes.
A rule is a check on one candidate attribute (age, province, highest grade, ...). Rules sit in groups that combine
with ALL or ANY. Later the Candidates step checks every candidate against them, so the check lives in code that does
not depend on the UI.

## What was built

**Backend** (`backend/src/Modules/Eligibility`, a new module beside Identity and Campaigns)
- **Field catalogue as data.** `fields`, `field_options` and `operators` are tables, seeded by the first migration.
  A field's operators are those of its value type (number, choice, yes/no, date), so a new field is a new row and
  needs no change to the rule builder. A new operator also needs code in the evaluator.
- **Rules.** `rule_sets` (one per campaign), `rule_groups`, `rules`, and an append-only `audit_log`. Foreign keys and
  check constraints, a unique index so the same check cannot appear twice in a group, and an `xmin` version so two
  people saving at once are told to reload.
- **`EligibilityEvaluator`** (pure, in `Eligibility.Domain`): takes a rule set and a candidate and returns eligible or
  not plus the result of every rule and group. No database, no web request.
- **Validation:** the right values for the field and comparison, contradictions and duplicates, and what finishing the
  step needs.
- **Endpoints:** catalogue, read, save draft, save and continue, test a sample candidate, suggested starter rules.
- Saving sets Step 2's status through a new `ICampaignSetupGateway`, so this module never touches the campaign tables.

**Frontend** (`apps/web`), page `/admin/campaigns/[id]/eligibility`
- The rule builder: groups and rules as rows (field, comparison, value, type, active switch, handle, details,
  delete), the empty state, a live plain-language summary, and a **test panel with a Run test button**.
- Reordering by drag, by the handle with the keyboard (Space to lift, arrows, Space to drop), and by Move up/down buttons.
- Inline messages under each input, confirmation before deleting a rule or group, a warning before leaving with unsaved work,
  loading and error states, and a read-only view. All text is in `lib/messages` for translation.

## Who can do what

| Role | Read | Test a candidate | Save, suggest |
|---|---|---|---|
| system-admin, selection-manager | yes | yes | yes, while the campaign is a draft |
| selection-officer | yes (read-only page) | yes | no |
| committee-user | no | no | no |

Once a campaign is not a draft, nobody can change its rules (the server answers 409); they stay visible and flagged as locked.

## Rules (as implemented)

- **Mandatory** rules decide eligibility; **optional** rules never block anyone, a failure is only a warning.
- Inside a group, only active mandatory rules count: an ALL group needs all of them, an ANY group needs one, and a group
  with none has no say. Groups always combine with ALL. A switched-off rule is skipped.
- A value the candidate did not provide fails the rule and is flagged "not provided".
- Age is whole years completed on a reference date chosen per campaign (it starts as the campaign's start date). A sample
  candidate gives a date of birth. "Between" includes both ends; "less than" and "greater than" do not include the value.
- Every rule needs a failure message (up to 200 characters); a new rule gets a sensible one that follows the rule until the
  user writes their own.
- **Save draft:** each rule must be well formed, with no duplicate and no contradiction; the step becomes In progress.
  **Save and continue:** also needs an active mandatory rule, the age reference date if an age rule is active, and province
  rules limited to the campaign's target provinces; the step becomes Complete. Saving a draft after completing puts it back
  to In progress. After Save and continue the page returns to the setup overview, because Step 3 has no page yet.
- **Contradictions** (for example age at least 20 and at most 18) are found among the active mandatory rules that must all be
  true: inside an ALL group and across ALL groups. ANY groups are not checked. The message names the rules involved.
- The page keeps changes in a working copy and stores the **whole set** on save (one atomic call), not each click.

## How to run

```bash
docker compose up -d --build    # starts ssms-db, keycloak, backend, frontend (migrations run at startup)
```

Open http://localhost:3000, sign in as `manager.demo` or `admin.demo`, create a campaign, finish Step 1 (Step 2 needs
its start date and target provinces), then open **Eligibility rules** from the setup overview.

## How to test

```bash
# Backend: 482 tests (106 Campaigns, 376 Eligibility). Needs Docker: a real PostgreSQL starts for the run.
cd backend && dotnet test

# Frontend: 422 tests, plus type-check and lint.
cd apps/web && npm test && npx tsc --noEmit && npm run lint
```

The backend tests cover every operator of every field type at its boundaries, ALL/ANY, mandatory vs optional, missing
data, contradictions, duplicates, validation, the audit log, versions and two people saving at once, role permissions,
the locked state of an Active or Closed campaign, step status changes, copying, and what the database itself refuses.

## What was actually verified

- Both test suites pass (numbers above). A weakened save policy was caught by two tests, then reverted.
- In a real Chrome browser, through the real login and the running backend: opening Step 2 from the overview, the empty
  state, suggested rules, the summary, running tests (eligible, not eligible with the failure message, missing information,
  a result marked out of date after an edit), a contradiction refused by the server with nothing saved, confirm-before-delete
  (focus starts on the safe button), reordering with the buttons and with the keyboard on the handle, saving and reloading,
  the audit lines, the unsaved-changes dialog, Save and continue, an Active campaign becoming read only, the officer's
  read-only page with a working test, and a phone-width layout with no sideways scroll. Everything passed after four
  problems it found were fixed: a step strip that always said "Step 1", summaries listing values in key order, rule controls
  pushing the page wider than a phone, and a cut-off field name. It was a one-off run; those checks are not in the repo.

## Assumptions (please confirm with PNC)

- **Starter rules** are a sample, not PNC policy: age between 17 and 23, Grade 12 or higher, the campaign's target provinces
  (all mandatory) and an optional information-session rule. Edit `SuggestedRules.cs` to change them.
- **Choice lists** are proposals: grades 9 to 12 and diploma or higher; Grade 12 exam result A to F; gender female and male;
  marital status single, married, divorced, widowed. Grade 12 exam result is a choice, not a number.
- Choice fields use is / is not / is one of / is none of, as specified, so "at least Grade 11" is written as "is one of
  Grade 11, Grade 12, ...".

## Not done / known limits

- **Admin unlock of an Active campaign** is not built: activation does not exist yet and the unlock needs its own design.
  Rules are simply read-only whenever the campaign is not a draft.
- **Copy rules from a previous campaign** works (`CopyRulesAsync`, tested) but no screen triggers it: the Create dialog's
  copy option is still disabled because no campaign can be completed yet.
- **Audit log** is written for every change (who, what, when, before and after) but there is no history screen; the page
  shows only when it was last saved.
- The browser **Back button** inside the app cannot be intercepted by Next.js, so it leaves without the unsaved-changes
  question. Closing the tab and clicking links do ask.
- Contradictions are found by the **server** on save, not live in the browser.
- Running rules against real candidates in bulk, the Candidates step, nested groups, custom formulas and Khmer are out of scope.
- Screen readers were not tried; keyboard use was checked in Chrome.
- The links from `rule_sets` and `audit_log` to `campaigns.campaigns` are written by hand in the migration (another module's
  table), so the Host always runs the Campaigns migrations first.
