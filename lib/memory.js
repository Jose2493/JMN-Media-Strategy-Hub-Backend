import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function getCompanyMemory(companyId) {
  const { data, error } = await supabase
    .from('company_memory')
    .select('*')
    .eq('company_id', companyId)
    .single();
  if (error) throw error;
  return data;
}

export function formatMemoryForPrompt(memory) {
  if (!memory) return '';
  const parts = [];
  if (memory.goals) parts.push(`Objetivos del negocio: ${memory.goals}`);
  if (memory.target_audience) parts.push(`Audiencia objetivo: ${memory.target_audience}`);
  if (memory.brand_positioning) parts.push(`Posicionamiento de marca: ${memory.brand_positioning}`);
  if (memory.strategic_decisions?.length) {
    parts.push(`Decisiones estratégicas previas: ${memory.strategic_decisions.map(d => d.decision || d).join('; ')}`);
  }
  if (memory.current_priorities?.length) {
    parts.push(`Prioridades actuales: ${memory.current_priorities.join('; ')}`);
  }
  if (!parts.length) return '';
  return `\n\nCONTEXTO DE ESTE CLIENTE (de conversaciones anteriores):\n${parts.join('\n')}`;
}

export async function updateCompanyMemory(companyId, changes) {
  const { data, error } = await supabase
    .from('company_memory')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertMemoryFacts(companyId, facts) {
  if (!facts?.length) return;
  const rows = facts.map(f => ({
    company_id: companyId,
    project_id: f.project_id ?? null,
    memory_type: f.memory_type,
    fact: f.fact,
    source_message_id: f.source_message_id ?? null
  }));
  const { error } = await supabase.from('memory_facts').insert(rows);
  if (error) throw error;
}
