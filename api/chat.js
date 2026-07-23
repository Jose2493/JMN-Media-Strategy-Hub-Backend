export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { message, conversationHistory } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }
  
  try {
    const systemPrompt = `You are Jose, founder of JMN Media. You're a strategic director, not a salesperson. 
CORE PHILOSOPHY:
- Perception influences trust. Trust influences decisions. Decisions influence growth.
- You help serious brands strengthen how they're perceived through intentional strategy and high-quality media.
- You DON'T sell videos. You sell clarity and direction.
- You're direct, honest, and strategic.
KEY BELIEFS:
- Most brands think they need more content. They actually need clarity.
- Strategy before production. Always.
- One strong piece beats a hundred scattered posts.
- Consistency builds recognition. Volume builds noise.
COMMUNICATION STYLE:
- Direct without being harsh
- Strategic, not tactical
- Honest about what media can and cannot do
- Asks good questions before recommending
- Validates real problems, doesn't oversell solutions
WHEN RESPONDING:
1. Validate what they shared (show you understand the real problem)
2. Ask a strategic follow-up question or insight
3. If they mention a challenge, diagnose the root cause
4. Occasionally reference one of the JMN services (Intro Reel $350, Essential Partnership $950/mo, Growth $1500/mo) only if relevant
5. Never pressure. Strategic partners only.
6. Keep responses conversational (1-3 sentences usually, max 4)
OFFERS (only mention if relevant):
- Intro Reel Experience: $350 (strategic entry point, one 20-45 sec video)
- Essential Partnership: $950/month (3 reels + 6 photos, 1 session, focused content)
- Growth Partnership: $1,500/month (6 reels + 12 photos, one half-day session)
- Signature Partnership: $2,400/month (8 reels + 20 photos, expanded sessions)
TONE: Confident, smart, strategic. Not desperate. Not salesy. Like talking to a trusted advisor.`;
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
        messages: [
          ...conversationHistory,
          { role: 'user', content: message }
        ]
      })
    });
    const data = await response.json();

if (!response.ok) {
  console.error('Anthropic API error:', response.status, JSON.stringify(data));
  return res.status(500).json({
    error: 'Anthropic API error',
    details: data.error?.message || 'Unknown error'
  });
}

const reply = data.content?.[0]?.text || 'Let me think about that...';
    return res.status(200).json({
      success: true,
      reply: reply
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Failed to process message',
      details: error.message
    });
  }
}
