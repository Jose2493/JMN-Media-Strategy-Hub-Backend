// DISPOSABLE Preview-only schema compatibility check for D5.
// Read-only: returns booleans only, never row data or secrets. Never merge to main.
import { createClient } from '@supabase/supabase-js';

const CHECKS = [
  ['social_accounts', 'id,external_account_id,platform'],
  ['social_account_metrics', 'id,social_account_id'],
  ['social_media', 'id,social_account_id'],
  ['social_media_metrics', 'id,social_media_id'],
  ['social_sync_runs', 'id,social_account_id'],
];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return res.status(503).json({ ok: false, stage: 'environment' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const checks = {};

  for (const [table, columns] of CHECKS) {
    const { error } = await supabase.from(table).select(columns).limit(1);
    checks[table] = !error;
  }

  const ok = Object.values(checks).every(Boolean);
  return res.status(ok ? 200 : 500).json({ ok, checks });
}
