// DISPOSABLE -- companion target for d2-outgoing-request-probe.js.
// Preview-only. Never merge this to main; deploy only from a throwaway branch.

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(200).json({ ok: true });
}
