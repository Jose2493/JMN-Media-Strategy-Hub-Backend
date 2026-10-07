# Brand Pulse by Andrés

Implemented on `codex/brand-pulse-andres`, stacked on local UX tip `e98c26a`. PR #30 and the original checkout are untouched. No push, deployment, merge, environment change, production database access, or migration application was performed.

## Daily state

The unapplied migration `20261007010000_company_brand_pulses.sql` creates only `company_brand_pulses`: company/date composite primary key; JSON payload; DB creation timestamp; nullable answer identifier, timestamp and authenticated contact. It adds company/contact foreign keys, complete-answer and timestamp checks, RLS, and revokes direct public/anon/authenticated access. Only service_role SELECT/INSERT/UPDATE is granted; no client policies are created.

Application validation requires an exact bounded JSON shape, an allowlisted business topic, one question, 3–4 distinct option IDs, bounded single-line copy and a payload no larger than 8 KiB in UTF-8. The UI displays insight copy in at most two lines. Answers are option IDs only; no client free text or contact details are collected.

The day boundary is explicitly `America/New_York`, including daylight saving transitions. First-load generation is lazy. A conflict-ignore insert and reread return the first persisted payload without replacing it. A conditional update with `answer_id IS NULL` atomically accepts the first answer; all writers reread the saved result. Existing pulses and provider-failure fallbacks are reused, not regenerated. Process-local single-flight avoids duplicated generation in one instance. Concurrent cold loads on different server instances can each incur a model call, but only one payload is persisted and shown; there is no distributed generation lease in this MVP.

## API

- `GET /api/brand-pulse`: authenticated current-day pulse; generates only if absent.
- `POST /api/brand-pulse`: exactly `{pulseDate, answerId}`. Reads the persisted company/date payload and validates the selected option. Never generates on answer requests. An old unanswered pulse returns 409 and asks for a reload; a previously answered pulse can be safely retried.
- Both return `{pulse: {pulse_date, payload, created_at, answer_id, answered_at}}` with no-store headers. The API omits company and actor identifiers.
- Company and actor are derived exclusively from the existing signed session verifier. Query parameters and extra body fields, including identity overrides, are rejected.
- Missing storage returns an honest 503 without a model call. Provider/JSON failure persists curated fallback copy rather than breaking Home. No secrets/provider diagnostic bodies are returned.

## Personalization and generation

Reads the existing `company_memory` goals, target audience, positioning, current priorities and strategic decisions; only bounded allowlisted business fields are sent. Reads up to three recent answered company pulses and includes their dates, question and selected label. Sparse context uses a useful onboarding question without a provider call.

Uses the existing Anthropic provider/model pattern server-side, with a 10-second timeout, compact JSON and 600 output tokens maximum. No new model SDK or browser model call. No writes to `company_memory`, `memory_facts` or project memory.

## Home and Strategy Session

Compact dark/purple module between the welcome and Next Move; exactly one question, accessible choice buttons, selected feedback and clear AI disclosure. After answering, only the selected choice remains visible. About Andrés explicitly explains that he is not human. No fixed-height/scroll container was introduced.

The CTA remains the existing top-level portal Strategy Session route `/portal/dashboard/view/173775`. It carries no token or answer in its URL. The existing `api/chat.js` loads the latest answered company pulse as dated untrusted reference data on the next Strategist turn, including its opening greeting. It asks Strategist to confirm current relevance and avoids treating it as a permanent fact or campaign decision. Pulse-storage failure does not break existing chat. Answers are not automatically promoted to long-term memory.

Home now supports the existing `#token=<bootstrap>` session exchange, scrubs the hash immediately and renews the short-lived session in memory. It also accepts a signed session supplied in the existing trusted SuiteDash `jmn:portal-init` version-1 message, from the exact parent window and `https://portal.jmnmedia.com` origin. The signed token is still verified server-side. A parent-injected session expires honestly and requires reopening; bootstrap sessions renew through the existing exchange.

**Portal acceptance dependency:** the inspected Home previously received presentation data only. The portal Home iframe must be configured to receive its authenticated bootstrap URL, or its trusted initializer must include `sessionToken`. No live SuiteDash configuration was changed. The display/height handshake and native navigation remain unchanged. Standalone Home without session shows an honest unavailable state.

## QA and staging acceptance

Automated tests cover tenant isolation and repository filters, same-day/reload stability, concurrent insert/answer behavior, first-answer wins, provenance/time, invalid IDs and scope injection, sparse/provider fallback, storage failure, New York/DST dates, UI states and trusted initialization, and actual Strategist prompt integration. In-memory adapters exercise repository query semantics; they do not prove Postgres privileges or constraints.

The full local suite passes. One pre-existing real-media proxy test skips because it requires a Linux DejaVu font path unavailable on this Windows host. Syntax and whitespace checks pass. Local browser QA uses `scripts/brand-pulse-preview.mjs`, a loopback-only fictional preview with in-memory state and no database/provider calls. It verifies desktop and 390px mobile, answer/reload, disclosure, and the existing CTA href. No live portal navigation or production session was exercised.

Before deployment, staging migration and acceptance are required, with separate authorization: verify SQL application, RLS/service grants, foreign keys and answer checks; simultaneous GET/POST through real Postgres; persistence across server restarts; Company A/B sessions; authenticated Home iframe wiring/height updates; actual portal CTA opening Strategist with the dated answer. The migration remains unapplied.

Code is ready for review; staging/live acceptance is pending.

## Changed files

- `supabase/migrations/20261007010000_company_brand_pulses.sql`
- `api/brand-pulse.js`, `api/chat.js`
- `lib/brandPulse.js`, `lib/brandPulse.test.js`, `lib/strategistChat.test.js`
- `public/brand-pulse.js`, `public/client-home.html`, `public/client-home.css`
- `tests/brand-pulse-ui.test.js`
- `scripts/brand-pulse-preview.mjs`
- `docs/brand-pulse-andres.md`, `docs/brand-pulse-schema-checkpoint.md`
- `docs/brand-pulse-qa/desktop.png`, `docs/brand-pulse-qa/mobile-390.png`

Initial implementation full-suite result: 191 tests, 190 passed, zero failed, one existing media-proxy skip. Initial browser mobile width: 390px; document scroll width: 375px (vertical scrollbar excluded), zero nested scroll containers. The initial answered card was approximately 524px tall on mobile after collapsing unselected options. Desktop had no horizontal overflow. Initial screenshots use fictional data only. See the visual polish results below for the current layout.

## Visual hierarchy polish

Visual/content-only changes in `public/client-home.html`, `public/client-home.css` and the render copy in `public/brand-pulse.js`. Existing UI test expectations were updated. No changes to persistence, API, schema, authentication, company scope, generation or Strategist integration.

Removed the welcome explanation, visible insight paragraph (including fallback “Choose one business outcome to guide your next content or campaign.”), successful-load “One question for your company today.”, “Answer saved for your company.”, visible date/time, and workspace subtitle “Move from idea to delivery.” Insight/date remain in the existing payload and DOM; they are simply hidden in this layout.

Post-answer presentation now reads “Good signal. [Selected option] should shape what we create next.” The stored/model-generated feedback is untouched. The answered CTA is “Continue with Andrés →”; unanswered remains “Build this with Andrés →”. About copy is shortened to “Andrés is JMN Media’s AI Strategic Partner, not a human. Shared business context helps personalize future pulses and Strategy Sessions.”

Next Move replaces “Give your next campaign a clear direction.”, “Bring a goal or an idea. Turn it into a plan you can come back to.” and “Open Strategy Session” with the slim complementary strip “Keep your content moving.” / “Review content →”, using the existing Social Center portal route. All workspace routes/actions and the Brand Pulse Strategy Session route remain unchanged. No new dynamic next-action logic was added.

Brand Pulse uses a restrained flat purple surface and a subtle outline, with no gradient or shadow. More space separates its headline, question and primary CTA. The secondary strip has no filled card or primary button. Workspace starts after a larger gap. Mobile options use two compact equal-width columns with 44px touch targets; the selected option stays compact after answering.

Current browser QA: desktop approximately 1280px and mobile 390×844px; unanswered pulse approximately 383px tall and answered approximately 383px on mobile, with the primary CTA visible in the top screen segment. Answer and reload preserve the same selected option, concise feedback and existing Strategy Session href. About disclosure opens/closes without overflow. Mobile document scroll width is 375px including reserved scrollbar space; zero horizontal overflow or nested scroll containers. Screenshots: `brand-pulse-qa/polished-desktop.png`, `polished-mobile-390.png`, and `polished-mobile-390-answered.png` (all fictional data).

Relevant regression tests: 35 passed, zero failures/skips, covering pulse persistence/API, Strategist integration, Home UI and portal framing. Changed JavaScript syntax checks and `git diff --check` pass. No staging/production access, migration application, merge or deployment.

## Editorial redesign (current presentation)

This subsequent pass changes only Home markup/styles and the existing style-test expectation. `public/brand-pulse.js` and all backend, persistence, schema, session, generation and answer code remain unchanged from the previous pass. All link destinations are preserved.

The panel background, border and corner treatment are removed. Brand Pulse is an open composition with a much larger, balanced headline, a quiet question, compact wrapping pills and a text-and-arrow CTA. Feedback is styled as editorial copy. A single purple four-point mark supplies the visual accent; it is a decorative CSS shape, not screen-reader text. The welcome is smaller and quieter. Workspace cards retain their routes/actions and are separated from the top composition by negative space.

Removed visible chrome: welcome decoration, the separate AI subtitle row, the text “About Andrés” (replaced with an accessible information icon), the filled primary-button treatment, panel frame/background, and “YOUR NEXT MOVE”. The exact AI disclosure remains available in the native About Andrés details control; it identifies Andrés as AI and explicitly not a human. It works without a new handler or route. The complementary content-review strip remains quiet and uses its existing route.

Browser QA uses fictional local state only. Desktop (~1280px): inspected unanswered and answered; stronger two-line headline, wrapping pills, concise feedback and unchanged CTA href. Mobile (390×844px): inspected unanswered (~371px pulse height) and answered after reload (~354px), clean headline wraps, 44px option touch targets, visible directional CTA, zero horizontal overflow or nested scroll. About icon opens/closes and retains the complete disclosure with no overflow. Stored choice, locked answered state, feedback and CTA survive reload.

Relevant regression suite: 35 passed, zero failed/skipped. JavaScript syntax checks and `git diff --check` pass. Evidence: `brand-pulse-qa/editorial-desktop-unanswered.png`, `editorial-desktop-answered.png`, `editorial-mobile-unanswered.png`, `editorial-mobile-answered.png`. No live portal navigation, staging/production access, migration application, merge or deployment was performed. Ready for visual/code review; prior staging acceptance requirements remain.

## Final Home consistency polish

Presentation-only changes to `public/client-home.html`, `public/client-home.css`, and the name formatting in `public/client-home.js`; an existing display test also verifies first-name rendering. Brand Pulse markup/style direction, JavaScript, generation/answer logic, API, persistence, schema, sessions, company scoping and Strategist integration remain unchanged. All destinations and configured-link behavior are preserved.

Welcome now displays the first token of the existing display name: “Welcome back, Alex.” for “Alex Rivera”; missing names retain “Welcome back.” It uses smaller, quieter type. The next-action strip remains the same short sentence and content-review route. The Brand Pulse accent is unchanged.

Workspace copy: “Plan your next campaign.”, “Review and prepare content.”, “Work in progress.”, “Your files and finished work.”, and “Create from your templates.” The long menu instructions are reduced to “Via portal menu” only for unconfigured Projects/Media cards; the existing helper hides when a configured link is available. This retains honest navigation guidance without inventing clickable destinations. Cards use almost invisible borders, softer surfaces, unboxed purple icons, and consistent muted text. Hover and keyboard focus remain clear; keyboard focus was verified in-browser.

Support copy is reduced to “Feedback gives us direction. Review shared work or message your JMN team.” and “Everything stays organized and ready when you need it.” No paragraphs or extra containers were added. The footer divider and labels are quieter, with compact mobile spacing.

QA: desktop and 390px mobile, unanswered and answered, including response/reload and unchanged CTA. Workspace stacks cleanly and the lower sections remain short. A fresh mobile viewport measurement confirms document client width equals scroll width (375px content area within a 390px viewport with a reserved scrollbar), zero horizontal overflow and zero nested scrolling. Relevant suite: 35 passed, zero failed/skipped; JavaScript syntax and whitespace checks pass. First-name formatting, missing identity defaults, conditional Design Studio, safe configured routes and session behavior remain covered by existing tests.

Final fictional screenshots: `brand-pulse-qa/final-home-desktop-unanswered.png`, `final-home-desktop-answered.png`, `final-home-mobile-unanswered.png`, `final-home-mobile-answered.png`, and `final-home-mobile-footer.png`. No merge, deployment, staging/production access or migration application. READY FOR REVIEW.
