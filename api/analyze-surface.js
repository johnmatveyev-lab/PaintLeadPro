import { GoogleGenerativeAI } from '@google/generative-ai';
import { applyCors, requireMethod, rateLimit, cleanString, validateImageInput, isConfigured } from './_utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  if (!rateLimit(req, res, { key: 'analyze', limit: 10, windowMs: 60_000 })) return;

  const { image } = req.body || {};
  const color = cleanString((req.body || {}).color, 60);

  const imageCheck = validateImageInput(image);
  if (!imageCheck.ok) {
    return res.status(400).json({ error: imageCheck.error });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback to Mock response if API key is not configured or is a placeholder
  if (!isConfigured(apiKey)) {
    console.log("GEMINI_API_KEY not found or is a placeholder. Returning mock analysis report.");
    
    // Simulate a slight database search delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    return res.status(200).json({
      success: true,
      mode: 'MOCK',
      prepNotes: "Siding appears to be horizontal wood/hardiplank in fair condition. Spotted localized weathering and minor paint peeling on lower panels. Recommend pressure washing and scraping loose flakes before priming.",
      gallonsEstimate: "12 - 15 gallons",
      primerRecommended: "Sherwin-Williams Exterior Latex Wood Primer",
      suggestedCoats: 2
    });
  }

  try {
    let base64Data = '';
    let mimeType = '';

    if (imageCheck.kind === 'dataurl') {
      base64Data = image.split(',')[1] || '';
      mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';
    } else {
      const imgRes = await fetch(image);
      if (!imgRes.ok) {
        return res.status(400).json({ error: 'Could not fetch image from URL' });
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64Data = buffer.toString('base64');
      mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    }

    if (!base64Data) {
      return res.status(400).json({ error: 'Empty image payload' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash-lite',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `Analyze this residential surface image for a repaint estimate in ${color || 'neutral'} color. 
    Output a structured JSON strictly with the following keys:
    - prepNotes: detailed string summarizing wall condition and scraping/washing prep work needed.
    - gallonsEstimate: string range of estimated paint gallons needed.
    - primerRecommended: string name of Sherwin-Williams primer needed.
    - suggestedCoats: integer number of topcoats (default 2).`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType
        }
      }
    ]);

    const responseText = result.response.text();
    
    // Sanitize JSON markers if returned
    let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const analysis = JSON.parse(cleanJson);

    return res.status(200).json({
      success: true,
      mode: 'PROD',
      ...analysis
    });

  } catch (error) {
    console.error("Gemini API call failed: ", error);
    return res.status(502).json({
      error: 'Failed to analyze surface image. Please try again.'
    });
  }
}
