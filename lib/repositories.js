import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function createConversation(companyId, contactId, projectId = null, channel = 'portal_ai_strategist') {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ company_id: companyId, contact_id: contactId, project_id: projectId, channel })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getConversation(companyId, conversationId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .single();
  if (error || !data) throw new Error('Conversation not found for this company');
  return data;
}

export async function addMessage(companyId, contactId, conversationId, role, content, projectId = null) {
  await getConversation(companyId, conversationId);

  const { data, error } = await supabase
    .from('messages')
    .insert({ company_id: companyId, contact_id: contactId, conversation_id: conversationId, project_id: projectId, role, content })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
  return data;
}
