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

  const {
    name,
    email,
    business,
    responses,
    diagnosis,
    leadScore
  } = req.body;

  if (!name || !email || !business) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Enviar email a Jainnyt con Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'noreply@jmnmedia.com',
        to: 'jainnyt@jmnmedia.com',
        subject: `🔥 New JMN Lead: ${name} (Score: ${leadScore}/100)`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2>New Lead from JMN Strategy Hub</h2>
            
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Lead Score:</strong> ${leadScore}/100</p>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Business:</strong> ${business}</p>
            </div>

            <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3>Diagnosis</h3>
              <p>${diagnosis}</p>
            </div>

            <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3>Conversation Summary</h3>
              <ul>
                <li><strong>Perception:</strong> ${responses.perception || 'N/A'}</li>
                <li><strong>Content Gap:</strong> ${responses.gap || 'N/A'}</li>
                <li><strong>Business Goal:</strong> ${responses.goal || 'N/A'}</li>
                <li><strong>Urgency:</strong> ${responses.urgency || 'N/A'}</li>
                <li><strong>Content Frequency:</strong> ${responses.contentgap || 'N/A'}</li>
                <li><strong>Ready to Invest:</strong> ${responses.decision || 'N/A'}</li>
              </ul>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd;">
              <p><strong>Next Action:</strong> Review lead score and reach out within 24 hours.</p>
              <p>Lead quality: ${leadScore >= 70 ? '🔥 HOT' : leadScore >= 50 ? '⚡ WARM' : '❄️ COLD'}</p>
            </div>
          </div>
        `
      })
    });

    if (!emailResponse.ok) {
      console.error('Resend error:', await emailResponse.text());
    }

    // 2. Guardar en SuiteDash (no debe tumbar la respuesta si falla)
    try {
      const suiteDashResponse = await fetch(
        'https://app.suitedash.com/secure-api/contacts',
        {
          method: 'POST',
          headers: {
            'X-Public-ID': process.env.SUITEDASH_PUBLIC_ID,
            'X-Secret-Key': process.env.SUITEDASH_SECRET_KEY,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            first_name: name.split(' ')[0],
            last_name: name.split(' ').slice(1).join(' ') || '',
            email: email,
            company: business,
            notes: `JMN Strategy Hub Lead\n\nLead Score: ${leadScore}/100\nDiagnosis: ${diagnosis}\n\nResponses:\n- Perception: ${responses.perception}\n- Content Gap: ${responses.gap}\n- Goal: ${responses.goal}\n- Urgency: ${responses.urgency}\n- Content Frequency: ${responses.contentgap}\n- Ready to Invest: ${responses.decision}\n\nCreated: ${new Date().toISOString()}`
          })
        }
      );

      if (!suiteDashResponse.ok) {
        console.error('SuiteDash error:', suiteDashResponse.status, await suiteDashResponse.text());
      }
    } catch (suiteDashError) {
      console.error('SuiteDash request failed:', suiteDashError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Lead saved successfully',
      leadScore
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Failed to save lead',
      details: error.message
    });
  }
}
