import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Devuelve el template SOLO si la company autenticada (companyId, tomado del
// JWT ya verificado por el caller -- NUNCA de algo que mande el navegador)
// tiene una fila de acceso concedida en design_template_access para ese
// template, y el template está activo.
//
// Deliberadamente NO distingue "el slug no existe" de "existe pero no tenés
// acceso" -- ambos casos devuelven null, para que el endpoint responda 403
// en los dos sin filtrar por oráculo si un template dado existe.
//
// Dos consultas simples (en vez de un solo JOIN vía embedding de
// supabase-js) a propósito: sin poder probar esto contra un despliegue real
// de Vercel antes de que se apruebe el código, se prefiere el camino más
// obviamente correcto sobre uno más compacto pero con sintaxis de embedding
// sin verificar en producción.
export async function getAuthorizedTemplate(companyId, slug) {
  if (!companyId || !slug) return null;

  // Se agrega template_config al select (antes solo id, name, slug) porque
  // es la fuente de dónde viven los assets privados de este template en
  // Storage (assetPath + mapeo de nombres lógicos a archivos). El filtro de
  // autorización en sí -- slug + is_active + fila en design_template_access
  // para companyId -- NO cambia en absoluto.
  const { data: template, error: templateError } = await supabase
    .from('design_templates')
    .select('id, name, slug, template_config')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (templateError || !template) return null;

  const { data: access, error: accessError } = await supabase
    .from('design_template_access')
    .select('id')
    .eq('company_id', companyId)
    .eq('design_template_id', template.id)
    .maybeSingle();

  if (accessError || !access) return null;

  return template;
}

// Firma URLs de corta duración para los assets privados de un template ya
// autorizado.
const SIGNED_URL_TTL_SECONDS = 600;

export async function signTemplateAssets(templateConfig) {
  const assetPath = templateConfig && templateConfig.assetPath;
  const assetMap = templateConfig && templateConfig.assets;

  if (!assetPath || typeof assetPath !== 'string') {
    throw new Error('template_config.assetPath missing or invalid');
  }

  if (!assetMap || typeof assetMap !== 'object' || Array.isArray(assetMap)) {
    throw new Error('template_config.assets missing or invalid');
  }

  const logicalKeys = Object.keys(assetMap);

  if (!logicalKeys.length) {
    throw new Error('template_config.assets is empty');
  }

  const paths = logicalKeys.map((key) => `${assetPath}/${assetMap[key]}`);

  const { data: signedList, error: signError } = await supabase
    .storage
    .from('design-assets')
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (signError || !signedList) {
    throw new Error(
      'Failed to sign design asset URLs: ' +
      (signError ? signError.message : 'no data returned')
    );
  }

  const assets = {};

  for (let i = 0; i < logicalKeys.length; i++) {
    const entry = signedList[i];

    if (!entry || entry.error || !entry.signedUrl) {
      throw new Error(
        `Failed to sign URL for asset "${logicalKeys[i]}" (${paths[i]})`
      );
    }

    assets[logicalKeys[i]] = entry.signedUrl;
  }

  return assets;
}
