# Brand Pulse by Andrés: persistence checkpoint

Historical investigation checkpoint. Option B was subsequently approved and implemented on this branch. See `brand-pulse-andres.md` for the current implementation and acceptance requirements. No migration has been applied.

## Branch and isolation

`codex/brand-pulse-andres` starts at `e98c26a`, the local `codex/portal-ux-navigation-polish` tip. That tip is not an ancestor of the inspected local `origin/main` (`9d69649`). Remote freshness has not been verified. The checkout is a separate local clone; the original checkout and UX worktree were not modified. Nothing was pushed, merged, deployed, or published.

## Inspected integration points

- `public/client-home.html`, `.js`: compact welcome, Next Move, Workspace; presentation-only display hook. CSP currently disallows network connections. Home needs the existing authenticated bootstrap protocol before it can request company data.
- `lib/socialSession.js`: signed HS256 bearer session; validated `companyId` and `contactId`. Server endpoints must derive scope exclusively from these claims.
- `lib/memory.js`: `company_memory` goals, target audience, positioning, current priorities, strategic decisions; `memory_facts` supports company/project scope and source-message provenance.
- `lib/memoryExtraction.js`: extraction after eight unprocessed messages. A single pulse answer cannot rely on this threshold for immediate shared memory.
- `api/chat.js`: Strategist loads company memory on each turn, uses Anthropic server-side, and loads campaign/thread context through `strategistStore`.
- `lib/repositories.js`: company-scoped conversations and messages.
- `lib/strategistStore.js`, `lib/strategistContext.js`: existing conversation creation and structured thread context. Context is explicitly treated as untrusted reference data.
- `public/strategist.js`: existing authenticated embedded initialization accepts a conversation reference and optional draft. The portal Strategy Session destination is `/portal/dashboard/view/173775`.
- `social_action_plans`: durable JSON state exists, but requires an owned Instagram account and tracks social-action workflow. It is unsuitable for company-wide Home pulses, including clients without Instagram.

## Why persistence needs a decision

The repository does not include the original DDL for company memory, facts, conversations, or messages. The inspected accessors do not establish a daily unique key, immutable daily payload, or atomic answer semantics. A read-then-insert sequence could create different pulses under concurrent requests. Appending JSON to priority strings would mix infrastructure state into business memory, race with extraction, and risk exposing machine state in prompts.

Existing memory is appropriate for business knowledge; it should remain the source of personalization. A small daily-state table would supplement it, not create a second business-memory system.

## Minimal proposed schema (design only)

One `company_brand_pulses` table:

- composite primary key `(company_id, pulse_date)`; company foreign key;
- bounded, validated JSON payload containing topic, headline, insight, one question, and three or four choices with feedback;
- `created_at`, nullable `answered_at`, nullable `answered_by` contact foreign key;
- nullable validated answer choice identifier;
- optional conversation foreign key for idempotent Strategy Session continuation.

Use one documented day boundary (UTC for MVP unless company timezone is already available). Enable RLS and service-role-only access, consistent with existing server storage. Every read/write must additionally filter the verified session company. First-load generation should insert on conflict without replacing the winner, then return the persisted row. First answer should use a conditional update where unanswered; retries return saved state. An atomic operation should also record the selected business priority as a provenance-linked fact or durable Strategist user message; avoid independent writes that can leave state and memory inconsistent.

No migration or database operation was performed. Schema necessity is not conclusively established without the existing base schema: a dedicated JSON column with conditional updates, or documented deterministic-ID conversation/message storage with suitable constraints, could avoid a new table. The existing accessor contracts alone do not verify those alternatives. Deterministic IDs still need compatible constraints, immutable payload storage, and safe concurrent answer writes; they must not overwrite unrelated conversation metadata.

## Planned continuation

Reuse company memory as generation input, limiting it to business fields. Use lazy server-side generation, strict bounded JSON validation, a short timeout/token budget, and curated sparse-context/provider-failure fallback. Persist the fallback using the same daily state rules. Fixed answer choices avoid free-text sensitive-data collection in this MVP.

Store the answer with contact/time provenance and supply the persisted pulse/answer to the existing Strategist context. Reuse the authenticated portal navigation handoff with a conversation reference; never place tokens or business answer text in URLs. Confirm the portal wrapper's existing initialization protocol while implementing Home authentication.

Place the compact dark/purple module between the welcome and Next Move, with explicit AI disclosure and an About Andrés affordance. Keep Next Move and Workspace below. Use a single-column mobile layout and accessible answer/status controls.

## Validation status

No feature code exists yet. Tenant isolation, concurrent same-day generation, answer retries/reload, fallback behavior, CTA continuation, desktop and 390px mobile QA, syntax checks, and the full automated suite remain pending. `git diff --check` is the only validation appropriate to this documentation checkpoint.
