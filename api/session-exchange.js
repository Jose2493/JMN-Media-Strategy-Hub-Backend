import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bootstrapToken } = req.body;
  if (!bootstrapToken) return res.status(400).json({ error: 'Missing bootstrapToken' });

  const tokenHash = crypto.createHash('sha256').update(bootstrapToken).digest('hex');

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('bootstrap_token_hash', tokenHash)
    .single();

  if (error || !contact) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const expiresInSeconds = 30 * 60;
  const sessionToken = jwt.sign(
    { contactId: contact.id, companyId: contact.company_id },
    process.env.SESSION_JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );

  return res.status(200).json({ sessionToken, expiresInSeconds });
}
