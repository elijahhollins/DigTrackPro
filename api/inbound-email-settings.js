import { ImapFlow } from 'imapflow';
import { encryptSecret } from './_inboundEmailCrypto.js';
import { requireAdminProfile } from './_supabaseAdmin.js';

const sanitizeAllowlist = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim().toLowerCase())
    .filter(Boolean);
};

const sanitizePayload = (body) => {
  const emailAddress = String(body?.emailAddress || '').trim();
  const host = String(body?.host || '').trim();
  const username = String(body?.username || '').trim();
  const mailbox = String(body?.mailbox || 'INBOX').trim() || 'INBOX';
  const subjectFilter = String(body?.subjectFilter || '').trim();
  const secure = body?.secure !== false;
  const autoImport = body?.autoImport !== false;
  const password = String(body?.password || '');
  const portValue = Number(body?.port);
  const port = Number.isFinite(portValue) && portValue > 0 ? Math.trunc(portValue) : 993;

  if (!emailAddress || !host || !username) {
    throw new Error('Email address, host, and username are required.');
  }

  return {
    emailAddress,
    host,
    port,
    username,
    password,
    secure,
    mailbox,
    subjectFilter: subjectFilter || null,
    senderAllowlist: sanitizeAllowlist(body?.senderAllowlist),
    autoImport,
  };
};

const testImapConnection = async (settings) => {
  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen(settings.mailbox);
  } finally {
    await client.logout().catch((error) => {
      console.warn('Inbound IMAP settings logout failed:', error);
    });
  }
};

const formatConnection = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    emailAddress: row.email_address || '',
    host: row.host || '',
    port: row.port || 993,
    username: row.username || '',
    secure: row.use_tls !== false,
    mailbox: row.mailbox || 'INBOX',
    subjectFilter: row.subject_filter || '',
    senderAllowlist: Array.isArray(row.sender_allowlist) ? row.sender_allowlist : [],
    autoImport: row.auto_import !== false,
    hasPassword: Boolean(row.password_encrypted),
    lastSyncedAt: row.last_synced_at || null,
    lastError: row.last_error || null,
  };
};

export default async function handler(req, res) {
  try {
    const { admin, profile } = await requireAdminProfile(req);

    if (req.method === 'GET') {
      const { data, error } = await admin
        .from('inbound_email_connections')
        .select('*')
        .eq('company_id', profile.companyId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ data: formatConnection(data) });
    }

    if (req.method === 'DELETE') {
      const { error } = await admin
        .from('inbound_email_connections')
        .delete()
        .eq('company_id', profile.companyId);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const payload = sanitizePayload(req.body || {});
    const { data: existing, error: existingError } = await admin
      .from('inbound_email_connections')
      .select('*')
      .eq('company_id', profile.companyId)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ error: existingError.message });
    }

    const hasStoredPassword = Boolean(payload.password || existing?.password_encrypted);
    if (!hasStoredPassword) {
      return res.status(400).json({ error: 'A mailbox password or app password is required.' });
    }

    const decryptedPassword = payload.password || null;
    if (decryptedPassword) {
      await testImapConnection(payload);
    }

    const row = {
      company_id: profile.companyId,
      email_address: payload.emailAddress,
      host: payload.host,
      port: payload.port,
      username: payload.username,
      password_encrypted: decryptedPassword ? encryptSecret(decryptedPassword) : existing.password_encrypted,
      use_tls: payload.secure,
      mailbox: payload.mailbox,
      subject_filter: payload.subjectFilter,
      sender_allowlist: payload.senderAllowlist,
      auto_import: payload.autoImport,
      last_error: null,
      updated_by: profile.id,
      created_by: existing?.created_by || profile.id,
    };

    const { data, error } = await admin
      .from('inbound_email_connections')
      .upsert(row, { onConflict: 'company_id' })
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ data: formatConnection(data) });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({ error: String(error?.message || 'Request failed.') });
  }
}
