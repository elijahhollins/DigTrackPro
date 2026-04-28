// Supabase Edge Function — send-alert-email
// Deploy via: supabase functions deploy send-alert-email
// Required secrets:
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set RESEND_FROM_EMAIL=alerts@yourdomain.com  (optional, defaults shown below)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertPayload {
  type: 'no_show' | 'refresh';
  ticketNo: string;
  jobNumber: string;
  street: string;
  city?: string;
  state?: string;
  expires?: string;
  actor: string;
  adminEmails: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: AlertPayload = await req.json();
    const { type, ticketNo, jobNumber, street, city, state, expires, actor, adminEmails } = payload;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL');

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY secret not configured. Get your API key from resend.com/api-keys and run: supabase secrets set RESEND_API_KEY=<your-key>' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!FROM_EMAIL) {
      return new Response(JSON.stringify({ error: 'RESEND_FROM_EMAIL secret not configured. Run: supabase secrets set RESEND_FROM_EMAIL=alerts@yourdomain.com (must be a Resend-verified sender address)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!adminEmails || adminEmails.length === 0) {
      return new Response(JSON.stringify({ message: 'No recipients' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isNoShow = type === 'no_show';
    const accentColor = isNoShow ? '#ef4444' : '#f59e0b';
    const eventLabel = isNoShow ? 'No Show Alert' : 'Refresh Request';
    const subject = isNoShow
      ? `🚨 No Show Alert — Ticket #${ticketNo} (Job #${jobNumber})`
      : `🔄 Refresh Request — Ticket #${ticketNo} (Job #${jobNumber})`;

    const locationParts = [street, city, state].filter(Boolean).join(', ');

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
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;">${actor}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Ticket #</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;font-family:monospace;">${ticketNo}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Job #</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;font-family:monospace;">${jobNumber}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Location</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;color:#334155;">${locationParts || '—'}</td>
        </tr>
        ${expires ? `<tr>
          <td style="padding:10px 0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">Expires</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#334155;">${expires}</td>
        </tr>` : ''}
      </table>
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
      adminEmails.map((to: string) =>
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

    const responseBody = JSON.stringify({ sent: succeeded, total: adminEmails.length, errors: failed.length > 0 ? failed : undefined });
    const status = succeeded === 0 && failed.length > 0 ? 500 : 200;
    return new Response(responseBody, { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
