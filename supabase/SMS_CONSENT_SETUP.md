# SMS Consent — Setup & Verification

Everything needed to turn on per-user SMS consent capture and to satisfy Twilio
toll-free verification.

---

## 1. Apply the migration

Open **Supabase Dashboard → SQL Editor → New query**, paste the contents of
`supabase/migrations/20260808000000_add_sms_consent.sql`, and run it.

It creates:

| Object | Purpose |
|---|---|
| `sms_consent` table | Append-only consent history (one row per decision) |
| `profiles.sms_phone` / `sms_enabled` / `sms_consent_prompted_at` | Send-time lookup + backfill bookkeeping |
| `enforce_sms_columns_owner_only` trigger | Blocks any user from writing another user's number or SMS flag |
| `record_sms_consent()` | Writes a consent row; derives user, company, IP, and user agent server-side |
| `revoke_sms_consent()` | In-app opt-out |
| `mark_sms_consent_prompted()` | Dismissal of the one-time backfill modal |
| `revoke_sms_consent_by_phone()` | STOP handling, `service_role` only |
| `can_send_sms()` | Server-side mirror of the send-time gate |

The migration is safe to re-run.

---

## 2. Configure the Twilio inbound webhook

Deployed at `POST https://digtrack.app/api/twilio-sms-webhook`
(`api/twilio-sms-webhook.js`).

In the Twilio Console, set your number's **"A message comes in"** webhook to that
URL with method **HTTP POST**.

Then add these Vercel environment variables (Project → Settings → Environment
Variables):

| Variable | Value |
|---|---|
| `TWILIO_AUTH_TOKEN` | Account auth token — used to verify `X-Twilio-Signature` |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. **Server-only** — never prefix it with `VITE_` |
| `TWILIO_WEBHOOK_URL` | Optional. The exact URL configured in Twilio, if it differs from the request host |

Behaviour:

- Requests without a valid signature are rejected with **403**.
- `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` set `revoked_at` on
  every live consent row for that number and flip `profiles.sms_enabled` to
  false.
- `HELP` replies with the program help message.
- Anything that fails to parse still returns **200**, so Twilio does not retry
  in a loop.

---

## 3. Reviewer demo invite

Run `supabase/create_twilio_demo_invite.sql` to create a throwaway company and
invite tokens. Put the resulting `https://digtrack.app/?invite=<token>` URL in
the Twilio verification form's **additional information** field — not on the
public page. Re-run section 3 of that script to re-arm the tokens if the
reviewer consumes them.

---

## 4. Screenshots for the public page

`public/sms-opt-in.html` renders four numbered steps. Each shows a dashed
placeholder until the matching image exists — nothing is broken in the meantime,
but Twilio expects real screenshots, so capture them and save as:

```
public/sms-opt-in/step-1.png   Admin generates the invite link (Team & Settings)
public/sms-opt-in/step-2.png   Registration form opened from the invite link
public/sms-opt-in/step-3.png   Mobile number field + SMS consent checkbox
public/sms-opt-in/step-4.png   Confirmation / in-app opt-out control
```

The page is live at `https://digtrack.app/sms-opt-in` with no authentication.

---

## 5. Verifying the security properties

Run these in the SQL Editor. Replace the UUIDs with two real users from
different accounts.

**A user cannot read another user's consent rows** — as user A, via the app or
an anon-key session:

```sql
-- Returns 0 rows: the sms_consent_select_own policy scopes SELECT to auth.uid()
select * from sms_consent where user_id = '<user-B-uuid>';
```

**A user cannot update or delete any consent row** — RLS has no UPDATE or DELETE
policy on `sms_consent`, so both are rejected for every authenticated client:

```sql
update sms_consent set revoked_at = null where id = '<any-row>';  -- 0 rows
delete from sms_consent where id = '<any-row>';                   -- 0 rows
```

**A user cannot write another user's phone or SMS flag** — the trigger raises
`42501` regardless of what the UI allows:

```sql
update profiles set sms_phone = '+18155550123', sms_enabled = true
 where id = '<user-B-uuid>';
-- ERROR: sms_phone and sms_enabled can only be changed by the owning user
```

**The send-time gate refuses users without consent**:

```sql
select * from can_send_sms('<user-with-no-consent-row>');
-- allowed = false, reason = 'no_consent_record'
```

The TypeScript mirror of that rule set is covered by `npm test`
(`utils/smsConsent.test.ts`).

---

## 6. What is deliberately *not* here

- No admin-facing field anywhere writes another user's number. If a crew member
  needs alerts, they open **Team & Settings → Text Alerts** in their own account
  and opt in.
- No component or edge function may call Twilio directly. Every send path must
  go through `canSendSms()` in `services/smsService.ts` (or `can_send_sms()` in
  SQL for server-side senders).
