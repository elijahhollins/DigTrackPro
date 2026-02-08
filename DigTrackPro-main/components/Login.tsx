
import React, { useState } from 'react';
import { User } from '../types.ts';
import { supabase } from '../lib/supabaseClient.ts';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResend, setShowResend] = useState(false);

  const handleResendEmail = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: window.location.origin
        }
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

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { 
            data: { display_name: name },
            emailRedirectTo: window.location.origin
          }
        });
        
        if (signUpError) throw signUpError;
        
        if (data.user && !data.session) {
          setInfo("Success! Check your email for a confirmation link.");
          setIsSignUp(false);
        } else if (data.session) {
          window.location.reload();
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        
        if (signInError) {
          if (signInError.message.toLowerCase().includes("confirm") || signInError.message.toLowerCase().includes("verified")) {
            setShowResend(true);
          }
          throw signInError;
        }
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex items-center justify-center p-4 z-[200]">
      <div className="w-full max-w-sm animate-in">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden p-8 border border-slate-200">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-brand p-3 rounded-xl shadow-lg shadow-brand/20 mb-4">
              <svg className="w-6 h-6 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">DigTrack Pro</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              {isSignUp ? 'New User Registration' : 'Site Portal Login'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 text-rose-600 text-[10px] font-black uppercase text-center rounded-xl border border-rose-100 flex flex-col gap-2">
                <span>{error}</span>
                {showResend && (
                  <button 
                    type="button"
                    onClick={handleResendEmail}
                    className="bg-rose-600 text-white py-1.5 rounded-lg text-[9px] hover:bg-rose-700 transition-colors"
                  >
                    Resend Verification Link
                  </button>
                )}
              </div>
            )}

            {info && (
              <div className="p-3 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase text-center rounded-xl border border-emerald-100">
                {info}
              </div>
            )}
            
            {isSignUp && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand/10 transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
              <input
                required
                type="email"
                placeholder="crew@company.com"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand/10 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
              <input
                required
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand/10 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full bg-brand text-[#0f172a] py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] transition-all shadow-xl shadow-brand/10 disabled:opacity-50 mt-2"
            >
              {isSubmitting ? 'Processing...' : isSignUp ? "Create Account" : "Access Terminal"}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-slate-100 pt-6">
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setInfo('');
                setShowResend(false);
              }}
              className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-brand transition-colors"
            >
              {isSignUp ? 'Existing User? Sign In' : "No Account? Sign Up Here"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
