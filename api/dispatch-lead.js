import twilio from 'twilio';

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

  const { phone, name, address, scope, budget, color } = req.body;

  if (!phone || !name || !address) {
    return res.status(400).json({ error: 'Missing lead contact details or address' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const partnerNumber = process.env.PARTNER_NOTIFY_PHONE || '+18645550100'; // Default notification number

  // Fallback to Mock SMS if Twilio is not configured or are placeholders
  if (
    !accountSid || accountSid.includes('your_') || accountSid === '' ||
    !authToken || authToken.includes('your_') || authToken === '' ||
    !fromNumber || fromNumber.includes('your_') || fromNumber === ''
  ) {
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
    return res.status(500).json({
      error: 'Twilio SMS dispatch failed',
      details: error.message
    });
  }
}
