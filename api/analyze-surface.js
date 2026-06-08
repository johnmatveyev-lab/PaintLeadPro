import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // CORS support
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

  const { image, color } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback to Mock response if API key is not configured or is a placeholder
  if (!apiKey || apiKey.includes('your_') || apiKey === '') {
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

    if (image.startsWith('data:')) {
      base64Data = image.split(',')[1] || image;
      mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';
    } else if (image.startsWith('http://') || image.startsWith('https://')) {
      const imgRes = await fetch(image);
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64Data = buffer.toString('base64');
      mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    } else {
      return res.status(400).json({ error: 'Unsupported image format' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
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
    return res.status(500).json({
      error: 'Failed to analyze surface image via Gemini',
      details: error.message
    });
  }
}
