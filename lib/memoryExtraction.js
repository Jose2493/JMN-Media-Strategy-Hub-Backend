import { createClient } from '@supabase/supabase-js';
import { updateCompanyMemory, insertMemoryFacts } from './memory.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const MEMORY_UPDATE_THRESHOLD = 8;

async function getUnprocessedMessages(conversationId, checkpointMessageId) {
  let sinceTimestamp = null;
  if (checkpointMessageId) {
    const { data: checkpoint } = await supabase
      .from('messages').select('created_at, conversation_id')
      .eq('id', checkpointMessageId).single();
    if (!checkpoint || checkpoint.conversation_id !== conversationId) {
      throw new Error('Checkpoint no pertenece a esta conversación — se ignora');
    }
    sinceTimestamp = checkpoint.created_at;
  }
  let q = supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  if (sinceTimestamp) q = q.gt('created_at', sinceTimestamp);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function maybeUpdateMemory(companyId, conversationId) {
  const { data: conversation } = await supabase
    .from('conversations').select('last_memory_processed_message_id')
    .eq('id', conversationId).eq('company_id', companyId).single();
  if (!conversation) return;

  const unprocessed = await getUnprocessedMessages(conversationId, conversation.last_memory_processed_message_id);
  if (unprocessed.length < MEMORY_UPDATE_THRESHOLD) return;

  const { data: currentMemory } = await supabase
    .from('company_memory').select('*').eq('company_id', companyId).single();

  const extractionPrompt = `You are analyzing a conversation between a client and JMN Media's AI Strategist to extract memory updates.

CURRENT COMPANY MEMORY:
${JSON.stringify(currentMemory, null, 2)}

NEW MESSAGES SINCE LAST UPDATE:
${unprocessed.map(m => `[${m.role}] ${m.content}`).join('\n')}

Return ONLY a JSON object (no markdown, no preamble) with this exact shape:
{
  "company_updates": {},
  "project_updates": {},
  "memory_facts": [ { "memory_type": "goal|audience|positioning|content_preference|strategic_decision|priority|campaign_summary|other", "fact": "short factual statement" } ]
}

Only include fields that genuinely changed or are newly learned. If nothing new, return empty objects/arrays.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 800, messages: [{ role: 'user', content: extractionPrompt }] })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Memory extraction API error:', response.status, JSON.stringify(data));
    return;
  }

  let extracted;
  try {
    const rawText = data.content?.[0]?.text?.trim() || '{}';
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    extracted = JSON.parse(cleanText);
  } catch (e) {
    console.error('Memory extraction: could not parse model output', e.message);
    return;
  }
  if (!extracted || typeof extracted !== 'object') return;

  if (extracted.company_updates && Object.keys(extracted.company_updates).length) {
    await updateCompanyMemory(companyId, extracted.company_updates);
  }
  if (extracted.memory_facts?.length) {
    await insertMemoryFacts(companyId, extracted.memory_facts.map(f => ({
      memory_type: f.memory_type || 'other',
      fact: f.fact,
      source_message_id: unprocessed[unprocessed.length - 1].id
    })));
  }

  await supabase.from('conversations')
    .update({ last_memory_processed_message_id: unprocessed[unprocessed.length - 1].id })
    .eq('id', conversationId);
}
