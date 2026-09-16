import { verifySocialSessionAuthorizationHeader } from '../lib/socialSession.js';
import { strategistStore, UUID } from '../lib/strategistStore.js';
import { formatCampaignContext } from '../lib/strategistContext.js';
import { getCompanyMemory, formatMemoryForPrompt } from '../lib/memory.js';
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

export function createChatHandler({
  verify = verifySocialSessionAuthorizationHeader, rateLimit = checkRateLimit,
  findConversation = getConversation, newConversation = createConversation,
  saveMessage = addMessage, getMetadata = (...args) => strategistStore.metadata(...args),
  getMemory = getCompanyMemory, formatMemory = formatMemoryForPrompt,
  updateMemory = maybeUpdateMemory, db = supabase, providerFetch = globalThis.fetch,
} = {}) {
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  let contactId, companyId;
  try {
    const decoded = verify(authHeader);
    contactId = decoded.contactId;
    companyId = decoded.companyId;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { message, conversationId: incomingConversationId, greeting } = req.body || {};
  if ((message !== undefined && (typeof message !== 'string' || message.length > 6000)) || (greeting !== undefined && typeof greeting !== 'boolean') || (!message?.trim() && !greeting) || (incomingConversationId !== undefined && incomingConversationId !== null && (typeof incomingConversationId !== 'string' || !UUID.test(incomingConversationId)))) return res.status(400).json({ error: 'Invalid message or conversation' });

  const withinLimit = await rateLimit(contactId);
  if (!withinLimit) {
    console.warn(`Rate limit exceeded for contact ${contactId}`);
    return res.status(429).json({
      reply: "You're sending messages a bit too fast for me to keep up — give it a moment and try again shortly.",
      rateLimited: true
    });
  }


  try {
    let conversationId = incomingConversationId;
    if (conversationId) {
      const existing = await findConversation(companyId, conversationId);
      if (existing.channel !== 'portal_ai_strategist') return res.status(404).json({error:'Conversation unavailable'});
    } else {
      const conv = await newConversation(companyId, contactId);
      conversationId = conv.id;
    }

    const metadata = await getMetadata(companyId, conversationId);
    const campaignContext = formatCampaignContext(metadata);
    const memory = await getMemory(companyId);
    const memoryContext = formatMemory(memory);

    const systemPrompt = `You are JMN Media's AI Strategist, working with Jose and his team. Never impersonate Jose or claim to be human. You're a strategic director, not a salesperson.

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
${memoryContext}
${campaignContext}`;

    const { data: recentMessages, error: historyError } = await db
      .from('messages').select('role, content')
      .eq('conversation_id', conversationId).eq('company_id', companyId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(40);
    if (historyError) throw new Error('History unavailable');

    const humanTurn = greeting
      ? 'The client just opened a new session and has not said anything yet. Write only the warm opening message itself, 2-3 sentences, no preamble, no meta-commentary. If you have memory of this company above, reference something specific and relevant to pick up where things left off, in your own natural voice. If there is no memory yet, introduce yourself briefly as JMN Media’s AI Strategist and invite them to share what they are noticing about their brand.'
      : message;

    const response = await providerFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 700,
        system: systemPrompt,
        messages: [...(recentMessages || []).reverse().filter(m => ['user', 'assistant'].includes(m.role)).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: humanTurn }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Strategist provider unavailable:', response.status);
      return res.status(500).json({ error: 'Strategist is temporarily unavailable. Please try again.' });
    }
    const reply = data.content?.filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
    if (!reply) throw new Error('Empty provider response');

    if (!greeting) {
      await saveMessage(companyId, contactId, conversationId, 'user', message);
    }
    await saveMessage(companyId, contactId, conversationId, 'assistant', reply);

    try {
      // Campaign decisions remain in their thread rather than contaminating global company memory.
      if (!metadata?.campaign_id && !metadata?.social_context) await updateMemory(companyId, conversationId);
    } catch (memErr) {
      console.error('Memory update failed (non-fatal)');
    }

    return res.status(200).json({ reply, conversationId });
  } catch (error) {
    console.error('Strategist request failed');
    return res.status(500).json({ error: 'Failed to process message. Please try again.' });
  }
}

}
export default createChatHandler();
