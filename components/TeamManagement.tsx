
import React, { useState, useEffect } from 'react';
import { UserRole, UserRecord, User } from '../types.ts';
import { apiService } from '../services/apiService.ts';

interface TeamManagementProps {
  users: UserRecord[];
  sessionUser: User;
  isDarkMode?: boolean;
  onAddUser: (user: Partial<UserRecord>) => Promise<void>;
  onDeleteUser: (id: string) => void;
  onThemeChange?: (color: string) => void;
  onToggleRole?: (user: UserRecord) => void;
}

const BRAND_COLORS = [
  { name: 'Safety Orange', hex: '#f59e0b' },
  { name: 'Electric Blue', hex: '#3b82f6' },
  { name: 'Construction Yellow', hex: '#fbbf24' },
  { name: 'Utility Pink', hex: '#ec4899' },
  { name: 'Safety Green', hex: '#10b981' },
  { name: 'Gas Yellow', hex: '#eab308' },
  { name: 'Water Blue', hex: '#0ea5e9' },
  { name: 'Sewer Green', hex: '#65a30d' },
  { name: 'Telecom Orange', hex: '#ea580c' },
  { name: 'Power Red', hex: '#e11d48' },
];

const TeamManagement: React.FC<TeamManagementProps> = ({ 
  users = [], 
  sessionUser, 
  isDarkMode, 
  onDeleteUser, 
  onThemeChange, 
  onToggleRole 
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'default'>(Notification.permission);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);

  const isAdmin = sessionUser?.role === UserRole.ADMIN;

  const handleEnablePush = async () => {
    setIsRegisteringPush(true);
    try {
      const permission = await Notification.requestPermission();
      setPushStatus(permission);
      
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        try {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            // Updated with the user provided VAPID Public Key
            applicationServerKey: 'BMuI79vwIgC-aZR9pJOBtg0HU6r_WmLVWZXY97jYxgnyHLDzSe7JbWwFqMALq3OsC7vCbgdyxI_fTyATo_GLvwY'
          });
          await apiService.savePushSubscription(sessionUser.id, subscription);
          alert("Push notifications enabled successfully.");
        } catch (subErr) {
          console.warn("Push subscription failed:", subErr);
          // Fallback: Notify user that local-only notifications are active
          alert("Native alerts enabled for this browser session.");
        }
      }
    } catch (err) {
      alert("Notification setup failed.");
    } finally {
      setIsRegisteringPush(false);
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

  return (
    <div className="space-y-8 animate-in">
      {/* Push Notification Toggle for Admins */}
      {isAdmin && (
        <section className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                Admin Desktop Alerts
              </h3>
              <p className={`text-[10px] font-bold uppercase tracking-tighter mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Get notified of No Shows and manual refresh requests.
              </p>
            </div>
            <button 
              onClick={handleEnablePush}
              disabled={pushStatus === 'granted' || isRegisteringPush}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                pushStatus === 'granted' 
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                : 'bg-brand text-slate-900 shadow-lg shadow-brand/20 hover:scale-105 active:scale-95'
              }`}
            >
              {isRegisteringPush ? 'Setting up...' : pushStatus === 'granted' ? 'Alerts Active' : 'Enable Alerts'}
            </button>
          </div>
          {pushStatus === 'denied' && (
            <p className="text-[9px] font-bold text-rose-500 uppercase">
              Notifications blocked by browser. Reset site permissions to enable.
            </p>
          )}
        </section>
      )}

      {/* Theme Selection */}
      <section className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          App Branding & Colors
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {BRAND_COLORS.map(color => (
            <button
              key={color.hex}
              onClick={() => onThemeChange?.(color.hex)}
              className="group flex items-center gap-3 p-2 rounded-xl border border-transparent hover:border-brand/20 hover:bg-brand/5 transition-all text-left"
            >
              <div 
                className="w-8 h-8 rounded-lg border-2 border-white/10 shadow-lg shrink-0"
                style={{ backgroundColor: color.hex }}
              />
              <div className="overflow-hidden">
                <span className="block text-[9px] font-black uppercase tracking-tight truncate">{color.name}</span>
                <span className="block text-[8px] font-mono opacity-40">{color.hex}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* User Management */}
      <section className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Authorized Personnel</h3>
          {isAdmin && (
            <button 
              onClick={forceSyncProfile}
              disabled={isSyncing}
              className="text-[9px] font-black uppercase tracking-widest text-brand bg-brand/10 px-3 py-1.5 rounded-lg hover:bg-brand hover:text-slate-900 transition-all flex items-center gap-2"
            >
              {isSyncing ? 'Syncing...' : 'Sync My Profile'}
            </button>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} text-[9px] font-black uppercase tracking-[0.2em] text-slate-500`}>
              <tr>
                <th className="px-6 py-3">Full Name</th>
                <th className="px-6 py-3">Email / ID</th>
                <th className="px-6 py-3">Role Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
              {users.map(user => (
                <tr key={user.id} className="text-xs font-bold transition-colors hover:bg-black/5">
                  <td className="px-6 py-4">{user.name}</td>
                  <td className="px-6 py-4 opacity-40 font-mono text-[10px]">{user.username}</td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => isAdmin && onToggleRole?.(user)}
                      disabled={!isAdmin || user.id === sessionUser.id}
                      className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all ${
                        user.role === UserRole.ADMIN 
                          ? 'bg-brand/10 border-brand/20 text-brand' 
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      } ${isAdmin && user.id !== sessionUser.id ? 'hover:scale-105 active:scale-95' : 'opacity-50 cursor-not-allowed'}`}
                    >
                      {user.role}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isAdmin && user.id !== sessionUser.id && (
                      <button 
                        onClick={() => { if(confirm(`Remove ${user.name} access?`)) onDeleteUser(user.id); }}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
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
      </section>
    </div>
  );
};

export default TeamManagement;
