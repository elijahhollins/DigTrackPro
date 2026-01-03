import React, { useState, useEffect, useMemo } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, JobNote, UserRecord, Job } from './types.ts';
import { getTicketStatus, getStatusColor, getStatusDotColor, getRowBgColor } from './utils/dateUtils.ts';
import { apiService, SQL_SCHEMA, RESET_SQL_SCHEMA } from './services/apiService.ts';
import TicketForm from './components/TicketForm.tsx';
import JobForm from './components/JobForm.tsx';
import StatCards from './components/StatCards.tsx';
import JobReview from './components/JobReview.tsx';
import PhotoManager from './components/PhotoManager.tsx';
import CalendarView from './components/CalendarView.tsx';
import TeamManagement from './components/TeamManagement.tsx';

const App: React.FC = () => {
  const [currentUser] = useState<User | null>({
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
  const [isSynced, setIsSynced] = useState<boolean | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copying, setCopying] = useState<'standard' | 'reset' | null>(null);
  
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

  const initApp = async () => {
    setIsLoading(true);
    try {
      const status = await apiService.getSyncStatus();
      setIsSynced(status.synced);
      setSyncError(status.error || null);
      setDiagnostics(status.diagnostics || null);

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
      setSyncError(error.message || "Failed to connect to database");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedColor = localStorage.getItem('dig_theme_color') || '#ea580c';
    setThemeColor(savedColor);
    initApp();
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
      alert(`Database error: ${error.message || error}`);
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
      alert(`Database error: ${error.message || error}`);
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
    if (window.confirm("Permanent delete?")) {
      try {
        await apiService.deleteTicket(id);
        setTickets(prev => prev.filter(t => t.id !== id));
      } catch (error: any) {
        alert(`Delete failed: ${error.message || error}`);
      }
    }
  };

  const handleCopySQL = async (mode: 'standard' | 'reset') => {
    setCopying(mode);
    try {
      const sql = mode === 'standard' ? SQL_SCHEMA : RESET_SQL_SCHEMA;
      await navigator.clipboard.writeText(sql);
      alert(mode === 'standard' ? "Standard SQL Copied!" : "RESET & REBUILD SQL Copied! Warning: This drops existing tables.");
    } catch (err) {
      console.error("Copy fail:", err);
    } finally {
      setCopying(null);
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
      return (
        status.toLowerCase().includes(s) ||
        t.ticketNo.toLowerCase().includes(s) ||
        t.address.toLowerCase().includes(s) ||
        t.jobNumber.toLowerCase().includes(s)
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
      <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">Testing Connection...</p>
    </div>
  );

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
                  <div className={`w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className={`text-[8px] font-black uppercase tracking-widest ${isSynced ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isSynced ? 'Supabase Connected' : 'Local Backup Mode'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 max-w-xl relative hidden md:block">
              <input type="text" placeholder="Search project numbers, tickets, or addresses..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:bg-white focus:ring-4 focus:ring-brand/10 focus:border-brand transition-all" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
              <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <button onClick={initApp} title="Re-test Sync" className="p-3 text-slate-400 hover:text-brand transition-colors">
                <svg className={`w-5 h-5 ${isLoading ? 'animate-spin text-brand' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                <button onClick={() => setThemeColor('#ea580c')} className="w-4 h-4 rounded-full bg-[#ea580c] shadow-sm hover:scale-125 transition-transform" />
                <button onClick={() => setThemeColor('#2563eb')} className="w-4 h-4 rounded-full bg-[#2563eb] shadow-sm hover:scale-125 transition-transform" />
                <button onClick={() => setThemeColor('#10b981')} className="w-4 h-4 rounded-full bg-[#10b981] shadow-sm hover:scale-125 transition-transform" />
                <button onClick={() => setThemeColor('#eab308')} className="w-4 h-4 rounded-full bg-[#eab308] shadow-sm hover:scale-125 transition-transform" />
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
        {!isSynced && isSynced !== null && (
          <div className="mb-6 bg-white border border-rose-100 p-8 rounded-[3rem] shadow-2xl shadow-rose-100/50 flex flex-col items-center text-center max-w-2xl mx-auto">
            <div className="bg-rose-50 p-6 rounded-[2.5rem] text-rose-500 mb-6">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Database Connection Failed</h2>
            <div className="mt-4 p-4 bg-rose-50/50 rounded-2xl border border-rose-100 w-full">
              <p className="text-xs font-mono font-bold text-rose-600 break-words uppercase leading-relaxed">
                {syncError || "Unknown Connection Error"}
              </p>
            </div>
            
            <p className="text-sm text-slate-400 font-medium mt-6 leading-relaxed">
              The app is currently running in <b>Local Mode</b>. Your work will save to this browser only. To fix sync, verify your Supabase keys in <code className="bg-slate-100 px-1 rounded">index.html</code>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-8">
              <button 
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
              >
                {showDiagnostics ? 'Hide Credentials' : 'Check Credentials'}
              </button>
              <button 
                onClick={() => handleCopySQL('standard')}
                className="px-6 py-4 border-2 border-rose-100 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 transition-all"
              >
                Copy Setup SQL
              </button>
            </div>

            {showDiagnostics && diagnostics && (
              <div className="w-full mt-6 p-6 bg-slate-50 rounded-[2rem] border border-slate-200 text-left animate-in slide-in-from-top-4 duration-300">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Diagnostics Panel</p>
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">Target URL:</span>
                    <code className="text-xs font-mono font-bold text-slate-800 break-all">{diagnostics.url || 'NOT_SET'}</code>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">Anon Key (Masked):</span>
                    <code className="text-xs font-mono font-bold text-slate-800 break-all">{diagnostics.anonKey || 'NOT_SET'}</code>
                  </div>
                  <div className="pt-4 border-t border-slate-200 mt-4">
                    <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
                      If the URL/Key look wrong, edit the <code className="text-slate-600">window.process.env</code> values inside your <code className="text-slate-600">index.html</code> file.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(isSynced || isSynced === null) && (
          <>
            {activeView === 'dashboard' && (
              <div className="space-y-6">
                <StatCards tickets={activeTickets} />
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/30 border-b border-slate-50">
                        <tr>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <button onClick={() => handleSort('jobNumber')} className="flex items-center gap-1.5 hover:text-slate-600">Job #</button>
                          </th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <button onClick={() => handleSort('ticketNo')} className="flex items-center gap-1.5 hover:text-slate-600">Ticket #</button>
                          </th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <button onClick={() => handleSort('address')} className="flex items-center gap-1.5 hover:text-slate-600">Address</button>
                          </th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                          <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <button onClick={() => handleSort('expirationDate')} className="flex items-center gap-1.5 hover:text-slate-600">Expires</button>
                          </th>
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
                        {filteredAndSortedTickets.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-20 text-center">
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">No tickets found in this view</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {activeView === 'calendar' && <CalendarView tickets={activeTickets} onEditTicket={handleEditTicket} />}
            {activeView === 'jobs' && <JobReview tickets={tickets} jobs={jobs} notes={notes} isAdmin={true} onEditJob={handleEditJob} onToggleComplete={handleToggleJobCompletion} onAddNote={async (note) => { const n = await apiService.addNote({...note, id: crypto.randomUUID(), timestamp: Date.now(), author: 'Admin'}); setNotes(prev => [n, ...prev]); }} onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} />}
            {activeView === 'photos' && <PhotoManager photos={photos} initialSearch={globalSearch} onAddPhoto={async (metadata, file) => { const saved = await apiService.addPhoto(metadata, file); setPhotos(prev => [saved, ...prev]); }} onDeletePhoto={async (id) => { await apiService.deletePhoto(id); setPhotos(prev => prev.filter(p => p.id !== id)); }} />}
            {activeView === 'team' && <TeamManagement users={users} currentUserId="demo-user" onAddUser={async (u) => { const newUser = await apiService.addUser({...u, id: crypto.randomUUID()}); setUsers(prev => [...prev, newUser]); }} onDeleteUser={async (id) => { await apiService.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); }} onThemeChange={setThemeColor} />}
          </>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-6 md:pb-8 flex justify-center pointer-events-none">
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/50 shadow-xl rounded-[2.5rem] p-2 flex items-center gap-1 pointer-events-auto">
          {[
            { id: 'dashboard', label: 'Tickets', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { id: 'calendar', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'jobs', label: 'Projects', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
            { id: 'photos', label: 'Media', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'team', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
          ].map((v) => (
            <button key={v.id} onClick={() => setActiveView(v.id as AppView)} className={`flex flex-col items-center gap-1 py-3 px-6 md:px-10 rounded-[2.2rem] transition-all group ${activeView === v.id ? 'bg-brand text-white shadow-lg shadow-brand' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={v.icon} /></svg>
              <span className={`text-[8px] font-black uppercase tracking-widest ${activeView === v.id ? 'text-white' : 'text-slate-400'}`}>{v.label}</span>
            </button>
          ))}
        </div>
      </div>
      {showTicketForm && <TicketForm onAdd={handleSaveTicket} onClose={() => { setShowTicketForm(false); setEditingTicket(null); }} initialData={editingTicket || undefined} users={users} />}
      {showJobForm && <JobForm onSave={handleSaveJob} onClose={() => { setShowJobForm(false); setEditingJob(null); }} initialData={editingJob || undefined} />}
    </div>
  );
};

export default App;