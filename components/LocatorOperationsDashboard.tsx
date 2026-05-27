import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { DigTicket, Job, UserRecord, UserRole } from '../types.ts';
import { formatDateStr } from '../utils/dateUtils.ts';

interface LocatorOperationsDashboardProps {
  tickets: DigTicket[];
  jobs: Job[];
  users: UserRecord[];
  isDarkMode: boolean;
  isAdmin: boolean;
  onAssignTicket: (ticketId: string, crewId: string | null) => Promise<void>;
  onUpdateTicketType: (ticketId: string, ticketType: 'standard' | 'inbound') => Promise<void>;
  onOpenNotes: (ticket: DigTicket) => void;
  onUploadPhoto: (ticketId: string, file: File) => Promise<void>;
  ticketIdsWithNotes: Set<string>;
  photoCountsByJob: Map<string, number>;
}

type DispatchSort = 'priority' | 'tech' | 'dueDate' | 'location';
type SortOrder = 'asc' | 'desc';
type DueFilter = 'all' | 'overdue' | 'next7' | 'today';

const parseDate = (value?: string) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
};

const LocatorOperationsDashboard = ({
  tickets,
  jobs,
  users,
  isDarkMode,
  isAdmin,
  onAssignTicket,
  onUpdateTicketType,
  onOpenNotes,
  onUploadPhoto,
  ticketIdsWithNotes,
  photoCountsByJob,
}: LocatorOperationsDashboardProps) => {
  const crewMembers = users.filter(u => u.role === UserRole.CREW);
  const crewNameById = useMemo(() => {
    const map = new Map<string, string>();
    crewMembers.forEach(crew => map.set(crew.id, crew.name || crew.username));
    return map;
  }, [crewMembers]);

  const [search, setSearch] = useState('');
  const [crewFilter, setCrewFilter] = useState('all');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<'all' | 'standard' | 'inbound'>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [sortBy, setSortBy] = useState<DispatchSort>('priority');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [uploadingTicketId, setUploadingTicketId] = useState<string | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const activeTickets = tickets.filter(t => !t.isArchived);
  const inboundTickets = activeTickets.filter(t => (t.ticketType || 'standard') === 'inbound');
  const unassignedTickets = activeTickets.filter(t => !t.assignedCrewId);
  const activeCrewCount = new Set(activeTickets.map(t => t.assignedCrewId).filter(Boolean)).size;

  const getClientLabel = (ticket: DigTicket) =>
    jobs.find(j => j.jobNumber === ticket.jobNumber)?.customer || ticket.siteContact || 'Field Request';

  const getDueDate = (ticket: DigTicket) => ticket.digByDate || ticket.workDate || ticket.expires;

  const dispatchList = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const inSevenDays = startOfToday + (7 * 24 * 60 * 60 * 1000);
    const todayEnd = startOfToday + (24 * 60 * 60 * 1000);
    const searchValue = search.trim().toLowerCase();

    const filtered = activeTickets.filter(ticket => {
      const type = ticket.ticketType || 'standard';
      const dueTime = parseDate(getDueDate(ticket));
      const location = `${ticket.street} ${ticket.city} ${ticket.state}`.toLowerCase();
      const assignedName = ticket.assignedCrewId ? (crewNameById.get(ticket.assignedCrewId) || '').toLowerCase() : '';
      const client = getClientLabel(ticket).toLowerCase();

      if (ticketTypeFilter !== 'all' && type !== ticketTypeFilter) return false;
      if (crewFilter === 'unassigned' && ticket.assignedCrewId) return false;
      if (crewFilter !== 'all' && crewFilter !== 'unassigned' && ticket.assignedCrewId !== crewFilter) return false;
      if (dueFilter === 'overdue' && !(dueTime < startOfToday)) return false;
      if (dueFilter === 'today' && !(dueTime >= startOfToday && dueTime < todayEnd)) return false;
      if (dueFilter === 'next7' && !(dueTime >= startOfToday && dueTime <= inSevenDays)) return false;
      if (searchValue && ![
        ticket.ticketNo,
        ticket.jobNumber,
        location,
        client,
        assignedName,
      ].join(' ').toLowerCase().includes(searchValue)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const direction = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'priority') {
        if (!a.assignedCrewId && b.assignedCrewId) return -1;
        if (a.assignedCrewId && !b.assignedCrewId) return 1;
        return parseDate(getDueDate(a)) - parseDate(getDueDate(b));
      }
      if (sortBy === 'tech') {
        const aName = a.assignedCrewId ? (crewNameById.get(a.assignedCrewId) || 'Unassigned') : 'Unassigned';
        const bName = b.assignedCrewId ? (crewNameById.get(b.assignedCrewId) || 'Unassigned') : 'Unassigned';
        return direction * aName.localeCompare(bName);
      }
      if (sortBy === 'dueDate') {
        return direction * (parseDate(getDueDate(a)) - parseDate(getDueDate(b)));
      }
      const aLocation = `${a.street} ${a.city} ${a.state}`;
      const bLocation = `${b.street} ${b.city} ${b.state}`;
      return direction * aLocation.localeCompare(bLocation);
    });
  }, [activeTickets, crewFilter, crewNameById, dueFilter, search, sortBy, sortOrder, ticketTypeFilter]);

  const handlePhotoSelect = async (ticket: DigTicket, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingTicketId(ticket.id);
    try {
      await onUploadPhoto(ticket.id, file);
    } catch (error: any) {
      alert(`Photo upload failed: ${error.message}`);
    } finally {
      setUploadingTicketId(null);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className={`text-3xl font-black uppercase tracking-tight font-display ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Locate Operations
          </h2>
          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
            Dispatching Queue + Inbound Assignment
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Bucket', value: activeTickets.length, tone: 'text-brand border-brand/20 bg-brand/10' },
          { label: 'Inbound Tickets', value: inboundTickets.length, tone: 'text-amber-500 border-amber-500/20 bg-amber-500/10' },
          { label: 'Unassigned', value: unassignedTickets.length, tone: 'text-rose-500 border-rose-500/20 bg-rose-500/10' },
          { label: 'Crew Active', value: activeCrewCount, tone: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10' },
        ].map(card => (
          <div key={card.label} className={`rounded-2xl border p-4 ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
            <p className={`text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{card.label}</p>
            <p className={`mt-2 inline-flex px-2.5 py-1 rounded-lg text-2xl font-black tracking-tight border ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticket, location, client, tech"
          className={`xl:col-span-2 px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as DispatchSort)} className={`px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <option value="priority">Sort: Priority</option>
          <option value="tech">Sort: Tech Name</option>
          <option value="dueDate">Sort: Due Date</option>
          <option value="location">Sort: Location</option>
        </select>
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className={`px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
        <select value={crewFilter} onChange={(e) => setCrewFilter(e.target.value)} className={`px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <option value="all">All Techs</option>
          <option value="unassigned">Unassigned</option>
          {crewMembers.map(crew => <option key={crew.id} value={crew.id}>{crew.name || crew.username}</option>)}
        </select>
        <select value={ticketTypeFilter} onChange={(e) => setTicketTypeFilter(e.target.value as 'all' | 'standard' | 'inbound')} className={`px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <option value="all">All Types</option>
          <option value="inbound">Inbound</option>
          <option value="standard">Standard</option>
        </select>
        <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value as DueFilter)} className={`xl:col-start-6 px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <option value="all">All Due Dates</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due Today</option>
          <option value="next7">Due Next 7 Days</option>
        </select>
      </div>

      <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className={`border-b ${isDarkMode ? 'border-white/[0.05] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/80'}`}>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Job / Ticket</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Client / Location</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Due</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Type</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Assign Crew</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Field Notes</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/[0.03]' : 'divide-slate-50'}`}>
              {dispatchList.map(ticket => {
                const dueDate = getDueDate(ticket);
                const hasNotes = ticketIdsWithNotes.has(ticket.id);
                const photoCount = photoCountsByJob.get(ticket.jobNumber) || 0;
                const isInbound = (ticket.ticketType || 'standard') === 'inbound';
                return (
                  <tr key={ticket.id} className={`${isDarkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/70'} transition-colors`}>
                    <td className="px-5 py-3">
                      <p className={`text-[11px] font-black ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>#{ticket.jobNumber}</p>
                      <p className="text-[10px] font-mono text-brand">{ticket.ticketNo}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className={`text-[11px] font-semibold truncate max-w-[260px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{getClientLabel(ticket)}</p>
                      <p className={`text-[10px] truncate max-w-[260px] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{ticket.street}, {ticket.city} {ticket.state}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {dueDate ? formatDateStr(dueDate) : 'N/A'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={ticket.ticketType || 'standard'}
                        disabled={!isAdmin}
                        onChange={(e) => onUpdateTicketType(ticket.id, e.target.value as 'standard' | 'inbound')}
                        className={`w-full min-w-[140px] px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                      >
                        <option value="standard">Standard</option>
                        <option value="inbound">Inbound</option>
                      </select>
                      {(ticket.refreshRequested || ticket.noShowRequested) && (
                        <div className="mt-1.5 flex gap-1.5">
                          {ticket.refreshRequested && <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-500 border-amber-500/25">Refresh</span>}
                          {ticket.noShowRequested && <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border bg-rose-500/10 text-rose-500 border-rose-500/25">No Show</span>}
                        </div>
                      )}
                      {!ticket.refreshRequested && !ticket.noShowRequested && (
                        <span className={`mt-1.5 inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${isInbound ? 'bg-brand/10 text-brand border-brand/30' : isDarkMode ? 'bg-white/5 text-slate-600 border-white/10' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                          {isInbound ? 'Inbound' : 'Standard'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={ticket.assignedCrewId || ''}
                        disabled={!isAdmin}
                        onChange={(e) => onAssignTicket(ticket.id, e.target.value || null)}
                        className={`w-full min-w-[170px] px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                      >
                        <option value="">Unassigned</option>
                        {crewMembers.map(crew => (
                          <option key={crew.id} value={crew.id}>{crew.name || crew.username}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onOpenNotes(ticket)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${hasNotes ? 'text-brand border-brand/30 bg-brand/10' : isDarkMode ? 'text-slate-400 border-white/10 hover:border-brand/30 hover:text-brand' : 'text-slate-500 border-slate-200 hover:border-brand/30 hover:text-brand'}`}
                        >
                          Notes{hasNotes ? ' ✓' : ''}
                        </button>
                        <button
                          onClick={() => fileInputsRef.current[ticket.id]?.click()}
                          disabled={uploadingTicketId === ticket.id}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${isDarkMode ? 'text-slate-300 border-white/10 hover:border-brand/30 hover:text-brand' : 'text-slate-600 border-slate-200 hover:border-brand/30 hover:text-brand'} ${uploadingTicketId === ticket.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {uploadingTicketId === ticket.id ? 'Uploading…' : `Photos (${photoCount})`}
                        </button>
                        <input
                          ref={el => { fileInputsRef.current[ticket.id] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoSelect(ticket, e)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {dispatchList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <p className={`text-[11px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>No tickets match current dispatch filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LocatorOperationsDashboard;
