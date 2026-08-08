/**
 * Single source of truth for SMS consent copy and eligibility rules.
 *
 * The version string and the rendered text live side by side on purpose: the
 * string stored in `sms_consent.consent_text_version` must always identify the
 * exact wording the user saw. Bump CONSENT_TEXT_VERSION whenever
 * SMS_CONSENT_TEXT changes.
 */

export const CONSENT_TEXT_VERSION = 'v1-2026-08';

export const SMS_CONSENT_TEXT =
  'I agree to receive SMS text messages from DigTrack Pro about my locate tickets, ' +
  'including status updates, expiration reminders, and crew assignment alerts. ' +
  'Message frequency varies. Message and data rates may apply. Reply STOP to opt out ' +
  'or HELP for help. See our Privacy Policy and Terms.';

export const PRIVACY_POLICY_URL = 'https://digtrack.app/privacy';
export const TERMS_URL = 'https://digtrack.app/terms';

export interface ConsentTextSegment {
  text: string;
  href?: string;
}

/**
 * Splits SMS_CONSENT_TEXT into plain and linked segments so the rendered
 * checkbox label is derived from the same string that gets versioned and
 * stored, rather than being retyped as JSX.
 */
export const consentTextSegments = (): ConsentTextSegment[] => {
  const links: Array<{ label: string; href: string }> = [
    { label: 'Privacy Policy', href: PRIVACY_POLICY_URL },
    { label: 'Terms', href: TERMS_URL },
  ];

  let rest = SMS_CONSENT_TEXT;
  const segments: ConsentTextSegment[] = [];

  for (const link of links) {
    const index = rest.indexOf(link.label);
    if (index === -1) continue;
    if (index > 0) segments.push({ text: rest.slice(0, index) });
    segments.push({ text: link.label, href: link.href });
    rest = rest.slice(index + link.label.length);
  }
  if (rest) segments.push({ text: rest });

  return segments;
};

const E164 = /^\+[1-9]\d{7,14}$/;

export const isE164 = (phone: string | null | undefined): boolean =>
  typeof phone === 'string' && E164.test(phone);

/**
 * Normalizes user input to E.164, assuming a North American number when no
 * country code is given. Returns null when the input cannot be a valid number.
 */
export const normalizeToE164 = (input: string | null | undefined): string | null => {
  if (!input) return null;

  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return null;

  if (hasPlus) {
    const candidate = `+${digits}`;
    return E164.test(candidate) ? candidate : null;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return null;
};

export type ConsentSource = 'invite_signup' | 'backfill_modal' | 'account_settings';

export interface SmsConsentRow {
  id: string;
  consented: boolean;
  consentedAt: number;
  revokedAt?: number | null;
  phone: string;
}

export interface SmsEligibilityInput {
  /** Newest consent row for the user, or null when none exists. */
  consent: SmsConsentRow | null;
  smsEnabled: boolean;
  smsPhone?: string | null;
}

export interface SmsEligibility {
  allowed: boolean;
  phone?: string;
  reason?: string;
}

/**
 * Pure send-time rule set. Kept free of I/O so it can be tested directly and
 * mirrored by public.can_send_sms() in SQL.
 */
export const evaluateSmsEligibility = ({ consent, smsEnabled, smsPhone }: SmsEligibilityInput): SmsEligibility => {
  if (!consent) return { allowed: false, reason: 'no_consent_record' };
  if (!consent.consented) return { allowed: false, reason: 'consent_declined' };
  if (consent.revokedAt) return { allowed: false, reason: 'consent_revoked' };
  if (!smsEnabled) return { allowed: false, reason: 'sms_disabled' };
  if (!isE164(smsPhone)) return { allowed: false, reason: 'invalid_phone' };
  return { allowed: true, phone: smsPhone as string };
};
