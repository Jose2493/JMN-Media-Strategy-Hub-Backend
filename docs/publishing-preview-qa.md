# Temporary publishing visual QA

On the PR's Vercel **Preview deployment**, open `/api/qa/social-publishing` with no query parameters or token. Vercel deployment protection, if enabled, still applies. The normal `/social-command-center.html` remains portal-authenticated.

This separate fixture page reuses the real publishing script and styles. The surrounding account/header is fictional demo markup; it does not exercise live account loading, analytics or strategy integrations. Use the scenario selector to review populated, empty, inactive and missing-permission states. Continue the sample draft to see a media preview, or choose a local JPEG/MP4 in Create post. Local files are only displayed using blob URLs.

Security boundaries:
- Server returns 404 unless `VERCEL_ENV` is exactly `preview`; a production target also fails closed. No hostname, query flag or token can enable it.
- Credentials in Authorization and all query strings are rejected. Fragment contents are discarded, never parsed or exchanged.
- No session, database, Instagram or API client modules are imported.
- Read-only fixture adapter allows only list/fixture-preview reads. Every mutation throws; connect displays a disabled message. No storage is used.
- CSP blocks network connections, forms, frames and workers. Only nonce-bearing scripts execute; media comes from data/blob URLs.
- Responses are non-cacheable and marked noindex.

Review desktop and mobile widths: tabs, empty states, media/caption preview, schedule toggle, scrollable body, visible action footer, keyboard navigation and Escape. Save, upload, schedule and cancel-post attempts must display the QA-only error without changing fixtures.

Remove `api/qa/social-publishing.js`, `lib/publishingPreviewPage.js`, `tests/publishing-preview.test.js` and this document when QA is finished. No production feature flag or configuration rollback is necessary. Never promote a Preview deployment to production to ship this change; use a normal production build so the environment guard remains authoritative.
