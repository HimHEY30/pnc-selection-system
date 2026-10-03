# User guide for new staff, and protection for unsaved forms

## Request

"A feature for a user guideline: how to use this app when they first log in." Then, after a list of what makes an app
friendly: "yes make it", covering the two items recommended first: **the first-login tour with a Guide page** and
**unsaved-changes protection on forms**.

## Decisions (made on the recommendation, not yet confirmed by PNC)

| Question | Decision | Why |
|---|---|---|
| Where is "tour seen" remembered? | A cookie in the browser (`pnc_guide_seen`, one year) | Users live only in Keycloak and the backend has no user table. The tour is help text, so seeing it once more on a second device costs nothing. A backend table can replace the cookie later without touching the screens. |
| Format | A step-by-step dialog (Back, Next, Skip), not a spotlight on real buttons | No tour library, no positioning code that breaks when the layout changes. |
| Text | Written by me from what the app does, English only, in `lib/messages/en.ts` | PNC staff should check the wording. Khmer is added later through the same file. |

## What will be built

**1. Welcome tour.** On the first visit to the admin area a dialog opens with four or five steps for the person's role.
Finishing or skipping sets the cookie and it never opens by itself again.
- Admin and manager: the campaign setup steps, creating a campaign (including copying one), eligibility rules,
  information sessions, where to find help.
- Officer: what an officer can see, My sessions, entering expected and actual attendance, where to find help.

**2. Guide page.** `/admin/guide`, linked from the sidebar under **Help**. The same material as the tour as short
sections, shown for the person's role, with a **Show the tour again** button and a glossary (campaign, step, rule group,
Not scheduled). It needs no backend.

**3. Unsaved-changes protection.** `FormDialog` gets a `dirty` flag. Closing a dirty form with Escape, the close
button or a click on the backdrop asks "Discard your changes?" (Keep editing / Discard) instead of throwing the typing
away. A clean form, a save in flight (already protected), a successful save and the form's own **Cancel** button behave as
before: Cancel is an explicit "throw it away". Wired into the session, host, attendance-numbers and cancel-session forms
and the Create campaign dialog.

## Out of scope

Spotlight tour, tooltips on fields, a per-user setting that follows the person across devices, Khmer text, a video, a
"what's new" feed, hints inside empty states.

## What was built

- **Tour:** `GuideProvider` (in the admin layout) owns one `GuideTour`, a `FormDialog` showing one step at a time with a
  progress bar. The admin layout reads the `pnc_guide_seen` cookie on the server, so the tour opens on the first visit with
  no flash. Closing it any way (Got it, Skip the tour, the ×, Escape) sets the cookie from the browser.
- **Guide page:** `/admin/guide`, a **Help › Guide** link in the sidebar, the same steps as sections for the person's role,
  **Show the tour again**, and a glossary. Text is `t.guide` in `lib/messages/en.ts`; which steps a person gets is
  `guideFor(roles)` in `lib/guide/guide.ts` (admin or manager: campaign guide; anyone else: officer guide).
- **Unsaved changes:** `FormDialog` has `dirty`; the session, host, attendance-numbers and cancel-session forms and the
  Create campaign dialog report it. The numbers form compares with its last save because it stays open after saving.
  The Create campaign dialog has its own `<dialog>`, so it carries the same question itself.
- Behaviour you might not expect: the cookie is **per browser, not per person**. Two people sharing one browser profile
  see the tour once between them. The guide text only describes what exists today: Steps 4 and 5 (Candidates, Entrance
  exam) are said to be "not open yet".

## Tests

`cd apps/web && npm test && npx tsc --noEmit && npm run lint` (820 tests, 39 new): the discard question for every way of
closing, each of the five forms, which steps each role gets, the tour's navigation, the cookie being set only on close,
and reopening from the Guide page. `npx next build` also compiles, with `/admin/guide` as a dynamic route.

## Not verified

- **No browser.** Nothing was looked at: the tour and Guide page layout, phone width, keyboard and screen-reader use, or the
  tour opening on a real first login. The running Docker stack still has the old build.
- **Escape in a real browser.** Chrome may refuse to hold back a second Escape press that follows the first with no click or
  key in between. The tests send the `cancel` event by hand; they do not prove how each browser behaves.
- The server-side parts (the layout reading the cookie, the Guide page) have no unit test; only the build covers them.
- The guide's wording is mine and has not been read by PNC staff.
