
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

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('dig_theme_mode', next ? 'dark' : 'light');
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

      const [allUsers, allTickets, allJobs, allPhotos, allNotes] = await Promise.all([
        apiService.getUsers(),
        apiService.getTickets(),
        apiService.getJobs(),
        apiService.getPhotos(),
        apiService.getNotes()
      ]);

      setUsers(allUsers);
      setTickets(allTickets);
      setJobs(allJobs);
      setPhotos(allPhotos);
      setNotes(allNotes);

      const sessionId = session.user.id;
      const sessionEmail = session.user.email?.toLowerCase();

      let matchedProfile = allUsers.find(u => 
        u.id === sessionId || 
        (u.username && u.username.toLowerCase() === sessionEmail)
      );

      let resolvedRole = UserRole.CREW;
      if (allUsers.length <= 1) {
        resolvedRole = UserRole.ADMIN;
      } else if (matchedProfile) {
        resolvedRole = matchedProfile.role;
      }

      if (!matchedProfile && session.user.email) {
        try {
          const newProfile = await apiService.addUser({
            id: sessionId,
            name: session.user.email.split('@')[0],
            username: session.user.email,
            role: resolvedRole
          });
          setUsers(prev => [...prev, newProfile]);
          matchedProfile = newProfile;
        } catch (e) {
          console.warn("Auto-profile failed");
        }
      }

      setSessionUser({
        id: sessionId,
        name: matchedProfile?.name || session.user.email?.split('@')[0] || 'User',
        username: matchedProfile?.username || session.user.email || 'unknown',
        role: resolvedRole
      });
      setIsLoading(false);

    } catch (error: any) {
      console.error("Initialization failed:", error);
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

  const handleToggleUserRole = async (user: UserRecord) => {
    try {
      const newRole = user.role === UserRole.ADMIN ? UserRole.CREW : UserRole.ADMIN;
      await apiService.updateUserRole(user.id, newRole);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (error: any) {
      alert(`Role Update Error: ${error.message}`);
    }
  };

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
      alert(`Database Error: ${error.message}`);
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
      alert(`Database Error: ${error.message}`);
    }
  };

  const handleToggleJobCompletion = async (job: Job) => {
    try {
      const updatedJob = { ...job, isComplete: !job.isComplete };
      await apiService.saveJob(updatedJob);
      setJobs(prev => prev.map(j => j.id === job.id ? updatedJob : j));
    } catch (error: any) {
      alert(`Status Update Error: ${error.message}`);
    }
  };

  const deleteTicket = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete this ticket?")) {
      try {
        await apiService.deleteTicket(id);
        setTickets(prev => prev.filter(t => t.id !== id));
      } catch (error: any) {
        alert(`Deletion Error: ${error.message}`);
      }
    }
  };

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
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
      let valA: any = a[sortConfig.field as keyof DigTicket];
      let valB: any = b[sortConfig.field as keyof DigTicket];

      if (sortConfig.field === 'status') {
        valA = getTicketStatus(a);
        valB = getTicketStatus(b);
      }

      const factor = sortConfig.order === 'asc' ? 1 : -1;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return factor * valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      }
      return factor * ((valA ?? 0) - (valB ?? 0));
    });
    return result;
  }, [activeTickets, globalSearch, sortConfig]);

  if (isLoading) return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
      <div className="w-10 h-10 border-2 border-slate-800 border-t-brand rounded-full animate-spin mb-4" />
      <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Syncing Terminal...</p>
    </div>
  );

  if (!sessionUser) return <Login onLogin={(user) => setSessionUser(user)} />;

  const isAdmin = sessionUser.role === UserRole.ADMIN;

  const SortHeader = ({ field, label }: { field: SortField, label: string }) => {
    const isActive = sortConfig.field === field;
    return (
      <th onClick={() => handleSort(field)} className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors group whitespace-nowrap ${isActive ? 'text-brand' : 'text-slate-400 hover:text-slate-200'}`}>
        <div className="flex items-center gap-1.5">
          {label}
          <div className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}>
            <svg className={`w-3 h-3 ${sortConfig.order === 'desc' && isActive ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </th>
    );
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#0f172a] text-slate-100' : 'bg-slate-50 text-slate-900'} transition-colors duration-300 pb-32`}>
      <header className={`${isDarkMode ? 'bg-[#1e293b]/95 border-white/5' : 'bg-white/95 border-slate-200'} backdrop-blur-md border-b sticky top-0 z-40`}>
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand p-2 rounded-xl shadow-lg shadow-brand/20">
              <svg className="w-5 h-5 text-[#0f172a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h1 className="text-sm font-black uppercase tracking-tighter">DigTrack Pro</h1>
          </div>
          
          <div className="flex-1 max-w-md hidden md:relative md:block">
            <input type="text" placeholder="Search..." className={`w-full pl-9 pr-4 py-2 border rounded-xl text-xs font-semibold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-600' : 'bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
            <svg className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleDarkMode} className={`p-2 rounded-xl transition-all ${isDarkMode ? 'bg-white/5 text-amber-300' : 'bg-slate-100 text-slate-500'}`}>
              {isDarkMode ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={() => { setEditingJob(null); setShowJobForm(true); }} className={`px-4 py-2 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all ${isDarkMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>Job</button>
                <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-[#0f172a] px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand/20">Ticket</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 animate-in">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <StatCards tickets={activeTickets} isDarkMode={isDarkMode} />
            <div className={`${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'} rounded-2xl shadow-sm border overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} border-b ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}>
                    <tr>
                      <SortHeader field="jobNumber" label="Job" />
                      <SortHeader field="ticketNo" label="Ticket #" />
                      <SortHeader field="address" label="Address" />
                      <SortHeader field="status" label="Status" />
                      <SortHeader field="expirationDate" label="Expires" />
                      <th className="px-5"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                    {filteredAndSortedTickets.map(ticket => {
                      const status = getTicketStatus(ticket);
                      return (
                        <tr key={ticket.id} onClick={() => isAdmin && setEditingTicket(ticket)} className={`transition-colors group ${isAdmin ? 'cursor-pointer' : ''} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                          <td className="px-5 py-4 text-xs font-black">{ticket.jobNumber}</td>
                          <td className="px-5 py-4 text-xs font-mono opacity-60">{ticket.ticketNo}</td>
                          <td className="px-5 py-4 text-xs font-medium truncate max-w-[200px]">{ticket.address}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black border uppercase ${getStatusColor(status)}`}>{status}</span>
                          </td>
                          <td className="px-5 py-4 text-[10px] font-bold opacity-40">{new Date(ticket.expirationDate).toLocaleDateString()}</td>
                          <td className="px-5 py-4 text-right">
                            {isAdmin && <button onClick={(e) => deleteTicket(ticket.id, e)} className="p-1.5 text-slate-400 hover:text-rose-500 transition-opacity opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
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
        {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} notes={notes} isAdmin={isAdmin} isDarkMode={isDarkMode} onEditJob={(j) => isAdmin && setEditingJob(j)} onToggleComplete={handleToggleJobCompletion} onAddNote={async (note) => { const n = await apiService.addNote({...note, id: crypto.randomUUID(), timestamp: Date.now(), author: sessionUser.name}); setNotes(prev => [n, ...prev]); }} onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} />}
        {activeView === 'photos' && <PhotoManager photos={photos} initialSearch={globalSearch} isDarkMode={isDarkMode} onAddPhoto={async (metadata, file) => { const saved = await apiService.addPhoto(metadata, file); setPhotos(prev => [saved, ...prev]); }} onDeletePhoto={async (id) => { await apiService.deletePhoto(id); setPhotos(prev => prev.filter(p => p.id !== id)); }} />}
        {activeView === 'team' && <TeamManagement users={users} sessionUser={sessionUser} isDarkMode={isDarkMode} onAddUser={async (u) => { const newUser = await apiService.addUser({...u}); setUsers(prev => [...prev, newUser]); }} onDeleteUser={async (id) => { await apiService.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); }} onThemeChange={setThemeColor} onToggleRole={handleToggleUserRole} />}
      </main>

      <div className="fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center">
        <div className={`backdrop-blur-xl border shadow-2xl rounded-2xl p-1.5 flex items-center gap-1 pointer-events-auto ${isDarkMode ? 'bg-slate-900/90 border-white/10' : 'bg-white/90 border-slate-200'}`}>
          {[
            { id: 'dashboard', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'calendar', label: 'Cal', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'jobs', label: 'Jobs', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
            { id: 'photos', label: 'Media', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'team', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
          ].map((v) => (
            <button key={v.id} onClick={() => setActiveView(v.id as AppView)} className={`flex flex-col items-center gap-1 py-2 px-5 md:px-8 rounded-xl transition-all ${activeView === v.id ? 'bg-brand text-slate-900 shadow-lg shadow-brand/20 scale-105' : 'text-slate-500 hover:text-brand'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={v.icon} /></svg>
              <span className="text-[8px] font-black uppercase tracking-tighter">{v.label}</span>
            </button>
          ))}
        </div>
      </div>
      {(showTicketForm || editingTicket) && <TicketForm onAdd={handleSaveTicket} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} initialData={editingTicket || undefined} users={users} isDarkMode={isDarkMode} />}
      {(showJobForm || editingJob) && <JobForm onSave={handleSaveJob} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} isDarkMode={isDarkMode} />}
    </div>
  );
};

export default App;
