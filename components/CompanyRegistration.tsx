
import React, { useState } from 'react';

interface CompanyRegistrationProps {
  onComplete: (companyName: string, brandColor: string, city: string, state: string, phone: string) => Promise<void>;
  isDarkMode?: boolean;
}

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

const CompanyRegistration: React.FC<CompanyRegistrationProps> = ({ onComplete, isDarkMode = true }) => {
  const [companyName, setCompanyName] = useState('');
  const [brandColor, setBrandColor] = useState('#3b82f6');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!companyName.trim()) {
      setError('Company name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onComplete(companyName.trim(), brandColor, city.trim(), state.trim(), phone.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create company. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex items-center justify-center p-4 z-[200]" role="dialog" aria-modal="true" aria-labelledby="company-registration-title">
      <div className="w-full max-w-sm animate-in">
        <div className={`rounded-2xl shadow-2xl overflow-hidden p-8 border ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-brand p-3 rounded-xl shadow-lg shadow-brand/20 mb-4">
              <svg className="w-6 h-6 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 id="company-registration-title" className={`text-xl font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Company Setup</h1>
            <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`}>
              Create Your Organization
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-rose-50 text-rose-600 text-[10px] font-black uppercase text-center rounded-xl border border-rose-100">
                {error}
              </div>
            )}

            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Acme Utilities Inc."
                required
                className={`w-full px-4 py-3 border rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="Springfield"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
                />
              </div>
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  State
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  placeholder="IL"
                  maxLength={2}
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className={`w-full px-4 py-3 border rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
              />
            </div>

            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Brand Color
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBrandColor(color)}
                    className="w-8 h-8 rounded-full transition-all hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: color,
                      outline: brandColor === color ? `3px solid ${color}` : 'none',
                      outlineOffset: '2px'
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={brandColor}
                  onChange={e => setBrandColor(e.target.value)}
                  className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent"
                  title="Custom color"
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: brandColor }} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{brandColor}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-brand text-[#0f172a] py-3 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Company & Continue'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompanyRegistration;
