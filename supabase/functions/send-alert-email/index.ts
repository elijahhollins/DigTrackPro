// Supabase Edge Function — send-alert-email
// Deploy via: supabase functions deploy send-alert-email
// Required secrets:
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set RESEND_FROM_EMAIL=alerts@yourdomain.com  (optional, defaults shown below)
//   supabase secrets set ALLOWED_ORIGINS=https://app.example.com,https://www.example.com  (optional)
//
// SECURITY NOTES
// --------------
// This function used to take an `adminEmails` array straight from the
// request body and mail every address in it, with no check on who was
// calling. That made it an open relay for "DigTrack Pro"-branded mail with
// attacker-chosen subject and body.
//
// It now:
//   1. verifies the caller's JWT in code rather than relying on the
//      platform's implicit verify_jwt default;
//   2. resolves recipients server-side — the caller names a company, and
//      get_alert_emails() (which does its own authorization check against
//      the caller's JWT) decides who actually receives mail;
//   3. HTML-escapes every interpolated field, not just some of them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Narrow CORS when ALLOWED_ORIGINS is configured. Falls back to '*' so an
// unconfigured deployment keeps working — auth here is a bearer token, not
// a cookie, so '*' is not itself an authentication bypass.
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsFor = (req: Request): Record<string, string> => {
  const origin = req.headers.get('origin') ?? '';
  const allow = allowedOrigins.length === 0
    ? '*'
    : (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
};

interface AlertPayload {
  type: 'no_show' | 'refresh' | 'test';
  /** Company whose configured alert recipients should be mailed. Ignored for `test`. */
  companyId?: string;
  ticketNo: string;
  jobNumber: string;
  street: string;
  city?: string;
  state?: string;
  expires?: string;
  actor: string;
  utilities?: string[];
  notes?: string;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!RESEND_API_KEY) {
      return json({ error: 'RESEND_API_KEY secret not configured. Get your API key from resend.com/api-keys and run: supabase secrets set RESEND_API_KEY=<your-key>' }, 500);
    }
    if (!FROM_EMAIL) {
      return json({ error: 'RESEND_FROM_EMAIL secret not configured. Run: supabase secrets set RESEND_FROM_EMAIL=alerts@yourdomain.com (must be a Resend-verified sender address)' }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase environment not available to the function' }, 500);
    }

    // ── Authenticate the caller ────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // This client carries the caller's JWT, so every query below runs as
    // them — RLS and get_alert_emails()'s own check still apply.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const caller = userData.user;

    const payload: AlertPayload = await req.json();
    const { type, companyId, ticketNo, jobNumber, street, city, state, expires, actor, utilities, notes } = payload;

    if (type !== 'no_show' && type !== 'refresh' && type !== 'test') {
      return json({ error: 'Invalid alert type' }, 400);
    }

    // ── Resolve recipients server-side ─────────────────────────────────
    // The caller never supplies an address list. A test goes to the
    // caller's own configured alert address; a real alert goes to whoever
    // get_alert_emails() says, and that function raises 'Unauthorized'
    // unless the caller belongs to the company (or is a super admin).
    let recipients: string[];

    if (type === 'test') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('notify_email')
        .eq('id', caller.id)
        .single();
      if (profileError) {
        return json({ error: `Could not load your profile: ${profileError.message}` }, 400);
      }
      recipients = String(profile?.notify_email ?? '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      if (recipients.length === 0 && caller.email) {
        recipients = [caller.email];
      }
    } else {
      if (!companyId) {
        return json({ error: 'companyId is required' }, 400);
      }
      const { data: rows, error: rpcError } = await supabase
        .rpc('get_alert_emails', { p_company_id: companyId });
      if (rpcError) {
        // get_alert_emails() raises 'Unauthorized' for a caller outside the company.
        const status = /unauthorized/i.test(rpcError.message) ? 403 : 400;
        return json({ error: rpcError.message }, status);
      }
      recipients = (rows ?? [])
        .flatMap((r: { notify_email: string }) => String(r.notify_email ?? '').split(','))
        .map((e: string) => e.trim())
        .filter(Boolean);
    }

    if (recipients.length === 0) {
      return json({ message: 'No recipients', sent: 0, total: 0 });
    }

    // ── Render ─────────────────────────────────────────────────────────
    const isNoShow = type === 'no_show';
    const accentColor = isNoShow ? '#ef4444' : '#f59e0b';
    const eventLabel = isNoShow ? 'No Show Alert' : type === 'test' ? 'Test Alert' : 'Refresh Request';
    const subject = isNoShow
      ? `🚨 No Show Alert — Ticket #${ticketNo} (Job #${jobNumber})`
      : type === 'test'
        ? `✅ DigTrack Pro test alert`
        : `🔄 Refresh Request — Ticket #${ticketNo} (Job #${jobNumber})`;

    const safeActor = escapeHtml(actor);
    const safeTicketNo = escapeHtml(ticketNo);
    const safeJobNumber = escapeHtml(jobNumber);
    const safeExpires = escapeHtml(expires);
    const locationParts = escapeHtml([street, city, state].filter(Boolean).join(', '));
    const utilitiesLabel = (utilities ?? []).filter(Boolean).map(escapeHtml).join(', ');
    const notesText = String(notes ?? '').trim();

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:${accentColor};padding:20px 28px;">
      <p style="margin:0;color:#fff;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;opacity:0.8;">DigTrack Pro · Alert</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:900;letter-spacing:-0.02em;">${eventLabel}</h1>
    </div>
    <div style="padding:28px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;width:38%;">Reported By</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;">${safeActor}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Ticket #</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;font-family:monospace;">${safeTicketNo}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Job #</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;font-family:monospace;">${safeJobNumber}</td>
        </tr>
        ${utilitiesLabel ? `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Utility Type</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;">${utilitiesLabel}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Location</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;color:#334155;">${locationParts || '—'}</td>
        </tr>
        ${expires ? `<tr>
          <td style="padding:10px 0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Expires</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#334155;">${safeExpires}</td>
        </tr>` : ''}
      </table>
      ${notesText ? `<div style="margin-top:24px;padding:16px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
        <p style="margin:0 0 6px;font-size:10px;color:#b45309;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;">Notes</p>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#334155;white-space:pre-wrap;">${escapeHtml(notesText)}</p>
      </div>` : ''}
      <div style="margin-top:24px;padding:14px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <p style="margin:0;font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">
          Log in to DigTrack Pro to view the full ticket and take action.
        </p>
      </div>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9;text-align:center;">
      <p style="margin:0;font-size:10px;color:#cbd5e1;font-weight:600;">
        You're receiving this because you enabled email alerts in DigTrack Pro.
      </p>
    </div>
  </div>
</body>
</html>`;

    const results = await Promise.allSettled(
      recipients.map((to: string) =>
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: FROM_EMAIL, to, subject, html: htmlBody }),
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Resend API error ${res.status}: ${body}`);
          }
          return res;
        })
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason?.message ?? 'unknown error');

    const status = succeeded === 0 && failed.length > 0 ? 500 : 200;
    return json({ sent: succeeded, total: recipients.length, errors: failed.length > 0 ? failed : undefined }, status);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
