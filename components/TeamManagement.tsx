import React, { useState } from 'react';
import { UserRole, UserRecord } from '../types.ts';

interface TeamManagementProps {
  users: UserRecord[];
  currentUserId: string;
  onAddUser: (user: Omit<UserRecord, 'id'>) => void;
  onDeleteUser: (id: string) => void;
  onThemeChange?: (color: string) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ users, currentUserId, onAddUser, onDeleteUser, onThemeChange }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: UserRole.CREW
  });

  const themes = [
    { name: 'Safety Orange', color: '#ea580c' },
    { name: 'Utility Blue', color: '#2563eb' },
    { name: 'Gas Yellow', color: '#eab308' },
    { name: 'Water Green', color: '#10b981' },
    { name: 'Power Red', color: '#e11d48' },
    { name: 'Slate Gray', color: '#475569' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username || !formData.password) return;
    onAddUser(formData);
    setFormData({ name: '', username: '', password: '', role: UserRole.CREW });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Visual Branding</h2>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select your organization's primary color</p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mt-6">
          {themes.map(t => (
            <button
              key={t.name}
              onClick={() => onThemeChange?.(t.color)}
              className="group flex flex-col items-center gap-3 p-4 rounded-3xl border border-slate-50 hover:bg-slate-50 transition-all"
            >
              <div 
                className="w-10 h-10 rounded-2xl shadow-lg transition-transform group-hover:scale-110" 
                style={{ backgroundColor: t.color }}
              />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Team Management</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Manage platform access and permissions</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${showAddForm ? 'bg-slate-100 text-slate-600' : 'bg-brand text-white shadow-lg shadow-brand hover:brightness-110'}`}
        >
          {showAddForm ? 'Close Panel' : 'Add New Member'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-8 rounded-3xl border border-brand/20 shadow-xl shadow-brand/5 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
              <input 
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-brand transition-all"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
              <input 
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-brand transition-all"
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Initial Password</label>
              <input 
                required
                type="text"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-brand transition-all"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Role</label>
              <div className="flex gap-2">
                <select 
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-brand transition-all appearance-none cursor-pointer"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                >
                  <option value={UserRole.CREW}>Field Crew</option>
                  <option value={UserRole.ADMIN}>Administrator</option>
                </select>
                <button type="submit" className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all">Add</button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Username</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-8 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 text-xs uppercase">
                      {user.name.substring(0, 1)}
                    </div>
                    <span className="text-sm font-bold text-slate-800">{user.name}</span>
                    {user.id === currentUserId && (
                      <span className="bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">You</span>
                    )}
                  </div>
                </td>
                <td className="px-8 py-5">
                  <span className="text-xs font-mono font-bold text-slate-400 lowercase">{user.username}</span>
                </td>
                <td className="px-8 py-5">
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${user.role === UserRole.ADMIN ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-8 py-5 text-right">
                  {user.id !== currentUserId && (
                    <button 
                      onClick={() => onDeleteUser(user.id)}
                      className="p-2 text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeamManagement;