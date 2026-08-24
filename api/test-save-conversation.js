import { createConversation, addMessage, getConversation } from '../lib/repositories.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, contactId } = req.body;
  if (!companyId || !contactId) return res.status(400).json({ error: 'Missing companyId or contactId' });

  try {
    const conversation = await createConversation(companyId, contactId);
    const userMsg = await addMessage(companyId, contactId, conversation.id, 'user', 'Mensaje de prueba del usuario');
    const assistantMsg = await addMessage(companyId, contactId, conversation.id, 'assistant', 'Respuesta de prueba del asistente');
    const confirmed = await getConversation(companyId, conversation.id);
    return res.status(200).json({ conversation: confirmed, userMsg, assistantMsg });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
