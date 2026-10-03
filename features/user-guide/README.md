# User guide for new staff, and protection for unsaved forms

## Request

"A feature for a user guideline: how to use this app when they first log in." Then, after a list of what makes an app
friendly: "yes make it", covering the two items recommended first: **the first-login tour with a Guide page** and
**unsaved-changes protection on forms**.

## Decisions (made on the recommendation, not yet confirmed by PNC)

| Question | Decision | Why |
|---|---|---|
| Where is "tour seen" remembered? | A cookie in the browser (`pnc_guide_seen`, one year) | Users live only in Keycloak and the backend has no user table. The tour is help text, so seeing it once more on a second device costs nothing. A backend table can replace the cookie later without touching the screens. |
| Format | **Changed on request: a spotlight tour.** The screen dims and a highlight glides to the real part of the screen each step is about, with a card beside it (first plan was a plain dialog: "I want it animate to the place of function like google service, not just a pop up guide") | Written here rather than with a tour library: no new dependency, it uses the app's own colours, and keyboard and screen-reader behaviour is ours to control. The cost is positioning code we maintain. |
| Text | Written by me from what the app does, English only, in `lib/messages/en.ts` | PNC staff should check the wording. Khmer is added later through the same file. |

## What will be built

**1. Welcome tour.** On the first visit to the admin area the screen dims and a highlight moves from place to place, a card
beside it saying what each is for. Finishing or skipping sets the cookie and it never opens by itself again.
- Admin and manager: welcome, the campaign switcher (where Create campaign is), Campaigns, Information sessions, the
  profile menu, the Guide.
- Officer: welcome, the campaign switcher (to look, not create), Your sessions (where numbers are entered), the profile
  menu, the Guide.
- The tour only points at the always-present parts of the screen (top bar and sidebar). The longer how-to (create by copying,
  eligibility, hosts, entering numbers) is on the Guide page.

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

- **Tour:** `GuideProvider` (in the admin layout) owns one `GuideTour`. Its parts: the switcher, profile menu and sidebar
  links carry a `data-guide` name; each step in `t.guide.tour` names its target and the side its card prefers; `placeCard`
  and `spotlightBox` (`lib/guide/placement.ts`, pure, unit-tested) decide where the highlight and card go so they stay on
  screen. The highlight is a box over the target whose huge shadow dims the rest, and CSS transitions glide it (and the card)
  between steps. A step whose target is missing or has no size is shown in the middle, nothing highlighted.
  - On a phone the sidebar is an off-screen drawer. For a sidebar step the tour sends a `guide:nav` event that
    `AdminShell` answers by opening the drawer (and closing it for other steps and at the end), and measures the link after
    the drawer's 300 ms slide so the highlight does not chase it.
  - Tab stays inside the card, Escape skips, focus starts on Next and returns where it was. Motion respects the global
    `prefers-reduced-motion` rule in `globals.css`.
  - The admin layout reads the `pnc_guide_seen` cookie on the server, so the tour opens on the first visit with no flash.
    Closing it any way (Got it, Skip the tour, the ×, Escape) sets the cookie from the browser.
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

`cd apps/web && npm test && npx tsc --noEmit && npm run lint` (839 tests): the discard question for every way of
closing, each of the five forms, which steps each role gets, the tour's navigation, the cookie being set only on close,
and reopening from the Guide page. `npx next build` also compiles, with `/admin/guide` as a dynamic route.

## Not verified

- **No browser. The animation itself has never been seen.** jsdom has no layout, so the tests give each target a made-up box
  and check where the highlight is put, not how it looks or moves. Unchecked: the glide and its timing, whether the card
  covers something it should not, the dimming colour, phone width (including the drawer opening and the card's size on a
  small screen), a page that is scrolled, keyboard and screen-reader use, and the tour opening on a real first login.
  The running Docker stack still has the old build.
- **Escape in a real browser.** Chrome may refuse to hold back a second Escape press that follows the first with no click or
  key in between. The tests send the `cancel` event by hand; they do not prove how each browser behaves.
- The server-side parts (the layout reading the cookie, the Guide page) have no unit test; only the build covers them.
- The guide's wording is mine and has not been read by PNC staff.
