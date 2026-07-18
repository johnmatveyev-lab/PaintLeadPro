/**
 * analyze-surface.js — AI siding/surface analysis for the Paint Visualizer.
 *
 * MIGRATED: Google Gemini → NVIDIA NIM (build.nvidia.com).
 *   - Endpoint: https://integrate.api.nvidia.com/v1/chat/completions (OpenAI-compatible)
 *   - Model: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning (multimodal — image input)
 *   - Env: NVIDIA_API_KEY replaces GEMINI_API_KEY
 *   - Dependency @google/generative-ai removed (plain fetch, zero deps)
 *
 * Response contract is unchanged: { success, mode, prepNotes, gallonsEstimate,
 * primerRecommended, suggestedCoats }.
 */
import { applyCors, requireMethod, rateLimit, cleanString, validateImageInput, isConfigured } from './_utils.js';

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NIM_VISION_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

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

  const apiKey = process.env.NVIDIA_API_KEY;

  // Fallback to Mock response if API key is not configured or is a placeholder
  if (!isConfigured(apiKey)) {
    console.log('NVIDIA_API_KEY not found or is a placeholder. Returning mock analysis report.');

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

    const prompt = `Analyze this residential surface image for a repaint estimate in ${color || 'neutral'} color.
Output a structured JSON object strictly with the following keys and nothing else:
- prepNotes: detailed string summarizing wall condition and scraping/washing prep work needed.
- gallonsEstimate: string range of estimated paint gallons needed.
- primerRecommended: string name of Sherwin-Williams primer needed.
- suggestedCoats: integer number of topcoats (default 2).
Respond with raw JSON only — no markdown fences, no commentary.`;

    const nimRes = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: NIM_VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.2,
        // Nano Omni reasons by default; the estimator wants fast structured output.
        chat_template_kwargs: { enable_thinking: false }
      })
    });

    if (!nimRes.ok) {
      const detail = await nimRes.text().catch(() => '');
      console.error('NIM API error:', nimRes.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'Failed to analyze surface image. Please try again.' });
    }

    const data = await nimRes.json();
    const responseText = data?.choices?.[0]?.message?.content || '';

    // Sanitize JSON markers if returned, then extract the JSON object.
    let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    if (start >= 0 && end > start) cleanJson = cleanJson.slice(start, end + 1);
    const analysis = JSON.parse(cleanJson);

    return res.status(200).json({
      success: true,
      mode: 'PROD',
      ...analysis
    });

  } catch (error) {
    console.error('NIM API call failed: ', error);
    return res.status(502).json({
      error: 'Failed to analyze surface image. Please try again.'
    });
  }
}
