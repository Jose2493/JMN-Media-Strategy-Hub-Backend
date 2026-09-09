import jwt from 'jsonwebtoken';
import { getAuthorizedTemplate } from '../lib/designTemplates.js';

// Autorización real de JMN Design Studio.
// companyId proviene exclusivamente del JWT verificado.
// El navegador nunca decide company_id ni permisos.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const sessionToken = authHeader.replace('Bearer ', '');

  let companyId;

  try {
    const decoded = jwt.verify(
      sessionToken,
      process.env.SESSION_JWT_SECRET
    );

    companyId = decoded.companyId;
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired session'
    });
  }

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({
      error: 'Missing slug'
    });
  }

  try {
    const template = await getAuthorizedTemplate(companyId, slug);

    if (!template) {
      // Mismo 403 si no existe o si la compañía no tiene acceso.
      // Así no revelamos qué templates existen.
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    return res.status(200).json({
      template: {
        id: template.id,
        name: template.name,
        slug: template.slug
      }
    });
  } catch (error) {
    console.error(
      'design-template lookup failed:',
      error.message
    );

    return res.status(500).json({
      error: 'Failed to verify template access'
    });
  }
}
