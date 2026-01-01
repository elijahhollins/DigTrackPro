
import React, { useState, useEffect, useMemo } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, JobNote, UserRecord } from './types';
import { getTicketStatus, getStatusColor, getStatusDotColor } from './utils/dateUtils';
import { apiService } from './services/apiService';
import TicketForm from './components/TicketForm';
import StatCards from './components/StatCards';
import JobReview from './components/JobReview';
import PhotoManager from './components/PhotoManager';
import CalendarView from './components/CalendarView';
import Login from './components/Login';
import TeamManagement from './components/TeamManagement';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [tickets, setTickets] = useState<DigTicket[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showForm, setShowForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState<DigTicket | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ field: SortField; order: SortOrder }>({
    field: 'createdAt',
    order: 'desc'
  });

  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      try {
        const savedUser = localStorage.getItem('dig_auth_user');
        if (savedUser) setCurrentUser(JSON.parse(savedUser));

        const [t, p, n, u] = await Promise.all([
          apiService.getTickets(),
          apiService.getPhotos(),
          apiService.getNotes(),
          apiService.getUsers()
        ]);

        setTickets(t);
        setPhotos(p);
        setNotes(n);
        setUsers(u);
      } catch (error) {
        console.error("Initialization Error:", error);
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

  const handleAddUser = async (userData: Omit<UserRecord, 'id'>) => {
    const newUser = await apiService.addUser({ ...userData, id: crypto.randomUUID() });
    setUsers(prev => [...prev, newUser]);
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) return alert("Cannot delete yourself.");
    if (window.confirm("Remove user?")) {
      await apiService.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  const handleSaveTicket = async (data: Omit<DigTicket, 'id' | 'createdAt'>) => {
    const ticket: DigTicket = editingTicket 
      ? { ...editingTicket, ...data }
      : { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
    
    await apiService.saveTicket(ticket);
    setTickets(prev => {
      const index = prev.findIndex(t => t.id === ticket.id);
      if (index > -1) return prev.map(t => t.id === ticket.id ? ticket : t);
      return [ticket, ...prev];
    });
    setShowForm(false);
    setEditingTicket(null);
  };

  const handleEdit = (ticket: DigTicket) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    setEditingTicket(ticket);
    setShowForm(true);
  };

  const deleteTicket = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete ticket?")) {
      await apiService.deleteTicket(id);
      setTickets(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleAddNote = async (note: Omit<JobNote, 'id' | 'timestamp' | 'author'>) => {
    const newNote = await apiService.addNote({
      ...note,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      author: currentUser?.name || 'Unknown'
    });
    setNotes(prev => [newNote, ...prev]);
  };

  const handleAddPhoto = async (photo: JobPhoto) => {
    const saved = await apiService.addPhoto(photo);
    setPhotos(prev => [saved, ...prev]);
  };

  const handleDeletePhoto = async (id: string) => {
    await apiService.deletePhoto(id);
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredAndSortedTickets = useMemo(() => {
    let result = tickets.filter(t => {
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
      if (typeof valA === 'string' && typeof valB === 'string') return factor * valA.localeCompare(valB);
      return factor * ((valA as number) - (valB as number));
    });
    return result;
  }, [tickets, globalSearch, sortConfig]);

  const urgentTicketsCount = useMemo(() => {
    return tickets.filter(t => {
      const s = getTicketStatus(t);
      return s === TicketStatus.EXPIRED || s === TicketStatus.EXTENDABLE;
    }).length;
  }, [tickets]);

  if (!currentUser) return <Login onLogin={handleLogin} />;
  
  if (isLoading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6" />
      <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">Syncing Data</p>
    </div>
  );

  const isAdmin = currentUser.role === UserRole.ADMIN;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) return (
      <svg className="w-3 h-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
    );
    return sortConfig.order === 'asc' 
      ? <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>;
  };

  const NavButtons = () => (
    <div className="flex items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
      {[
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'jobs', label: 'Jobs' },
        { id: 'photos', label: 'Photos' },
        ...(isAdmin ? [{ id: 'team', label: 'Team' }] : [])
      ].map((v) => (
        <button 
          key={v.id}
          onClick={() => setActiveView(v.id as AppView)}
          className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeView === v.id ? 'bg-white text-blue-600 shadow-md shadow-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-8 flex flex-col">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4">
          <div className="h-20 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-100">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">DigTrack Pro</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${isAdmin ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                    {currentUser.role}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 max-w-xl relative hidden md:block">
              <input
                type="text"
                placeholder="Search database..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-400"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
              />
              <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <div className="hidden lg:block">
                <NavButtons />
              </div>

              {isAdmin && (
                <button
                  onClick={() => { setEditingTicket(null); setShowForm(true); }}
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 shadow-xl shadow-blue-50 text-[10px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                  <span className="hidden sm:inline">Add Ticket</span>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="p-2.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all border border-slate-100 hover:border-rose-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-100 px-6 py-4 flex justify-between items-center z-50 shadow-[0_-8px_20px_rgba(0,0,0,0.03)]">
        {[
          { id: 'dashboard', icon: 'M4 6h16M4 12h16M4 18h16' },
          { id: 'calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
          { id: 'jobs', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
          { id: 'photos', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
          ...(isAdmin ? [{ id: 'team', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' }] : [])
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => setActiveView(item.id as AppView)}
            className={`flex flex-col items-center gap-1 ${activeView === item.id ? 'text-blue-600' : 'text-slate-300'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} /></svg>
            <span className="text-[9px] font-black uppercase tracking-widest">{item.id}</span>
          </button>
        ))}
      </nav>

      <main className="max-w-[1600px] mx-auto px-4 py-8 flex-1 w-full animate-in fade-in slide-in-from-bottom-2 duration-700">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            {urgentTicketsCount > 0 && globalSearch !== 'urgent' && (
              <div className="bg-rose-50/50 border border-rose-100 rounded-[2rem] p-6 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-rose-500 text-white p-2.5 rounded-2xl shadow-lg shadow-rose-100 animate-pulse">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-black text-rose-900 uppercase tracking-tight">Critical Attention Required</p>
                    <p className="text-xs text-rose-600 font-medium">There are {urgentTicketsCount} tickets that require your immediate review.</p>
                  </div>
                </div>
                <button onClick={() => setGlobalSearch('urgent')} className="px-5 py-2.5 bg-white text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-rose-600 hover:text-white transition-all border border-rose-100">Review Now</button>
              </div>
            )}

            <StatCards tickets={tickets} />

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/30 border-b border-slate-50">
                    <tr>
                      {[
                        { id: 'jobNumber', label: 'Job #' },
                        { id: 'ticketNo', label: 'Ticket #' },
                        { id: 'address', label: 'Address' },
                        { id: 'city', label: 'City' },
                        { id: 'status', label: 'Status' },
                        { id: 'digStart', label: 'Dig Start' },
                        { id: 'expirationDate', label: 'Expires' },
                        { id: 'actions', label: '' }
                      ].map(col => (
                        <th key={col.id} onClick={() => col.id !== 'actions' && handleSort(col.id as SortField)} className={`px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ${col.id !== 'actions' ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}>
                          <div className="flex items-center gap-1.5">
                            {col.label} {col.id !== 'actions' && <SortIcon field={col.id as SortField} />}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredAndSortedTickets.map(ticket => {
                      const status = getTicketStatus(ticket);
                      const isUrgent = status === TicketStatus.EXPIRED || status === TicketStatus.EXTENDABLE;
                      return (
                        <tr key={ticket.id} onClick={() => handleEdit(ticket)} className={`hover:bg-blue-50/20 transition-all group cursor-pointer ${isUrgent ? 'bg-rose-50/5' : ''}`}>
                          <td className="px-6 py-6 text-xs font-black text-slate-700">{ticket.jobNumber}</td>
                          <td className="px-6 py-6 text-xs font-mono font-bold text-slate-400">{ticket.ticketNo}</td>
                          <td className="px-6 py-6 text-xs font-bold text-slate-500 truncate max-w-[200px]">{ticket.address}</td>
                          <td className="px-6 py-6 text-xs font-bold text-slate-400 uppercase tracking-tight">{ticket.city}</td>
                          <td className="px-6 py-6">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest ${getStatusColor(status)} shadow-sm shadow-slate-100`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${getStatusDotColor(status)}`}></span>
                              {status}
                            </span>
                          </td>
                          <td className="px-6 py-6 text-[11px] text-slate-500 font-bold">{new Date(ticket.digStart).toLocaleDateString()}</td>
                          <td className={`px-6 py-6 text-[11px] font-black ${isUrgent ? 'text-rose-500 underline decoration-rose-200 decoration-2 underline-offset-8' : 'text-slate-500'}`}>{new Date(ticket.expirationDate).toLocaleDateString()}</td>
                          <td className="px-6 py-6 text-right">
                            {isAdmin && (
                              <button onClick={(e) => deleteTicket(ticket.id, e)} className="p-2 text-slate-200 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredAndSortedTickets.length === 0 && (
                <div className="py-24 text-center">
                  <div className="bg-slate-50 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">No matching records</h3>
                  <p className="text-xs text-slate-400 mt-2">Try a different search or clear your filters.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'calendar' && <CalendarView tickets={tickets} onEditTicket={handleEdit} />}
        {activeView === 'jobs' && <JobReview tickets={tickets} notes={notes} onAddNote={handleAddNote} onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} />}
        {activeView === 'photos' && <PhotoManager photos={photos} initialSearch={globalSearch} onAddPhoto={handleAddPhoto} onDeletePhoto={handleDeletePhoto} />}
        {activeView === 'team' && isAdmin && <TeamManagement users={users} currentUserId={currentUser.id} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} />}
      </main>

      {showForm && isAdmin && (
        <TicketForm 
          onAdd={handleSaveTicket} 
          onClose={() => { setShowForm(false); setEditingTicket(null); }} 
          initialData={editingTicket || undefined} 
        />
      )}
    </div>
  );
};

export default App;
