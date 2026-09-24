# Instagram publishing activation

This addition supports single JPEG photos and MP4 Reels, private uploads, saved drafts, scheduled publication, cancellation before processing, and visible failure/uncertain states. Carousels, stories, editing scheduled posts, automatic caption generation, and automatic linking to an action plan are not included yet. Cancel and create a new post to change a scheduled item.

## Activation

1. Merge the migration and verify the `Instagram publishing schema` workflow passes. It uses the existing `SUPABASE_DB_URL` GitHub secret. The additive schema creates a private `social-publishing` bucket; no anonymous storage policy is needed.
2. In Meta, enable `instagram_business_content_publish` for the existing Instagram Login application. Access for external customers may require App Review/Advanced Access. Test users and production customer permissions must be verified separately.
3. In the Vercel production environment, add a randomly generated `CRON_SECRET` (at least 32 random bytes) and `INSTAGRAM_PUBLISHING_ENABLED=true`. Keep these out of chat, source control and client code. Existing Supabase/token-encryption variables remain in use. Redeploy. The cron runs once per minute on a compatible Vercel plan.
4. Verify authenticated cron invocations succeed. Scheduling is disabled until the worker has a heartbeat less than five minutes old; drafts still work. Preview deployments do not execute Vercel cron.
5. From Social Center, select **Enable publishing** and authorize the intended Instagram professional account. Existing analytics-only connections continue working without this scope. The granted scope and token expiry must cover the scheduled time.
6. Use an explicitly approved JPEG or MP4 to run the first live test. Confirm one post is created, then test a scheduled post with the browser closed and verify cancellation of a different pending item. No live posts are created by automated tests.

## Timing and recovery

Dates are entered in the device's displayed IANA time zone, converted to UTC, and stored with that zone. Nonexistent daylight-saving local times are rejected; during a repeated fall-back hour the browser selects the first occurrence and confirmation shows the resolved time. Scheduling supports one minute to 30 days ahead and is subject to token validity.

Each cron claims one job and advances one provider stage. Containers are created when due, not days ahead, so they cannot expire while waiting for their scheduled day. Instagram processing and queue load can delay publication. This is a small-volume initial implementation, not an exact-minute SLA.

The worker uses a 90-second lease and a persisted publication-intent state. It does not automatically resend an ambiguous publish request. `uncertain` requires checking Instagram before creating a replacement post. Database failure after a successful provider call also leaves a recoverable uncertainty state instead of a duplicate send. Revoked/expired tokens fail closed.

Client sessions never receive provider tokens. Each API lookup checks company/account ownership; job tables have RLS and no direct browser grants. Media is immutable once uploaded; Meta receives a short-lived signed read URL. Only the selected object gets an upload URL. Source files are removed on account data deletion; otherwise uploads currently remain private until an administrator removes them. Set an operational retention policy before broad rollout. Daily upload allowance is 100 per company (best-effort, not an atomic billing quota).

## Validation

`npm test` exercises schedules, ownership, permission/expiry checks, provider request shapes, lease fencing, stale intent behavior, processing timeouts, and ambiguous publish outcomes. `supabase/tests/instagram_publishing.sql` checks schema permissions, claiming, and recovery inside a rolled-back transaction. Browser tests use synthetic account data and mocked API responses; they do not verify Meta authorization or production delivery.

Local verification on 2026-09-24: all 135 Node tests passed. The migration and rollback SQL checks passed in PGlite. Chromium at 390×844 and 1280×900 verified the composer, JPEG upload, draft save, schedule confirmation and cancellation with synthetic API responses; no page JavaScript errors or horizontal mobile overflow were observed. Production Meta delivery and SuiteDash iframe/phone-keyboard behavior remain unverified.
