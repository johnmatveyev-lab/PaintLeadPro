/**
 * voice-token.js — Mints short-lived xAI ephemeral tokens for the Chloe
 * browser voice agent.
 *
 * The browser NEVER sees XAI_API_KEY. It calls this endpoint, receives a
 * 5-minute client secret, and opens its own WebSocket directly to
 * wss://api.x.ai/v1/realtime. No proxying of audio through our serverless
 * functions (they'd time out anyway) — Vercel only does the 1-shot mint.
 *
 * Mirrors the conventions of the other /api routes (_utils.js guards,
 * mock mode when the key isn't configured).
 */
import { applyCors, requireMethod, rateLimit, isConfigured } from './_utils.js';

const CLIENT_SECRETS_URL = 'https://api.x.ai/v1/realtime/client_secrets';
const TOKEN_TTL_SECONDS = 300; // xAI max/default window for client secrets

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;
  // Voice sessions are expensive relative to other endpoints — keep the
  // mint rate conservative. One token per session start is all the UI needs.
  if (!rateLimit(req, res, { key: 'voice-token', limit: 5, windowMs: 60_000 })) return;

  const apiKey = process.env.XAI_API_KEY;

  // Mock mode: lets the widget render a graceful "not configured" state in
  // previews and local dev, consistent with analyze-surface / voice-agent.
  if (!isConfigured(apiKey)) {
    console.log('XAI_API_KEY not found or placeholder. Returning mock voice-token response.');
    return res.status(200).json({ mock: true, reason: 'XAI_API_KEY not configured' });
  }

  try {
    const upstream = await fetch(CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expires_after: { seconds: TOKEN_TTL_SECONDS } })
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('[voice-token] xAI client_secrets error', upstream.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'Voice service unavailable' });
    }

    const data = await upstream.json();
    // Pass through only what the client needs. xAI returns the secret under
    // `client_secret.value` (OpenAI-Realtime-compatible shape) — but tolerate
    // a flat `value`/`token` field so an upstream shape tweak can't brick us.
    const token =
      data?.client_secret?.value || data?.value || data?.token || null;
    const expiresAt =
      data?.client_secret?.expires_at || data?.expires_at || null;

    if (!token) {
      console.error('[voice-token] Unexpected client_secrets response shape');
      return res.status(502).json({ error: 'Voice service unavailable' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ token, expiresAt, model: 'grok-voice-latest' });
  } catch (err) {
    console.error('[voice-token] mint failed:', err.message);
    return res.status(502).json({ error: 'Voice service unavailable' });
  }
}
