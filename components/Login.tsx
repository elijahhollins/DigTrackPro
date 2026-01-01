
import React, { useState } from 'react';
import { UserRole, User, UserRecord } from '../types';

export default ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [u, setU] = useState('admin');
  const [p, setP] = useState('admin123');
  const [err, setErr] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const users: UserRecord[] = JSON.parse(localStorage.getItem('dig_users_db') || '[]');
    const auth = users.find(x => x.username === u && x.password === p);
    if (auth) onLogin(auth); else setErr('Invalid credentials');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl shadow-blue-100 border border-blue-50 w-full max-w-md text-center">
        <div className="bg-blue-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-200">
           <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" /></svg>
        </div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">DigTrack Pro</h1>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-10">Secured Site Interface</p>
        <form onSubmit={submit} className="space-y-6">
          <input type="text" placeholder="Username" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all" value={u} onChange={e => setU(e.target.value)} />
          <input type="password" placeholder="Password" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all" value={p} onChange={e => setP(e.target.value)} />
          {err && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest">{err}</p>}
          <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">Establish Access</button>
        </form>
      </div>
    </div>
  );
};
