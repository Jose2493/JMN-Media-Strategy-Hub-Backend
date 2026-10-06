# Client Media Library v1

`/media-library.html` is the permanent history view. Social Center Content remains the latest-30 active review/publishing workflow. Both use `social_approved_assets` and private `jmn-content`; no migration or new storage is required. Only assets registered through JMN Upload appear (legacy SuiteDash files are not imported).

GET `/api/social/media-library` requires the existing session bearer token. Accepted filters: `q` (literal title substring), `filter` (all/photos/reels/approved), `project` (exact campaign label), `page` (zero-based). Filters combine server-side with mandatory session-company equality. Pages contain 24 assets, deterministic created_at/id ordering, and hasMore. Only posters are signed on listing; review/download/publishing use the existing ownership-checked commands. Concurrent new uploads can shift offset pages; refresh/search starts at page 1.

The library reuses protected review/approval, original download and the existing composer. Posting is offered only for approved assets with an active Instagram account, selectable when multiple accounts exist. Opening the composer creates no draft; existing Save draft behavior is preserved. Missing Instagram status does not prevent browsing or downloading. Session expiry closes dialogs and hides the application.

## Staging portal integration (required before release)

Create/update the staging Media & Deliverables custom page to embed `/media-library.html` on the staging deployment using the SAME bootstrap-fragment mechanism as Social Center. The bootstrap must belong to the authenticated company. Do not paste an admin/service key. Update the staging navigation entry to this custom page; retain access to legacy SuiteDash files separately if required. This repository cannot alter SuiteDash navigation. Production portal navigation has NOT been changed.

## Acceptance

Preview-only `/api/qa/media-library` provides fictional populated/empty/error/loading/no-Instagram states, 55 assets for pagination, search, filters and a 390px layout control. Network access and mutations are blocked by CSP and fixture callbacks. Production returns 404.

Before merge, use two staging companies and real private staging assets: verify tenant A never lists/previews/downloads/posts tenant B media, including forged IDs; search old assets beyond the latest 30; campaign/type/status filtering; original byte fidelity after approval; account selection; Post this → edit caption → Save draft; session expiry while loading/in dialogs. Do not publish. Check native desktop/mobile layout and keyboard/dialog focus. No production data, storage, auth settings or publishing behavior is changed.
