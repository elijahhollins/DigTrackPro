import React, { useState, useEffect, useMemo } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, JobNote, UserRecord, Job } from './types.ts';
import { getTicketStatus, getStatusColor, getStatusDotColor, getRowBgColor } from './utils/dateUtils.ts';
import { apiService } from './services/apiService.ts';
import { checkSupabaseConfig } from './lib/supabaseClient.ts';
import TicketForm from './components/TicketForm.tsx';
import JobForm from './components/JobForm.tsx';
import StatCards from './components/StatCards.tsx';
import JobReview from './components/JobReview.tsx';
import PhotoManager from './components/PhotoManager.tsx';
import CalendarView from './components/CalendarView.tsx';
import Login from './components/Login.tsx';
import TeamManagement from './components/TeamManagement.tsx';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [tickets, setTickets] = useState<DigTicket[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isConfigMissing, setIsConfigMissing] = useState(false);
  
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
    
    // Extract RGB for translucent UI elements
    let r = 0, g = 0, b = 0;
    if (color.length === 7) {
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    }
    document.documentElement.style.setProperty('--brand-ring', `rgba(${r}, ${g}, ${b}, 0.1)`);
    document.documentElement.style.setProperty('--brand-shadow', `rgba(${r}, ${g}, ${b}, 0.2)`);
  };

  useEffect(() => {
    const savedColor = localStorage.getItem('dig_theme_color') || '#ea580c';
    setThemeColor(savedColor);
  }, []);

  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      setInitError(null);
      
      const config = checkSupabaseConfig();
      if (!config.isValid) {
        console.error("Supabase config invalid:", config);
        setIsConfigMissing(true);
        setIsLoading(false);
        return;
      }

      const timeoutId = setTimeout(() => {
        setInitError("Network requests are taking too long. Please check your Supabase project status.");
        setIsLoading(false);
      }, 15000);

      try {
        const savedUser = localStorage.getItem('dig_auth_user');
        if (savedUser) {
          try {
            setCurrentUser(JSON.parse(savedUser));
          } catch (e) {
            localStorage.removeItem('dig_auth_user');
          }
        }

        const [t, j, p, n, u] = await Promise.all([
          apiService.getTickets().catch(() => []),
          apiService.getJobs().catch(() => []),
          apiService.getPhotos().catch(() => []),
          apiService.getNotes().catch(() => []),
          apiService.getUsers().catch(() => [])
        ]);

        clearTimeout(timeoutId);
        setTickets(t);
        setJobs(j);
        setPhotos(p);
        setNotes(n);
        setUsers(u);
      } catch (error: any) {
        clearTimeout(timeoutId);
        const msg = typeof error === 'string' ? error : (error?.message || "Critical connection error.");
        setInitError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('dig_auth_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    if (window.confirm("Sign out of DigTrack Pro?")) {
      setCurrentUser(null);
      localStorage.removeItem('dig_auth_user');
      setActiveView('dashboard');
    }
  };

  const handleSaveTicket = async (data: Omit<DigTicket, 'id' | 'createdAt'>) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    try {
      const ticket: DigTicket = editingTicket 
        ? { ...editingTicket, ...data }
        : { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      
      await apiService.saveTicket(ticket);
      setTickets(prev => {
        const index = prev.findIndex(t => t.id === ticket.id);
        if (index > -1) return prev.map(t => t.id === ticket.id ? ticket : t);
        return [ticket, ...prev];
      });
      setShowTicketForm(false);
      setEditingTicket(null);
    } catch (error: any) {
      alert(`Failed to save ticket: ${error.message || error}`);
    }
  };

  const handleSaveJob = async (data: Omit<Job, 'id' | 'createdAt'>) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    try {
      const job: Job = editingJob 
        ? { ...editingJob, ...data }
        : { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      
      await apiService.saveJob(job);
      setJobs(prev => {
        const index = prev.findIndex(j => j.id === job.id);
        if (index > -1) return prev.map(j => j.id === job.id ? job : j);
        return [job, ...prev];
      });
      setShowJobForm(false);
      setEditingJob(null);
    } catch (error: any) {
      alert(`Failed to save job: ${error.message || error}`);
    }
  };

  const handleToggleJobCompletion = async (job: Job) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    try {
      const updatedJob = { ...job, isComplete: !job.isComplete };
      await apiService.saveJob(updatedJob);
      setJobs(prev => prev.map(j => j.id === job.id ? updatedJob : j));
    } catch (error: any) {
      alert(`Failed to update status: ${error.message || error}`);
    }
  };

  const handleEditTicket = (ticket: DigTicket) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    setEditingTicket(ticket);
    setShowTicketForm(true);
  };

  const handleEditJob = (job: Job) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    setEditingJob(job);
    setShowJobForm(true);
  };

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  const deleteTicket = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentUser?.role !== UserRole.ADMIN) return;
    if (window.confirm("Delete ticket? This cannot be undone.")) {
      try {
        await apiService.deleteTicket(id);
        setTickets(prev => prev.filter(t => t.id !== id));
      } catch (error: any) {
        alert(`Failed to delete: ${error.message || error}`);
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
      if (s === 'urgent') return status === TicketStatus.EXPIRED || status === TicketStatus.EXTENDABLE;
      return (
        status.toLowerCase().includes(s) ||
        t.ticketNo.toLowerCase().includes(s) ||
        t.address.toLowerCase().includes(s) ||
        t.jobNumber.toLowerCase().includes(s) ||
        (t.city && t.city.toLowerCase().includes(s))
      );
    });

    result.sort((a, b) => {
      const valA = a[sortConfig.field] ?? '';
      const valB = b[sortConfig.field] ?? '';
      const factor = sortConfig.order === 'asc' ? 1 : -1;
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return factor * valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      }
      return factor * ((valA as number) - (valB as number));
    });
    return result;
  }, [activeTickets, globalSearch, sortConfig]);

  if (isConfigMissing) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-white p-10 md:p-16 rounded-[3rem] shadow-2xl border border-slate-100 max-w-2xl animate-in zoom-in duration-500">
        <div className="bg-brand/10 text-brand w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-brand/5 rotate-3">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>
        </div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">System Configuration Error</h2>
        <p className="text-slate-500 mt-6 leading-relaxed font-medium">Supabase credentials were provided but appear to be misconfigured or incomplete.</p>
        <div className="mt-10 space-y-4 text-left">
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 group">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Project</h4>
            <p className="text-xs text-slate-600 leading-relaxed font-mono">https://i7zcb2whvav1el36edbv.supabase.co</p>
          </div>
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Key Status</h4>
            <p className="text-xs text-slate-600 leading-relaxed truncate">The Anon Key is loaded into the system memory.</p>
          </div>
        </div>
        <button onClick={() => window.location.reload()} className="w-full mt-10 bg-brand text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-xl shadow-brand/20 active:scale-[0.98]">Reload System</button>
      </div>
    </div>
  );

  if (!currentUser && !isLoading) return <Login onLogin={handleLogin} />;
  
  if (isLoading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-14 h-14 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-6" />
      <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">Synchronizing Environment</p>
    </div>
  );

  if (initError) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl border border-slate-100 max-w-lg">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Sync Delayed</h2>
        <p className="text-slate-500 mt-4 leading-relaxed font-medium">{initError}</p>
        <button onClick={() => window.location.reload()} className="w-full mt-8 bg-brand text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-brand/20">Retry Connection</button>
      </div>
    </div>
  );

  const isAdmin = currentUser.role === UserRole.ADMIN;

  const NavigationBar = () => (
    <div className="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-6 md:pb-8 flex justify-center pointer-events-none">
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/50 shadow-xl rounded-[2.5rem] p-2 flex items-center gap-1 pointer-events-auto">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: 'M4 6h16M4 12h16M4 18h16' },
          { id: 'calendar', label: 'Calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
          { id: 'jobs', label: 'Jobs', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
          { id: 'photos', label: 'Photos', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
          ...(isAdmin ? [{ id: 'team', label: 'Team', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' }] : [])
        ].map((v) => (
          <button 
            key={v.id}
            onClick={() => setActiveView(v.id as AppView)}
            className={`flex flex-col items-center gap-1 py-3 px-5 md:px-8 rounded-[2rem] transition-all group ${activeView === v.id ? 'bg-brand text-white shadow-lg shadow-brand' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={v.icon} /></svg>
            <span className={`text-[8px] font-black uppercase tracking-widest ${activeView === v.id ? 'text-white' : 'text-slate-400'}`}>{v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const SortHeader: React.FC<{ field: SortField, label: string }> = ({ field, label }) => {
    const isActive = sortConfig.field === field;
    return (
      <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
        <button onClick={() => handleSort(field)} className={`flex items-center gap-1.5 hover:text-slate-600 transition-colors ${isActive ? 'text-slate-800' : ''}`}>{label}</button>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4">
          <div className="h-20 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-brand p-2.5 rounded-2xl shadow-lg shadow-brand">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">DigTrack Pro</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${isAdmin ? 'bg-orange-100 text-brand' : 'bg-slate-100 text-slate-500'}`}>{currentUser.role}</span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 max-w-xl relative hidden md:block">
              <input type="text" placeholder="Search database records..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:bg-white focus:ring-4 focus:ring-brand/10 focus:border-brand transition-all" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
              <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                <button onClick={() => setThemeColor('#ea580c')} title="Safety Orange" className="w-4 h-4 rounded-full bg-[#ea580c] shadow-sm hover:scale-125 transition-transform" />
                <button onClick={() => setThemeColor('#2563eb')} title="Utility Blue" className="w-4 h-4 rounded-full bg-[#2563eb] shadow-sm hover:scale-125 transition-transform" />
                <button onClick={() => setThemeColor('#10b981')} title="Water Green" className="w-4 h-4 rounded-full bg-[#10b981] shadow-sm hover:scale-125 transition-transform" />
              </div>

              {isAdmin && activeView === 'jobs' && (
                <button onClick={() => { setEditingJob(null); setShowJobForm(true); }} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-100 text-[10px]">New Job</button>
              )}
              {isAdmin && (
                <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-white px-5 py-3 rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2 shadow-xl shadow-brand text-[10px]">New Ticket</button>
              )}
              <button onClick={handleLogout} className="p-3 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all border border-slate-100"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-8 flex-1 w-full animate-in fade-in slide-in-from-bottom-2 duration-700 pb-44">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <StatCards tickets={activeTickets} />
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/30 border-b border-slate-50">
                    <tr>
                      <SortHeader field="jobNumber" label="Job #" />
                      <SortHeader field="ticketNo" label="Ticket #" />
                      <SortHeader field="address" label="Address" />
                      <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                      <SortHeader field="expirationDate" label="Expires" />
                      <th className="px-6 py-6"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredAndSortedTickets.map(ticket => {
                      const status = getTicketStatus(ticket);
                      return (
                        <tr key={ticket.id} onClick={() => isAdmin && handleEditTicket(ticket)} className={`transition-all group ${isAdmin ? 'cursor-pointer' : ''} ${getRowBgColor(status)}`}>
                          <td className="px-6 py-6 text-xs font-black text-slate-700">{ticket.jobNumber}</td>
                          <td className="px-6 py-6 text-xs font-mono font-bold text-slate-400">{ticket.ticketNo}</td>
                          <td className="px-6 py-6 text-xs font-bold text-slate-500 truncate max-w-[250px]">{ticket.address}</td>
                          <td className="px-6 py-6"><span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest ${getStatusColor(status)} shadow-sm`}>{status}</span></td>
                          <td className="px-6 py-6 text-[11px] font-black text-slate-500">{new Date(ticket.expirationDate).toLocaleDateString()}</td>
                          <td className="px-6 py-6 text-right">
                            {isAdmin && (
                              <button onClick={(e) => deleteTicket(ticket.id, e)} className="p-2 text-slate-200 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
        )}
        {activeView === 'calendar' && <CalendarView tickets={activeTickets} onEditTicket={handleEditTicket} />}
        {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} notes={notes} isAdmin={isAdmin} onEditJob={handleEditJob} onToggleComplete={handleToggleJobCompletion} onAddNote={async (note) => { try { const n = await apiService.addNote({...note, id: crypto.randomUUID(), timestamp: Date.now(), author: currentUser!.name}); setNotes(prev => [n, ...prev]); } catch (error: any) { alert(`Note save failed: ${error.message || error}`); } }} onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} />}
        {activeView === 'photos' && <PhotoManager photos={photos} initialSearch={globalSearch} onAddPhoto={async (metadata, file) => { try { const saved = await apiService.addPhoto(metadata, file); setPhotos(prev => [saved, ...prev]); } catch (error: any) { alert(`Upload failed: ${error.message || error}`); } }} onDeletePhoto={async (id) => { try { await apiService.deletePhoto(id); setPhotos(prev => prev.filter(p => p.id !== id)); } catch (error: any) { alert(`Delete failed: ${error.message || error}`); } }} />}
        {activeView === 'team' && isAdmin && <TeamManagement users={users} currentUserId={currentUser!.id} onAddUser={async (u) => { try { const newUser = await apiService.addUser({...u, id: crypto.randomUUID()}); setUsers(prev => [...prev, newUser]); } catch (error: any) { alert(`User creation failed: ${error.message || error}`); } }} onDeleteUser={async (id) => { try { await apiService.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); } catch (error: any) { alert(`User deletion failed: ${error.message || error}`); } }} onThemeChange={setThemeColor} />}
      </main>

      <NavigationBar />
      {showTicketForm && isAdmin && <TicketForm onAdd={handleSaveTicket} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} initialData={editingTicket || undefined} users={users} />}
      {showJobForm && isAdmin && <JobForm onSave={handleSaveJob} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} />}
    </div>
  );
};

export default App;