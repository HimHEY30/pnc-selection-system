# Eligibility rules (Step 2 of campaign setup)

## Request

Let admins and managers say, for each campaign, who is allowed to apply, from the UI and with no code changes.
A rule is a check on one candidate attribute (age, province, highest grade, ...). Rules sit in groups that combine
with ALL or ANY. Later the Candidates step checks every candidate against them, so the check lives in code that does
not depend on the UI.

**Follow-up request:** let rules also check exam subjects, such as Math, Logic and English, "or can be more". See
[Exam subjects](#exam-subjects) below.

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

## Exam subjects

Rules can check a candidate's score in an exam subject, and their total or average across the subjects. Each campaign
has its own list of subjects, managed on the Step 2 page.

**How it works.** A subject is a row in `eligibility.fields` that belongs to one campaign (`campaign_id`, `subject_name`),
a number field of points from 0 to 100 with two decimals. So rules, validation, the evaluator, the summary, the test panel
and the foreign key from a rule to its field treat "Math score" like any other field; there is no second mechanism. The
catalogue a campaign sees is the shared fields, its own subjects, and (with two or more subjects) two shared fields worked
out from them: **Total exam score** and **Average exam score**.

**On the page.** A card at the top of Step 2 lists the subjects with "Used by N rules" badges, and lets a manager
- **add** a subject (it is a field in every rule row straight away),
- **rename** one (rules hold the subject's key, so they keep working; the name changes in the field list, the summary and
  the failure messages that were filled in for you; a message you wrote yourself keeps the old name),
- **remove** one, after a confirmation that says it happens now, not on save.

Subject changes are saved at once (they are not part of the rule set's whole-set save) and audited. A new draft campaign
starts with **Math, Logic and English**, added the first time its page opens (by the system, so not in the audit log).
Removing every subject on purpose does not bring them back.

**Rules of the subject list**
- Names are tidied (outer spaces off, inner runs of spaces made one), 1 to 40 characters, unique within the campaign
  ignoring case (also enforced by a unique index), at most 12 subjects.
- Only a draft campaign can change its subjects, like its rules; officers see the list read only.
- A subject a **saved** rule uses cannot be removed (409), nor can one whose removal would leave a saved total or average
  rule with fewer than two subjects. On the page, a subject used by a rule on screen (saved or not) has its Remove button
  off too, until the rule is deleted and saved.
- The database refuses to delete a subject a rule uses (the key is checked when the transaction commits, so deleting a
  whole campaign, which removes its subjects and rules together, still works).

**How a candidate is checked**
- A subject rule compares that score (at least, at most, between, ...), like any number.
- **Total** = the sum of the campaign's subject scores; **average** = the total divided by the number of subjects, rounded
  to two decimals (half up) so a rule can reach it. If any subject's score is missing or is not a number, the total and
  average are missing too, so a candidate cannot pass "total at least 200" by leaving a subject out. A missing value fails
  the rule and is flagged "not provided", as for every other field.
- The test panel asks for the scores a rule needs: one subject's score for a subject rule, every subject's score for a
  total or average rule. Leave one blank to see a missing score handled.
- Copying rules from another campaign (not reachable from a screen yet) copies the subjects too, reusing one with the same
  name, and points the copied rules at the new campaign's own subjects.

**API** (all under `/api/campaigns/{id}/eligibility/exam-subjects`): `GET` (admin, manager, officer), `POST`, `PUT /{key}`,
`DELETE /{key}` (admin, manager). Each answers with the whole subject list and the campaign's catalogue.

## How to run

```bash
docker compose up -d --build    # starts ssms-db, keycloak, backend, frontend (migrations run at startup)
```

Open http://localhost:3000, sign in as `manager.demo` or `admin.demo`, create a campaign, finish Step 1 (Step 2 needs
its start date and target provinces), then open **Eligibility rules** from the setup overview.

## How to test

```bash
# Backend: 626 tests (106 Campaigns, 520 Eligibility). Needs Docker: a real PostgreSQL starts for the run.
cd backend && dotnet test

# Frontend: 512 tests, plus type-check and lint.
cd apps/web && npm test && npx tsc --noEmit && npm run lint
```

The backend tests cover every operator of every field type at its boundaries, ALL/ANY, mandatory vs optional, missing
data, contradictions, duplicates, validation, the audit log, versions and two people saving at once, role permissions,
the locked state of an Active or Closed campaign, step status changes, copying, and what the database itself refuses.
For exam subjects they add: the evaluator on scores, totals, averages and missing scores; adding, renaming and removing
with every refusal and the audit lines; eight people opening a new campaign at once (still exactly three subjects); rules
on subjects saved, completed and tested; another campaign's subject refused; roles and the locked state; copying with
subjects; and the database constraints (a name needs a campaign, no duplicate names, a used subject cannot be deleted, a
campaign with subjects and rules can be deleted).

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
- **Exam subjects** were checked differently, because no browser was available for that change: both test suites pass;
  one test that failed was a real bug (focus did not return to the Rename button while it was still disabled by the pending
  request) and was fixed; tests that guard the test panel's behaviour fail without the code they guard; and the new migration
  was applied to the running dev database that already held the first Eligibility migration (it applied cleanly, with the
  two new fields, the constraints and the unique name index in place). **The subjects card was not looked at in a real
  browser**: its layout (for example the Add subject button lining up with the name box) and its phone-width behaviour are
  unverified, and so is a live run through Keycloak login.

## Assumptions (please confirm with PNC)

- **Starter rules** are a sample, not PNC policy: age between 17 and 23, Grade 12 or higher, the campaign's target provinces
  (all mandatory) and an optional information-session rule. Edit `SuggestedRules.cs` to change them.
- **Choice lists** are proposals: grades 9 to 12 and diploma or higher; Grade 12 exam result A to F; gender female and male;
  marital status single, married, divorced, widowed. Grade 12 exam result is a choice, not a number.
- Choice fields use is / is not / is one of / is none of, as specified, so "at least Grade 11" is written as "is one of
  Grade 11, Grade 12, ...".
- **Exam subjects** (please confirm): they are the PNC entrance exam's subjects; every subject is scored 0 to 100 with up to
  two decimals; each campaign has its own list (new campaigns start with Math, Logic and English, at most 12 subjects);
  the total and average cover every subject of the campaign with equal weight; a missing score fails a rule.

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
- **Exam scores are not collected anywhere yet.** Step 5 (Entrance exam) has no page or data, so subject rules can be written
  and tested but no real candidate has a score to be checked against until that step exists. The evaluator is ready for it.
- Subjects cannot be reordered, weighted (a weighted total) or given a different maximum from 100, and there is no history
  screen for subject changes (they are in the audit log).
- A failure message the user wrote for a rule keeps the subject's old name after a rename, and so does a filled-in message
  if the page is reloaded before the rules are saved (it then looks like a message the user wrote).
- Subject changes are saved at once, so they are not undone by leaving the page without saving the rules.
- Screen readers were not tried; keyboard use was checked in Chrome.
- The links from `rule_sets` and `audit_log` to `campaigns.campaigns` are written by hand in the migration (another module's
  table), so the Host always runs the Campaigns migrations first.
