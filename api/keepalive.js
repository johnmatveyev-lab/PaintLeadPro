import { applyCors, requireMethod, isConfigured } from './_utils.js';

// Pinged daily by Vercel Cron (see vercel.json) to keep the free-tier
// Supabase project from auto-pausing after 7 days of inactivity.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!isConfigured(url) || !isConfigured(key)) {
    return res.status(200).json({ ok: true, supabase: 'not configured' });
  }

  try {
    // Any authenticated REST hit counts as project activity.
    // RLS blocks anon reads, so this returns no data — that's fine.
    const r = await fetch(`${url}/rest/v1/leads?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    return res.status(200).json({ ok: true, supabase: `pinged (${r.status})` });
  } catch (err) {
    console.error('Keepalive ping failed:', err);
    return res.status(200).json({ ok: false, supabase: 'unreachable' });
  }
}
