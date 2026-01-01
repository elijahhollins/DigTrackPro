
import React, { useState, useEffect, useMemo } from 'react';
import { DigTicket, SortField, SortOrder, TicketStatus, AppView, JobPhoto, User, UserRole, JobNote, UserRecord } from './types';
import { getTicketStatus, getStatusColor, getStatusDotColor, getRowBgColor } from './utils/dateUtils';
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
    if (window.confirm("Delete ticket? This cannot be undone.")) {
      await apiService.deleteTicket(id);
      setTickets(prev => prev.filter(t => t.id !== id));
    }
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

  if (!currentUser) return <Login onLogin={handleLogin} />;
  
  if (isLoading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-14 h-14 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin mb-6" />
      <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]">Loading Project Data</p>
    </div>
  );

  const isAdmin = currentUser.role === UserRole.ADMIN;

  const NavigationBar = () => (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 md:pb-6">
      <div className="max-w-2xl mx-auto bg-white/90 backdrop-blur-xl border border-slate-200/50 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-[2.5rem] p-2 flex items-center justify-between">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: 'M4 6h16M4 12h16M4 18h16' },
          { id: 'calendar', label: 'Calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
          { id: 'jobs', label: 'Jobs', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
          { id: 'photos', label: 'Photos', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
          ...(isAdmin ? [{ id: 'team', label: 'Team', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' }] : [])
        ].map((v) => (
          <button 
            key={v.id}
            onClick={() => setActiveView(v.id as AppView)}
            className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-[2rem] transition-all group ${activeView === v.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={v.icon} /></svg>
            <span className={`text-[8px] font-black uppercase tracking-widest ${activeView === v.id ? 'text-white' : 'text-slate-400'}`}>{v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative pb-32">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4">
          <div className="h-20 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-orange-500 p-2.5 rounded-2xl shadow-lg shadow-orange-100">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">DigTrack Pro</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${isAdmin ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                    {currentUser.role}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 max-w-xl relative hidden md:block">
              <input
                type="text"
                placeholder="Search database..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:bg-white focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all placeholder:text-slate-400"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
              />
              <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="flex items-center gap-4 ml-auto">
              {isAdmin && (
                <button
                  onClick={() => { setEditingTicket(null); setShowForm(true); }}
                  className="bg-orange-500 text-white px-5 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center gap-2 shadow-xl shadow-orange-100 text-[10px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                  <span className="hidden sm:inline">New Ticket</span>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="p-3 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all border border-slate-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-8 flex-1 w-full animate-in fade-in slide-in-from-bottom-2 duration-700">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <StatCards tickets={tickets} />
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/30 border-b border-slate-50">
                    <tr>
                      {['Job #', 'Ticket #', 'Address', 'Status', 'Expires', ''].map((label, idx) => (
                        <th key={idx} className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredAndSortedTickets.map(ticket => {
                      const status = getTicketStatus(ticket);
                      return (
                        <tr 
                          key={ticket.id} 
                          onClick={() => handleEdit(ticket)} 
                          className={`transition-all group cursor-pointer ${getRowBgColor(status)}`}
                        >
                          <td className="px-6 py-6 text-xs font-black text-slate-700">{ticket.jobNumber}</td>
                          <td className="px-6 py-6 text-xs font-mono font-bold text-slate-400">{ticket.ticketNo}</td>
                          <td className="px-6 py-6 text-xs font-bold text-slate-500 truncate max-w-[250px]">{ticket.address}, {ticket.city}</td>
                          <td className="px-6 py-6">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest ${getStatusColor(status)} shadow-sm`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${getStatusDotColor(status)}`}></span>
                              {status}
                            </span>
                          </td>
                          <td className={`px-6 py-6 text-[11px] font-black ${status === TicketStatus.EXPIRED ? 'text-rose-500' : 'text-slate-500'}`}>
                            {new Date(ticket.expirationDate).toLocaleDateString()}
                          </td>
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
            </div>
          </div>
        )}

        {activeView === 'calendar' && <CalendarView tickets={tickets} onEditTicket={handleEdit} />}
        {activeView === 'jobs' && (
          <JobReview 
            tickets={tickets} 
            notes={notes} 
            onAddNote={async (note) => {
              const n = await apiService.addNote({...note, id: crypto.randomUUID(), timestamp: Date.now(), author: currentUser.name});
              setNotes(prev => [n, ...prev]);
            }} 
            onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} 
          />
        )}
        {activeView === 'photos' && (
          <PhotoManager 
            photos={photos} 
            initialSearch={globalSearch} 
            onAddPhoto={async (p) => {
              const saved = await apiService.addPhoto(p);
              setPhotos(prev => [saved, ...prev]);
            }} 
            onDeletePhoto={async (id) => {
              await apiService.deletePhoto(id);
              setPhotos(prev => prev.filter(p => p.id !== id));
            }} 
          />
        )}
        {activeView === 'team' && isAdmin && (
          <TeamManagement 
            users={users} 
            currentUserId={currentUser.id} 
            onAddUser={async (u) => {
              const newUser = await apiService.addUser({...u, id: crypto.randomUUID()});
              setUsers(prev => [...prev, newUser]);
            }} 
            onDeleteUser={async (id) => {
              await apiService.deleteUser(id);
              setUsers(prev => prev.filter(u => u.id !== id));
            }} 
          />
        )}
      </main>

      <NavigationBar />

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
