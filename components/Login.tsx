import React, { useState } from 'react';
import { UserRole, User } from '../types.ts';
import { supabase } from '../lib/supabaseClient.ts';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message || 'Login failed. Please check your email and password.');
      }

      if (!authData.user) {
        throw new Error('Authentication succeeded but no user data was returned.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        throw new Error(`Profile access error: ${profileError.message}. Check database permissions.`);
      }

      if (!profile) {
        onLogin({
          id: authData.user.id,
          name: authData.user.email?.split('@')[0] || 'Unknown User',
          username: authData.user.email?.split('@')[0] || 'unknown',
          role: UserRole.CREW
        });
      } else {
        onLogin({
          id: profile.id,
          name: profile.name,
          username: profile.username,
          role: profile.role as UserRole
        });
      }
    } catch (err: any) {
      console.error('Login detailed error:', err);
      setError(err.message || 'An unexpected error occurred during login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-100 flex items-center justify-center p-4 z-[200]">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-[3rem] shadow-2xl shadow-brand/10 overflow-hidden p-10 md:p-12 border border-slate-200">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="bg-brand p-4 rounded-3xl shadow-xl shadow-brand/20 mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">DigTrack Pro</h1>
            <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px] mt-3">Construction Site Access</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-center animate-in fade-in zoom-in duration-200">
                <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </span>
                <input
                  required
                  type="email"
                  placeholder="admin@company.com"
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm font-bold text-slate-950 outline-none focus:ring-4 focus:ring-brand/10 focus:border-brand focus:bg-white transition-all placeholder:text-slate-400"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1">Secure Password</label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </span>
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm font-bold text-slate-950 outline-none focus:ring-4 focus:ring-brand/10 focus:border-brand focus:bg-white transition-all placeholder:text-slate-400"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full bg-brand hover:brightness-110 text-white py-5 rounded-[1.25rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-brand/20 disabled:opacity-50 flex items-center justify-center gap-3 mt-4"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Enter Dashboard
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-100 flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            <span>© 2025 DIGTRACK SYSTEMS</span>
            <span>PRO VERSION 4.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;