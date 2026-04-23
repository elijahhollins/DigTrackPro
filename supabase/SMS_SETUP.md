# SMS Notifications Setup (Twilio)

DigTrackPro sends SMS alerts to the company admin phone number whenever a foreman logs a **No Show** or submits a **Refresh Request**. Notifications are delivered via a Supabase Edge Function that calls the Twilio REST API.

---

## Prerequisites

- A Twilio account with a provisioned phone number capable of sending SMS
- The Supabase CLI installed (`npm install -g supabase`)
- You are logged in: `supabase login`

---

## Step 1 — Deploy the Edge Function

From the repository root:

```bash
supabase functions deploy send-sms --project-ref <your-project-ref>
```

Your project ref is the subdomain in your Supabase URL (e.g. `fusubnzndmngjfgatzrq`).

---

## Step 2 — Set Twilio Secrets

```bash
supabase secrets set \
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_AUTH_TOKEN=your_auth_token \
  TWILIO_FROM_NUMBER=+15551234567 \
  --project-ref <your-project-ref>
```

| Secret | Where to find it |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info |
| `TWILIO_FROM_NUMBER` | Twilio Console → Phone Numbers (your purchased number, E.164 format e.g. `+15551234567`) |

---

## Step 3 — Set the Admin Notification Phone Number

SMS alerts are sent to the **company phone number** stored in DigTrackPro.

1. Log in as an **Admin** or **Super Admin**
2. Go to **Team** → Company Settings (or Super Admin panel for other companies)
3. Set the **Phone** field to the mobile number that should receive alerts (E.164 format, e.g. `+15551234567`)

> **Note:** The destination number must be a mobile number capable of receiving SMS. If you have a Twilio trial account, the number must be verified in the Twilio console.

---

## How It Works

- When a foreman taps **Log No Show Event**, the app calls the `send-sms` Edge Function after saving the record
- When a foreman taps **Request Refresh**, the app calls `send-sms` after toggling the flag on
- The Edge Function authenticates the caller via Supabase JWT, then posts to `api.twilio.com`
- Errors are logged to the browser console but do not interrupt the normal save flow

---

## Troubleshooting

| Symptom | Check |
|---|---|
| No SMS received | Verify secrets are set (`supabase secrets list`) and the company phone number is saved |
| Function returns 500 | View function logs: `supabase functions logs send-sms --project-ref <ref>` |
| Twilio error "not a valid phone number" | Ensure numbers are E.164 format (`+1...`) |
| Trial account error | Verify the destination number in the Twilio console |
