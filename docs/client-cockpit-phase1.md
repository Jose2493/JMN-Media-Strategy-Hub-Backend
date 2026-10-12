# Home cockpit — Phase 1

Isolated branch based on main 82368a4. Existing client-home.html and portal navigation are unchanged. No migration, writes, new persistence, external intelligence, or publishing calls.

## Routes and data

- `/client-cockpit.html#token=<existing bootstrap>` uses the existing `/api/session-exchange`. The fragment is removed immediately, credentials remain in memory only, and all displayed context is cleared at session expiry/page exit.
- `GET /api/client-cockpit` uses the existing verified Social Session company identity, never a supplied company ID. It returns exact, company-scoped counts from `social_approved_assets` and `social_publish_jobs`; company `business_name`; Instagram status through `listInstagramAccountsForCompany`; and the editor's existing active-template/access-grant checks.
- Partial failures return null, displayed as unavailable rather than zero. No private media URLs, provider tokens, or database errors are returned.
- Design Studio appears only for the active `semper-athlete-shirt-01` template with an explicit company grant, matching the existing editor. Its button transfers the bootstrap via the existing same-origin fragment flow; the editor independently exchanges it and verifies access again. Bootstrap is retained only in memory for this navigation, until session expiry/page exit. No new auth contract.
- Strategy and Social links use the existing SuiteDash routes 173775 and 174976 so those pages continue to bootstrap normally.
- Pipeline opens Social Center, where the user selects the corresponding existing filter. No query-filter passthrough is assumed across the SuiteDash wrapper. Counts cover all time; assets and publishing jobs are different units and may overlap.
- Daily Pulse is deterministic, using review/draft/approved/scheduled state in priority order. It is not live news or generated intelligence. “Turn into action” opens the relevant existing workflow; it creates nothing automatically.
- No strategy recommendation alerts are invented. Phase 1 attention covers review items, drafts, and connection issues. Additional recommendation alerts can be added only with an explicit actionable-state contract.

## Preview acceptance

`/api/qa/client-cockpit` is available only with VERCEL_ENV=preview and not a production target, without credentials/query flags. It uses fictional data and shared rendering code. CSP blocks network connections; clicks report their destination without opening production. Scenarios: populated, empty, partial error, loading, expired session, no design access, and Instagram issue. Width selector provides a 390px container; also verify a real mobile viewport.

Authenticated staging acceptance must use staging credentials and confirm company A/B names/counts/access, expiry, unavailable-state retry, and navigation. The fixture does not prove live authentication or database integration.

## Reversible portal integration (not performed)

Keep the current Home page until acceptance. A future approved integration must provide its existing bootstrap to the new page using the standard fragment pattern. Use a full-width, borderless iframe with id `jmn-client-cockpit`, not a fixed-height inner scrolling panel. Load `client-cockpit-embed.js` in the parent after the iframe. It validates both the iframe origin and window source before resizing. The child sends only height metadata to the two known SuiteDash origins. Verify this in the actual portal before production activation. Do not paste bootstrap values into documentation or commits.

Rollback: retain or restore the original Home iframe URL; all existing pages and contracts remain intact.
