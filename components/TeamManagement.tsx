
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

const TeamManagement: React.FC<TeamManagementProps> = ({ users, sessionUser, isDarkMode, onAddUser, onDeleteUser, onThemeChange, onToggleRole }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    role: UserRole.CREW
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username) return;
    onAddUser(formData);
    setFormData({ name: '', username: '', role: UserRole.CREW });
    setShowAddForm(false);
  };

  const copyFixSql = () => {
    navigator.clipboard.writeText(SQL_SCHEMA);
    alert("SQL FIX COPIED!\n\n1. Go to your Supabase Dashboard\n2. Open the SQL Editor\n3. Paste this code and click 'RUN'\n\nThis will fix the 'Infinite Recursion' error.");
  };

  const forceSyncProfile = async () => {
    setIsSyncing(true);
    try {
      const newProfile = await apiService.addUser({
        id: sessionUser.id,
        name: sessionUser.name,
        username: sessionUser.username,
        role: sessionUser.role
      });
      alert(`Success: Your profile has been re-registered in the database. Try adding a job now.`);
      window.location.reload();
    } catch (err: any) {
      alert(`Sync Failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const isAdmin = sessionUser.role === UserRole.ADMIN;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className={`p-8 rounded-[2.5rem] shadow-sm border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className={`text-xl font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>System Access</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Identity & Database Control</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
            <button 
              onClick={copyFixSql}
              className="flex-1 md:flex-none bg-rose-600 text-white px-4 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Recursion Fix SQL
            </button>
            <button 
              onClick={forceSyncProfile}
              disabled={isSyncing}
              className={`flex-1 md:flex-none px-4 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isDarkMode ? 'bg-white text-[#0f172a]' : 'bg-slate-900 text-white'}`}
            >
              {isSyncing ? 'Syncing...' : 'Sync Profile'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center px-4">
        <div>
          <h2 className={`text-xl font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Crew Registry</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{users.length} Active Profiles</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${showAddForm ? 'bg-slate-500 text-white' : 'bg-brand text-[#0f172a] shadow-lg shadow-brand/20'}`}
          >
            {showAddForm ? 'Cancel' : 'Register New'}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className={`p-8 rounded-[2rem] border animate-in slide-in-from-top-4 duration-300 ${isDarkMode ? 'bg-black/20 border-white/10' : 'bg-white border-slate-200 shadow-xl shadow-slate-100'}`}>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Name</label>
              <input required className={`w-full px-4 py-3 border rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand ${isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
              <input required className={`w-full px-4 py-3 border rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand ${isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Role</label>
              <select className={`w-full px-4 py-3 border rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand ${isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.CREW}>Crew</option>
                <option value={UserRole.ADMIN}>Admin</option>
              </select>
            </div>
            <button type="submit" className="bg-brand text-[#0f172a] px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest">Add User</button>
          </form>
        </div>
      )}

      <div className={`rounded-[2rem] shadow-sm border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'} border-b`}>
              <tr>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Crew Member</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
              {users.map(user => {
                const isSelf = user.id === sessionUser.id;
                return (
                  <tr key={user.id} className="group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border-2 ${isSelf ? 'bg-brand text-[#0f172a] border-brand' : 'bg-slate-100 text-slate-500 border-white'}`}>
                          {user.name.substring(0, 1)}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-sm font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{user.name} {isSelf && '(You)'}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest ${user.role === 'ADMIN' ? 'text-brand' : 'text-slate-400'}`}>{user.role}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      {isAdmin && !isSelf && (
                        <button onClick={() => onDeleteUser(user.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
    </div>
  );
};

export default TeamManagement;
