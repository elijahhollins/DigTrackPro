
import React, { useState } from 'react';
import { UserRole, UserRecord, User } from '../types.ts';

interface TeamManagementProps {
  users: UserRecord[];
  sessionUser: User;
  onAddUser: (user: Omit<UserRecord, 'id'>) => void;
  onDeleteUser: (id: string) => void;
  onThemeChange?: (color: string) => void;
  onToggleRole?: (user: UserRecord) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ users, sessionUser, onAddUser, onDeleteUser, onThemeChange, onToggleRole }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [customColor, setCustomColor] = useState('#ea580c');
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: UserRole.CREW
  });

  const themes = [
    { name: 'Safety', color: '#ea580c' },
    { name: 'Utility', color: '#2563eb' },
    { name: 'Gas', color: '#eab308' },
    { name: 'Water', color: '#10b981' },
    { name: 'Power', color: '#e11d48' },
    { name: 'Slate', color: '#475569' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username || !formData.password) return;
    onAddUser(formData);
    setFormData({ name: '', username: '', password: '', role: UserRole.CREW });
    setShowAddForm(false);
  };

  const handleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    onThemeChange?.(color);
  };

  const isAdmin = sessionUser.role === UserRole.ADMIN;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Interface Branding</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Global Visual System</p>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hex Value</span>
            <input 
              type="color" 
              value={customColor} 
              onChange={handleCustomColor}
              className="w-10 h-10 rounded-xl cursor-pointer border-none bg-transparent"
            />
            <span className="text-xs font-mono font-bold text-slate-800 uppercase">{customColor}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {themes.map(t => (
            <button
              key={t.name}
              onClick={() => {
                setCustomColor(t.color);
                onThemeChange?.(t.color);
              }}
              className="group flex flex-col items-center gap-3 p-4 rounded-3xl border border-slate-50 hover:bg-slate-50 transition-all"
            >
              <div 
                className="w-10 h-10 rounded-2xl shadow-lg transition-transform group-hover:scale-110" 
                style={{ backgroundColor: t.color }}
              />
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Crew Management</h2>
          <p className="text-xs text-slate-600 font-bold uppercase tracking-widest mt-1">Access Control List</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="px-4 py-2.5 rounded-2xl border-2 border-slate-100 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:bg-slate-50"
          >
            {showDebug ? 'Hide Debug' : 'Debug Session'}
          </button>
          {isAdmin && (
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${showAddForm ? 'bg-slate-100 text-slate-700' : 'bg-brand text-[#0f172a] shadow-lg shadow-brand/20 hover:brightness-110'}`}
            >
              {showAddForm ? 'Cancel' : 'Register New Crew'}
            </button>
          )}
        </div>
      </div>

      {showDebug && (
        <div className="bg-slate-900 p-8 rounded-[2rem] border border-white/5 shadow-2xl animate-in slide-in-from-top-4 duration-300">
          <h4 className="text-brand font-black text-[10px] uppercase tracking-[0.4em] mb-4">Identity Resolution Debugger</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-slate-500 text-[8px] font-black uppercase mb-1">Session UUID</p>
              <p className="text-white text-xs font-mono break-all">{sessionUser.id}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-slate-500 text-[8px] font-black uppercase mb-1">Session Email</p>
              <p className="text-white text-xs font-mono">{sessionUser.username}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-slate-500 text-[8px] font-black uppercase mb-1">Resolved Role</p>
              <p className={`text-xs font-black uppercase ${isAdmin ? 'text-brand' : 'text-rose-500'}`}>{sessionUser.role}</p>
            </div>
          </div>
          <p className="mt-4 text-slate-400 text-[9px] font-medium leading-relaxed">
            Note: The app grants permissions by matching your Session Email or UUID to a record in the registry below. 
            If your email is listed but you aren't an Admin, use the "Toggle Role" button below.
          </p>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white p-8 rounded-3xl border border-brand/20 shadow-xl shadow-brand/5 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
              <input required className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand transition-all text-slate-950" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Username/Email</label>
              <input required className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand transition-all text-slate-950" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
              <input required type="text" className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand transition-all text-slate-950" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Role</label>
              <div className="flex gap-2">
                <select className="flex-1 px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand transition-all appearance-none cursor-pointer text-slate-950" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                  <option value={UserRole.CREW}>Crew</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
                <button type="submit" className="bg-slate-950 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">Create</button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-slate-900 uppercase tracking-widest">Team Member</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-900 uppercase tracking-widest">Permissions</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => {
              const isSelf = user.id === sessionUser.id || user.username.toLowerCase() === sessionUser.username.toLowerCase();
              return (
                <tr key={user.id} className={`hover:bg-slate-50 transition-colors group ${isSelf ? 'bg-brand/5' : ''}`}>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border-2 shadow-sm ${isSelf ? 'bg-brand text-[#0f172a] border-brand' : 'bg-slate-100 text-slate-500 border-white'}`}>
                        {user.name.substring(0, 1)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-950">{user.name} {isSelf && '(You)'}</span>
                        <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tight">{user.username}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <button 
                      onClick={() => isAdmin && onToggleRole?.(user)}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${isAdmin ? 'hover:scale-105 cursor-pointer' : 'cursor-default'} ${user.role === UserRole.ADMIN ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      {user.role}
                    </button>
                  </td>
                  <td className="px-8 py-5 text-right">
                    {isAdmin && !isSelf && (
                      <button onClick={() => onDeleteUser(user.id)} className="p-3 text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-2xl" title="Delete Account">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeamManagement;
