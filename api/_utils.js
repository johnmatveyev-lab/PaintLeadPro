// Shared helpers for PaintLead Pro serverless API endpoints.

// --- CORS ---------------------------------------------------------------
// Same-origin requests (the normal case: pages served from the same Vercel
// deployment) don't need CORS headers at all. We only echo an Origin back
// if it is explicitly allowlisted via the ALLOWED_ORIGINS env var
// (comma-separated), keeping the API closed to arbitrary third-party sites.
export function applyCors(req, res) {
  const origin = req.headers?.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // handled
  }
  return false;
}

// --- Method guard --------------------------------------------------------
export function requireMethod(req, res, method) {
  if (req.method !== method) {
    res.setHeader('Allow', `${method}, OPTIONS`);
    res.status(405).json({ error: 'Method Not Allowed' });
    return false;
  }
  return true;
}

// --- Rate limiting (best-effort, per warm serverless instance) -----------
const buckets = new Map();
export function rateLimit(req, res, { limit = 10, windowMs = 60_000, key = 'global' } = {}) {
  const ip =
    (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  let bucket = buckets.get(bucketKey);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(bucketKey, bucket);
  }
  bucket.count += 1;

  // Opportunistic cleanup to bound memory.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (now - b.start > windowMs) buckets.delete(k);
    }
  }

  if (bucket.count > limit) {
    res.setHeader('Retry-After', Math.ceil((bucket.start + windowMs - now) / 1000));
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
    return false;
  }
  return true;
}

// --- Validation helpers ---------------------------------------------------
export function cleanString(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  // Strip control characters, collapse whitespace, cap length.
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export function isValidPhone(value) {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

// Max payload for inline images: ~8 MB of base64 (≈6 MB binary).
export const MAX_IMAGE_CHARS = 8 * 1024 * 1024;

export function validateImageInput(image) {
  if (typeof image !== 'string' || image.length === 0) {
    return { ok: false, error: 'Missing image data' };
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return { ok: false, error: 'Image too large (max ~6 MB). Please upload a smaller photo.' };
  }
  if (image.startsWith('data:image/')) return { ok: true, kind: 'dataurl' };
  if (/^https:\/\/[^\s]+$/i.test(image)) return { ok: true, kind: 'url' };
  return { ok: false, error: 'Unsupported image format. Provide a data URL or https image URL.' };
}

// Treat empty strings and obvious placeholders as "not configured".
export function isConfigured(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('your_');
}
