import { applyCors, requireMethod } from './_utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  // Serve public config variables (Supabase URL and Anon Key).
  // The anon key is safe to expose by design; data access is enforced by RLS.
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
}
