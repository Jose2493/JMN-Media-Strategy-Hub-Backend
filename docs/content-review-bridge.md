# JMN content review → approved publishing (Phase 1)

This feature is stacked on PR #28, which remains unmerged. It adds one small content
registry, not a DAM. No live migration is applied by the PR/deployment. Existing
session/bootstrap endpoints and Instagram publishing endpoints are unchanged.

## Before enabling real client content

1. Review and apply `supabase/migrations/20260928030000_social_approved_assets.sql`
   in a staging database first, then through your normal production migration process.
   This is the first/unapplied content migration; the interrupted approved-only draft
   was never deployed. Do not apply over a manually-created table of the same name.
2. Confirm `jmn-content` is private and storage plan limits permit your master files.
   The bucket limit is 500 MiB; provider/project limits may be smaller. Do not increase
   the existing `social-publishing` bucket limit.
3. Use a trusted JMN workstation with Node, existing npm dependencies, FFmpeg with
   libx264/drawtext, ffprobe and a TrueType font. No credentials are exposed to clients.
4. Test using a fictional company, including approval, signed original download and
   storage-to-storage copy. The automated suite mocks the hosted DB/storage and also
   exercises real local FFmpeg generation; it does not apply migrations to Supabase.

## Smallest admin upload mechanism

No new admin website or public upload endpoint is introduced. Only trusted staff with
existing Supabase service credentials can run the CLI. It looks up `companies.business_name`
using the configured company ID before uploading and uses that name in the watermark.
The optional `projectLabel` is a display label, not a new project/campaign relationship.

Create a local config (do not commit client IDs, filenames or credentials):

```json
{
  "companyId": "COMPANY_UUID",
  "companyName": "Fictional Studio (local-only generation)",
  "title": "September studio story",
  "file": "/absolute/path/to/master.mov",
  "projectLabel": "September campaign",
  "caption": "Suggested caption",
  "fontFile": "/absolute/path/to/font.ttf"
}
```

Generate locally, without credentials or network writes:

```sh
node scripts/prepare-client-content.mjs /path/to/config.json
```

Register for client review (existing SUPABASE_URL and SUPABASE_SECRET_KEY must be
provided securely in the workstation environment, never config, browser, logs or git):

```sh
node scripts/prepare-client-content.mjs /path/to/config.json --upload
```

The command generates a fresh asset ID and prints only the ID, state and local output
folder. It validates company existence and bucket privacy, generates renditions, uploads
all four objects with `upsert:false`, and inserts metadata last. Partial upload failures
are cleaned up. If registration returns an ambiguous error, files remain private for
operator reconciliation rather than risking deletion of a registered master. Inspect
that exact asset ID before retrying; repeated commands intentionally create new assets.
Generated local folders remain for staff inspection; delete them after verifying upload.
There is no automatic revision replacement or notification/email delivery in Phase 1.

## Metadata and objects

One table `social_approved_assets` records ID, company, title, kind, original filename,
extension, SHA-256, byte count, four object keys, caption, project label, created_at,
status, approved_at and approved_by. States are IN_REVIEW and APPROVED. The service role
alone can access this table; a restrictive storage policy denies browser-role access to
`jmn-content` even if a broad permissive storage policy exists elsewhere.

Private `jmn-content` objects per company/asset:

- `master.<ext>`: exact source bytes, unmodified, no watermark/recompression.
- `review.jpg|mp4`: optimized review rendition with burnt-in watermarks.
- `poster.jpg`: extracted from the protected proxy, also watermarked.
- `social.jpg|mp4`: clean Instagram-compatible rendition, never exposed in review.

Supported masters: JPEG, PNG, MP4 and MOV, up to the smaller of 500 MiB and the
provider/project limit. Files stay in object storage, never ordinary database records.
For photos the source aspect ratio must be 4:5–1.91:1. A clean social rendition is
limited to the existing 8 MiB JPEG / 100 MiB MP4 limits. The CLI fails if those limits
cannot be met; export a suitable social-length source. It never modifies the master.
No automatic frame-rate/duration or every Instagram codec restriction is promised;
existing Instagram validation/provider errors still apply. A source master can be
higher quality than the social rendition and always downloads byte-for-byte unchanged.

## Proxy protection

FFmpeg creates a <=720px-wide H.264/AAC fast-start video (or JPEG) independently from
the master. Three visible bands include JMN MEDIA PREVIEW, the company name, FOR REVIEW
ONLY and part of the asset ID. Video band positions drift subtly over time. Text is
burned into actual proxy pixels with drawtext, using a text file and expansion disabled;
it is not a removable HTML/CSS overlay. Original and clean social files remain untouched.
Long client names wrap. Human staff should check output for readability before delivery.
No claim of copy prevention: signed proxies can be captured/downloaded while valid,
and screen recording or sophisticated editing is possible. Watermarks deter clean reuse
and make the review copy traceable. They are not DRM.

## Client workflow

Content appears inside Social Command Center, including before connecting Instagram.
In Review → Review preview → watch protected media → Approve (with confirmation).
The server checks the session company, records its contact and timestamp, and transitions
only IN_REVIEW → APPROVED. Concurrent/repeated approval retains the initial approval.
Approved → Download original (60-second signed attachment URL), or Post this under the
chosen connected Instagram account → the existing composer with clean media/caption
preselected → edit caption → Save draft, Post now or Schedule as before.

Review and list responses only sign proxy/poster URLs (5 minutes). Opening a review again
refreshes its URLs. Opening an approved composer signs the clean social rendition. These
URLs are bearer capabilities: do not share them. Responses are no-store and no-referrer.
No master URL is returned until the ownership + APPROVED checks pass. Asset IDs, statuses,
URLs, object paths and company IDs supplied by the client cannot override stored data.

## Minimal additive API

New `/api/social/approved-content` uses the existing strict session JWT verifier.
GET lists the authenticated company's content (latest 30). POST accepts only
`command`, `assetId`, `accountId`; commands: review, approve, download, preview, prepare.
Review/approval/download work without an Instagram account. Preview/prepare additionally
validate account ownership and APPROVED state. No client URL or company field is accepted.
Prepare checks MIME/size and the existing daily job limit, server-copies the clean rendition
to `social-publishing/<company>/<account>/<new job ID>.<ext>`, then creates an existing-format
draft. Existing save/schedule APIs, worker, token handling and publication confirmations
remain unchanged. No upload/download round trip is needed in the client browser.
Opening the composer does not create a job. Preparation starts only on Save draft/Post now/
Schedule; a successful preparation is retained during retry of the existing save/schedule.
An interrupted preparation may leave a private draft/orphan; it never schedules/publishes
by itself. Withdrawing an approved asset/revoking already-created jobs is not implemented.

## Preview QA and tests

`/api/qa/social-publishing` retains the existing Preview-only gate and CSP. One fictional
In Review video has actual burnt-in watermark footage embedded as a blob; an approved
Reel and photo demonstrate the existing composer. Approve and Download original display
QA-only feedback and do not mutate or download anything; the Approved tab provides the
separate approved state. No production APIs, storage, tokens or persistence are used.
The browser can play the embedded two-second clip offline. All source data is fictional.

Run `npm test`. FFmpeg integration tests skip only where FFmpeg/font are unavailable;
this workstation runs them. Hosted migration/RLS and actual Supabase storage copy must be
smoke-tested in staging before production rollout. No real publishing was performed.
