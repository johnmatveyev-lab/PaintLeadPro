import { applyCors, requireMethod, rateLimit, cleanString, isValidPhone, isConfigured } from './_utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!rateLimit(req, res, { key: 'voice', limit: 6, windowMs: 60_000 })) return;

  const body = req.body || {};
  const phone = cleanString(body.phone, 24);
  const name = cleanString(body.name, 80);
  const scope = cleanString(body.scope, 80);
  const budget = cleanString(body.budget, 60);
  const color = cleanString(body.color, 60);

  if (!phone || !name) {
    return res.status(400).json({ error: 'Missing customer phone or name' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const vapiApiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID || 'chloe-receptionist-id';
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  // Fallback to Mock dialing if API Key is not configured or is placeholder
  if (!isConfigured(vapiApiKey)) {
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
    return res.status(502).json({
      error: 'Voice agent dispatch failed. Please try again.'
    });
  }
}
