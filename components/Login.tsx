
import React, { useState } from 'react';
import { UserRole, User, UserRecord } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    setTimeout(() => {
      const savedUsersStr = localStorage.getItem('dig_users_db_v1');
      let users: UserRecord[] = [];
      
      if (savedUsersStr) {
        users = JSON.parse(savedUsersStr);
      } else { // Fallback if local storage is empty
        users = [
          { id: '1', name: 'Admin User', username: 'admin', password: 'admin123', role: UserRole.ADMIN },
          { id: '2', name: 'Field Tech', username: 'crew', password: 'crew123', role: UserRole.CREW }
        ];
      }

      const normalizedInput = username.toLowerCase();
      const authenticatedUser = users.find(u => u.username.toLowerCase() === normalizedInput && u.password === password);
      
      if (authenticatedUser) {
        onLogin({
          id: authenticatedUser.id,
          name: authenticatedUser.name,
          username: authenticatedUser.username,
          role: authenticatedUser.role
        });
      } else {
        setError('Invalid username or password.');
        setIsSubmitting(false);
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-4 z-[100]">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-[3rem] shadow-2xl shadow-blue-100/50 overflow-hidden p-10 md:p-12 border border-blue-50">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="bg-blue-600 p-4 rounded-3xl shadow-xl shadow-blue-200 mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">DigTrack Pro</h1>
            <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px] mt-3">Construction Site Access</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl text-center">
                <p className="text-rose-500 text-xs font-black uppercase tracking-widest">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Account Username</label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-slate-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </span>
                <input
                  required
                  type="text"
                  placeholder="admin"
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-slate-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </span>
                <input
                  required
                  type="password"
                  placeholder="admin123"
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              disabled={isSubmitting}
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[1.25rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-3 mt-4"
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

          <div className="mt-10 pt-8 border-t border-slate-50 flex justify-between items-center text-[9px] font-bold text-slate-300 uppercase tracking-widest">
            <span>© 2024 DIGTRACK SYSTEMS</span>
            <span>SECURE v2.5</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
