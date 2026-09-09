import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Devuelve el template únicamente cuando la compañía autenticada
// tiene acceso explícito y el template está activo.
export async function getAuthorizedTemplate(companyId, slug) {
  if (!companyId || !slug) return null;

  const {
    data: template,
    error: templateError
  } = await supabase
    .from('design_templates')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (templateError || !template) {
    return null;
  }

  const {
    data: access,
    error: accessError
  } = await supabase
    .from('design_template_access')
    .select('id')
    .eq('company_id', companyId)
    .eq('design_template_id', template.id)
    .maybeSingle();

  if (accessError || !access) {
    return null;
  }

  return template;
}
