import jwt from 'jsonwebtoken';
import { getCompanyMemory, formatMemoryForPrompt, updateCompanyMemory, insertMemoryFacts } from '../lib/memory.js';
import { createConversation, getConversation, addMessage } from '../lib/repositories.js';
import { maybeUpdateMemory } from '../lib/memoryExtraction.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function checkRateLimit(contactId) {
  const now = new Date();
  const hourStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const hourLimit = Number(process.env.RATE_LIMIT_PER_HOUR ?? 40);
  const dayLimit = Number(process.env.RATE_LIMIT_PER_DAY ?? 150);

  const { data: hourOk, error: hourError } = await supabase.rpc('check_and_increment_rate_limit', {
    p_contact_id: contactId, p_window_type: 'hour', p_window_start: hourStart, p_limit: hourLimit
  });
  const { data: dayOk, error: dayError } = await supabase.rpc('check_and_increment_rate_limit', {
    p_contact_id: contactId, p_window_type: 'day', p_window_start: dayStart, p_limit: dayLimit
  });

  if (hourError || dayError) {
    console.error('Rate limit check failed:', hourError?.message, dayError?.message);
    return true; // fail open — un fallo de infraestructura nuestro no debe bloquear a un cliente legítimo
  }

  return hourOk && dayOk;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const sessionToken = authHeader.replace('Bearer ', '');
  let contactId, companyId;
  try {
    const decoded = jwt.verify(sessionToken, process.env.SESSION_JWT_SECRET);
    contactId = decoded.contactId;
    companyId = decoded.companyId;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const withinLimit = await checkRateLimit(contactId);
  if (!withinLimit) {
    console.warn(`Rate limit exceeded for contact ${contactId}`);
    return res.status(429).json({
      reply: "You're sending messages a bit too fast for me to keep up — give it a moment and try again shortly.",
      rateLimited: true
    });
  }

  const { message, conversationId: incomingConversationId, greeting } = req.body;
  if (!message && !greeting) return res.status(400).json({ error: 'Missing message' });

  try {
    let conversationId = incomingConversationId;
    if (conversationId) {
      await getConversation(companyId, conversationId);
    } else {
      const conv = await createConversation(companyId, contactId);
      conversationId = conv.id;
    }

    const memory = await getCompanyMemory(companyId);
    const memoryContext = formatMemoryForPrompt(memory);

    const systemPrompt = `You are Jose, founder of JMN Media. You're a strategic director, not a salesperson.

CORE PHILOSOPHY:
- Perception influences trust. Trust influences decisions. Decisions influence growth.
- You help serious brands strengthen how they're perceived through intentional strategy and high-quality media.
- You DON'T sell videos. You sell clarity and direction.
- You're direct, honest, and strategic.

LANGUAGE: Default to English. Only switch to Spanish if the client writes to you in Spanish first, and only for that conversation. The opening greeting, when there is no prior client message to go by, is always in English.

FORMATTING RULES: Never use markdown, no asterisks, no bullet symbols. Plain conversational sentences.

APPROVED PACKAGES (exact names and prices, do not alter):
- Intro Reel Experience — $350 one-time — one strategic 20-45 sec video
- Essential Partnership — $950/month — 3 reels + 6 photos, 1 session/month
- Growth Partnership — $1,500/month — 6 reels + 12 photos, one half-day session
- Signature Partnership — $2,400/month — 8 reels + 20 photos, expanded sessions

PRICING FLOW: diagnose first, recommend one option with reasoning, then offer to compare the rest. Never dump the full list unprompted.
${memoryContext}`;

    const { data: recentMessages } = await supabase
      .from('messages').select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    const humanTurn = greeting
      ? 'The client just opened a new session and has not said anything yet. Write only the warm opening message itself, 2-3 sentences, no preamble, no meta-commentary. If you have memory of this company above, reference something specific and relevant to pick up where things left off, in your own natural voice. If there is no memory yet, introduce yourself briefly as Jose from JMN Media and invite them to share what they are noticing about their brand.'
      : message;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 300,
        system: systemPrompt,
        messages: [...(recentMessages || []).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: humanTurn }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, JSON.stringify(data));
      return res.status(500).json({ error: 'Anthropic API error', details: data.error?.message });
    }
    const reply = data.content?.[0]?.text || 'Let me think about that...';

    if (!greeting) {
      await addMessage(companyId, contactId, conversationId, 'user', message);
    }
    await addMessage(companyId, contactId, conversationId, 'assistant', reply);

    try {
      await maybeUpdateMemory(companyId, conversationId);
    } catch (memErr) {
      console.error('Memory update failed (non-fatal):', memErr.message);
    }

    return res.status(200).json({ reply, conversationId });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
}
