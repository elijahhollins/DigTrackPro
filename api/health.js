/**
 * Health endpoint for uptime monitoring.
 *
 * Probing the SPA's root URL only proves Vercel's CDN is up, which it essentially always is --
 * it says nothing about Supabase, which is the actual single point of failure. This checks the
 * things that can realistically break.
 *
 * Returns HTTP 503 (not 200-with-a-status-field) when a critical check fails, because uptime
 * monitors key on status codes. The body carries booleans and latencies only -- never key
 * material, never raw upstream error text.
 */

const CHECK_TIMEOUT_MS = 3000;

/** Fetch with a hard timeout so one hung dependency cannot hang the whole endpoint. */
const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const timed = async (fn) => {
  const start = Date.now();
  try {
    const ok = await fn();
    return { ok, ms: Date.now() - start };
  } catch (error) {
    // Deliberately not returning error.message: upstream errors can echo back connection strings
    // or key fragments, and this endpoint is public.
    return { ok: false, ms: Date.now() - start, error: error?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      status: 'error',
      error: 'CONFIG_MISSING: SUPABASE_URL / SUPABASE_ANON_KEY are not configured.',
    });
  }

  const [database, auth, storage] = await Promise.all([
    // Proves Postgres executed something, via the SECURITY DEFINER health_check() function.
    timed(async () => {
      const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/health_check`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      return response.ok;
    }),

    // GoTrue's own health endpoint.
    timed(async () => {
      const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: supabaseAnonKey },
      });
      return response.ok;
    }),

    // Storage answering at all is the signal -- an anon bucket list legitimately returns 200 or
    // 400/401 depending on policy. Deliberately an allowlist rather than `status < 500`: a 403
    // from an intermediary (proxy, WAF, egress filter) would otherwise be read as healthy, which
    // is the one wrong answer a monitor must never give.
    timed(async () => {
      const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/bucket`, {
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
      });
      return [200, 400, 401].includes(response.status);
    }),
  ]);

  // Presence check only. Calling a real AI endpoint would cost money on every probe and add
  // seconds of latency, so this catches the failure that actually happens: a key going missing
  // from the environment after a config change.
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);

  const checks = {
    database,
    auth,
    storage,
    ai: { ok: aiConfigured, configured: aiConfigured },
  };

  // Database and auth are load-bearing: without either, nobody can use the app. Storage failing
  // degrades photo upload but leaves ticket management working, and a missing AI key only breaks
  // ticket scanning -- neither should page someone at 3am, so they are reported, not fatal.
  const healthy = database.ok && auth.ok;

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'error',
    degraded: healthy && !(storage.ok && aiConfigured),
    checks,
    timestamp: new Date().toISOString(),
  });
}
