
import React, { useState, useEffect, useMemo } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, Job, JobNote, UserRecord } from './types.ts';
import { getTicketStatus, getStatusColor, getStatusDotColor } from './utils/dateUtils.ts';
import { apiService } from './services/apiService.ts';
import { supabase } from './lib/supabaseClient.ts';
import TicketForm from './components/TicketForm.tsx';
import JobForm from './components/JobForm.tsx';
import StatCards from './components/StatCards.tsx';
import JobReview from './components/JobReview.tsx';
import PhotoManager from './components/PhotoManager.tsx';
import CalendarView from './components/CalendarView.tsx';
import TeamManagement from './components/TeamManagement.tsx';
import Login from './components/Login.tsx';

const App: React.FC = () => {
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [tickets, setTickets] = useState<DigTicket[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSynced, setIsSynced] = useState<boolean | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState<DigTicket | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ field: SortField; order: SortOrder }>({
    field: 'createdAt',
    order: 'desc'
  });

  const setThemeColor = (color: string) => {
    localStorage.setItem('dig_theme_color', color);
    document.documentElement.style.setProperty('--brand-primary', color);
    let r = 0, g = 0, b = 0;
    if (color.startsWith('#') && color.length === 7) {
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    }
    document.documentElement.style.setProperty('--brand-ring', `rgba(${r}, ${g}, ${b}, 0.1)`);
    document.documentElement.style.setProperty('--brand-shadow', `rgba(${r}, ${g}, ${b}, 0.2)`);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessionUser(null);
  };

  const initApp = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setSessionUser(null);
        setIsLoading(false);
        return;
      }

      // Fetch Profile quickly
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      // Normalize role comparison
      const rawRole = (profile?.role || '').toUpperCase();
      const resolvedRole = rawRole === 'ADMIN' ? UserRole.ADMIN : UserRole.CREW;

      const userObj: User = {
        id: session.user.id,
        name: profile?.name || session.user.email?.split('@')[0] || 'User',
        username: profile?.username || session.user.email || 'unknown',
        role: resolvedRole
      };
      
      setSessionUser(userObj);
      setIsLoading(false);

      // Now fetch data in background
      apiService.getSyncStatus().then(status => {
        setIsSynced(status.synced);
        setSyncError(status.error || null);
      });

      Promise.allSettled([
        apiService.getTickets(),
        apiService.getJobs(),
        apiService.getPhotos(),
        apiService.getNotes(),
        apiService.getUsers()
      ]).then(([t, j, p, n, u]) => {
        if (t.status === 'fulfilled') setTickets(t.value);
        if (j.status === 'fulfilled') setJobs(j.value);
        if (p.status === 'fulfilled') setPhotos(p.value);
        if (n.status === 'fulfilled') setNotes(n.value);
        if (u.status === 'fulfilled') setUsers(u.value);
      });

    } catch (error: any) {
      console.error("Critical Initialization error:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedColor = localStorage.getItem('dig_theme_color') || '#f59e0b';
    setThemeColor(savedColor);
    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setSessionUser(null);
      } else if (event === 'SIGNED_IN') {
        initApp();
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleSaveTicket = async (data: Omit<DigTicket, 'id' | 'createdAt'>) => {
    try {
      const ticket: DigTicket = editingTicket 
        ? { ...editingTicket, ...data }
        : { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      const saved = await apiService.saveTicket(ticket);
      setTickets(prev => {
        const index = prev.findIndex(t => t.id === saved.id);
        if (index > -1) return prev.map(t => t.id === saved.id ? saved : t);
        return [saved, ...prev];
      });
      setShowTicketForm(false);
      setEditingTicket(null);
    } catch (error: any) {
      alert(`Access Denied: Only Admins can save tickets.`);
    }
  };

  const handleSaveJob = async (data: Omit<Job, 'id' | 'createdAt'>) => {
    try {
      const job: Job = editingJob 
        ? { ...editingJob, ...data }
        : { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      const saved = await apiService.saveJob(job);
      setJobs(prev => {
        const index = prev.findIndex(j => j.id === saved.id);
        if (index > -1) return prev.map(j => j.id === saved.id ? saved : j);
        return [saved, ...prev];
      });
      setShowJobForm(false);
      setEditingJob(null);
    } catch (error: any) {
      alert(`Access Denied: Only Admins can manage jobs.`);
    }
  };

  const handleToggleJobCompletion = async (job: Job) => {
    try {
      const updatedJob = { ...job, isComplete: !job.isComplete };
      await apiService.saveJob(updatedJob);
      setJobs(prev => prev.map(j => j.id === job.id ? updatedJob : j));
    } catch (error: any) {
      alert(`Update failed. Check your permissions.`);
    }
  };

  const handleToggleUserRole = async (user: UserRecord) => {
    try {
      const newRole = user.role === UserRole.ADMIN ? UserRole.CREW : UserRole.ADMIN;
      await apiService.updateUserRole(user.id, newRole);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (error: any) {
      alert("Failed to update user role.");
    }
  };

  const deleteTicket = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Permanent delete?")) {
      try {
        await apiService.deleteTicket(id);
        setTickets(prev => prev.filter(t => t.id !== id));
      } catch (error: any) {
        alert(`Delete failed: You must be an Admin.`);
      }
    }
  };

  const completedJobNumbers = useMemo(() => {
    return new Set(jobs.filter(j => j.isComplete).map(j => j.jobNumber));
  }, [jobs]);

  const activeTickets = useMemo(() => {
    return tickets.filter(t => !completedJobNumbers.has(t.jobNumber));
  }, [tickets, completedJobNumbers]);

  const filteredAndSortedTickets = useMemo(() => {
    let result = activeTickets.filter(t => {
      const s = globalSearch.toLowerCase().trim();
      if (!s) return true;
      const status = getTicketStatus(t);
      return status.toLowerCase().includes(s) || 
             t.ticketNo.toLowerCase().includes(s) || 
             t.address.toLowerCase().includes(s) || 
             t.jobNumber.toLowerCase().includes(s);
    });
    result.sort((a, b) => {
      const valA = a[sortConfig.field] ?? '';
      const valB = b[sortConfig.field] ?? '';
      const factor = sortConfig.order === 'asc' ? 1 : -1;
      if (typeof valA === 'string' && typeof valB === 'string') return factor * valA.localeCompare(valB, undefined, { numeric: true });
      return factor * ((valA as number) - (valB as number));
    });
    return result;
  }, [activeTickets, globalSearch, sortConfig]);

  if (isLoading) return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
      <div className="w-14 h-14 border-4 border-slate-800 border-t-brand rounded-full animate-spin mb-6" />
      <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-[10px]">Accessing Secure Gateway...</p>
    </div>
  );

  if (!sessionUser) {
    return <Login onLogin={(user) => setSessionUser(user)} />;
  }

  const isAdmin = sessionUser.role === UserRole.ADMIN;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col relative">
      <header className="bg-[#1e293b]/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4">
          <div className="h-20 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-brand p-2.5 rounded-2xl shadow-lg shadow-brand/40">
                <svg className="w-6 h-6 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <h1 className="text-lg font-black text-white tracking-tight leading-none uppercase">DigTrack Pro</h1>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">
                    {sessionUser.name} ({sessionUser.role})
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 max-w-xl relative hidden md:block">
              <input type="text" placeholder="Search project database..." className="w-full pl-10 pr-4 py-3 bg-[#0f172a]/50 border border-white/5 rounded-2xl text-sm font-semibold outline-none focus:bg-[#0f172a] focus:ring-4 focus:ring-brand/10 focus:border-brand/40 transition-all text-white placeholder:text-slate-600" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
              <svg className="w-4 h-4 text-slate-600 absolute left-3.5 top-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <button onClick={handleSignOut} title="Sign Out" className="p-3 text-slate-500 hover:text-rose-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
              
              {isAdmin && (
                <>
                  {activeView === 'jobs' && (
                    <button onClick={() => { setEditingJob(null); setShowJobForm(true); }} className="bg-white text-[#0f172a] px-5 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center gap-2 shadow-xl shadow-white/5 text-[10px]">New Job</button>
                  )}
                  <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-[#0f172a] px-5 py-3 rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2 shadow-xl shadow-brand/20 text-[10px]">New Ticket</button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-8 flex-1 w-full animate-in fade-in slide-in-from-bottom-2 duration-700 pb-44">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            <StatCards tickets={activeTickets} />
            <div className="bg-[#1e293b] rounded-[3rem] shadow-xl border border-white/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-black/20 border-b border-white/5">
                    <tr>
                      <th className="px-8 py-7 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Job #</th>
                      <th className="px-8 py-7 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Ticket #</th>
                      <th className="px-8 py-7 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Address</th>
                      <th className="px-8 py-7 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Status</th>
                      <th className="px-8 py-7 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Expires</th>
                      <th className="px-8 py-7"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredAndSortedTickets.map(ticket => {
                      const status = getTicketStatus(ticket);
                      return (
                        <tr key={ticket.id} onClick={() => isAdmin && setEditingTicket(ticket)} className={`transition-all group ${isAdmin ? 'cursor-pointer hover:bg-white/5' : ''}`}>
                          <td className="px-8 py-7 text-xs font-black text-white">{ticket.jobNumber}</td>
                          <td className="px-8 py-7 text-xs font-mono font-bold text-slate-400">{ticket.ticketNo}</td>
                          <td className="px-8 py-7 text-xs font-bold text-slate-300 truncate max-w-[250px]">{ticket.address}</td>
                          <td className="px-8 py-7">
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[9px] font-black border uppercase tracking-[0.1em] ${getStatusColor(status).replace('bg-emerald-50', 'bg-emerald-500/10').replace('text-emerald-700', 'text-emerald-500')} shadow-sm`}>{status}</span>
                          </td>
                          <td className="px-8 py-7 text-[11px] font-black text-slate-400">{new Date(ticket.expirationDate).toLocaleDateString()}</td>
                          <td className="px-8 py-7 text-right">
                            {isAdmin && <button onClick={(e) => deleteTicket(ticket.id, e)} className="p-2 text-slate-700 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeView === 'calendar' && <CalendarView tickets={activeTickets} onEditTicket={(t) => isAdmin && setEditingTicket(t)} />}
        {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} notes={notes} isAdmin={isAdmin} onEditJob={(j) => isAdmin && setEditingJob(j)} onToggleComplete={handleToggleJobCompletion} onAddNote={async (note) => { const n = await apiService.addNote({...note, id: crypto.randomUUID(), timestamp: Date.now(), author: sessionUser.name}); setNotes(prev => [n, ...prev]); }} onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} />}
        {activeView === 'photos' && <PhotoManager photos={photos} initialSearch={globalSearch} onAddPhoto={async (metadata, file) => { const saved = await apiService.addPhoto(metadata, file); setPhotos(prev => [saved, ...prev]); }} onDeletePhoto={async (id) => { await apiService.deletePhoto(id); setPhotos(prev => prev.filter(p => p.id !== id)); }} />}
        {activeView === 'team' && <TeamManagement users={users} currentUserId={sessionUser.id} onAddUser={async (u) => { const newUser = await apiService.addUser({...u, id: crypto.randomUUID()}); setUsers(prev => [...prev, newUser]); }} onDeleteUser={async (id) => { await apiService.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); }} onThemeChange={setThemeColor} onToggleRole={handleToggleUserRole} />}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-6 md:pb-8 flex justify-center pointer-events-none">
        <div className="bg-[#1e293b]/95 backdrop-blur-2xl border border-white/5 shadow-2xl rounded-[3rem] p-2 flex items-center gap-1 pointer-events-auto ring-1 ring-white/5">
          {[
            { id: 'dashboard', label: 'Tickets', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { id: 'calendar', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'jobs', label: 'Projects', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
            { id: 'photos', label: 'Media', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'team', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
          ].map((v) => (
            <button key={v.id} onClick={() => setActiveView(v.id as AppView)} className={`flex flex-col items-center gap-1.5 py-3.5 px-6 md:px-10 rounded-[2.5rem] transition-all group ${activeView === v.id ? 'bg-brand text-[#0f172a] shadow-xl shadow-brand/20 scale-105' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}>
              <svg className="w-5 h-5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={v.icon} /></svg>
              <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${activeView === v.id ? 'text-[#0f172a]' : 'text-slate-500'}`}>{v.label}</span>
            </button>
          ))}
        </div>
      </div>
      {(showTicketForm || editingTicket) && <TicketForm onAdd={handleSaveTicket} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} initialData={editingTicket || undefined} users={users} />}
      {(showJobForm || editingJob) && <JobForm onSave={handleSaveJob} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} />}
    </div>
  );
};

export default App;
