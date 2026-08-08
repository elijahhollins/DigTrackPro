import { apiService } from './apiService.ts';
import { evaluateSmsEligibility, SmsEligibility, SmsEligibilityInput } from '../utils/smsConsent.ts';

/**
 * The single send-time gate for SMS.
 *
 * Every send path must call this first and must not touch the Twilio client
 * directly. A message may only go out when the user has an unrevoked consent
 * row, `profiles.sms_enabled` is true, and a valid E.164 number is on file.
 *
 * Note on scope: `sms_consent` is readable only by its owner under RLS, so a
 * browser session asking about another user always lands on `no_consent_record`.
 * A background sender running with elevated credentials sees the real row.
 */
export const canSendSms = async (userId: string): Promise<SmsEligibility> => {
  if (!userId) return deny({ allowed: false, reason: 'missing_user_id' }, userId);

  const [consent, users] = await Promise.all([
    apiService.getLatestSmsConsent(userId),
    apiService.getUsers()
  ]);

  const profile = users.find(u => u.id === userId);
  if (!profile) return deny({ allowed: false, reason: 'profile_not_found' }, userId);

  const input: SmsEligibilityInput = {
    consent,
    smsEnabled: profile.smsEnabled === true,
    smsPhone: profile.smsPhone
  };

  const result = evaluateSmsEligibility(input);
  return result.allowed ? result : deny(result, userId);
};

const deny = (result: SmsEligibility, userId: string): SmsEligibility => {
  console.warn(`[SMS] send blocked for user ${userId || '(none)'}: ${result.reason}`);
  return result;
};
