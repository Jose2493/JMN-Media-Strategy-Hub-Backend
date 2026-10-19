# Strategist Actions Phase 1

Safe contextual routing is attached to the latest saved assistant recommendation
in Strategy Session. GET /api/strategist-actions accepts only a conversation
selector, verifies current contact/company membership, reads the tenant-owned
conversation and its latest assistant message, then applies bounded keyword rules.
It does not execute model instructions or accept model-supplied URLs. English and
common Spanish topics are supported; this is deterministic routing, not semantic
understanding. Historical threads refresh suggestions on open; new replies refresh
after they are saved. Unknown topics produce no speculative CTA.

Social Center, Strategy Session, Design Studio and Home use fixed existing portal
routes. No supported draft-specific incoming route exists, so draft/review CTAs
open Social Center rather than inventing a new contract. Design requires the
current active template/company grant; the destination independently authorizes
again. Onboarding requires active, incomplete enrollment, current membership and
owned project (where applicable). Opening Home resumes its existing onboarding.

Production requests are available from a contextual CTA and a persistent sidebar
entry. Fields: goal, location, deliverables, timeline, approximate budget, mode.
The recommendation is a disclosed heuristic based on location/goal and urgency,
not a price, service-area promise or booking. The client reviews all fields and can
change the suggested approach before explicitly submitting. No content, campaigns,
contracts, payments or appointments are created by this flow.

Location hints are deliberately bounded: Boston-area city hints may suggest
On-Location; explicit remote intent or clear long-distance travel hints may suggest
Remote. Broad locations such as Massachusetts, unknown locations and incomplete
shoot details remain neutral and require the client to select an approach. These
hints do not determine coverage or distance. Client selections survive another
edit/review cycle; JMN still confirms location, feasibility, scope and pricing.

## Review queue and rollout

The additive migration 20261019040000_production_requests.sql is included but NOT
applied by this PR. It creates a private JMN review queue with RLS enabled and no
anon/authenticated direct grants. The existing server service role writes it.
Client POST creates only pending_review; ownership is always session-derived.
A supplied conversation must belong to the current company. Unique contact/retry
key prevents retry duplicates without overwriting the original submission. There
is no client list/read/update/delete endpoint. Strict field allowlists and bounds
reject ownership, status and URL overrides. Provider details are not returned.

JMN staff reviews pending_review rows through trusted Supabase administration,
ordered by created_at, using linked contact/company records for follow-up. Receipt
means saved to this queue; no email, ticket or external notification is sent. Assign
a staff owner and review cadence before beta activation. This is deliberately not
a new admin console or billing system. Production remains unchanged until a
separately authorized migration and deployment. Without the table, submission
fails neutrally and never claims receipt; routing continues to work.

Staging acceptance must apply ONLY the new migration, verify RLS/role access,
exercise actual request persistence/retries and review queue visibility, and test
both tenant sessions. Production grants/enrollments are not created here.
