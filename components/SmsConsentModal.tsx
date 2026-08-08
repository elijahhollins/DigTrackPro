import React, { useState } from 'react';
import { User } from '../types.ts';
import { apiService } from '../services/apiService.ts';
import SmsConsentFields from './SmsConsentFields.tsx';
import { CONSENT_TEXT_VERSION, normalizeToE164 } from '../utils/smsConsent.ts';

interface SmsConsentModalProps {
  sessionUser: User;
  isDarkMode?: boolean;
  /** Called after the prompt is answered or dismissed; `smsEnabled` reflects what was stored. */
  onClose: (result: { smsEnabled: boolean; smsPhone?: string }) => void;
}

/**
 * One-time backfill prompt for users who created their account before SMS
 * consent capture existed. It is never a gate: dismissing it records
 * `sms_consent_prompted_at` so it does not come back, and the app stays fully
 * usable either way.
 */
const SmsConsentModal: React.FC<SmsConsentModalProps> = ({ sessionUser, isDarkMode, onClose }) => {
  const [phone, setPhone] = useState('');
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const inputCls = `w-full px-4 py-3 border rounded-xl text-sm font-medium outline-none transition-all ${
    isDarkMode
      ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-brand/50'
      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  }`;
  const labelCls = `block text-[9px] font-black uppercase tracking-[0.15em] mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`;
  const consentTextCls = `text-[11px] leading-relaxed font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`;

  const handleDismiss = async () => {
    setIsSaving(true);
    try {
      await apiService.markSmsConsentPrompted();
    } catch (err) {
      console.error('Failed to record SMS consent prompt dismissal:', err);
    } finally {
      setIsSaving(false);
      onClose({ smsEnabled: false });
    }
  };

  const handleSave = async () => {
    setError('');
    const normalized = normalizeToE164(phone);
    if (!normalized) {
      setError('Please enter a valid mobile number, for example (815) 555-0123.');
      return;
    }

    setIsSaving(true);
    try {
      await apiService.recordSmsConsent({
        userId: sessionUser.id,
        companyId: sessionUser.companyId,
        phone: normalized,
        consented,
        consentTextVersion: CONSENT_TEXT_VERSION,
        consentSource: 'backfill_modal'
      });
      onClose({ smsEnabled: consented, smsPhone: normalized });
    } catch (err) {
      console.error('Failed to record SMS consent:', err);
      setError('We could not save that right now. Please try again, or skip for now.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${isDarkMode ? 'bg-[#0f1e33] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className={`text-lg font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Get ticket alerts by text
          </h2>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isSaving}
            aria-label="Dismiss"
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${isDarkMode ? 'text-slate-500 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className={`text-xs mb-5 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          Optional. Add your own mobile number to receive locate ticket alerts. You can change this any time in Team &amp; Settings.
        </p>

        <div className="space-y-4">
          <SmsConsentFields
            phone={phone}
            onPhoneChange={setPhone}
            consented={consented}
            onConsentChange={setConsented}
            inputClassName={inputCls}
            labelClassName={labelCls}
            consentTextClassName={consentTextCls}
            idPrefix="backfill"
            disabled={isSaving}
          />

          {error && (
            <p className="text-[11px] font-semibold text-rose-500">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !phone.trim()}
              className="flex-1 bg-brand text-[#07101f] py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] transition-all disabled:opacity-50 hover:opacity-90 active:scale-[0.99]"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isSaving}
              className={`px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] border transition-all disabled:opacity-40 ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
            >
              Not Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmsConsentModal;
