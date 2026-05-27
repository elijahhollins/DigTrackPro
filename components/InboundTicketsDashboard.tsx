
import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRecord, UserRole } from '../types.ts';
import {
  InboundTicket,
  InboundTicketStatus,
  INBOUND_STATUS_LABELS,
  INBOUND_UTILITIES,
} from '../services/inboundTypes.ts';
import { inboundTicketService } from '../services/inboundTicketService.ts';
import InboundTicketRow from './InboundTicketRow.tsx';
import InboundTicketDetail from './InboundTicketDetail.tsx';
import InboundTicketForm from './InboundTicketForm.tsx';

interface InboundTicketsDashboardProps {
  sessionUser: User;
  users:       UserRecord[];
  isDarkMode?: boolean;
}

type SortKey = 'dueDate' | 'digStartDate' | 'siteAddress' | 'assignedTo';
type SortDir = 'asc' | 'desc';

const InboundTicketsDashboard: React.FC<InboundTicketsDashboardProps> = ({
  sessionUser,
  users,
  isDarkMode,
}) => {
  const dm = isDarkMode ?? false;

  const [tickets, setTickets] = useState<InboundTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [detailTicket, setDetailTicket]   = useState<InboundTicket | null>(null);
  const [showForm, setShowForm]           = useState(false);

  // Filters
  const [filterTech, setFilterTech]                 = useState('');
  const [filterStatus, setFilterStatus]             = useState<InboundTicketStatus | ''>('');
  const [filterDueDateFrom, setFilterDueDateFrom]   = useState('');
  const [filterDueDateTo, setFilterDueDateTo]       = useState('');
  const [filterDigFrom, setFilterDigFrom]           = useState('');
  const [filterDigTo, setFilterDigTo]               = useState('');
  const [filterUtility, setFilterUtility]           = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Bulk-assign
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [bulkAssignUserId, setBulkAssignUserId] = useState('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadTickets = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await inboundTicketService.getTickets();
      setTickets(data);
    } catch (err) {
      setLoadError((err as Error).message ?? 'Failed to load inbound tickets.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, []);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const crewUsers = useMemo(
    () => users.filter(u => u.role === UserRole.CREW || u.role === UserRole.ADMIN),
    [users],
  );

  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    if (filterTech) {
      const user = users.find(u => u.id === filterTech);
      if (user) result = result.filter(t => t.assignedTo === user.id);
      else result = result.filter(t => !t.assignedTo); // "Unassigned"
    }

    if (filterStatus) {
      result = result.filter(t => t.status === filterStatus);
    }

    if (filterDueDateFrom) {
      result = result.filter(t => t.dueDate >= filterDueDateFrom);
    }
    if (filterDueDateTo) {
      result = result.filter(t => t.dueDate <= filterDueDateTo);
    }
    if (filterDigFrom) {
      result = result.filter(t => t.digStartDate >= filterDigFrom);
    }
    if (filterDigTo) {
      result = result.filter(t => t.digStartDate <= filterDigTo);
    }
    if (filterUtility) {
      result = result.filter(t => t.utilityTypes.includes(filterUtility));
    }

    // Sort
    result.sort((a, b) => {
      let av = '';
      let bv = '';
      if (sortKey === 'dueDate')      { av = a.dueDate;       bv = b.dueDate; }
      if (sortKey === 'digStartDate') { av = a.digStartDate;  bv = b.digStartDate; }
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
  }, [tickets, filterTech, filterStatus, filterDueDateFrom, filterDueDateTo, filterDigFrom, filterDigTo, filterUtility, sortKey, sortDir, users]);

  // ── Sorting helper ────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIcon = (key: SortKey) =>
    sortKey !== key ? (
      <svg className="w-3 h-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ) : sortDir === 'asc' ? (
      <svg className="w-3 h-3 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
      </svg>
    );

  // ── Assign handlers ───────────────────────────────────────────────────────

  const handleAssign = async (ticketId: string, userId: string | null) => {
    try {
      await inboundTicketService.assignTicket(ticketId, userId);
      setTickets(prev =>
        prev.map(t =>
          t.id === ticketId
            ? {
                ...t,
                assignedTo: userId,
                status: userId
                  ? (t.status === InboundTicketStatus.UNASSIGNED ? InboundTicketStatus.ASSIGNED : t.status)
                  : InboundTicketStatus.UNASSIGNED,
              }
            : t,
        ),
      );
    } catch (err) {
      console.error('Assign failed:', err);
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

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:      tickets.length,
    unassigned: tickets.filter(t => t.status === InboundTicketStatus.UNASSIGNED).length,
    inProgress: tickets.filter(t => t.status === InboundTicketStatus.IN_PROGRESS).length,
    completed:  tickets.filter(t => t.status === InboundTicketStatus.COMPLETED).length,
  }), [tickets]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls = `px-3 py-2 border rounded-xl text-[11px] font-medium outline-none transition-all ${
    dm
      ? 'bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-600 focus:border-brand/40'
      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-brand/50'
  }`;

  const thCls = `px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${dm ? 'text-slate-600' : 'text-slate-400'}`;

  const allEligibleSelected =
    selectedIds.size > 0 &&
    filteredTickets
      .filter(t => t.status === InboundTicketStatus.UNASSIGNED || t.status === InboundTicketStatus.ASSIGNED)
      .every(t => selectedIds.has(t.id));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className={`text-3xl font-black uppercase tracking-tight font-display ${dm ? 'text-white' : 'text-slate-900'}`}>
            Inbound Tickets
          </h2>
          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} · Dispatch Queue
          </p>
        </div>
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',       value: stats.total,      color: dm ? 'text-slate-100' : 'text-slate-900' },
          { label: 'Unassigned',  value: stats.unassigned, color: dm ? 'text-rose-400' : 'text-rose-600' },
          { label: 'In Progress', value: stats.inProgress, color: dm ? 'text-amber-400' : 'text-amber-600' },
          { label: 'Completed',   value: stats.completed,  color: 'text-emerald-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
            <p className={`text-[9px] font-black uppercase tracking-[0.15em] ${dm ? 'text-slate-600' : 'text-slate-400'}`}>{label}</p>
            <p className={`text-3xl font-black mt-1 font-display ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className={`rounded-2xl border p-4 space-y-3 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Tech filter */}
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Tech</span>
            <select className={inputCls} value={filterTech} onChange={e => setFilterTech(e.target.value)}>
              <option value="">All Techs</option>
              {crewUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Status</span>
            <select className={inputCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value as InboundTicketStatus | '')}>
              <option value="">All Statuses</option>
              {Object.values(InboundTicketStatus).map(s => (
                <option key={s} value={s}>{INBOUND_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Utility filter */}
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Utility</span>
            <select className={inputCls} value={filterUtility} onChange={e => setFilterUtility(e.target.value)}>
              <option value="">All Utilities</option>
              {INBOUND_UTILITIES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Due date range */}
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Due Date From</span>
            <input type="date" className={inputCls} value={filterDueDateFrom} onChange={e => setFilterDueDateFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Due Date To</span>
            <input type="date" className={inputCls} value={filterDueDateTo} onChange={e => setFilterDueDateTo(e.target.value)} />
          </div>

          {/* Dig start range */}
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Dig Start From</span>
            <input type="date" className={inputCls} value={filterDigFrom} onChange={e => setFilterDigFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>Dig Start To</span>
            <input type="date" className={inputCls} value={filterDigTo} onChange={e => setFilterDigTo(e.target.value)} />
          </div>

          {/* Clear */}
          {(filterTech || filterStatus || filterDueDateFrom || filterDueDateTo || filterDigFrom || filterDigTo || filterUtility) && (
            <button
              onClick={() => {
                setFilterTech(''); setFilterStatus(''); setFilterDueDateFrom('');
                setFilterDueDateTo(''); setFilterDigFrom(''); setFilterDigTo(''); setFilterUtility('');
              }}
              className={`self-end px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                dm ? 'border-white/10 text-slate-500 hover:text-rose-400 hover:border-rose-500/20' : 'border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200'
              }`}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Bulk assign bar */}
      {selectedIds.size > 0 && (
        <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border ${dm ? 'bg-brand/10 border-brand/20' : 'bg-brand/5 border-brand/20'}`}>
          <span className="text-brand text-[11px] font-black uppercase tracking-widest">
            {selectedIds.size} selected
          </span>
          <select
            value={bulkAssignUserId}
            onChange={e => setBulkAssignUserId(e.target.value)}
            className={`ml-auto px-3 py-2 border rounded-xl text-[11px] font-medium outline-none ${
              dm
                ? 'bg-white/5 border-white/10 text-slate-200'
                : 'bg-white border-slate-200 text-slate-900'
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
            {isBulkAssigning ? 'Assigning…' : 'Assign'}
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
      )}

      {/* Table */}
      <div className={`rounded-2xl border overflow-hidden ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
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
                  {/* Select-all checkbox */}
                  <th className={`${thCls} w-10`}>
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      onChange={e => handleSelectAll(e.target.checked)}
                      className="w-3.5 h-3.5 accent-brand rounded"
                    />
                  </th>
                  <th className={thCls}>Ticket #</th>
                  <th
                    className={`${thCls} cursor-pointer select-none`}
                    onClick={() => toggleSort('siteAddress')}
                  >
                    <div className="flex items-center gap-1.5">Address {sortIcon('siteAddress')}</div>
                  </th>
                  <th
                    className={`${thCls} cursor-pointer select-none`}
                    onClick={() => toggleSort('dueDate')}
                  >
                    <div className="flex items-center gap-1.5">Due Date {sortIcon('dueDate')}</div>
                  </th>
                  <th
                    className={`${thCls} cursor-pointer select-none`}
                    onClick={() => toggleSort('digStartDate')}
                  >
                    <div className="flex items-center gap-1.5">Dig Start {sortIcon('digStartDate')}</div>
                  </th>
                  <th
                    className={`${thCls} cursor-pointer select-none`}
                    onClick={() => toggleSort('assignedTo')}
                  >
                    <div className="flex items-center gap-1.5">Assigned Tech {sortIcon('assignedTo')}</div>
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
                          No Inbound Tickets
                        </p>
                        <p className={`text-[10px] ${dm ? 'text-slate-700' : 'text-slate-500'}`}>
                          Create a new ticket or adjust your filters.
                        </p>
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
                      onOpenDetail={setDetailTicket}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
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

      {/* Create form */}
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
