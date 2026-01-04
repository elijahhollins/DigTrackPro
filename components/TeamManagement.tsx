
import React, { useState } from 'react';
import { UserRole, UserRecord, User } from '../types.ts';
import { apiService } from '../services/apiService.ts';

interface TeamManagementProps {
  users: UserRecord[];
  sessionUser: User;
  onAddUser: (user: Partial<UserRecord>) => void;
  onDeleteUser: (id: string) => void;
  onThemeChange?: (color: string) => void;
  onToggleRole?: (user: UserRecord) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ users, sessionUser, onAddUser, onDeleteUser, onThemeChange, onToggleRole }) => {
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

  const forceSyncProfile = async () => {
    setIsSyncing(true);
    try {
      const newProfile = await apiService.addUser({
        id: sessionUser.id,
        name: sessionUser.name,
        username: sessionUser.username,
        role: sessionUser.role
      });
      alert(`Success: Your profile has been re-registered in the database with ID ${newProfile.id}. Try adding a job now.`);
      window.location.reload();
    } catch (err: any) {
      alert(`Sync Failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const isAdmin = sessionUser.role === UserRole.ADMIN;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Your Identity</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Real-time Session Verification</p>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 flex flex-col min-w-[150px]">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Auth ID</span>
              <span className="text-[10px] font-mono font-bold text-slate-900 truncate">{sessionUser.id}</span>
            </div>
            <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 flex flex-col">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Session Permission</span>
              <span className={`text-[10px] font-black uppercase ${isAdmin ? 'text-brand' : 'text-slate-600'}`}>{sessionUser.role}</span>
            </div>
            <button 
              onClick={forceSyncProfile}
              disabled={isSyncing}
              className="bg-slate-950 text-white px-4 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
            >
              {isSyncing ? 'Syncing...' : 'Force Sync Profile'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Database Registry</h2>
          <p className="text-xs text-slate-600 font-bold uppercase tracking-widest mt-1">Managed Crew Profiles ({users.length})</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${showAddForm ? 'bg-slate-100 text-slate-700' : 'bg-brand text-[#0f172a] shadow-lg shadow-brand/20 hover:brightness-110'}`}
          >
            {showAddForm ? 'Cancel' : 'Register New Profile'}
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-white p-8 rounded-[2rem] border border-brand/20 shadow-xl shadow-brand/5 animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Display Name</label>
              <input required className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand transition-all text-slate-950" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Auth Email</label>
              <input required className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand transition-all text-slate-950" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Permission Tier</label>
              <select className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black outline-none focus:ring-2 focus:ring-brand transition-all appearance-none cursor-pointer text-slate-950" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.CREW}>Crew (Restricted)</option>
                <option value={UserRole.ADMIN}>Admin (Read/Write)</option>
              </select>
            </div>
            <button type="submit" className="bg-slate-950 text-white px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">Add User</button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-slate-900 uppercase tracking-widest">Crew Member</th>
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
                        <span className="text-[9px] font-bold text-slate-400 font-mono tracking-tight uppercase truncate max-w-[200px]">{user.id}</span>
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
                      <button onClick={() => onDeleteUser(user.id)} className="p-3 text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-2xl">
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
