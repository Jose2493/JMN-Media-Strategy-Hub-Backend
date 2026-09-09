import jwt from 'jsonwebtoken';
import { getAuthorizedTemplate, signTemplateAssets } from '../lib/designTemplates.js';

// Único punto de autorización real para Design Studio. El cliente (public/
// design-studio.html) NUNCA decide si tiene acceso -- solo decide si MUESTRA
// el editor, en base a lo que este endpoint responde. companyId sale
// exclusivamente del JWT ya verificado acá abajo; el cliente solo manda el
// slug del template que quiere, nada de company_id ni de permisos.
export default async function handler(req, res) {
  // Sin headers CORS: design-studio.html llama a este endpoint desde el
  // mismo origen de Vercel (fetch relativo a '/api/design-template'), así
  // que el navegador nunca aplica CORS ni dispara un preflight para esta
  // llamada -- Access-Control-Allow-* no hace nada acá y solo ampliaría
  // innecesariamente qué orígenes podrían, en teoría, leer la respuesta.
  // Si algún día un origen distinto necesita llamar a este endpoint, se
  // vuelve a agregar un Access-Control-Allow-Origin con el origen exacto
  // permitido, nunca '*'.
  //
  // no-store porque cada respuesta (200, 401, 403) refleja el estado de
  // sesión/autorización de un contacto específico -- no debe quedar
  // cacheada ni en el navegador ni en ningún proxy/CDN intermedio.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const sessionToken = authHeader.replace('Bearer ', '');
  let companyId;
  try {
    const decoded = jwt.verify(sessionToken, process.env.SESSION_JWT_SECRET);
    companyId = decoded.companyId;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  try {
    const template = await getAuthorizedTemplate(companyId, slug);
    if (!template) {
      // Mismo 403 tanto si el template no existe como si existe pero esta
      // company no tiene acceso -- no se filtra la diferencia.
      return res.status(403).json({ error: 'Access denied' });
    }

    // signTemplateAssets() tira una excepción si falta assetPath, falta el
    // mapeo de assets, o Storage falla en firmar CUALQUIERA de las URLs --
    // en cualquiera de esos casos cae al catch de abajo (500) y NUNCA se
    // responde con un objeto `assets` incompleto. No hay fallback a las
    // rutas públicas viejas en ningún punto de este camino.
    const assets = await signTemplateAssets(template.template_config);

    return res.status(200).json({
      template: {
        id: template.id,
        name: template.name,
        slug: template.slug,
        assets
      }
    });
  } catch (error) {
    console.error('design-template lookup failed:', error.message);
    return res.status(500).json({ error: 'Failed to verify template access' });
  }
}
