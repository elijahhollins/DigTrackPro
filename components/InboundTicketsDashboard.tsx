
import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRecord, UserRole } from '../types.ts';
import {
  InboundTicket,
  InboundTicketStatus,
  INBOUND_UTILITIES,
  InboundTimeEntry,
  statusAfterAssign,
} from '../services/inboundTypes.ts';
import { inboundTicketService } from '../services/inboundTicketService.ts';
import InboundTicketRow, { MS_PER_DAY } from './InboundTicketRow.tsx';
import InboundTicketDetail from './InboundTicketDetail.tsx';
import InboundTicketForm from './InboundTicketForm.tsx';
import { fmtElapsed, useElapsedSeconds } from '../utils/inboundTimeUtils.ts';

interface InboundTicketsDashboardProps {
  sessionUser: User;
  users:       UserRecord[];
  isDarkMode?: boolean;
}

type SortKey = 'dueDate' | 'digStartDate' | 'siteAddress' | 'assignedTo';
type SortDir = 'asc' | 'desc';
type UrgencyFilter = 'all' | 'overdue' | 'today' | 'week';

function relativeTime(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── Live Activity row — one per clocked-in entry ──────────────────────────────

interface LiveActivityRowProps {
  entry:     InboundTimeEntry;
  ticket:    InboundTicket | undefined;
  isDarkMode: boolean;
  onClockOut: (entry: InboundTimeEntry) => void;
  onOpenTicket: (ticket: InboundTicket) => void;
}

const LiveActivityRow: React.FC<LiveActivityRowProps> = ({
  entry,
  ticket,
  isDarkMode: dm,
  onClockOut,
  onOpenTicket,
}) => {
  const elapsed = useElapsedSeconds(entry.clockedInAt);
  const [clockingOut, setClockingOut] = useState(false);

  const handleClockOut = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setClockingOut(true);
    try {
      await inboundTicketService.clockOut(entry.id);
      onClockOut(entry);
    } catch (err) {
      console.error('Admin clock-out failed:', err);
    } finally {
      setClockingOut(false);
    }
  };

  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl ${dm ? 'bg-white/[0.03] border border-white/[0.05]' : 'bg-slate-50 border border-slate-100'}`}>
      {/* Pulsing active indicator */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>

      {/* Technician */}
      <div className="min-w-[120px] shrink-0">
        <p className={`text-[11px] font-black truncate ${dm ? 'text-slate-200' : 'text-slate-800'}`}>
          {entry.technicianName}
        </p>
        <p className={`text-[9px] font-bold uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
          Technician
        </p>
      </div>

      {/* Ticket info */}
      <div className="flex-1 min-w-0">
        {ticket ? (
          <button
            onClick={() => onOpenTicket(ticket)}
            className={`text-left group`}
          >
            <p className={`text-[11px] font-bold truncate group-hover:underline ${dm ? 'text-brand' : 'text-brand'}`}>
              #{ticket.ticketNumber}
            </p>
            <p className={`text-[10px] truncate ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
              {ticket.siteAddress}
            </p>
          </button>
        ) : (
          <p className={`text-[10px] ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
            Ticket #{entry.ticketId.slice(0, 8)}…
          </p>
        )}
      </div>

      {/* Elapsed timer */}
      <div className="shrink-0 text-right min-w-[68px]">
        <p className={`text-[13px] font-black tabular-nums ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
          {fmtElapsed(elapsed)}
        </p>
        <p className={`text-[8px] font-bold uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
          Elapsed
        </p>
      </div>

      {/* Admin clock-out */}
      <button
        onClick={handleClockOut}
        disabled={clockingOut}
        title={`Clock out ${entry.technicianName}`}
        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
          clockingOut ? 'opacity-50 cursor-not-allowed' : ''
        } ${dm
          ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20'
          : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
        }`}
      >
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
        {clockingOut ? 'Saving…' : 'Clock Out'}
      </button>
    </div>
  );
};

const InboundTicketsDashboard: React.FC<InboundTicketsDashboardProps> = ({
  sessionUser,
  users,
  isDarkMode,
}) => {
  const dm = isDarkMode ?? false;

  const [tickets,       setTickets]       = useState<InboundTicket[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [loadError,     setLoadError]     = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [detailTicket, setDetailTicket] = useState<InboundTicket | null>(null);
  const [showForm,     setShowForm]     = useState(false);

  // ── Live Activity (admin clock-in view) ───────────────────────────────────
  const [liveEntries,       setLiveEntries]       = useState<InboundTimeEntry[]>([]);
  const [liveActivityExpanded, setLiveActivityExpanded] = useState(true);

  const loadLiveActivity = async () => {
    try {
      const entries = await inboundTicketService.getCompanyActiveEntries();
      setLiveEntries(entries);
    } catch {
      // Non-fatal — panel will remain empty
    }
  };

  // ── Filters ───────────────────────────────────────────────────────────────
  const [searchQuery,         setSearchQuery]         = useState('');
  const [filterTech,          setFilterTech]          = useState('');
  const [filterStatus,        setFilterStatus]        = useState<InboundTicketStatus | ''>('');
  const [filterUrgency,       setFilterUrgency]       = useState<UrgencyFilter>('all');
  const [filterDueDateFrom,   setFilterDueDateFrom]   = useState('');
  const [filterDueDateTo,     setFilterDueDateTo]     = useState('');
  const [filterDigFrom,       setFilterDigFrom]       = useState('');
  const [filterDigTo,         setFilterDigTo]         = useState('');
  const [filterUtility,       setFilterUtility]       = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Bulk-assign ───────────────────────────────────────────────────────────
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set());
  const [bulkAssignUserId, setBulkAssignUserId] = useState('');
  const [isBulkAssigning,  setIsBulkAssigning]  = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadTickets = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [data] = await Promise.all([
        inboundTicketService.getTickets(),
        loadLiveActivity(),
      ]);
      setTickets(data);
      setLastRefreshed(new Date());
    } catch (err) {
      setLoadError((err as Error).message ?? 'Failed to load inbound tickets.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const crewUsers = useMemo(
    () => users.filter(u => u.role === UserRole.CREW || u.role === UserRole.ADMIN),
    [users],
  );

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const stats = useMemo(() => {
    const weekEnd = new Date(Date.now() + 7 * MS_PER_DAY).toISOString().split('T')[0];
    return {
      total:      tickets.length,
      unassigned: tickets.filter(t => t.status === InboundTicketStatus.UNASSIGNED).length,
      assigned:   tickets.filter(t => t.status === InboundTicketStatus.ASSIGNED).length,
      inProgress: tickets.filter(t => t.status === InboundTicketStatus.IN_PROGRESS).length,
      completed:  tickets.filter(t => t.status === InboundTicketStatus.COMPLETED).length,
      overdue:    tickets.filter(t =>
        t.dueDate < todayStr && t.status !== InboundTicketStatus.COMPLETED).length,
      today: tickets.filter(t =>
        t.dueDate === todayStr && t.status !== InboundTicketStatus.COMPLETED).length,
      week: tickets.filter(t =>
        t.dueDate >= todayStr && t.dueDate <= weekEnd &&
        t.status !== InboundTicketStatus.COMPLETED).length,
    };
  }, [tickets, todayStr]);

  // ── Filtering + sorting ───────────────────────────────────────────────────

  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    // Live search: ticket #, address, caller name/phone
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.siteAddress.toLowerCase().includes(q)  ||
        t.callerName.toLowerCase().includes(q)   ||
        t.callerPhone.toLowerCase().includes(q),
      );
    }

    if (filterTech) {
      const user = users.find(u => u.id === filterTech);
      if (user) result = result.filter(t => t.assignedTo === user.id);
      else result = result.filter(t => !t.assignedTo);
    }

    if (filterStatus) {
      result = result.filter(t => t.status === filterStatus);
    }

    if (filterUrgency === 'overdue') {
      result = result.filter(t =>
        t.dueDate < todayStr && t.status !== InboundTicketStatus.COMPLETED);
    } else if (filterUrgency === 'today') {
      result = result.filter(t => t.dueDate === todayStr);
    } else if (filterUrgency === 'week') {
      const weekEnd = new Date(Date.now() + 7 * MS_PER_DAY).toISOString().split('T')[0];
      result = result.filter(t => t.dueDate >= todayStr && t.dueDate <= weekEnd);
    }

    if (filterDueDateFrom) result = result.filter(t => t.dueDate >= filterDueDateFrom);
    if (filterDueDateTo)   result = result.filter(t => t.dueDate <= filterDueDateTo);
    if (filterDigFrom)     result = result.filter(t => t.digStartDate >= filterDigFrom);
    if (filterDigTo)       result = result.filter(t => t.digStartDate <= filterDigTo);
    if (filterUtility)     result = result.filter(t => t.utilityTypes.includes(filterUtility));

    result.sort((a, b) => {
      let av = '';
      let bv = '';
      if (sortKey === 'dueDate')      { av = a.dueDate;      bv = b.dueDate; }
      if (sortKey === 'digStartDate') { av = a.digStartDate; bv = b.digStartDate; }
      if (sortKey === 'siteAddress')  { av = a.siteAddress.toLowerCase(); bv = b.siteAddress.toLowerCase(); }
      if (sortKey === 'assignedTo') {
        av = users.find(u => u.id === a.assignedTo)?.name?.toLowerCase() ?? '';
        bv = users.find(u => u.id === b.assignedTo)?.name?.toLowerCase() ?? '';
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    tickets, searchQuery, filterTech, filterStatus, filterUrgency,
    filterDueDateFrom, filterDueDateTo, filterDigFrom, filterDigTo,
    filterUtility, sortKey, sortDir, users, todayStr,
  ]);

  // ── Sort helper ───────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
    if (sortKey !== col) return (
      <svg className="w-3 h-3 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
    return sortDir === 'asc' ? (
      <svg className="w-3 h-3 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // ── Assign / status handlers ──────────────────────────────────────────────

  const handleAssign = async (ticketId: string, userId: string | null) => {
    try {
      await inboundTicketService.assignTicket(ticketId, userId);
      setTickets(prev =>
        prev.map(t =>
          t.id === ticketId
            ? { ...t, assignedTo: userId, status: statusAfterAssign(t.status, userId) }
            : t,
        ),
      );
    } catch (err) {
      console.error('Assign failed:', err);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: InboundTicketStatus) => {
    try {
      await inboundTicketService.updateTicket(ticketId, { status: newStatus });
      setTickets(prev =>
        prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t),
      );
      if (detailTicket?.id === ticketId) {
        setDetailTicket(prev => prev ? { ...prev, status: newStatus } : prev);
      }
    } catch (err) {
      console.error('Status change failed:', err);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignUserId || selectedIds.size === 0) return;
    setIsBulkAssigning(true);
    try {
      await inboundTicketService.bulkAssign([...selectedIds], bulkAssignUserId);
      setTickets(prev =>
        prev.map(t =>
          selectedIds.has(t.id)
            ? { ...t, assignedTo: bulkAssignUserId, status: InboundTicketStatus.ASSIGNED }
            : t,
        ),
      );
      setSelectedIds(new Set());
      setBulkAssignUserId('');
    } catch (err) {
      console.error('Bulk assign failed:', err);
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const handleSelect = (id: string, checked: boolean) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const eligible = filteredTickets
        .filter(t => t.status === InboundTicketStatus.UNASSIGNED || t.status === InboundTicketStatus.ASSIGNED)
        .map(t => t.id);
      setSelectedIds(new Set(eligible));
    } else {
      setSelectedIds(new Set());
    }
  };

  // ── Ticket CRUD callbacks ─────────────────────────────────────────────────

  const handleTicketCreated = async (data: Omit<InboundTicket, 'id' | 'createdAt'>) => {
    const created = await inboundTicketService.createTicket(data);
    setTickets(prev => [...prev, created]);
  };

  const handleTicketUpdated = (updated: InboundTicket) => {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (detailTicket?.id === updated.id) setDetailTicket(updated);
  };

  const handleTicketDeleted = (id: string) => {
    setTickets(prev => prev.filter(t => t.id !== id));
    if (detailTicket?.id === id) setDetailTicket(null);
  };

  /** Called when an admin clocks out a technician from the Live Activity panel. */
  const handleLiveClockOut = (entry: InboundTimeEntry) => {
    setLiveEntries(prev => prev.filter(e => e.id !== entry.id));
  };

  // ── Misc helpers ──────────────────────────────────────────────────────────

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterTech('');
    setFilterStatus('');
    setFilterUrgency('all');
    setFilterDueDateFrom('');
    setFilterDueDateTo('');
    setFilterDigFrom('');
    setFilterDigTo('');
    setFilterUtility('');
  };

  const hasActiveFilters =
    !!searchQuery || !!filterTech || !!filterStatus || filterUrgency !== 'all' ||
    !!filterDueDateFrom || !!filterDueDateTo || !!filterDigFrom || !!filterDigTo || !!filterUtility;

  const hasDateFilters =
    !!filterDueDateFrom || !!filterDueDateTo || !!filterDigFrom || !!filterDigTo;

  const allEligibleSelected =
    selectedIds.size > 0 &&
    filteredTickets
      .filter(t => t.status === InboundTicketStatus.UNASSIGNED || t.status === InboundTicketStatus.ASSIGNED)
      .every(t => selectedIds.has(t.id));

  // ── Shared style helpers ──────────────────────────────────────────────────

  const inputCls = `px-3 py-2 border rounded-xl text-[11px] font-medium outline-none transition-all ${
    dm
      ? 'bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600 focus:border-brand/40'
      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  }`;

  const thCls = `px-4 py-3.5 text-[9px] font-black uppercase tracking-[0.18em] ${dm ? 'text-slate-600' : 'text-slate-400'}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── PAGE HEADER ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className={`text-3xl font-black uppercase tracking-tight font-display ${dm ? 'text-white' : 'text-slate-900'}`}>
            Inbound Dispatch
          </h2>
          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {lastRefreshed && (
              <span className="ml-2 normal-case tracking-normal font-normal">
                · Updated {relativeTime(lastRefreshed)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTickets}
            disabled={isLoading}
            title="Refresh"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
              dm
                ? 'border-white/10 text-slate-500 hover:text-slate-200 hover:border-white/20 disabled:opacity-30'
                : 'border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 disabled:opacity-30'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
            </svg>
            New Ticket
          </button>
        </div>
      </div>

      {/* ── STAT CARDS (clickable filters) ────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
        {([
          {
            key: 'total', label: 'Total', value: stats.total,
            color: dm ? 'text-slate-100' : 'text-slate-900',
            active: !filterStatus && filterUrgency === 'all',
            onClick: clearAllFilters,
          },
          {
            key: 'unassigned', label: 'Unassigned', value: stats.unassigned,
            color: dm ? 'text-rose-400' : 'text-rose-600',
            active: filterStatus === InboundTicketStatus.UNASSIGNED,
            onClick: () => {
              setFilterStatus(prev => prev === InboundTicketStatus.UNASSIGNED ? '' : InboundTicketStatus.UNASSIGNED);
              setFilterUrgency('all');
            },
          },
          {
            key: 'assigned', label: 'Assigned', value: stats.assigned,
            color: 'text-brand',
            active: filterStatus === InboundTicketStatus.ASSIGNED,
            onClick: () => {
              setFilterStatus(prev => prev === InboundTicketStatus.ASSIGNED ? '' : InboundTicketStatus.ASSIGNED);
              setFilterUrgency('all');
            },
          },
          {
            key: 'inprogress', label: 'In Progress', value: stats.inProgress,
            color: dm ? 'text-amber-400' : 'text-amber-600',
            active: filterStatus === InboundTicketStatus.IN_PROGRESS,
            onClick: () => {
              setFilterStatus(prev => prev === InboundTicketStatus.IN_PROGRESS ? '' : InboundTicketStatus.IN_PROGRESS);
              setFilterUrgency('all');
            },
          },
          {
            key: 'completed', label: 'Completed', value: stats.completed,
            color: 'text-emerald-500',
            active: filterStatus === InboundTicketStatus.COMPLETED,
            onClick: () => {
              setFilterStatus(prev => prev === InboundTicketStatus.COMPLETED ? '' : InboundTicketStatus.COMPLETED);
              setFilterUrgency('all');
            },
          },
          {
            key: 'overdue', label: 'Overdue', value: stats.overdue,
            color: dm ? 'text-rose-400' : 'text-rose-600',
            active: filterUrgency === 'overdue',
            onClick: () => {
              setFilterUrgency(prev => prev === 'overdue' ? 'all' : 'overdue');
              setFilterStatus('');
            },
          },
        ] ).map(card => (
          <button
            key={card.key}
            onClick={card.onClick}
            className={`text-left rounded-xl border p-3 transition-all hover:shadow-md ${
              card.active
                ? (dm ? 'bg-brand/10 border-brand/30' : 'bg-brand/5 border-brand/30')
                : (dm ? 'bg-[#0b1629] border-white/[0.06] hover:border-white/10' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm')
            }`}
          >
            <p className={`text-[8px] font-black uppercase tracking-[0.15em] ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
              {card.label}
            </p>
            <p className={`text-2xl font-black mt-0.5 font-display ${card.color}`}>{card.value}</p>
          </button>
        ))}
      </div>

      {/* ── LIVE ACTIVITY PANEL ──────────────────────────────────────────── */}
      <div className={`rounded-2xl border overflow-hidden ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
        {/* Header */}
        <button
          onClick={() => setLiveActivityExpanded(prev => !prev)}
          className={`w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors ${
            dm ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Global pulsing dot when anyone is clocked in */}
            {liveEntries.length > 0 ? (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            ) : (
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dm ? 'bg-slate-700' : 'bg-slate-200'}`} />
            )}
            <span className={`text-[10px] font-black uppercase tracking-widest ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
              Live Activity
            </span>
            {liveEntries.length > 0 && (
              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                dm ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                {liveEntries.length} clocked in
              </span>
            )}
          </div>
          <svg
            className={`w-3.5 h-3.5 transition-transform ${liveActivityExpanded ? '' : '-rotate-90'} ${dm ? 'text-slate-600' : 'text-slate-400'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Body */}
        {liveActivityExpanded && (
          <div className={`px-4 pb-4 pt-1 border-t ${dm ? 'border-white/[0.04]' : 'border-slate-100'}`}>
            {liveEntries.length === 0 ? (
              <p className={`py-6 text-center text-[11px] font-semibold ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
                No technicians currently clocked in.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {liveEntries.map(entry => (
                  <LiveActivityRow
                    key={entry.id}
                    entry={entry}
                    ticket={tickets.find(t => t.id === entry.ticketId)}
                    isDarkMode={dm}
                    onClockOut={handleLiveClockOut}
                    onOpenTicket={setDetailTicket}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FILTER PANEL ──────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-4 space-y-3 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>

        {/* Row 1: Search + dropdowns + advanced toggle */}
        <div className="flex flex-wrap gap-2.5 items-end">

          {/* Live search */}
          <div className={`flex items-center gap-2 flex-1 min-w-[180px] px-3 py-2 border rounded-xl transition-all ${
            dm
              ? 'bg-white/5 border-white/10 focus-within:border-brand/40'
              : 'bg-white border-slate-200 focus-within:border-brand/50'
          }`}>
            <svg className={`w-3.5 h-3.5 shrink-0 ${dm ? 'text-slate-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search address, ticket #, caller…"
              className={`flex-1 bg-transparent text-[11px] font-medium outline-none ${
                dm ? 'text-slate-200 placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`shrink-0 ${dm ? 'text-slate-600 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Tech */}
          <div className="flex flex-col gap-1">
            <span className={`text-[8px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Tech</span>
            <select className={inputCls} value={filterTech} onChange={e => setFilterTech(e.target.value)}>
              <option value="">All Techs</option>
              {crewUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Utility */}
          <div className="flex flex-col gap-1">
            <span className={`text-[8px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Utility</span>
            <select className={inputCls} value={filterUtility} onChange={e => setFilterUtility(e.target.value)}>
              <option value="">All Utilities</option>
              {INBOUND_UTILITIES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Dates toggle */}
          <button
            onClick={() => setShowAdvancedFilters(prev => !prev)}
            className={`self-end flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
              showAdvancedFilters || hasDateFilters
                ? (dm ? 'bg-brand/10 border-brand/30 text-brand' : 'bg-brand/5 border-brand/30 text-brand')
                : (dm ? 'border-white/10 text-slate-500 hover:text-slate-200 hover:border-white/20' : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300')
            }`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Dates
            {hasDateFilters && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className={`self-end px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                dm ? 'border-rose-500/20 text-rose-400 hover:bg-rose-500/10' : 'border-rose-200 text-rose-500 hover:bg-rose-50'
              }`}
            >
              Clear All
            </button>
          )}
        </div>

        {/* Row 2: Status pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-[8px] font-black uppercase tracking-widest shrink-0 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Status:</span>
          {([
            { value: '' as InboundTicketStatus | '',      label: 'All',         count: stats.total },
            { value: InboundTicketStatus.UNASSIGNED,      label: 'Unassigned',  count: stats.unassigned },
            { value: InboundTicketStatus.ASSIGNED,        label: 'Assigned',    count: stats.assigned },
            { value: InboundTicketStatus.IN_PROGRESS,     label: 'In Progress', count: stats.inProgress },
            { value: InboundTicketStatus.COMPLETED,       label: 'Completed',   count: stats.completed },
          ]).map(pill => {
            const active = filterStatus === pill.value;
            return (
              <button
                key={pill.value || 'all'}
                onClick={() => setFilterStatus(pill.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? 'bg-brand/10 border-brand/30 text-brand'
                    : (dm
                        ? 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:text-slate-200 hover:border-white/15'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300')
                }`}
              >
                {pill.label}
                <span className={`rounded px-1 py-px text-[8px] font-black ${
                  active
                    ? 'bg-brand/20 text-brand'
                    : (dm ? 'bg-white/5 text-slate-600' : 'bg-slate-200 text-slate-500')
                }`}>
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 3: Urgency pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-[8px] font-black uppercase tracking-widest shrink-0 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Urgency:</span>
          {([
            { value: 'all'     as UrgencyFilter, label: 'All',       count: stats.total,      urgent: false },
            { value: 'overdue' as UrgencyFilter, label: 'Overdue',   count: stats.overdue,    urgent: true },
            { value: 'today'   as UrgencyFilter, label: 'Due Today', count: stats.today,      urgent: true },
            { value: 'week'    as UrgencyFilter, label: 'This Week', count: stats.week,       urgent: false },
          ]).map(pill => {
            const active = filterUrgency === pill.value;
            const danger = pill.urgent && pill.count > 0;
            return (
              <button
                key={pill.value}
                onClick={() => setFilterUrgency(pill.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? danger
                        ? (dm ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600')
                        : 'bg-brand/10 border-brand/30 text-brand'
                    : (dm
                        ? 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:text-slate-200 hover:border-white/15'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300')
                }`}
              >
                {pill.label}
                {pill.count > 0 && (
                  <span className={`rounded px-1 py-px text-[8px] font-black ${
                    active && danger
                      ? (dm ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-100 text-rose-600')
                      : active
                          ? 'bg-brand/20 text-brand'
                          : danger
                              ? (dm ? 'bg-rose-500/10 text-rose-500' : 'bg-rose-50 text-rose-500')
                              : (dm ? 'bg-white/5 text-slate-600' : 'bg-slate-200 text-slate-500')
                  }`}>
                    {pill.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Advanced date filters (collapsible) */}
        {showAdvancedFilters && (
          <div className={`flex flex-wrap gap-3 pt-3 border-t ${dm ? 'border-white/[0.06]' : 'border-slate-100'}`}>
            <div className="flex flex-col gap-1">
              <span className={`text-[8px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Due Date From</span>
              <input type="date" className={inputCls} value={filterDueDateFrom} onChange={e => setFilterDueDateFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-[8px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Due Date To</span>
              <input type="date" className={inputCls} value={filterDueDateTo} onChange={e => setFilterDueDateTo(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-[8px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Dig Start From</span>
              <input type="date" className={inputCls} value={filterDigFrom} onChange={e => setFilterDigFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-[8px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Dig Start To</span>
              <input type="date" className={inputCls} value={filterDigTo} onChange={e => setFilterDigTo(e.target.value)} />
            </div>
            {hasDateFilters && (
              <button
                onClick={() => { setFilterDueDateFrom(''); setFilterDueDateTo(''); setFilterDigFrom(''); setFilterDigTo(''); }}
                className={`self-end px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                  dm ? 'border-white/10 text-slate-500 hover:text-rose-400 hover:border-rose-500/20' : 'border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200'
                }`}
              >
                Clear Dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── BULK ASSIGN BAR ──────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className={`flex flex-wrap items-center gap-3 px-5 py-3.5 rounded-2xl border ${dm ? 'bg-brand/10 border-brand/20' : 'bg-brand/5 border-brand/20'}`}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-brand flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-[#07101f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-brand text-[11px] font-black uppercase tracking-widest">
              {selectedIds.size} ticket{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={bulkAssignUserId}
              onChange={e => setBulkAssignUserId(e.target.value)}
              className={`px-3 py-2 border rounded-xl text-[11px] font-medium outline-none ${
                dm ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <option value="">— Assign To —</option>
              {crewUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkAssignUserId || isBulkAssigning}
              className="px-5 py-2 rounded-xl bg-brand text-[#07101f] text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBulkAssigning ? 'Assigning…' : 'Assign All'}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className={`p-2 rounded-xl transition-all ${dm ? 'text-slate-500 hover:text-slate-200 hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── RESULTS META ──────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between text-[10px] font-semibold ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
        <span>
          {hasActiveFilters
            ? `${filteredTickets.length} of ${tickets.length} tickets`
            : `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} total`}
        </span>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className={`text-[9px] font-black uppercase tracking-widest transition-colors ${
              dm ? 'text-slate-600 hover:text-brand' : 'text-slate-400 hover:text-brand'
            }`}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── TABLE ──────────────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border overflow-hidden ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className={`text-[11px] font-semibold ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Loading tickets…</span>
          </div>
        ) : loadError ? (
          <div className="py-12 text-center">
            <p className="text-rose-500 text-[12px] font-semibold">{loadError}</p>
            <button onClick={loadTickets} className="mt-3 text-brand text-[11px] font-black uppercase tracking-widest hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className={`border-b ${dm ? 'border-white/[0.05] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/80'}`}>
                  <th className={`${thCls} w-10`}>
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      onChange={e => handleSelectAll(e.target.checked)}
                      className="w-3.5 h-3.5 accent-brand rounded"
                    />
                  </th>
                  <th className={thCls}>Ticket #</th>
                  <th className={`${thCls} cursor-pointer select-none`} onClick={() => toggleSort('siteAddress')}>
                    <div className="flex items-center gap-1.5">Address <SortIcon col="siteAddress" /></div>
                  </th>
                  <th className={`${thCls} cursor-pointer select-none`} onClick={() => toggleSort('dueDate')}>
                    <div className="flex items-center gap-1.5">Due Date <SortIcon col="dueDate" /></div>
                  </th>
                  <th className={`${thCls} cursor-pointer select-none`} onClick={() => toggleSort('digStartDate')}>
                    <div className="flex items-center gap-1.5">Dig Start <SortIcon col="digStartDate" /></div>
                  </th>
                  <th className={`${thCls} cursor-pointer select-none`} onClick={() => toggleSort('assignedTo')}>
                    <div className="flex items-center gap-1.5">Assigned Tech <SortIcon col="assignedTo" /></div>
                  </th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Utilities</th>
                  <th className={`${thCls} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${dm ? 'divide-white/[0.03]' : 'divide-slate-50'}`}>
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dm ? 'bg-white/[0.03] border border-white/[0.05]' : 'bg-slate-100'}`}>
                          <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <p className={`text-[11px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
                          {hasActiveFilters ? 'No matching tickets' : 'No Inbound Tickets'}
                        </p>
                        <p className={`text-[10px] ${dm ? 'text-slate-700' : 'text-slate-500'}`}>
                          {hasActiveFilters ? 'Try adjusting your search or filters.' : 'Create a new ticket to get started.'}
                        </p>
                        {hasActiveFilters && (
                          <button
                            onClick={clearAllFilters}
                            className="mt-1 text-brand text-[10px] font-black uppercase tracking-widest hover:underline"
                          >
                            Clear all filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map(ticket => (
                    <InboundTicketRow
                      key={ticket.id}
                      ticket={ticket}
                      users={users}
                      isSelected={selectedIds.has(ticket.id)}
                      isDarkMode={dm}
                      isAdmin={true}
                      onSelect={handleSelect}
                      onAssign={handleAssign}
                      onStatusChange={handleStatusChange}
                      onOpenDetail={setDetailTicket}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── DETAIL MODAL ──────────────────────────────────────────────────── */}
      {detailTicket && (
        <InboundTicketDetail
          ticket={detailTicket}
          users={users}
          sessionUser={sessionUser}
          isAdmin={true}
          isDarkMode={dm}
          onClose={() => setDetailTicket(null)}
          onTicketUpdated={handleTicketUpdated}
          onTicketDeleted={handleTicketDeleted}
        />
      )}

      {/* ── CREATE FORM ───────────────────────────────────────────────────── */}
      {showForm && (
        <InboundTicketForm
          crewUsers={crewUsers}
          companyId={sessionUser.companyId}
          createdBy={sessionUser.id}
          isDarkMode={dm}
          onSave={handleTicketCreated}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};

export default InboundTicketsDashboard;
