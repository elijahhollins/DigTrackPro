
import React, { useState, useEffect, useMemo } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, Job, JobNote, UserRecord, NoShowRecord } from './types.ts';
import { getTicketStatus, getStatusColor } from './utils/dateUtils.ts';
import { apiService } from './services/apiService.ts';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.ts';
import TicketForm from './components/TicketForm.tsx';
import JobForm from './components/JobForm.tsx';
import StatCards from './components/StatCards.tsx';
import JobReview from './components/JobReview.tsx';
import PhotoManager from './components/PhotoManager.tsx';
import CalendarView from './components/CalendarView.tsx';
import TeamManagement from './components/TeamManagement.tsx';
import NoShowForm from './components/NoShowForm.tsx';
import Login from './components/Login.tsx';

const App: React.FC = () => {
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('dig_theme_mode') !== 'light');
  const [tickets, setTickets] = useState<DigTicket[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState<DigTicket | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [noShowTicket, setNoShowTicket] = useState<DigTicket | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<TicketStatus | 'NO_SHOW' | null>(null);
  const [sortConfig, setSortConfig] = useState<{ field: SortField; order: SortOrder }>({
    field: 'createdAt',
    order: 'desc'
  });

  const applyThemeColor = (hex: string, save: boolean = false) => {
    document.documentElement.style.setProperty('--brand-primary', hex);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--brand-ring', `rgba(${r}, ${g}, ${b}, 0.1)`);
    document.documentElement.style.setProperty('--brand-shadow', `rgba(${r}, ${g}, ${b}, 0.25)`);
    if (save) localStorage.setItem('dig_theme_color', hex);
  };

  useEffect(() => {
    const activeTkts = tickets.filter(t => !t.isArchived);
    const statuses = activeTkts.map(t => getTicketStatus(t));
    let color = '#3b82f6';
    if (statuses.includes(TicketStatus.EXPIRED)) color = '#e11d48';
    else if (statuses.includes(TicketStatus.REFRESH_NEEDED) || statuses.includes(TicketStatus.EXTENDABLE) || activeTkts.some(t => t.noShowRequested)) color = '#f59e0b';
    else if (activeTkts.length > 0) color = '#10b981';
    const manual = localStorage.getItem('dig_theme_color');
    applyThemeColor(manual || color);
  }, [tickets]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('dig_theme_mode', next ? 'dark' : 'light');
  };

  const initApp = async () => {
    if (!isSupabaseConfigured()) { setIsLoading(false); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSessionUser(null); setIsLoading(false); return; }
      const [allUsers, allTickets, allJobs, allPhotos, allNotes] = await Promise.allSettled([
        apiService.getUsers(),
        apiService.getTickets(),
        apiService.getJobs(),
        apiService.getPhotos(),
        apiService.getNotes()
      ]);
      setUsers(allUsers.status === 'fulfilled' ? allUsers.value : []);
      setTickets(allTickets.status === 'fulfilled' ? allTickets.value : []);
      setJobs(allJobs.status === 'fulfilled' ? allJobs.value : []);
      setPhotos(allPhotos.status === 'fulfilled' ? allPhotos.value : []);
      setNotes(allNotes.status === 'fulfilled' ? allNotes.value : []);
      const matchedProfile = (allUsers.status === 'fulfilled' ? allUsers.value : []).find(u => u.id === session.user.id);
      if (matchedProfile) {
        setSessionUser({ id: session.user.id, name: matchedProfile.name, username: matchedProfile.username, role: matchedProfile.role });
      } else {
        setSessionUser({ id: session.user.id, name: session.user.user_metadata?.display_name || 'New User', username: session.user.email || '', role: UserRole.CREW });
      }
    } catch (error) { console.error("Critical Init Error:", error); } finally { setIsLoading(false); }
  };

  useEffect(() => {
    initApp();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => initApp());
    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try { await supabase.auth.signOut(); setSessionUser(null); } catch (error: any) { console.error("Sign out error:", error.message); }
  };

  const handleSaveTicket = async (data: Omit<DigTicket, 'id' | 'createdAt'>, archiveOld: boolean = false) => {
    try {
      const ticket: DigTicket = (editingTicket && !archiveOld)
        ? { ...editingTicket, ...data }
        : { ...data, id: crypto.randomUUID(), createdAt: Date.now(), isArchived: false };
      const saved = await apiService.saveTicket(ticket, archiveOld);
      setTickets(prev => {
        if (archiveOld) return [saved, ...prev.map(t => (t.ticketNo === saved.ticketNo && t.jobNumber === saved.jobNumber && t.id !== saved.id) ? { ...t, isArchived: true } : t)];
        const index = prev.findIndex(t => t.id === saved.id);
        if (index > -1) return prev.map(t => t.id === saved.id ? saved : t);
        return [saved, ...prev];
      });
      setShowTicketForm(false);
      setEditingTicket(null);
    } catch (error: any) { alert(error.message); }
  };

  const handleDeleteTicket = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this ticket?")) return;
    try {
      await apiService.deleteTicket(id);
      setTickets(prev => prev.filter(t => t.id !== id));
    } catch (error: any) { alert("Delete failed: " + error.message); }
  };

  const handleDeleteJob = async (job: Job) => {
    if (!confirm(`Permanently delete Job #${job.jobNumber}? This cannot be undone.`)) return;
    try {
      await apiService.deleteJob(job.id);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      // Optionally clean up associated tickets locally too
      setTickets(prev => prev.filter(t => t.jobNumber !== job.jobNumber));
    } catch (error: any) { alert("Delete job failed: " + error.message); }
  };

  const handleToggleRefresh = async (ticket: DigTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedTicket = { ...ticket, refreshRequested: !ticket.refreshRequested };
      const saved = await apiService.saveTicket(updatedTicket);
      setTickets(prev => prev.map(t => t.id === saved.id ? saved : t));
    } catch (error: any) { alert(error.message); }
  };

  const handleSort = (field: SortField) => setSortConfig(p => ({ field, order: p.field === field && p.order === 'asc' ? 'desc' : 'asc' }));

  const activeTickets = useMemo(() => {
    const completedNumbers = new Set(jobs.filter(j => j.isComplete).map(j => j.jobNumber));
    return tickets.filter(t => !completedNumbers.has(t.jobNumber) && !t.isArchived);
  }, [tickets, jobs]);

  const filteredTickets = useMemo(() => {
    let res = activeTickets.filter(t => {
      const s = globalSearch.toLowerCase().trim();
      if (s && !t.ticketNo.toLowerCase().includes(s) && !t.street.toLowerCase().includes(s) && !t.jobNumber.toLowerCase().includes(s)) return false;
      if (activeFilter) {
        if (activeFilter === 'NO_SHOW') return t.noShowRequested;
        return getTicketStatus(t) === activeFilter;
      }
      return true;
    });
    res.sort((a, b) => {
      let vA: any = a[sortConfig.field as keyof DigTicket];
      let vB: any = b[sortConfig.field as keyof DigTicket];
      if (sortConfig.field === 'status') { vA = getTicketStatus(a); vB = getTicketStatus(b); }
      const f = sortConfig.order === 'asc' ? 1 : -1;
      if (typeof vA === 'string') return f * vA.localeCompare(vB);
      return f * ((vA ?? 0) - (vB ?? 0));
    });
    return res;
  }, [activeTickets, globalSearch, sortConfig, activeFilter]);

  if (isLoading) return <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" /><p className="text-[9px] font-black uppercase tracking-widest opacity-40">Synchronizing Vault...</p></div>;
  if (!sessionUser) return <Login onLogin={setSessionUser} />;

  const isAdmin = sessionUser.role === UserRole.ADMIN;

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#0f172a] text-slate-100' : 'bg-slate-50 text-slate-900'} transition-all duration-500 pb-24`}>
      <header className={`${isDarkMode ? 'bg-[#1e293b]/95 border-white/5' : 'bg-white/95 border-slate-200'} backdrop-blur-md border-b sticky top-0 z-40 transition-all duration-500`}>
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-brand p-2 rounded-xl shadow-lg shadow-brand/20 transition-all duration-500 glow-brand">
              <svg className="w-4 h-4 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h1 className="text-sm font-black uppercase tracking-tight hidden sm:block">DigTrack Pro</h1>
          </div>
          
          <div className="flex-1 max-w-sm relative">
            <input type="text" placeholder="Search locate vault..." className={`w-full pl-8 pr-4 py-1.5 border rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-100 border-slate-200'}`} value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
            <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={toggleDarkMode} className={`p-2 rounded-xl transition-all ${isDarkMode ? 'bg-white/5 text-amber-300' : 'bg-slate-100 text-slate-500'}`}>
              {isDarkMode ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
            </button>
            {isAdmin && (
              <div className="flex gap-1.5 ml-1">
                <button onClick={() => { setEditingJob(null); setShowJobForm(true); }} className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-3 py-1.5 rounded-xl font-black uppercase tracking-widest text-[9px] shadow-sm">+ Job</button>
                <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-[#0f172a] px-3 py-1.5 rounded-xl font-black uppercase tracking-widest text-[9px] shadow-sm transition-all duration-500">+ Ticket</button>
              </div>
            )}
            <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-rose-500 ml-1">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 animate-in">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <StatCards tickets={activeTickets} isDarkMode={isDarkMode} activeFilter={activeFilter} onFilterClick={setActiveFilter} />
            <div className={`${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'} rounded-3xl shadow-sm border overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} border-b border-black/5`}>
                    <tr>
                      <th onClick={() => handleSort('jobNumber')} className="px-6 py-4 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:text-brand transition-colors text-slate-400">Job</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Ticket</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Street</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center text-slate-400">Status</th>
                      <th onClick={() => handleSort('expires')} className="px-6 py-4 text-[10px] font-black uppercase tracking-widest cursor-pointer text-right text-slate-400">Expires</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                    {filteredTickets.map(ticket => {
                      const status = getTicketStatus(ticket);
                      return (
                        <tr key={ticket.id} onClick={() => isAdmin && setEditingTicket(ticket)} className={`transition-all group ${isAdmin ? 'cursor-pointer' : ''} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                          <td className="px-6 py-3 text-[13px] font-black">{ticket.jobNumber}</td>
                          <td className="px-6 py-3 text-[12px] font-mono opacity-50">{ticket.ticketNo}</td>
                          <td className="px-6 py-3 text-[13px] font-bold truncate max-w-[250px]">{ticket.street}</td>
                          <td className="px-6 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${getStatusColor(status)}`}>{status}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-[12px] font-bold text-right opacity-40">{new Date(ticket.expires).toLocaleDateString()}</td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setNoShowTicket(ticket); }} 
                                aria-label="Request No Show"
                                className={`p-2 rounded-xl transition-all border shadow-sm ${
                                  ticket.noShowRequested 
                                    ? 'bg-rose-500 text-white border-rose-600 shadow-rose-500/20' 
                                    : 'bg-rose-500/10 text-rose-600 border-rose-200 hover:bg-rose-500 hover:text-white hover:shadow-rose-500/30'
                                }`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              </button>

                              <button 
                                onClick={(e) => handleToggleRefresh(ticket, e)} 
                                title="Toggle Manual Refresh"
                                className={`p-2 rounded-xl transition-all border ${ticket.refreshRequested ? 'bg-amber-100 text-amber-600 border-amber-300' : 'bg-black/5 text-slate-400 border-transparent hover:text-brand hover:border-brand/20'}`}
                              >
                                <svg className={`w-4 h-4 ${ticket.refreshRequested ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15" /></svg>
                              </button>

                              {isAdmin && (
                                <button 
                                  onClick={(e) => handleDeleteTicket(ticket.id, e)}
                                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                  title="Delete Ticket"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
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
        )}
        {activeView === 'calendar' && <CalendarView tickets={activeTickets} onEditTicket={(t) => isAdmin && setEditingTicket(t)} />}
        {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} notes={notes} isAdmin={isAdmin} isDarkMode={isDarkMode} onEditJob={(j) => isAdmin && setEditingJob(j)} onDeleteJob={handleDeleteJob} onToggleComplete={async (j) => { await apiService.saveJob({...j, isComplete: !j.isComplete}); initApp(); }} onAddNote={async (note) => { const n = await apiService.addNote({...note, id: crypto.randomUUID(), timestamp: Date.now(), author: sessionUser.name}); setNotes(prev => [n, ...prev]); }} onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} />}
        {activeView === 'photos' && <PhotoManager photos={photos} jobs={jobs} tickets={tickets} initialSearch={globalSearch} isDarkMode={isDarkMode} onAddPhoto={async (metadata, file) => { const saved = await apiService.addPhoto(metadata, file); setPhotos(prev => [saved, ...prev]); return saved; }} onDeletePhoto={async (id) => { await apiService.deletePhoto(id); setPhotos(prev => prev.filter(p => p.id !== id)); }} />}
        {activeView === 'team' && <TeamManagement users={users} sessionUser={sessionUser} isDarkMode={isDarkMode} onAddUser={async (u) => { const newUser = await apiService.addUser({...u}); setUsers(prev => [...prev, newUser]); }} onDeleteUser={async (id) => { await apiService.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); }} onThemeChange={(hex) => applyThemeColor(hex, true)} />}
      </main>

      <nav className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <div className={`backdrop-blur-xl border shadow-2xl rounded-3xl p-1.5 flex items-center gap-1 pointer-events-auto transition-all duration-500 ${isDarkMode ? 'bg-[#1e293b]/90 border-white/10' : 'bg-white/90 border-slate-200'}`}>
          {[
            { id: 'dashboard', label: 'Vault', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1' },
            { id: 'calendar', label: 'Cal', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'jobs', label: 'Review', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
            { id: 'photos', label: 'Media', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'team', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066' }
          ].map((v) => (
            <button key={v.id} onClick={() => { setActiveView(v.id as AppView); setActiveFilter(null); }} className={`flex flex-col items-center gap-1 py-2 px-6 rounded-2xl transition-all ${activeView === v.id ? 'bg-brand text-[#0f172a] shadow-lg shadow-brand/20 scale-105' : 'text-slate-500 hover:text-brand'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={v.icon} /></svg><span className="text-[8px] font-black uppercase tracking-tighter">{v.label}</span></button>
          ))}
        </div>
      </nav>

      {(showTicketForm || editingTicket) && (
        <TicketForm 
          onAdd={handleSaveTicket} 
          onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} 
          initialData={editingTicket || undefined} 
          users={users} 
          jobs={jobs}
          isDarkMode={isDarkMode} 
          onJobCreated={(newJob) => setJobs(prev => [...prev, newJob])}
        />
      )}
      {(showJobForm || editingJob) && <JobForm onSave={async (j) => { await apiService.saveJob({...j, id: crypto.randomUUID(), createdAt: Date.now()}); initApp(); setShowJobForm(false); }} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} isDarkMode={isDarkMode} />}
      {noShowTicket && <NoShowForm ticket={noShowTicket} userName={sessionUser?.name || 'User'} onSave={async (r) => { await apiService.addNoShow(r); initApp(); setNoShowTicket(null); }} onClose={() => setNoShowTicket(null)} isDarkMode={isDarkMode} />}
    </div>
  );
};

export default App;
