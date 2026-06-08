export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { leadId, phone, name, scope, budget, color } = req.body;

  if (!phone || !name) {
    return res.status(400).json({ error: 'Missing customer phone or name' });
  }

  const vapiApiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID || 'chloe-receptionist-id';
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  // Fallback to Mock dialing if API Key is not configured or is placeholder
  if (!vapiApiKey || vapiApiKey.includes('your_') || vapiApiKey === '') {
    console.log("VAPI_API_KEY not found or placeholder. Returning mock outbound voice webhook status.");
    
    return res.status(200).json({
      success: true,
      mode: 'MOCK',
      callId: 'mock-call-' + Date.now(),
      status: 'queued',
      message: `Simulated outbound call queued for ${name} at ${phone}`
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: assistantId,
        customer: {
          number: phone,
          name: name
        },
        phoneNumberId: phoneNumberId,
        assistantOverrides: {
          variableValues: {
            customerName: name,
            projectScope: scope || 'painting',
            projectBudget: budget || 'standard rates',
            chosenColor: color || 'Alabaster'
          }
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to trigger Vapi outbound call');
    }

    return res.status(200).json({
      success: true,
      mode: 'PROD',
      callId: data.id,
      status: data.status,
      message: `Vapi call initiated: ${data.id}`
    });

  } catch (error) {
    console.error("Vapi integration failed: ", error);
    return res.status(500).json({
      error: 'Vapi agent dispatch failed',
      details: error.message
    });
  }
}
