import React from 'react';
import { consentTextSegments } from '../utils/smsConsent.ts';

interface SmsConsentFieldsProps {
  phone: string;
  onPhoneChange: (value: string) => void;
  consented: boolean;
  onConsentChange: (value: boolean) => void;
  /** Classes for the phone input, so the login screen and the in-app modal can each match their own surface. */
  inputClassName: string;
  labelClassName: string;
  consentTextClassName: string;
  idPrefix: string;
  disabled?: boolean;
}

/**
 * Mobile number + SMS consent checkbox, shared by the invite signup form and
 * the one-time backfill modal so both capture the identical, versioned copy.
 *
 * The checkbox is deliberately separate from any terms acceptance control, is
 * unchecked by default, and stays disabled until a number has been entered.
 * Leaving it unchecked is a valid outcome and never blocks the form.
 */
const SmsConsentFields: React.FC<SmsConsentFieldsProps> = ({
  phone,
  onPhoneChange,
  consented,
  onConsentChange,
  inputClassName,
  labelClassName,
  consentTextClassName,
  idPrefix,
  disabled = false,
}) => {
  const hasPhone = phone.trim().length > 0;
  const checkboxId = `${idPrefix}-sms-consent`;

  return (
    <>
      <div>
        <label className={labelClassName} htmlFor={`${idPrefix}-sms-phone`}>Mobile Number (optional)</label>
        <input
          id={`${idPrefix}-sms-phone`}
          type="tel"
          autoComplete="tel"
          placeholder="(815) 555-0123"
          className={inputClassName}
          value={phone}
          disabled={disabled}
          onChange={(e) => {
            onPhoneChange(e.target.value);
            if (e.target.value.trim() === '') onConsentChange(false);
          }}
        />
      </div>

      <div className="flex items-start gap-2.5">
        <input
          id={checkboxId}
          type="checkbox"
          checked={consented}
          disabled={disabled || !hasPhone}
          onChange={(e) => onConsentChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0 accent-[#3b82f6] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        />
        <label htmlFor={checkboxId} className={`${consentTextClassName} ${hasPhone ? 'cursor-pointer' : 'opacity-60'}`}>
          {consentTextSegments().map((segment, i) => (
            segment.href ? (
              <a
                key={i}
                href={segment.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline hover:opacity-80"
                onClick={(e) => e.stopPropagation()}
              >
                {segment.text}
              </a>
            ) : (
              <React.Fragment key={i}>{segment.text}</React.Fragment>
            )
          ))}
        </label>
      </div>
    </>
  );
};

export default SmsConsentFields;
