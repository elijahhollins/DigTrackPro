import React, { useState } from 'react';
import { UserRole, UserRecord, User } from '../types.ts';
import { apiService, SQL_SCHEMA } from '../services/apiService.ts';

interface TeamManagementProps {
  users: UserRecord[];
  sessionUser: User;
  isDarkMode?: boolean;
  onAddUser: (user: Partial<UserRecord>) => Promise<void>;
  onDeleteUser: (id: string) => void;
  onThemeChange?: (color: string) => void;
  onToggleRole?: (user: UserRecord) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ 
  users = [], 
  sessionUser, 
  isDarkMode, 
  onDeleteUser, 
  onThemeChange, 
  onToggleRole 
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSqlViewer, setShowSqlViewer] = useState(false);

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
      alert(`Success: Your local profile is now synchronized with the cloud.`);
      window.location.reload();
    } catch (err: any) {
      alert(`Sync Failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const isAdmin = sessionUser?.role === UserRole.ADMIN;

  return (
    <div className="space-y-6 animate-in">
      <div className={`p-6 rounded-2xl shadow-sm border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="max-w-xl">
            <h2 className={`text-sm font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>System Administration</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Personnel & Access Control</p>
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              New crew members must <span className="text-brand font-black">Register</span> on the login screen to create their official credentials. Once they appear in the registry below, an administrator can promote them to the Admin role.
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={copyFixSql}
              className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 font-black text-[9px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm"
            >
              Fix Permissions SQL
            </button>
            <button 
              onClick={forceSyncProfile}
              disabled={isSyncing}
              className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border ${isDarkMode ? 'bg-white text-slate-900 border-white' : 'bg-slate-900 text-white border-slate-900'}`}
            >
              {isSyncing ? 'Syncing...' : 'Sync My Identity'}
            </button>
          </div>
        </div>

        {showSqlViewer && (
          <div className="mt-4 p-4 rounded-xl border font-mono text-[9px] overflow-x-auto whitespace-pre bg-black/40 border-white/10 text-brand">
            {SQL_SCHEMA}
          </div>
        )}
      </div>

      <div className={`rounded-2xl shadow-sm border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b border-black/5 flex justify-between items-center bg-black/5">
          <h2 className={`text-xs font-black tracking-tight uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Personnel Registry</h2>
          <span className="text-[9px] font-black text-slate-400 bg-black/5 px-2 py-1 rounded-md uppercase tracking-widest">{users.length} Active Records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} border-b border-black/5`}>
              <tr>
                <th className="px-6 py-3.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Crew Member</th>
                <th className="px-6 py-3.5 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Permissions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
              {(users || []).map(user => {
                const isSelf = user?.id === sessionUser?.id;
                const isAdminUser = user?.role === UserRole.ADMIN;
                
                return (
                  <tr key={user.id} className="group hover:bg-slate-500/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] border ${isSelf ? 'bg-brand text-[#0f172a] border-brand shadow-md' : 'bg-black/5 text-slate-400 border-transparent'}`}>
                          {(user.name || 'U').substring(0, 1).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-xs font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{user.name} {isSelf && '(Current)'}</span>
                          <span className="text-[9px] font-bold text-slate-500 opacity-60 font-mono tracking-tighter">{user.username}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${isAdminUser ? 'bg-brand/10 border-brand/20 text-brand' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                          {user.role}
                        </span>
                        {isAdmin && !isSelf && (
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => onToggleRole?.(user)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-brand hover:border-brand/40 transition-all bg-white shadow-sm"
                              title="Toggle Administrator Role"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            </button>
                            <button 
                              onClick={() => onDeleteUser(user.id)} 
                              className="p-1.5 text-slate-400 hover:text-rose-500 transition-all"
                              title="Revoke Portal Access"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )}
                      </div>
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