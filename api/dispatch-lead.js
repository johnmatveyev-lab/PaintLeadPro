import twilio from 'twilio';
import { applyCors, requireMethod, rateLimit, cleanString, isValidPhone, isConfigured } from './_utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!rateLimit(req, res, { key: 'dispatch', limit: 6, windowMs: 60_000 })) return;

  const body = req.body || {};
  const phone = cleanString(body.phone, 24);
  const name = cleanString(body.name, 80);
  const address = cleanString(body.address, 160);
  const scope = cleanString(body.scope, 80);
  const budget = cleanString(body.budget, 60);
  const color = cleanString(body.color, 60);

  if (!phone || !name || !address) {
    return res.status(400).json({ error: 'Missing lead contact details or address' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const partnerNumber = process.env.PARTNER_NOTIFY_PHONE || '+18645550100'; // Default notification number

  // Fallback to Mock SMS if Twilio is not configured or are placeholders
  if (!isConfigured(accountSid) || !isConfigured(authToken) || !isConfigured(fromNumber)) {
    console.log("Twilio credentials not found or are placeholders. Returning mock SMS dispatch payload.");
    
    return res.status(200).json({
      success: true,
      mode: 'MOCK',
      messageSid: 'mock-sms-' + Date.now(),
      status: 'sent',
      message: `Simulated SMS dispatched to partner at ${partnerNumber}`
    });
  }

  try {
    const client = twilio(accountSid, authToken);

    const smsBody = `PaintLead Pro Exclusive Dispatch:
Name: ${name}
Phone: ${phone}
Address: ${address}
Scope: ${scope}
Budget: ${budget}
Color: ${color}
Est. Gallons: Calculated dynamically.
Status: Confirmed - Ready for estimate.`;

    const message = await client.messages.create({
      body: smsBody,
      from: fromNumber,
      to: partnerNumber
    });

    return res.status(200).json({
      success: true,
      mode: 'PROD',
      messageSid: message.sid,
      status: message.status,
      message: `SMS sent successfully: ${message.sid}`
    });

  } catch (error) {
    console.error("Twilio SMS dispatch failed: ", error);
    return res.status(502).json({
      error: 'SMS dispatch failed. Please try again.'
    });
  }
}
