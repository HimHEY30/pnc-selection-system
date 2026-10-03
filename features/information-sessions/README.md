# Information sessions (Step 3 of campaign setup)

> Status: **plan agreed, build in progress.** This file is rewritten at the end of the build with what was actually
> built, how to run and test it, and what was and was not verified.

## Request

Admins and managers create information sessions for a campaign and assign each one to an officer or to themselves.
A session is hosted by an officer, an alumnus or a partner (an NGO, a high school, ...). Admins, managers and officers
can record how many candidates are **expected** to join and, afterwards, how many **actually** joined, as a number of
females and a number of males.

## Decisions (the recommended defaults, accepted by the requester)

| Topic | Decision |
|---|---|
| Module | New `Sessions` module (schema `sessions`), beside Identity, Campaigns and Eligibility. It reads its campaign through `ICampaignSetupGateway` and reports Step 3's status through it. |
| Assignee | The staff member responsible: an officer, a manager or an admin. Anyone creating a session can pick themselves ("Me" is the default). |
| Host | One of three types. **Officer**: a staff member (often the assignee, one click to copy). **Alumnus** and **Partner**: people and organisations who are not system users, kept as records in a reusable host directory (partner kinds: NGO, high school, university, other). |
| Officer list | Users are only in Keycloak. The backend reads the staff list (roles `selection-officer`, `selection-manager`, `system-admin`) from Keycloak's admin API through one interface, `IStaffDirectory`. Picking yourself needs no directory call. |
| Who can do what | Admin, manager: create, edit, cancel sessions and manage the host directory. Admin, manager, **officer**: read everything, record the **expected** number and the **actual** attendance. Committee users: nothing. |
| When it is editable | The session's details and cancelling follow the campaign: Draft or Active campaigns can change them, a Closed one is read only. Expected and actual numbers can be entered on any session that is not cancelled, whatever the campaign's status, because sessions happen while a campaign runs. |
| Expected | One whole number, 0 to 5000. Optional. Can be changed until the session is cancelled. |
| Actual | Two whole numbers, **female** and **male** (0 to 5000 each); the total is their sum. Entered together. Allowed once the session's date has arrived (Cambodia time). Recording it marks the session **Done**; it can be corrected later (audited). |
| Status | Planned, Done, Cancelled. Cancelling needs a reason and is final; a Done session cannot be cancelled. |
| Dates | A session has a date and a start and end time (local Cambodia time), end after start. Past dates are allowed, so a session that already took place can be recorded. |
| Format | In person (venue), online (link) or hybrid (both); the matching fields are required. A province is optional and must be one of the campaign's target provinces. |
| Clash | The same host (a person or a record) cannot run two sessions whose times overlap on the same date. |
| Step 3 | Complete when the campaign has at least one session that is not cancelled; In progress when it only has cancelled ones; reported only while the campaign is a draft (the gateway's rule). |
| Audit | Every change (created, updated, cancelled, expected set, attendance recorded) is written to an append-only log: who, when, before and after. There is no history screen. |
| Out of scope | Candidate lists per session (Step 4), recurring sessions, notifications to hosts or assignees, a host portal, reminders. |

## Plan, in reviewable commits

1. Design (this file).
2. `Sessions` module skeleton and its tests project, wired into the Host.
3. Domain: session, host, statuses, validation, attendance rules, with unit tests.
4. Storage: migration (sessions, hosts, audit log, constraints, the hand-written link to campaigns).
5. Staff directory: the Identity contract, the Keycloak admin implementation, the role check.
6. Host directory service and endpoints.
7. Session service (create, edit, cancel, clash, step status, audit) with tests.
8. Expected and actual attendance, with tests.
9. Endpoints, authorization tests against a real PostgreSQL.
10. Web: types, loaders, server actions.
11. Web: the campaign's sessions page (list, filters, form, cancel, attendance).
12. Web: my sessions page, setup overview link, docs.
