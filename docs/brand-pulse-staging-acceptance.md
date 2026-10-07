# Brand Pulse staging acceptance — partial

Migration applied: **YES**, to `aladurkcrzyczjtpdpjc` only, through its authenticated Supabase SQL Editor. Executed `20261007010000_company_brand_pulses.sql`; no other migration, schema change, deployment, merge, social publication, or production access.

## Database verification

- PASS: Dashboard identifies JMN Media Partner Staging and the expected project reference.
- PASS: Preflight `to_regclass` returned NULL; zero matching relations and policies.
- PASS: Table exists; service-role REST SELECT returns HTTP 200.
- PASS: Primary key `(company_id, pulse_date)`; company and contact foreign keys.
- PASS: RLS enabled.
- PASS: All seven table privileges denied to both anon and authenticated, verified with `has_table_privilege`.
- PASS: Service role SELECT, INSERT, UPDATE granted and exercised by the real repository.
- PASS: Complete-response constraint and `answered_at >= created_at` constraint exist. Invalid updates were rejected with PostgreSQL 23514.

## Real staging storage / local handler verification

Tests used the actual Brand Pulse handler, session verifier, service and repository against staging Postgres. Sessions were signed with an ephemeral local test secret for the existing QA contacts. These are **not hosted portal login acceptance**. No contact or bootstrap-token records were modified.

| Item | Result |
| --- | --- |
| Same-day reload returns the persisted pulse | PASS at handler/repository level |
| Company B cannot target/read A through browser scope input | PASS; query override rejected |
| Company B cannot answer A-only daily pulse | PASS; 404 before B had its own row; A unchanged |
| Browser company override rejected | PASS; 400 |
| Valid answer persists with authenticated QA contact audit | PASS |
| New service instance preserves answered state | PASS |
| Repeated different valid answer returns first stored answer | PASS |
| Invalid answer ID rejected | PASS; 400 |
| Sparse-context fallback | PASS; controlled sparse input, no model call |
| AI failure fallback | PASS; controlled provider exception, persisted fallback |
| Existing daily payload cannot be replaced | PASS |
| Latest dated answer available from company-scoped Strategist context source | PASS at repository/formatter level; hosted Strategist consumption pending |

Machine-readable details: `brand-pulse-staging-api-results.json`.

## Hosted acceptance still blocked

The application/portal staging URL and working QA portal authentication are not available. The supplied `https://aladurkcrzyczjtpdpjc.supabase.co` is the database API, not a Home URL. Local `qa-a.json` / `qa-b.json` bootstrap hashes matched no contacts in staging, although both QA companies and one contact per company exist.

These items remain **BLOCKED / NOT RUN** and have not passed staging acceptance:

- QA Company A Home loads Brand Pulse under its actual portal session.
- Same-day and answered reload through that hosted Home.
- About Andrés disclosure on the hosted page.
- CTA opens the existing Strategy Session inside the portal.
- Actual Strategist request receives/uses the latest dated answer.
- Hosted desktop and 390px mobile; horizontal overflow and nested scrolling checks.

Prior fictional preview visual QA does not satisfy these hosted checks. No visual or functional code was changed during this acceptance pass.

## Records created

Only two `company_brand_pulses` rows, New York calendar date `2026-10-06`:

- QA Company A: `7811dc6c-ca9b-4883-a435-7a4481e1bbf5`; answer `retention`; actor `028af363-6695-4f7c-9d34-d6fa2fc39f0b`; timestamp recorded in JSON results.
- QA Company B: `ac08c61d-616f-43bf-9095-91aae7afaf46`; unanswered.

No QA company, contact, conversation, permanent memory, or social records were created or changed.

## Checks and disposition

Relevant regression suite rerun: **35 passed, 0 failed, 0 skipped**. No functional code changed, so a new full-suite run was not required. Prior full-suite result: 190 passed, 0 failed, 1 existing environment-dependent skip (191 total). Syntax and diff checks recorded separately at completion.

Only acceptance documentation/results and schema screenshot added. Production `odlgikxtfrtxnqvsicnl`, PR #30 and approved visual design untouched.

**NOT READY TO MERGE** — hosted portal acceptance remains required.
