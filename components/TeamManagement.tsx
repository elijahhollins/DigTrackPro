
import React, { useState } from 'react';
import { UserRole, UserRecord, User } from '../types.ts';
import { apiService, SQL_SCHEMA } from '../services/apiService.ts';

interface TeamManagementProps {
  users: UserRecord[];
  sessionUser: User;
  isDarkMode?: boolean;
  onAddUser: (user: Partial<UserRecord>) => void;
  onDeleteUser: (id: string) => void;
  onThemeChange?: (color: string) => void;
  onToggleRole?: (user: UserRecord) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ 
  users = [], 
  sessionUser, 
  isDarkMode, 
  onAddUser, 
  onDeleteUser, 
  onThemeChange, 
  onToggleRole 
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSqlViewer, setShowSqlViewer] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: UserRole.CREW
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username) return;
    onAddUser(formData);
    setFormData({ name: '', username: '', password: '', role: UserRole.CREW });
    setShowAddForm(false);
  };

  const copyFixSql = () => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(SQL_SCHEMA);
        alert("SQL FIX COPIED!\n\n1. Go to your Supabase Dashboard\n2. Open the SQL Editor\n3. Paste this code and click 'RUN'");
      } else {
        setShowSqlViewer(true);
      }
    } catch (e) {
      setShowSqlViewer(true);
    }
  };

  const forceSyncProfile = async () => {
    if (!sessionUser) return;
    setIsSyncing(true);
    try {
      await apiService.addUser({
        id: sessionUser.id,
        name: sessionUser.name,
        username: sessionUser.username,
        role: sessionUser.role
      });
      alert(`Success: Your profile has been re-synchronized. If you still see database errors, please run the SQL Fix.`);
      window.location.reload();
    } catch (err: any) {
      alert(`Sync Failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const isAdmin = sessionUser?.role === UserRole.ADMIN;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* System Controls */}
      <div className={`p-8 rounded-[2.5rem] shadow-sm border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className={`text-xl font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>System Security</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Identity & Database Integrity</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
            <button 
              onClick={copyFixSql}
              className="flex-1 md:flex-none bg-rose-600 text-white px-5 py-3.5 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-900/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Recursion Fix SQL
            </button>
            <button 
              onClick={forceSyncProfile}
              disabled={isSyncing}
              className={`flex-1 md:flex-none px-5 py-3.5 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg ${isDarkMode ? 'bg-white text-[#0f172a]' : 'bg-slate-900 text-white shadow-slate-200'}`}
            >
              {isSyncing ? (
                <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              )}
              Sync My Profile
            </button>
          </div>
        </div>

        {showSqlViewer && (
          <div className="mt-8 animate-in slide-in-from-top-4 duration-500">
            <div className={`p-6 rounded-3xl border font-mono text-[10px] overflow-x-auto whitespace-pre ${isDarkMode ? 'bg-black/40 border-white/10 text-brand' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
              {SQL_SCHEMA}
            </div>
            <p className="mt-4 text-[9px] font-bold text-slate-500 text-center uppercase tracking-widest italic">Copy this code manually and run it in the Supabase SQL Editor</p>
          </div>
        )}
      </div>

      {/* Crew Header */}
      <div className="flex justify-between items-center px-4">
        <div>
          <h2 className={`text-xl font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Crew Registry</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{users.length} Active Profiles</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className={`px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${showAddForm ? 'bg-slate-500 text-white' : 'bg-brand text-[#0f172a] shadow-xl shadow-brand/30'}`}
          >
            {showAddForm ? 'Cancel Registration' : 'Register New User'}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className={`p-8 rounded-[2.5rem] border animate-in slide-in-from-top-4 duration-300 ${isDarkMode ? 'bg-black/20 border-white/10' : 'bg-white border-slate-200 shadow-xl shadow-slate-100'}`}>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
              <input required className={`w-full px-5 py-4 border rounded-xl text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email / Username</label>
              <input required type="email" className={`w-full px-5 py-4 border rounded-xl text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Secure Password</label>
              <input required type="password" className={`w-full px-5 py-4 border rounded-xl text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Base Role</label>
              <select className={`w-full px-5 py-4 border rounded-xl text-sm font-black outline-none focus:ring-4 focus:ring-brand/10 ${isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.CREW}>Crew Member</option>
                <option value={UserRole.ADMIN}>Administrator</option>
              </select>
            </div>
            <button type="submit" className="bg-brand text-[#0f172a] px-6 py-4.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/20 hover:scale-[1.02] transition-transform">Save Access</button>
          </form>
        </div>
      )}

      {/* User Table */}
      <div className={`rounded-[2.5rem] shadow-sm border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'} border-b`}>
              <tr>
                <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Crew Member</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">System Control</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
              {(users || []).map(user => {
                const isSelf = user?.id === sessionUser?.id;
                const userRole = user?.role || UserRole.CREW;
                const isAdminUser = userRole === UserRole.ADMIN;
                
                return (
                  <tr key={user?.id || Math.random().toString()} className="group hover:bg-slate-500/5 transition-colors">
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border-2 transition-all ${isSelf ? 'bg-brand text-[#0f172a] border-brand shadow-lg shadow-brand/20' : (isDarkMode ? 'bg-white/5 text-slate-400 border-white/5' : 'bg-slate-100 text-slate-500 border-white')}`}>
                          {(user?.name || 'U').substring(0, 1).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-base font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{user?.name || 'Unknown User'} {isSelf && '(You)'}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${isAdminUser ? 'bg-brand/10 text-brand' : 'text-slate-400 bg-slate-100'}`}>{userRole}</span>
                            <span className="text-[9px] font-bold text-slate-500 opacity-60 font-mono">@{user?.username || 'no-email'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7 text-right">
                      {isAdmin && !isSelf && (
                        <div className="flex items-center justify-end gap-3">
                          <button 
                            onClick={() => onToggleRole?.(user)}
                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${isAdminUser ? 'bg-slate-700 text-white border-slate-600' : (isDarkMode ? 'bg-white/5 text-slate-400 border-white/10 hover:text-brand' : 'bg-slate-50 text-slate-600 border-slate-100 hover:text-brand')}`}
                          >
                            {isAdminUser ? 'Make Crew' : 'Make Admin'}
                          </button>
                          <button 
                            onClick={() => onDeleteUser(user.id)} 
                            className="p-2.5 text-slate-400 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                            title="Remove Access"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(users || []).length === 0 && (
            <div className="py-20 text-center">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No access logs found in database</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamManagement;
