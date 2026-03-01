
import React, { useState } from 'react';
import { UserRole, UserRecord, User, Company } from '../types.ts';
import { apiService } from '../services/apiService.ts';

interface TeamManagementProps {
  users: UserRecord[];
  sessionUser: User;
  company?: Company;
  isDarkMode?: boolean;
  hasApiKey: boolean;
  isSuperAdmin?: boolean;
  allCompanies?: Company[];
  onCompanyCreated?: (company: Company) => void;
  onCompanyUpdated?: (id: string, updates: { name?: string; city?: string; state?: string; phone?: string }) => Promise<void>;
  onAddUser: (user: Partial<UserRecord>) => Promise<void>;
  onDeleteUser: (id: string) => void;
  onThemeChange?: (color: string) => void;
  onToggleRole?: (user: UserRecord) => void;
  onOpenSelectKey?: () => Promise<void>;
  onUpdateUserName?: (id: string, name: string) => Promise<void>;
  onSendPasswordReset?: (email: string) => Promise<void>;
  onUpdateCurrentUserPassword?: (password: string) => Promise<void>;
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
  company,
  isDarkMode, 
  hasApiKey,
  isSuperAdmin = false,
  allCompanies = [],
  onCompanyCreated,
  onCompanyUpdated,
  onDeleteUser, 
  onThemeChange, 
  onToggleRole,
  onOpenSelectKey,
  onUpdateUserName,
  onSendPasswordReset,
  onUpdateCurrentUserPassword
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'default'>(Notification.permission);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);

  // Platform admin state (super-admin only)
  const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
  const [newCoName, setNewCoName] = useState('');
  const [newCoColor, setNewCoColor] = useState('#3b82f6');
  const [newCoCity, setNewCoCity] = useState('');
  const [newCoState, setNewCoState] = useState('');
  const [newCoPhone, setNewCoPhone] = useState('');
  const [isCreatingCo, setIsCreatingCo] = useState(false);
  const [loadingCompanyIds, setLoadingCompanyIds] = useState<Set<string>>(new Set());
  const [latestInviteUrl, setLatestInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(new Set());

  // Edit company state (super-admin only)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCoName, setEditCoName] = useState('');
  const [editCoCity, setEditCoCity] = useState('');
  const [editCoState, setEditCoState] = useState('');
  const [editCoPhone, setEditCoPhone] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Inline user name editing state (admin)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserNameValue, setEditUserNameValue] = useState('');
  const [isSavingUserName, setIsSavingUserName] = useState(false);

  // My Profile editing state (all users)
  const [myName, setMyName] = useState(sessionUser?.name || '');
  const [myNewPassword, setMyNewPassword] = useState('');
  const [myConfirmPassword, setMyConfirmPassword] = useState('');
  const [isSavingMyProfile, setIsSavingMyProfile] = useState(false);

  const isAdmin = sessionUser?.role === UserRole.ADMIN || isSuperAdmin;

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
            applicationServerKey: 'BMuI79vwIgC-aZR9pJOBtg0HU6r_WmLVWZXY97jYxgnyHLDzSe7JbWwFqMALq3OsC7vCbgdyxI_fTyATo_GLvwY'
          });
          await apiService.savePushSubscription(sessionUser.id, subscription);
          alert("Push notifications enabled successfully.");
        } catch (subErr) {
          console.warn("Push subscription failed:", subErr);
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

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoName.trim()) return;
    setIsCreatingCo(true);
    try {
      const { company, inviteToken } = await apiService.createCompanyAndInvite(newCoName.trim(), newCoColor, newCoCity.trim(), newCoState.trim(), newCoPhone.trim());
      onCompanyCreated?.(company);
      const url = `${window.location.origin}?invite=${inviteToken}`;
      setLatestInviteUrl(url);
      setNewCoName('');
      setNewCoCity('');
      setNewCoState('');
      setNewCoPhone('');
      setShowNewCompanyForm(false);
    } catch (err: any) {
      alert('Failed to create company: ' + err.message);
    } finally {
      setIsCreatingCo(false);
    }
  };

  const startEditCompany = (co: Company) => {
    setEditingCompanyId(co.id);
    setEditCoName(co.name);
    setEditCoCity(co.city || '');
    setEditCoState(co.state || '');
    setEditCoPhone(co.phone || '');
  };

  const cancelEditCompany = () => {
    setEditingCompanyId(null);
  };

  const handleSaveEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompanyId || !editCoName.trim()) return;
    setIsSavingEdit(true);
    try {
      await onCompanyUpdated?.(editingCompanyId, {
        name: editCoName.trim(),
        city: editCoCity.trim(),
        state: editCoState.trim(),
        phone: editCoPhone.trim()
      });
      setEditingCompanyId(null);
    } catch (err: any) {
      alert('Failed to update company: ' + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleGetInvite = async (companyId: string) => {
    setLoadingCompanyIds(prev => new Set(prev).add(companyId));
    try {
      const token = await apiService.createInviteForCompany(companyId);
      const url = `${window.location.origin}?invite=${token}`;
      setLatestInviteUrl(url);
      console.log('Invite link generated successfully:', url);
    } catch (err: any) {
      console.error('Failed to generate invite:', err);
      alert('Failed to generate invite: ' + err.message);
    } finally {
      setLoadingCompanyIds(prev => {
        const next = new Set(prev);
        next.delete(companyId);
        return next;
      });
    }
  };

  const copyInviteUrl = () => {
    navigator.clipboard.writeText(latestInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleCompanyExpansion = (companyId: string) => {
    setExpandedCompanyIds(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const startEditUserName = (user: UserRecord) => {
    setEditingUserId(user.id);
    setEditUserNameValue(user.name);
  };

  const handleSaveUserName = async (userId: string) => {
    if (!editUserNameValue.trim()) return;
    setIsSavingUserName(true);
    try {
      await onUpdateUserName?.(userId, editUserNameValue.trim());
      setEditingUserId(null);
    } catch (err: any) {
      alert('Failed to update name: ' + err.message);
    } finally {
      setIsSavingUserName(false);
    }
  };

  const handleSendPasswordReset = async (username: string) => {
    if (!confirm(`Send a password reset email to ${username}?`)) return;
    try {
      await onSendPasswordReset?.(username);
      alert(`Password reset email sent to ${username}.`);
    } catch (err: any) {
      alert('Failed to send reset email: ' + err.message);
    }
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myName.trim()) return;
    if (myNewPassword && myNewPassword !== myConfirmPassword) {
      alert('Passwords do not match.');
      return;
    }
    setIsSavingMyProfile(true);
    try {
      if (myName.trim() !== sessionUser.name) {
        await onUpdateUserName?.(sessionUser.id, myName.trim());
      }
      if (myNewPassword) {
        await onUpdateCurrentUserPassword?.(myNewPassword);
      }
      alert('Profile updated successfully.');
      setMyNewPassword('');
      setMyConfirmPassword('');
    } catch (err: any) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setIsSavingMyProfile(false);
    }
  };

  return (
    <div className="space-y-8 animate-in pb-4">
      {/* Platform Admin Section — visible to SUPER_ADMIN only */}
      {isSuperAdmin && (
        <section className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Platform Admin · Companies</h3>
            </div>
            <button
              onClick={() => setShowNewCompanyForm(!showNewCompanyForm)}
              className="bg-brand text-[#0f172a] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
              New Company
            </button>
          </div>

          {/* New Company Form */}
          {showNewCompanyForm && (
            <form onSubmit={handleCreateCompany} className={`px-6 py-5 border-b border-black/5 ${isDarkMode ? 'bg-black/10' : 'bg-slate-50'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Company Name</label>
                  <input
                    type="text"
                    value={newCoName}
                    onChange={e => setNewCoName(e.target.value)}
                    placeholder="Acme Utilities Inc."
                    required
                    className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Phone Number</label>
                  <input
                    type="tel"
                    value={newCoPhone}
                    onChange={e => setNewCoPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>City</label>
                  <input
                    type="text"
                    value={newCoCity}
                    onChange={e => setNewCoCity(e.target.value)}
                    placeholder="Springfield"
                    className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>State</label>
                  <input
                    type="text"
                    value={newCoState}
                    onChange={e => setNewCoState(e.target.value)}
                    placeholder="IL"
                    maxLength={2}
                    className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Brand Color</label>
                  <input type="color" value={newCoColor} onChange={e => setNewCoColor(e.target.value)} className="w-10 h-10 rounded-xl cursor-pointer border-2 border-slate-200" title="Brand color" />
                </div>
                <button type="submit" disabled={isCreatingCo} className="bg-brand text-[#0f172a] px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-60 hover:scale-105 active:scale-95 transition-all whitespace-nowrap">
                  {isCreatingCo ? 'Creating...' : 'Create & Get Link'}
                </button>
                <button type="button" onClick={() => setShowNewCompanyForm(false)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}>Cancel</button>
              </div>
            </form>
          )}

          {/* Invite URL result */}
          {latestInviteUrl && (
            <div className={`mx-6 my-4 p-4 rounded-2xl border-2 border-brand/30 bg-brand/5`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-brand mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                Invite Link Ready — Share with New Company Admin:
              </p>
              <div className="flex items-center gap-2">
                <code className={`flex-1 text-[10px] font-mono p-2.5 rounded-xl break-all ${isDarkMode ? 'bg-black/30 text-slate-300' : 'bg-white text-slate-600 border border-slate-200'}`}>{latestInviteUrl}</code>
                <button onClick={copyInviteUrl} className={`shrink-0 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-brand text-[#0f172a] hover:scale-105 active:scale-95'}`}>
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* Companies table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50/80'} text-[9px] font-black uppercase tracking-[0.2em]`}>
                <tr>
                  <th className="px-6 py-3 text-slate-500">Company</th>
                  <th className="px-6 py-3 text-slate-500">Brand</th>
                  <th className="px-6 py-3 text-slate-500">Users</th>
                  <th className="px-6 py-3 text-right text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                {allCompanies.map(co => {
                  const companyUsers = users.filter(u => u.companyId === co.id);
                  const isExpanded = expandedCompanyIds.has(co.id);
                  const isEditing = editingCompanyId === co.id;
                  
                  return (
                    <React.Fragment key={co.id}>
                      {isEditing ? (
                        <tr>
                          <td colSpan={4} className={`px-6 py-4 bg-brand/5`}>
                            <form onSubmit={handleSaveEditCompany} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Company Name</label>
                                  <input
                                    type="text"
                                    value={editCoName}
                                    onChange={e => setEditCoName(e.target.value)}
                                    required
                                    className={`w-full px-3 py-2 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                                  />
                                </div>
                                <div>
                                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Phone Number</label>
                                  <input
                                    type="tel"
                                    value={editCoPhone}
                                    onChange={e => setEditCoPhone(e.target.value)}
                                    placeholder="(555) 123-4567"
                                    className={`w-full px-3 py-2 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
                                  />
                                </div>
                                <div>
                                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>City</label>
                                  <input
                                    type="text"
                                    value={editCoCity}
                                    onChange={e => setEditCoCity(e.target.value)}
                                    placeholder="Springfield"
                                    className={`w-full px-3 py-2 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
                                  />
                                </div>
                                <div>
                                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>State</label>
                                  <input
                                    type="text"
                                    value={editCoState}
                                    onChange={e => setEditCoState(e.target.value)}
                                    placeholder="IL"
                                    maxLength={2}
                                    className={`w-full px-3 py-2 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button type="submit" disabled={isSavingEdit} className="bg-brand text-[#0f172a] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-60 hover:scale-105 active:scale-95 transition-all">
                                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button type="button" onClick={cancelEditCompany} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}>Cancel</button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : (
                        <tr className="text-xs font-bold transition-colors hover:bg-black/5">
                          <td className="px-6 py-4">
                            <button
                              onClick={() => toggleCompanyExpansion(co.id)}
                              className="flex items-center gap-2 hover:text-brand transition-colors"
                            >
                              <svg 
                                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                              </svg>
                              <div>
                                <div>{co.name}</div>
                                {(co.city || co.state || co.phone) && (
                                  <div className="text-[9px] font-bold opacity-40 mt-0.5">
                                    {[co.city, co.state].filter(Boolean).join(', ')}{co.phone ? ` · ${co.phone}` : ''}
                                  </div>
                                )}
                              </div>
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: co.brandColor || '#3b82f6' }} />
                              <span className="font-mono text-[10px] opacity-50">{co.brandColor}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[10px] opacity-60">
                            {companyUsers.length} member{companyUsers.length !== 1 ? 's' : ''}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => startEditCompany(co)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-white/10 text-slate-300 hover:bg-brand hover:text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-brand hover:text-slate-900'}`}
                                title="Edit company details"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button
                                onClick={() => handleGetInvite(co.id)}
                                disabled={loadingCompanyIds.has(co.id)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                  loadingCompanyIds.has(co.id)
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'hover:scale-105 active:scale-95 hover:bg-brand hover:text-slate-900'
                                } ${isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-700'}`}
                              >
                                {loadingCompanyIds.has(co.id) ? 'Generating...' : 'Get Link'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      
                      {/* Expanded user list */}
                      {isExpanded && !isEditing && companyUsers.length > 0 && (
                        <tr>
                          <td colSpan={4} className={`px-6 py-4 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50'}`}>
                            <div className="space-y-2">
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Company Members ({companyUsers.length})
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {companyUsers.map(user => (
                                  <div 
                                    key={user.id}
                                    className={`flex items-center justify-between p-3 rounded-xl border ${
                                      isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold truncate">{user.name}</div>
                                      <div className="text-[10px] font-mono opacity-40 truncate">{user.username}</div>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                                      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN
                                        ? 'bg-brand/10 border-brand/20 text-brand' 
                                        : 'bg-slate-100 border-slate-200 text-slate-500'
                                    }`}>
                                      {user.role}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      
                      {/* Empty state when expanded but no users */}
                      {isExpanded && !isEditing && companyUsers.length === 0 && (
                        <tr>
                          <td colSpan={4} className={`px-6 py-4 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50'}`}>
                            <div className="text-center text-[10px] font-black uppercase text-slate-400 py-2">
                              No members in this company yet
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {allCompanies.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-[10px] font-black uppercase text-slate-400">
                      No companies yet. Create the first one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* AI Connection & Push Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isAdmin && (
          <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                  Desktop Alerts
                </h3>
                <p className={`text-[10px] font-bold uppercase tracking-tighter mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Browser Push Notifications
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
                {isRegisteringPush ? '...' : pushStatus === 'granted' ? 'Enabled' : 'Enable'}
              </button>
            </div>
          </div>
        )}

        <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Gemini AI Status
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${hasApiKey ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse'}`}>
                  {hasApiKey ? 'Connected' : 'Action Required'}
                </span>
              </div>
              <p className={`text-[10px] font-bold uppercase tracking-tighter mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {hasApiKey ? 'Extraction Engine Ready' : 'Authentication Needed'}
              </p>
            </div>
            <button 
              onClick={onOpenSelectKey}
              className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-500 hover:text-white transition-all shadow-lg active:scale-95 ${hasApiKey ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' : 'bg-purple-600 text-white border-purple-700 animate-bounce'}`}
            >
              {hasApiKey ? 'Switch AI Project' : 'Handshake AI'}
            </button>
          </div>
        </div>
      </section>

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

      {/* Company Admin — Invite Link (visible to company admins, not super-admin) */}
      {isAdmin && !isSuperAdmin && sessionUser.companyId && (
        <section className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Crew Invite Link · {company?.name}</h3>
            </div>
            <button
              onClick={() => handleGetInvite(sessionUser.companyId)}
              disabled={loadingCompanyIds.has(sessionUser.companyId)}
              className={`bg-brand text-[#0f172a] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${loadingCompanyIds.has(sessionUser.companyId) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
            >
              {loadingCompanyIds.has(sessionUser.companyId) ? 'Generating...' : 'Generate Invite Link'}
            </button>
          </div>
          {latestInviteUrl && (
            <div className="px-6 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                Invite Link Ready — Share with New Crew Member:
              </p>
              <div className="flex items-center gap-2">
                <code className={`flex-1 text-[10px] font-mono p-2.5 rounded-xl break-all ${isDarkMode ? 'bg-black/30 text-slate-300' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>{latestInviteUrl}</code>
                <button onClick={copyInviteUrl} className={`shrink-0 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-brand text-[#0f172a] hover:scale-105 active:scale-95'}`}>
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

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
            <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} text-[9px] font-black uppercase tracking-[0.2em] text-slate-50`}>
              <tr>
                <th className="px-6 py-3">Full Name</th>
                <th className="px-6 py-3">Email / ID</th>
                {isSuperAdmin && <th className="px-6 py-3">Company</th>}
                <th className="px-6 py-3">Role Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
              {users.map(user => {
                const isEditingThisUser = editingUserId === user.id;
                return (
                <tr key={user.id} className="text-xs font-bold transition-colors hover:bg-black/5">
                  <td className="px-6 py-4">
                    {isEditingThisUser ? (
                      <input
                        type="text"
                        value={editUserNameValue}
                        onChange={e => setEditUserNameValue(e.target.value)}
                        className={`px-3 py-1.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-brand/20 transition-all min-w-[8rem] max-w-[14rem] w-full ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td className="px-6 py-4 opacity-40 font-mono text-[10px]">{user.username}</td>
                  {isSuperAdmin && (
                    <td className="px-6 py-4 text-[10px] opacity-60">
                      {allCompanies.find(c => c.id === user.companyId)?.name || '—'}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => isAdmin && onToggleRole?.(user)}
                      disabled={!isAdmin || user.id === sessionUser.id}
                      className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all ${
                        user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN
                          ? 'bg-brand/10 border-brand/20 text-brand' 
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      } ${isAdmin && user.id !== sessionUser.id ? 'hover:scale-105 active:scale-95' : 'opacity-50 cursor-not-allowed'}`}
                    >
                      {user.role}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isEditingThisUser ? (
                        <>
                          <button
                            onClick={() => handleSaveUserName(user.id)}
                            disabled={isSavingUserName}
                            className="px-3 py-1.5 bg-brand text-[#0f172a] rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-60 hover:scale-105 active:scale-95 transition-all"
                          >
                            {isSavingUserName ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingUserId(null)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        isAdmin && user.id !== sessionUser.id && (
                          <>
                            <button
                              onClick={() => startEditUserName(user)}
                              className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-slate-400 hover:text-brand hover:bg-brand/10' : 'text-slate-500 hover:text-brand hover:bg-brand/10'}`}
                              title="Edit name"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => handleSendPasswordReset(user.username)}
                              className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-slate-400 hover:text-amber-400 hover:bg-amber-400/10' : 'text-slate-500 hover:text-amber-600 hover:bg-amber-500/10'}`}
                              title="Send password reset email"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            </button>
                            <button 
                              onClick={() => { if(confirm(`Remove ${user.name} access?`)) onDeleteUser(user.id); }}
                              className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* My Profile — visible to all users */}
      <section className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
        <div className="px-6 py-4 border-b border-black/5">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            My Profile
          </h3>
        </div>
        <form onSubmit={handleSaveMyProfile} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Display Name</label>
              <input
                type="text"
                value={myName}
                onChange={e => setMyName(e.target.value)}
                required
                className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
              />
            </div>
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Email (read-only)</label>
              <input
                type="email"
                value={sessionUser.username}
                readOnly
                className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none opacity-50 cursor-not-allowed ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              />
            </div>
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>New Password</label>
              <input
                type="password"
                value={myNewPassword}
                onChange={e => setMyNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
              />
            </div>
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Confirm Password</label>
              <input
                type="password"
                value={myConfirmPassword}
                onChange={e => setMyConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900'}`}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSavingMyProfile}
            className="bg-brand text-[#0f172a] px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-60 hover:scale-105 active:scale-95 transition-all"
          >
            {isSavingMyProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </section>
    </div>
  );
};

export default TeamManagement;
