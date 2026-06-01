import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'node:crypto';
import { decryptSecret } from './_inboundEmailCrypto.js';
import { parseInboundEmail } from './_inboundEmailParser.js';
import { requireAdminProfile } from './_supabaseAdmin.js';

const DEFAULT_SYNC_BATCH_SIZE = 10;
const MAX_SYNC_MESSAGES = Math.max(
  1,
  Number(process.env.INBOUND_EMAIL_SYNC_BATCH_SIZE || DEFAULT_SYNC_BATCH_SIZE),
);

const buildEmailText = ({ subject, from, text, html }) => {
  const fromLine = Array.isArray(from?.value) ? from.value.map(item => item.address || item.name).filter(Boolean).join(', ') : '';
  const body = String(text || html || '').replace(/\s{3,}/g, '\n\n').trim();
  return [`Subject: ${subject || ''}`, fromLine ? `From: ${fromLine}` : '', body].filter(Boolean).join('\n\n');
};

const shouldImportMessage = (settings, parsedEmail) => {
  const allowlist = Array.isArray(settings.sender_allowlist) ? settings.sender_allowlist : [];
  const sender = Array.isArray(parsedEmail.from?.value)
    ? String(parsedEmail.from.value[0]?.address || '').trim().toLowerCase()
    : '';

  if (allowlist.length > 0 && (!sender || !allowlist.includes(sender))) {
    return { allowed: false, reason: 'Sender is not in the allowlist.' };
  }

  const subjectFilter = String(settings.subject_filter || '').trim().toLowerCase();
  if (subjectFilter) {
    const subject = String(parsedEmail.subject || '').trim().toLowerCase();
    if (!subject.includes(subjectFilter)) {
      return { allowed: false, reason: 'Subject filter did not match.' };
    }
  }

  return { allowed: true, sender };
};

const deriveFallbackTicketNumber = ({ subject, messageId }) => {
  const subjectMatch = String(subject || '').match(/\b([A-Z0-9-]{6,})\b/);
  if (subjectMatch) return subjectMatch[1];
  return `EMAIL-${String(messageId || crypto.randomUUID()).replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase()}`;
};

const upsertInboundTicketFromEmail = async ({ admin, companyId, profile, parsed, emailText, subject, messageId }) => {
  const ticketNumber = parsed.ticketNumber || deriveFallbackTicketNumber({ subject, messageId });
  const siteAddress = parsed.siteAddress || 'Email ticket - address missing';
  const notes = [parsed.notes, '', 'Imported from email', emailText].filter(Boolean).join('\n').slice(0, 8000);

  const { data: existing } = await admin
    .from('inbound_tickets')
    .select('*')
    .eq('company_id', companyId)
    .eq('ticket_number', ticketNumber)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await admin
      .from('inbound_tickets')
      .update({
        site_address: siteAddress,
        dig_start_date: parsed.digStartDate || existing.dig_start_date || '',
        due_date: parsed.dueDate || existing.due_date || parsed.digStartDate || '',
        caller_name: parsed.callerName || existing.caller_name || '',
        caller_phone: parsed.callerPhone || existing.caller_phone || '',
        utility_types: parsed.utilityTypes?.length ? parsed.utilityTypes : existing.utility_types || [],
        notes,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw error;
    return { ticketId: data.id, status: 'updated' };
  }

  const { data, error } = await admin
    .from('inbound_tickets')
    .insert({
      company_id: companyId,
      ticket_number: ticketNumber,
      site_address: siteAddress,
      dig_start_date: parsed.digStartDate || '',
      due_date: parsed.dueDate || parsed.digStartDate || '',
      status: 'unassigned',
      assigned_to: null,
      caller_name: parsed.callerName || '',
      caller_phone: parsed.callerPhone || '',
      utility_types: parsed.utilityTypes || [],
      notes,
      created_by: profile.id,
    })
    .select('*')
    .single();

  if (error) throw error;
  return { ticketId: data.id, status: 'imported' };
};

const recordMessage = async ({
  admin,
  companyId,
  connectionId,
  uid,
  parsedEmail,
  parseStatus,
  errorMessage,
  inboundTicketId,
}) => {
  await admin.from('inbound_email_messages').upsert({
    company_id: companyId,
    connection_id: connectionId,
    message_uid: uid,
    message_id: parsedEmail.messageId || null,
    subject: parsedEmail.subject || '',
    from_email: Array.isArray(parsedEmail.from?.value) ? parsedEmail.from.value[0]?.address || '' : '',
    received_at: parsedEmail.date ? parsedEmail.date.toISOString() : null,
    parse_status: parseStatus,
    error_message: errorMessage || null,
    inbound_ticket_id: inboundTicketId || null,
  }, { onConflict: 'connection_id,message_uid' });
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const { admin, profile } = await requireAdminProfile(req);
    const { data: connection, error: connectionError } = await admin
      .from('inbound_email_connections')
      .select('*')
      .eq('company_id', profile.companyId)
      .maybeSingle();

    if (connectionError) {
      return res.status(500).json({ error: connectionError.message });
    }
    if (!connection) {
      return res.status(404).json({ error: 'No inbound email connection is configured.' });
    }
    if (connection.auto_import === false && req.body?.force !== true) {
      return res.status(200).json({
        data: {
          importedCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          syncedAt: new Date().toISOString(),
        },
      });
    }

    const client = new ImapFlow({
      host: connection.host,
      port: connection.port,
      secure: connection.use_tls !== false,
      auth: {
        user: connection.username,
        pass: decryptSecret(connection.password_encrypted),
      },
      logger: false,
    });

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      await client.connect();
      await client.mailboxOpen(connection.mailbox || 'INBOX');
      const messageUids = await client.search({ seen: false });
      const targetUids = messageUids.slice(0, MAX_SYNC_MESSAGES);

      if (targetUids.length > 0) {
        for await (const message of client.fetch(targetUids, { uid: true, source: true })) {
          const { data: existingMessage } = await admin
            .from('inbound_email_messages')
            .select('id')
            .eq('connection_id', connection.id)
            .eq('message_uid', message.uid)
            .maybeSingle();

          if (existingMessage?.id) {
            skippedCount += 1;
            continue;
          }

          const parsedEmail = await simpleParser(message.source);
          const importDecision = shouldImportMessage(connection, parsedEmail);
          if (!importDecision.allowed) {
            skippedCount += 1;
            await recordMessage({
              admin,
              companyId: profile.companyId,
              connectionId: connection.id,
              uid: message.uid,
              parsedEmail,
              parseStatus: 'skipped',
              errorMessage: importDecision.reason,
            });
            continue;
          }

          try {
            const emailText = buildEmailText(parsedEmail);
            const parsed = await parseInboundEmail(emailText);
            const result = await upsertInboundTicketFromEmail({
              admin,
              companyId: profile.companyId,
              profile,
              parsed,
              emailText,
              subject: parsedEmail.subject || '',
              messageId: parsedEmail.messageId || '',
            });

            if (result.status === 'updated') updatedCount += 1;
            else importedCount += 1;

            await recordMessage({
              admin,
              companyId: profile.companyId,
              connectionId: connection.id,
              uid: message.uid,
              parsedEmail,
              parseStatus: result.status,
              inboundTicketId: result.ticketId,
            });

            await client.messageFlagsAdd(message.uid, ['\\Seen']);
          } catch (error) {
            failedCount += 1;
            await recordMessage({
              admin,
              companyId: profile.companyId,
              connectionId: connection.id,
              uid: message.uid,
              parsedEmail,
              parseStatus: 'failed',
              errorMessage: String(error?.message || 'Failed to import message.'),
            });
          }
        }
      }

      await admin
        .from('inbound_email_connections')
        .update({
          last_synced_at: new Date().toISOString(),
          last_error: failedCount > 0 ? `Failed to import ${failedCount} email(s).` : null,
          updated_by: profile.id,
        })
        .eq('id', connection.id);
    } finally {
      await client.logout().catch(() => {});
    }

    return res.status(200).json({
      data: {
        importedCount,
        updatedCount,
        skippedCount,
        failedCount,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({ error: String(error?.message || 'Sync failed.') });
  }
}
