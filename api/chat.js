import jwt from 'jsonwebtoken';
import { getCompanyMemory, formatMemoryForPrompt, updateCompanyMemory, insertMemoryFacts } from '../lib/memory.js';
import { createConversation, getConversation, addMessage } from '../lib/repositories.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const MEMORY_UPDATE_THRESHOLD = 8;

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

  const { message, conversationId: incomingConversationId } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  try {
    let conversationId = incomingConversationId;
    if (conversationId) {
      await getConversation(companyId, conversationId); // valida que sea de esta empresa
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
        messages: [...(recentMessages || []).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, JSON.stringify(data));
      return res.status(500).json({ error: 'Anthropic API error', details: data.error?.message });
    }
    const reply = data.content?.[0]?.text || 'Let me think about that...';

    await addMessage(companyId, contactId, conversationId, 'user', message);
    await addMessage(companyId, contactId, conversationId, 'assistant', reply);

    return res.status(200).json({ reply, conversationId });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
}
