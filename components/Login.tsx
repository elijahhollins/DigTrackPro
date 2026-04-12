
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.ts';
import { apiService } from '../services/apiService.ts';

interface LoginProps {
  authError?: string;
}

const Login: React.FC<LoginProps> = ({ authError = '' }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [isValidatingInvite, setIsValidatingInvite] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token) {
      setInviteToken(token);
      setIsSignUp(true);
      setIsValidatingInvite(true);
      apiService.validateInviteToken(token).then(info => {
        if (info) {
          setInviteCompanyId(info.companyId);
          setCompanyName(info.companyName);
        } else {
          setError('This invite link is invalid or has already been used.');
        }
      }).catch(() => {
        setError('Could not validate invite link. Please try again.');
      }).finally(() => setIsValidatingInvite(false));
    }
  }, []);

  const handleResendEmail = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: { emailRedirectTo: window.location.origin }
      });
      if (resendError) throw resendError;
      setInfo("Verification email resent! Please check your inbox.");
      setShowResend(false);
    } catch (err: any) {
      setError(err.message || "Failed to resend email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setShowResend(false);
    setIsSubmitting(true);

    if (isSignUp && (!name || name.trim() === '')) {
      setError('Please enter your full name.');
      setIsSubmitting(false);
      return;
    }
    if (isSignUp && !inviteCompanyId && !companyName.trim()) {
      setError('Please enter your company name.');
      setIsSubmitting(false);
      return;
    }

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name.trim(),
              ...(inviteCompanyId
                ? { company_id: inviteCompanyId, invite_token: inviteToken }
                : { company_name: companyName.trim() }
              )
            },
            emailRedirectTo: window.location.origin
          }
        });
        if (signUpError) throw signUpError;
        if (data.user && !data.session) {
          setInfo("Success! Check your email for a confirmation link.");
          setIsSignUp(false);
        }
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          if (signInError.message.toLowerCase().includes("confirm") || signInError.message.toLowerCase().includes("verified")) {
            setShowResend(true);
          }
          throw signInError;
        }
        if (!signInData?.session) {
          throw new Error('Sign in failed: no session returned. Please try again.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full px-4 py-3 bg-[#0f1e33] border border-white/[0.08] rounded-xl text-sm font-medium text-white placeholder:text-slate-600 outline-none focus:border-brand/50 focus:bg-[#101f38] transition-all";
  const labelCls = "block text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-1.5";

  return (
    <div className="fixed inset-0 bg-[#07101f] flex z-[200]">
      {/* ── LEFT BRAND PANEL ── */}
      <div className="hidden lg:flex flex-col w-[420px] shrink-0 bg-[#0b1629] border-r border-white/[0.05] relative overflow-hidden p-10">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand/[0.04] rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-0 w-72 h-72 bg-brand/[0.03] rounded-full blur-3xl" />
          {/* Grid pattern */}
          <svg aria-hidden="true" className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Logo */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-16">
            <img src="/logo.svg" alt="Company logo" className="w-11 h-11 object-contain rounded-2xl" />
            <div>
              <p className="text-white text-sm font-black uppercase tracking-widest font-display">DigTrack Pro</p>
              <p className="text-slate-600 text-[9px] font-bold uppercase tracking-[0.2em]">Locate Management</p>
            </div>
          </div>

          <h2 className="text-4xl font-black text-white leading-tight tracking-tight font-display mb-4">
            Field-grade<br />
            <span className="text-brand">compliance</span><br />
            tools.
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed font-medium max-w-xs">
            Track every dig ticket, manage your crew, and stay ahead of expirations — all in one command center.
          </p>
        </div>

        {/* Feature list */}
        <div className="relative mt-auto space-y-3">
          {[
            { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', label: 'Real-time ticket tracking' },
            { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Expiry & renewal alerts' },
            { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', label: 'Multi-crew management' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-brand/10 border border-brand/15 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={f.icon} />
                </svg>
              </div>
              <span className="text-slate-400 text-[11px] font-semibold">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <img src="/logo.svg" alt="Company logo" className="w-10 h-10 object-contain rounded-2xl" />
            <div>
              <p className="text-white text-sm font-black uppercase tracking-widest">DigTrack Pro</p>
              <p className="text-slate-600 text-[9px] uppercase tracking-[0.15em]">Locate Management</p>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-black text-white tracking-tight font-display">
              {isSignUp ? 'Create account' : 'Welcome back'}
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              {isSignUp
                ? (inviteCompanyId ? 'Complete your admin registration' : 'Set up your crew account')
                : 'Sign in to your locate dashboard'
              }
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || authError) && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[11px] font-semibold flex flex-col gap-2">
                <span>{error || authError}</span>
                {showResend && (
                  <button
                    type="button"
                    onClick={handleResendEmail}
                    className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors self-start"
                  >
                    Resend Verification
                  </button>
                )}
              </div>
            )}
            {info && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-[11px] font-semibold">
                {info}
              </div>
            )}

            {isSignUp && (
              <div>
                <label className={labelCls}>Full Name</label>
                <input required type="text" placeholder="John Smith" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            {isSignUp && (
              <div>
                <label className={labelCls}>
                  Company Name
                  {inviteCompanyId && <span className="text-brand ml-1">· Invite ✓</span>}
                </label>
                <input
                  required={!inviteCompanyId}
                  type="text"
                  placeholder={isValidatingInvite ? 'Validating...' : 'Acme Utilities Inc.'}
                  className={`${inputCls} ${inviteCompanyId ? 'opacity-60 cursor-not-allowed' : ''}`}
                  value={isValidatingInvite ? '' : companyName}
                  onChange={(e) => !inviteCompanyId && setCompanyName(e.target.value)}
                  readOnly={!!inviteCompanyId || isValidatingInvite}
                />
              </div>
            )}

            <div>
              <label className={labelCls}>Email Address</label>
              <input required type="email" placeholder="crew@company.com" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input required type="password" placeholder="••••••••" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full bg-brand text-[#07101f] py-3.5 rounded-xl font-black text-[11px] uppercase tracking-[0.15em] transition-all shadow-lg shadow-brand/20 disabled:opacity-50 hover:opacity-90 active:scale-[0.99] mt-2"
            >
              {isSubmitting ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setInfo(''); setShowResend(false); }}
              className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-brand transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
