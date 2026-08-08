import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SMS_CONSENT_TEXT,
  consentTextSegments,
  evaluateSmsEligibility,
  normalizeToE164,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from './smsConsent.ts';

const consented = {
  id: 'c1',
  consented: true,
  consentedAt: Date.now(),
  revokedAt: null,
  phone: '+18155550123',
};

test('a user with no consent row can never be sent to', () => {
  const result = evaluateSmsEligibility({
    consent: null,
    smsEnabled: true,
    smsPhone: '+18155550123',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'no_consent_record');
  assert.equal(result.phone, undefined);
});

test('a recorded decline blocks sending', () => {
  const result = evaluateSmsEligibility({
    consent: { ...consented, consented: false },
    smsEnabled: true,
    smsPhone: '+18155550123',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'consent_declined');
});

test('a revoked consent blocks sending even when sms_enabled drifted true', () => {
  const result = evaluateSmsEligibility({
    consent: { ...consented, revokedAt: Date.now() },
    smsEnabled: true,
    smsPhone: '+18155550123',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'consent_revoked');
});

test('sms_enabled false blocks sending', () => {
  const result = evaluateSmsEligibility({ consent: consented, smsEnabled: false, smsPhone: '+18155550123' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'sms_disabled');
});

test('a missing or malformed number blocks sending', () => {
  assert.equal(evaluateSmsEligibility({ consent: consented, smsEnabled: true, smsPhone: null }).reason, 'invalid_phone');
  assert.equal(evaluateSmsEligibility({ consent: consented, smsEnabled: true, smsPhone: '8155550123' }).reason, 'invalid_phone');
});

test('a fully consented user is allowed and carries the phone through', () => {
  const result = evaluateSmsEligibility({ consent: consented, smsEnabled: true, smsPhone: '+18155550123' });
  assert.equal(result.allowed, true);
  assert.equal(result.phone, '+18155550123');
  assert.equal(result.reason, undefined);
});

test('normalizeToE164 handles the formats a crew member actually types', () => {
  assert.equal(normalizeToE164('(815) 555-0123'), '+18155550123');
  assert.equal(normalizeToE164('815-555-0123'), '+18155550123');
  assert.equal(normalizeToE164('18155550123'), '+18155550123');
  assert.equal(normalizeToE164('+1 815 555 0123'), '+18155550123');
  assert.equal(normalizeToE164('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizeToE164('555-0123'), null);
  assert.equal(normalizeToE164(''), null);
  assert.equal(normalizeToE164(undefined), null);
});

test('rendered consent segments reassemble into the stored consent text', () => {
  const segments = consentTextSegments();
  assert.equal(segments.map(s => s.text).join(''), SMS_CONSENT_TEXT);

  const linked = segments.filter(s => s.href);
  assert.deepEqual(
    linked.map(s => [s.text, s.href]),
    [['Privacy Policy', PRIVACY_POLICY_URL], ['Terms', TERMS_URL]],
  );
});
