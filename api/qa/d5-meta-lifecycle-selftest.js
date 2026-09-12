// DISPOSABLE Preview-only D5 self-test. Never merge to main.
import crypto from 'crypto';
import {
  extractMetaSignedRequest,
  verifyMetaSignedRequest,
  createMetaDeletionConfirmation,
  verifyMetaDeletionConfirmation,
} from '../../lib/metaSignedRequest.js';
import { deleteInstagramAccountDataByExternalId } from '../../lib/socialAccountDeletion.js';

const SECRET = 'synthetic-meta-secret-at-least-32-bytes';
const USER_ID = '17841400000000001';

function signPayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(encodedPayload, 'utf8').digest('base64url');
  return `${signature}.${encodedPayload}`;
}

function fakeSupabase({ absent = false } = {}) {
  const trace = [];
  return {
    trace,
    from(table) {
      const state = { table, mode: 'select', filters: [] };
      const builder = {
        select() { state.mode = 'select'; return builder; },
        delete() { state.mode = 'delete'; return builder; },
        eq(column, value) { state.filters.push([column, value]); return builder; },
        in(column, values) {
          trace.push(['delete', table, column, [...values]]);
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          trace.push(['selectOne', table]);
          return Promise.resolve({ data: absent ? null : { id: '33333333-3333-4333-8333-333333333333' }, error: null });
        },
        then(resolve, reject) {
          let result;
          if (state.mode === 'select' && table === 'social_media') {
            trace.push(['selectMany', table]);
            result = { data: [{ id: 'media-1' }, { id: 'media-2' }], error: null };
          } else {
            trace.push(['delete', table]);
            result = { data: null, error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const checks = {
    signedRequestVerified: false,
    formExtractionSafe: false,
    tamperBlocked: false,
    confirmationOpaqueAndValid: false,
    deletionOrderSafe: false,
    deletionIdempotent: false,
  };

  try {
    const signed = signPayload({ algorithm: 'HMAC-SHA256', user_id: USER_ID, issued_at: 1800000000 });
    const verified = verifyMetaSignedRequest(signed, SECRET);
    checks.signedRequestVerified = verified.userId === USER_ID;
    checks.formExtractionSafe = extractMetaSignedRequest(`signed_request=${encodeURIComponent(signed)}`) === signed;

    try {
      verifyMetaSignedRequest(`${signed.slice(0, -1)}${signed.endsWith('A') ? 'B' : 'A'}`, SECRET);
    } catch {
      checks.tamperBlocked = true;
    }

    const confirmation = createMetaDeletionConfirmation({ userId: USER_ID, appSecret: SECRET, nowMs: 1_800_000_000_000 });
    checks.confirmationOpaqueAndValid =
      !confirmation.includes(USER_ID) &&
      verifyMetaDeletionConfirmation(confirmation, SECRET, { nowMs: 1_800_000_100_000 }) === true;

    const fake = fakeSupabase();
    const deleted = await deleteInstagramAccountDataByExternalId(USER_ID, { supabase: fake });
    const deleteTables = fake.trace.filter((entry) => entry[0] === 'delete').map((entry) => entry[1]);
    checks.deletionOrderSafe =
      deleted.deleted === true &&
      deleteTables.join(',') === 'social_media_metrics,social_account_metrics,social_sync_runs,social_media,social_accounts';

    const absent = fakeSupabase({ absent: true });
    const absentResult = await deleteInstagramAccountDataByExternalId(USER_ID, { supabase: absent });
    checks.deletionIdempotent = absentResult.alreadyAbsent === true && absent.trace.length === 1;

    const ok = Object.values(checks).every(Boolean);
    return res.status(ok ? 200 : 500).json({ ok, checks });
  } catch {
    return res.status(500).json({ ok: false, checks });
  }
}
