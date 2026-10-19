# Founding Partner onboarding — Phase 1

Private, opt-in beta experience integrated into the existing authenticated Home.
No public trial, checkout, subscription infrastructure, new session contract, or
changes to Social Center/Design Studio endpoints. No production data was seeded.

## Experience

Four steps cover welcome and founding offer; workspace confirmation, curated
context and available areas; state-based Daily Pulse and 2–3 next moves; reasonable
participation expectations and optional rating/note/issue feedback. The primary
first-value action opens an existing portal area. Normal Home is always reachable.
Completion is persisted per contact; subsequent visits show Home with a welcome/
feedback replay control. Skipping does not mark onboarding complete. Feedback is
one replaceable response per contact, not a survey or automatic ticket/email.
The interface confirms saving only after the server acknowledges it.

Semper is a Company Workspace using the existing company's name and industry.
Riany is a Project Workspace tied to an existing project in the signed company.
Its client-facing project label/type and strategy focus are curated enrollment
copy, not arbitrary raw memory. Company-level Instagram/counts are explicitly
labeled in the project flow; no new project-only social isolation is claimed.
Unknown metrics show a dash and missing context prompts a next step. Daily Pulse
uses the existing deterministic cockpit rules; it is not an extra AI call.

Design Studio visibility requires the existing active template/company grant;
its independent server authorization remains unchanged. Media is included only
when staff explicitly confirms availability. No enrollment changes entitlements.

## Persistence and authorization

`20261017050000_founding_partner_onboarding.sql` adds two private beta tables,
with RLS enabled, no anon/authenticated grants, and service-role-only access.
The API verifies the existing JWT and current contact/company membership on
EVERY operation, plus active enrollment and current project ownership. Caller
IDs, status changes, arbitrary fields and query parameters are rejected. Backend
identity always comes from the verified session. Responses are private/no-store.
The browser keeps the existing session in memory and clears the view on expiry.
Feedback is bounded to 500 characters and a 1–5 optional rating. Upserts replace
only the signed contact's response. Completion is idempotent and does not begin
or alter a billing clock.

Staff may review `founding_partner_feedback` through existing trusted database
administration, scoped by company/contact. No client can list another response.

## Review / rollout gate — not executed by this PR

1. Review/apply the migration in staging and verify RLS/grants and constraints.
2. Confirm the existing Semper contact/company and Riany contact/company/project
   IDs. Never enroll by matching a display name or copy bootstrap credentials.
3. Enroll the intended members with the appropriate partner_key/workspace_kind.
   Semper requires no project_id; Riany requires a verified owned project_id.
   Set display_name/category to approved client-facing labels; strategy_focus is
   optional and must be reviewed client-facing copy. media_available defaults false.
4. Use separate staging sessions to verify first visit, reload after completion,
   feedback readback, disabled enrollment, changed contact membership and project
   ownership, and unavailable/missing migration fallback to normal Home.
5. Confirm actual portal permissions for the fixed Strategy/Social links and
   optional Media link. This UI adds no permissions and cannot authorize a page.
6. Production migration/enrollment and start dates need a separate rollout.
   Two months complimentary then $20/month is displayed as the private agreement;
   collection, dates and participation decisions remain manual with JMN.

Until migration + verified enrollment exist, ordinary clients retain Home.
Missing schema/service failure also retains Home; no inferred enrollment or
fallback tenant exists. This avoids silently enabling a public plan.

## QA

### SuiteDash iframe integration

Use the existing page-scoped `client-cockpit-embed.js` helper on the portal page,
with `id="jmn-client-cockpit"` on the actual iframe (not its wrapper). Load the
helper from the same reviewed Preview as the iframe during QA. A SuiteDash native
iframe block may omit that ID; in that case the QA page installer must locate the
single iframe with the exact Preview origin and `/client-cockpit.html` path and
assign the ID before loading the helper. Never match or copy another page's token.
Do not use a fixed height as the final integration. The child already reports its
natural height on step/content changes, resize and responsive reflow; the helper
checks message source/origin and grows or shrinks the iframe. Portal scrolling
then owns the document. Do not install this on live Home during Preview QA.

Onboarding width is scoped to `#cockpit` while its direct child is `.fp`: the shell
fills the available portal width with small outer gutters, while prose and feedback
retain readable limits. Returning to Home restores the existing cockpit layout.

`/api/qa/founding-partner` runs only in Vercel Preview. It uses fictional context
for Semper/Company and Riany/Project labels, plus unauthorized, missing-context,
and save-error scenarios. No credentials, network calls, real feedback or links
are used by that fixture. Preview protection is not disabled.

Automated service/API tests cover membership and project isolation, unauthorized
writes, entitlement display, owner overrides, feedback validation, idempotent
completion, neutral provider errors and production QA-route exclusion. Full
repository tests and browser layout/interaction checks are recorded in the PR.
Actual staging database acceptance remains a rollout gate, not a claimed result
of mock service or browser fixture tests.
