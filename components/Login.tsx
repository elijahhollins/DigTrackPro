
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email, password, options: { data: { display_name: name } }
        });
        if (signUpError) throw signUpError;
        if (data.user && data.session) window.location.reload();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-in">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden p-8 border border-slate-200">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-brand p-3 rounded-xl shadow-lg shadow-brand/20 mb-4">
              <svg className="w-8 h-8 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">DigTrack Pro</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{isSignUp ? 'Registration' : 'System Login'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-rose-50 text-rose-500 text-[10px] font-black uppercase text-center rounded-xl border border-rose-100">{error}</div>}
            
            {isSignUp && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Name</label>
                <input required type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand/10 transition-all" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
              <input required type="email" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand/10 transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
              <input required type="password" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand/10 transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <button disabled={isSubmitting} type="submit" className="w-full bg-brand text-slate-900 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-brand/10 mt-4 disabled:opacity-50">
              {isSubmitting ? '...' : (isSignUp ? "Sign Up" : "Sign In")}
            </button>
          </form>

          <button onClick={() => setIsSignUp(!isSignUp)} className="w-full mt-6 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-brand transition-colors text-center">
            {isSignUp ? 'Back to Login' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
