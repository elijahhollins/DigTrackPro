import React, { useState, useEffect, useMemo } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, JobNote, UserRecord, Job } from './types.ts';
import { getTicketStatus, getStatusColor, getStatusDotColor, getRowBgColor } from './utils/dateUtils.ts';
import { apiService } from './services/apiService.ts';
import TicketForm from './components/TicketForm.tsx';
import JobForm from './components/JobForm.tsx';
import StatCards from './components/StatCards.tsx';
import JobReview from './components/JobReview.tsx';
import PhotoManager from './components/PhotoManager.tsx';
import CalendarView from './components/CalendarView.tsx';
import TeamManagement from './components/TeamManagement.tsx';

const App: React.FC = () => {
  // Default to a demo admin user to bypass login
  const [currentUser, setCurrentUser] = useState<User | null>({
    id: 'demo-user',
    name: 'Test Administrator',
    username: 'admin',
    role: UserRole.ADMIN
  });

  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [tickets, setTickets] = useState<DigTicket[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  
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

  useEffect(() => {
    const savedColor = localStorage.getItem('dig_theme_color') || '#ea580c';
    setThemeColor(savedColor);
  }, []);

  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      setInitError(null);

      try {
        const [t, j, p, n, u] = await Promise.all([
          apiService.getTickets(),
          apiService.getJobs(),
          apiService.getPhotos(),
          apiService.getNotes(),
          apiService.getUsers()
        ]);

        setTickets(t);
        setJobs(j);
        setPhotos(p);
        setNotes(n);
        setUsers(u);
      } catch (error: any) {
        console.error("Initialization warning:", error);
        // We don't block the UI here anymore since apiService handles fallbacks
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, []);

  const handleLogout = () => {
    if (window.confirm("Bypass logout? Normally this would clear credentials.")) {
      // In bypass mode, we just stay "logged in" as demo
    }
  };

  const handleSaveTicket = async (data: Omit<DigTicket, 'id' | 'createdAt'>) => {
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
      alert(`Failed to save: ${error.message || error}`);
    }
  };

  const handleSaveJob = async (data: Omit<Job, 'id' | 'createdAt'>) => {
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
    try {
      const updatedJob = { ...job, isComplete: !job.isComplete };
      await apiService.saveJob(updatedJob);
      setJobs(prev => prev.map(j => j.id === job.id ? updatedJob : j));
    } catch (error: any) {
      alert(`Update failed: ${error.message || error}`);
    }
  };

  const handleEditTicket = (ticket: DigTicket) => {
    setEditingTicket(ticket);
    setShowTicketForm(true);
  };

  const handleEditJob = (job: Job) => {
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
    if (window.confirm("Delete record?")) {
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

  if (isLoading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-14 h-14 border-4 border-slate-100 border-t-brand rounded-full animate-spin mb-6" />
      <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">Preparing Workspace...</p>
    </div>
  );

  const isAdmin = true; // Forced true for bypass

  const NavigationBar = () => (
    <div className="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-6 md:pb-8 flex justify-center pointer-events-none">
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/50 shadow-xl rounded-[2.5rem] p-2 flex items-center gap-1 pointer-events-auto">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: 'M4 6h16M4 12h16M4 18h16' },
          { id: 'calendar', label: 'Calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
          { id: 'jobs', label: 'Jobs', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
          { id: 'photos', label: 'Photos', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
          { id: 'team', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
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
                  <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-orange-100 text-brand">Admin Mode (Bypass)</span>
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
                <button onClick={() => setThemeColor('#eab308')} title="Gas Yellow" className="w-4 h-4 rounded-full bg-[#eab308] shadow-sm hover:scale-125 transition-transform" />
              </div>

              {activeView === 'jobs' && (
                <button onClick={() => { setEditingJob(null); setShowJobForm(true); }} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-100 text-[10px]">New Job</button>
              )}
              <button onClick={() => { setEditingTicket(null); setShowTicketForm(true); }} className="bg-brand text-white px-5 py-3 rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2 shadow-xl shadow-brand text-[10px]">New Ticket</button>
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
                        <tr key={ticket.id} onClick={() => handleEditTicket(ticket)} className={`transition-all group cursor-pointer ${getRowBgColor(status)}`}>
                          <td className="px-6 py-6 text-xs font-black text-slate-700">{ticket.jobNumber}</td>
                          <td className="px-6 py-6 text-xs font-mono font-bold text-slate-400">{ticket.ticketNo}</td>
                          <td className="px-6 py-6 text-xs font-bold text-slate-500 truncate max-w-[250px]">{ticket.address}</td>
                          <td className="px-6 py-6"><span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest ${getStatusColor(status)} shadow-sm`}>{status}</span></td>
                          <td className="px-6 py-6 text-[11px] font-black text-slate-500">{new Date(ticket.expirationDate).toLocaleDateString()}</td>
                          <td className="px-6 py-6 text-right">
                            <button onClick={(e) => deleteTicket(ticket.id, e)} className="p-2 text-slate-200 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
        {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} notes={notes} isAdmin={true} onEditJob={handleEditJob} onToggleComplete={handleToggleJobCompletion} onAddNote={async (note) => { try { const n = await apiService.addNote({...note, id: crypto.randomUUID(), timestamp: Date.now(), author: currentUser!.name}); setNotes(prev => [n, ...prev]); } catch (error: any) { alert(`Note save failed: ${error.message || error}`); } }} onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} />}
        {activeView === 'photos' && <PhotoManager photos={photos} initialSearch={globalSearch} onAddPhoto={async (metadata, file) => { try { const saved = await apiService.addPhoto(metadata, file); setPhotos(prev => [saved, ...prev]); } catch (error: any) { alert(`Upload failed: ${error.message || error}`); } }} onDeletePhoto={async (id) => { try { await apiService.deletePhoto(id); setPhotos(prev => prev.filter(p => p.id !== id)); } catch (error: any) { alert(`Delete failed: ${error.message || error}`); } }} />}
        {activeView === 'team' && <TeamManagement users={users} currentUserId={currentUser!.id} onAddUser={async (u) => { try { const newUser = await apiService.addUser({...u, id: crypto.randomUUID()}); setUsers(prev => [...prev, newUser]); } catch (error: any) { alert(`User creation failed: ${error.message || error}`); } }} onDeleteUser={async (id) => { try { await apiService.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); } catch (error: any) { alert(`User deletion failed: ${error.message || error}`); } }} onThemeChange={setThemeColor} />}
      </main>

      <NavigationBar />
      {showTicketForm && <TicketForm onAdd={handleSaveTicket} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} initialData={editingTicket || undefined} users={users} />}
      {showJobForm && <JobForm onSave={handleSaveJob} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} />}
    </div>
  );
};

export default App;