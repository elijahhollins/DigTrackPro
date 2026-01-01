
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
    field: 'createdAt', order: 'desc'
  });

  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      try {
        const savedUser = localStorage.getItem('dig_auth_user');
        if (savedUser) setCurrentUser(JSON.parse(savedUser));
        
        const [t, p, n, u] = await Promise.all([
          apiService.getTickets(), apiService.getPhotos(),
          apiService.getNotes(), apiService.getUsers()
        ]);
        setTickets(t); setPhotos(p); setNotes(n); setUsers(u);
      } catch (err) { console.error(err); } 
      finally { setIsLoading(false); }
    };
    initApp();
  }, []);

  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('dig_auth_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    if (window.confirm("Sign out of DigTrack?")) {
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
      const idx = prev.findIndex(t => t.id === ticket.id);
      return idx > -1 ? prev.map(t => t.id === ticket.id ? ticket : t) : [ticket, ...prev];
    });
    setShowForm(false);
    setEditingTicket(null);
  };

  const deleteTicket = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete record?")) {
      await apiService.deleteTicket(id);
      setTickets(prev => prev.filter(t => t.id !== id));
    }
  };

  const filteredTickets = useMemo(() => {
    let result = tickets.filter(t => {
      const s = globalSearch.toLowerCase();
      const st = getTicketStatus(t);
      if (s === 'urgent') return st === TicketStatus.EXPIRED || st === TicketStatus.EXTENDABLE;
      return t.ticketNo.toLowerCase().includes(s) || t.address.toLowerCase().includes(s) || t.jobNumber.toLowerCase().includes(s);
    });

    result.sort((a, b) => {
      const valA = a[sortConfig.field] ?? '';
      const valB = b[sortConfig.field] ?? '';
      const order = sortConfig.order === 'asc' ? 1 : -1;
      return order * (valA > valB ? 1 : -1);
    });
    return result;
  }, [tickets, globalSearch, sortConfig]);

  if (!currentUser) return <Login onLogin={handleLogin} />;
  
  if (isLoading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
      <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">Loading Records</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2.5 rounded-2xl shadow-xl shadow-blue-100">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">DigTrack Pro</h1>
              <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest mt-1.5">{currentUser.role} PANEL</p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'calendar', label: 'Calendar' },
              { id: 'jobs', label: 'Jobs' },
              { id: 'photos', label: 'Photos' },
              ...(isAdmin ? [{ id: 'team', label: 'Team' }] : [])
            ].map(v => (
              <button key={v.id} onClick={() => setActiveView(v.id as AppView)} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeView === v.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {v.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button onClick={() => { setEditingTicket(null); setShowForm(true); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100">
                Create Ticket
              </button>
            )}
            <button onClick={handleLogout} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 hover:text-rose-500 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-10 flex-1 w-full animate-in fade-in duration-700">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            <StatCards tickets={tickets} />
            
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div className="relative w-full max-w-md">
                   <input type="text" placeholder="Search by address, ticket #, or job #..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
                   <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/30">
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-8 py-5">Job ID</th>
                      <th className="px-8 py-5">Ticket Number</th>
                      <th className="px-8 py-5">Site Address</th>
                      <th className="px-8 py-5">Status</th>
                      <th className="px-8 py-5">Dig Start</th>
                      <th className="px-8 py-5 text-right">Expiration</th>
                      <th className="px-8 py-5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredTickets.map(t => {
                      const st = getTicketStatus(t);
                      return (
                        <tr key={t.id} onClick={() => isAdmin && (setEditingTicket(t), setShowForm(true))} className="hover:bg-blue-50/20 transition-all cursor-pointer group">
                          <td className="px-8 py-6 text-xs font-black text-slate-800">{t.jobNumber}</td>
                          <td className="px-8 py-6 text-xs font-mono font-bold text-slate-400">{t.ticketNo}</td>
                          <td className="px-8 py-6 text-xs font-bold text-slate-500 truncate max-w-[250px]">{t.address}</td>
                          <td className="px-8 py-6">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest shadow-sm ${getStatusColor(st)}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${getStatusDotColor(st)}`}></span>{st}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-[11px] font-bold text-slate-500">{new Date(t.digStart).toLocaleDateString()}</td>
                          <td className="px-8 py-6 text-[11px] font-black text-slate-800 text-right">{new Date(t.expirationDate).toLocaleDateString()}</td>
                          <td className="px-8 py-6 text-right">
                            {isAdmin && (
                              <button onClick={(e) => deleteTicket(t.id, e)} className="p-2 text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

        {activeView === 'calendar' && <CalendarView tickets={tickets} onEditTicket={(t) => { setEditingTicket(t); setShowForm(true); }} />}
        
        {activeView === 'jobs' && (
          <JobReview 
            tickets={tickets} 
            notes={notes} 
            onAddNote={async (n) => { 
              const saved = await apiService.addNote({...n, id: crypto.randomUUID(), timestamp: Date.now(), author: currentUser.name}); 
              setNotes(prev => [saved, ...prev]); 
            }} 
            onViewPhotos={(j) => { setGlobalSearch(j); setActiveView('photos'); }} 
          />
        )}

        {activeView === 'photos' && (
          <PhotoManager 
            photos={photos} 
            initialSearch={globalSearch} 
            onAddPhoto={async (p) => { 
              const s = await apiService.addPhoto(p); 
              setPhotos(prev => [s, ...prev]); 
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
              const n = await apiService.addUser({...u, id: crypto.randomUUID()}); 
              setUsers(prev => [...prev, n]); 
            }} 
            onDeleteUser={async (id) => { 
              await apiService.deleteUser(id); 
              setUsers(prev => prev.filter(u => u.id !== id)); 
            }} 
          />
        )}
      </main>

      {showForm && (
        <TicketForm 
          onAdd={handleSaveTicket} 
          onClose={() => { setShowForm(false); setEditingTicket(null); }} 
          initialData={editingTicket || undefined} 
        />
      )}

      {/* Mobile Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-around p-4 z-50 shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
        {['dashboard', 'calendar', 'jobs', 'photos'].map(v => (
          <button key={v} onClick={() => setActiveView(v as AppView)} className={`flex flex-col items-center gap-1 ${activeView === v ? 'text-blue-600' : 'text-slate-300'}`}>
            <div className={`w-1 h-1 rounded-full mb-1 ${activeView === v ? 'bg-blue-600' : 'bg-transparent'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest">{v}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default App;
