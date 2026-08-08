import crypto from 'node:crypto';

/**
 * Twilio inbound SMS webhook.
 *
 * Point Twilio's "A message comes in" webhook at POST https://digtrack.app/api/twilio-sms-webhook
 *
 * Required environment variables (Vercel project settings):
 *   TWILIO_AUTH_TOKEN          — used to verify the X-Twilio-Signature header
 *   SUPABASE_URL               — project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — server-only key; never expose to the browser
 *   TWILIO_WEBHOOK_URL         — optional. The exact URL configured in Twilio,
 *                                if it differs from the host header (proxies,
 *                                preview deployments).
 *
 * Unsigned or badly signed requests are rejected with 403. Anything that parses
 * badly still returns 200, so Twilio does not enter a retry storm over a message
 * we were never going to act on.
 */

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

const HELP_MESSAGE =
  'DigTrack Pro: locate ticket alerts. Msg frequency varies. Msg & data rates may apply. ' +
  'Reply STOP to unsubscribe. Support: hello@digtrack.app';

const twiml = (message) =>
  message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const respond = (res, body) => {
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(body);
};

/**
 * Twilio's signature scheme: the request URL with every POST parameter appended
 * in key-sorted order, HMAC-SHA1'd with the account auth token.
 */
const isValidTwilioSignature = (signature, url, params, authToken) => {
  if (!signature) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(payload, 'utf-8')).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const requestUrl = (req) => {
  if (process.env.TWILIO_WEBHOOK_URL) return process.env.TWILIO_WEBHOOK_URL;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}${req.url}`;
};

const revokeConsent = async (phone) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[Twilio webhook] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
    return;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/revoke_sms_consent_by_phone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ p_phone: phone }),
  });

  if (!response.ok) {
    console.error('[Twilio webhook] revoke_sms_consent_by_phone failed:', response.status, await response.text());
    return;
  }

  console.log(`[Twilio webhook] opt-out recorded for ${phone} (${await response.text()} user(s))`);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[Twilio webhook] TWILIO_AUTH_TOKEN is not configured; rejecting request.');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const params = req.body && typeof req.body === 'object' ? req.body : {};

  if (!isValidTwilioSignature(req.headers['x-twilio-signature'], requestUrl(req), params, authToken)) {
    console.warn('[Twilio webhook] rejected request with missing or invalid signature.');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    const from = typeof params.From === 'string' ? params.From.trim() : '';
    const keyword = typeof params.Body === 'string' ? params.Body.trim().toUpperCase() : '';

    if (!from || !keyword) {
      // Signed, but nothing actionable — acknowledge and move on.
      return respond(res, twiml(null));
    }

    if (STOP_KEYWORDS.has(keyword)) {
      await revokeConsent(from);
      // Twilio sends its own opt-out confirmation for toll-free numbers, so
      // adding a second message here would double-text the user.
      return respond(res, twiml(null));
    }

    if (HELP_KEYWORDS.has(keyword)) {
      return respond(res, twiml(HELP_MESSAGE));
    }

    return respond(res, twiml(null));
  } catch (error) {
    console.error('[Twilio webhook] failed to process inbound message:', error);
    // Deliberate 200: a retry would fail the same way.
    return respond(res, twiml(null));
  }
}
