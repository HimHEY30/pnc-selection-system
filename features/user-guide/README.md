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

## Not verified (to be updated when done)

Nothing is verified in a browser yet.
