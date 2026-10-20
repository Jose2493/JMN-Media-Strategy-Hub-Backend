# Portal cohesion and embedding

JMN owns the workspaces; SuiteDash owns the surrounding navigation and page scroll.
No SuiteDash-specific business rules are added. Shared product tokens live in
`public/portal-language.css`; each workspace retains its own palette and purpose.
Home uses existing status/counts, one Daily Pulse primary action and open attention
rows. Social retains its black canvas, channel header, metrics and publishing UI.

## Page-scoped rollout (not installed in production by this PR)

On a reviewed SuiteDash QA page, load `portal-embed.css` and `portal-embed.js` from
the same immutable Preview as the iframe. Opt in only the intended child:

```html
<iframe data-jmn-workspace="strategy" title="JMN Strategy Session"
  src="https://REVIEWED-PREVIEW/strategist.html" scrolling="no"></iframe>
```

Supported markers are `cockpit`, `strategy`, `social`, `design`. Keep the existing
per-client authentication wiring; never place a shared bootstrap in this example
or copy it between tenants. The helper reads the iframe's exact origin and checks
both message origin and source window, workspace channel and bounded integer
height. Messages carry only layout metadata. Wrong-channel frames cannot resize
one another. Existing `jmn-client-cockpit` helper remains backward compatible;
use one parent helper per frame, not both.

The child reports natural content height after root/body resize, initial render,
fonts, viewport changes and parent measurement requests. It can grow and shrink
without a document-scrollHeight feedback loop. Long conversations are document
flow in normal Strategy Session; composer remains after the readable thread.
Sidebar navigation uses its existing modal drawer on mobile. The same-origin
Strategist modal opened from Social (`embedded=1`) retains its bounded layout and
existing session initialization contract. Modal dialogs and navigation drawers may
scroll internally; normal workspace content does not have its own scroll pane.

A child alone cannot remove SuiteDash's fixed/aspect-ratio iframe wrapper. The
parent helper normalizes only its opted-in wrapper and gutter selectors. A future
custom shell can consume the same layout messages without importing app logic.
Live rollout must verify late helper installation, growth/shrink, drawer closure,
mobile keyboard, long messages and composer reachability. No global iframe rules,
project protection changes or production page edits are required by this code.

## Scope boundaries

No API, session, RLS, business persistence, publishing behavior or tier enforcement
changes. Entitlements are a separate internal design document and example JSON.
Design Studio positioning remains inside the authorized editor response, never in
the unauthenticated template shell. Onboarding terms, completion and feedback are
unchanged. Fictional QA surfaces do not authenticate or reach external APIs.

## Fictional Preview QA

Open `/api/qa/portal-cohesion` on the reviewed Preview. This route fails closed in
production, rejects credentials and unknown selectors, and blocks network requests
with CSP. It renders the real workspace markup/styles or existing fixture renderers
without loading production authentication/integration scripts. Its native-wrapper
fixture runs the actual parent helper. Design preview artwork is a placeholder;
authorization/asset/export behavior is covered by the existing isolation suite.

Browser checks cover desktop, wide desktop, 390px and 320px; all four pipeline
states; long conversation growth and shrink; drawer/keyboard/composer reachability;
Company/Project onboarding steps, feedback and completion; and authorized/denied
Design controls. Social fixture saves/publishing intentionally remain disabled.
Existing automated tests exercise actual save-payload behavior through mocks.

The fictional portal is not proof of a live SuiteDash rollout. Install the parent
helper only on an authorized QA page before production rollout, then validate
actual SuiteDash margins and real-device keyboard/tap behavior. No live SuiteDash
page was edited and no new QA identities or protection bypasses were created.
