
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, UserRecord } from '../types.ts';
import {
  InboundTicket,
  InboundTicketStatus,
  INBOUND_STATUS_LABELS,
  InboundTimeEntry,
} from '../services/inboundTypes.ts';
import { inboundTicketService } from '../services/inboundTicketService.ts';
import InboundTicketDetail from './InboundTicketDetail.tsx';
import { statusBadge } from './InboundTicketRow.tsx';
import { fmtElapsed, useElapsedSeconds } from '../utils/inboundTimeUtils.ts';

interface InboundTechQueueProps {
  sessionUser: User;
  users:       UserRecord[];
  isDarkMode?: boolean;
}

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
};

const MS_PER_DAY = 86_400_000;

const urgencyColor = (iso: string, dm: boolean): string => {
  if (!iso) return '';
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / MS_PER_DAY);
  if (diff <= 1) return dm ? 'text-rose-400' : 'text-rose-600';
  if (diff <= 3) return dm ? 'text-amber-400' : 'text-amber-600';
  return '';
};

// ── Clock-in conflict dialog ───────────────────────────────────────────────────

interface ClockConflictDialogProps {
  /** The ticket the user wants to clock into. */
  targetTicket:    InboundTicket;
  /** All tickets the user is currently clocked into. */
  activeTickets:   InboundTicket[];
  isDarkMode:      boolean;
  onSwitch:        () => void;
  onAdd:           () => void;
  onCancel:        () => void;
}

const ClockConflictDialog: React.FC<ClockConflictDialogProps> = ({
  targetTicket,
  activeTickets,
  isDarkMode: dm,
  onSwitch,
  onAdd,
  onCancel,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div
      className={`relative w-full max-w-md rounded-2xl shadow-2xl p-6 ${
        dm ? 'bg-[#0d1f3c] border border-white/[0.08]' : 'bg-white border border-slate-200'
      }`}
      onClick={e => e.stopPropagation()}
    >
      {/* Icon */}
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${dm ? 'bg-amber-500/15' : 'bg-amber-50'}`}>
        <svg className={`w-6 h-6 ${dm ? 'text-amber-400' : 'text-amber-600'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>

      <h3 className={`text-[15px] font-black uppercase tracking-tight mb-1 ${dm ? 'text-white' : 'text-slate-900'}`}>
        Already Clocked In
      </h3>
      <p className={`text-[12px] mb-4 leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
        You are currently clocked in to:
      </p>

      {/* Currently active tickets */}
      <ul className={`rounded-xl border divide-y mb-5 ${dm ? 'border-white/[0.06] divide-white/[0.04] bg-white/[0.02]' : 'border-slate-200 divide-slate-100 bg-slate-50'}`}>
        {activeTickets.map(t => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className={`text-[11px] font-black truncate ${dm ? 'text-slate-200' : 'text-slate-800'}`}>
                #{t.ticketNumber} — {t.siteAddress}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className={`text-[12px] mb-5 leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
        You are about to clock into <span className={`font-bold ${dm ? 'text-slate-200' : 'text-slate-800'}`}>#{targetTicket.ticketNumber}</span>.
        Would you like to clock out of the above ticket{activeTickets.length > 1 ? 's' : ''} first, or clock in to multiple tickets?
      </p>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onSwitch}
          className={`w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            dm
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
          }`}
        >
          Clock out &amp; switch to #{targetTicket.ticketNumber}
        </button>
        <button
          onClick={onAdd}
          className={`w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            dm
              ? 'bg-brand/10 text-brand hover:bg-brand/20 border border-brand/20'
              : 'bg-brand/5 text-brand hover:bg-brand/10 border border-brand/20'
          }`}
        >
          Clock in to multiple tickets
        </button>
        <button
          onClick={onCancel}
          className={`w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            dm
              ? 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] border border-white/[0.06]'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
          }`}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// ── Clock-in row component ─────────────────────────────────────────────────────

interface ClockRowProps {
  ticket:          InboundTicket;
  activeEntry:     InboundTimeEntry | null;
  entriesLoaded:   boolean;
  clocking:        boolean;
  isDarkMode:      boolean;
  onClockInRequest: (ticket: InboundTicket) => void;
  onClockOut:      (ticket: InboundTicket, entryId: string) => void;
}

const ClockRow: React.FC<ClockRowProps> = ({
  ticket,
  activeEntry,
  entriesLoaded,
  clocking,
  isDarkMode: dm,
  onClockInRequest,
  onClockOut,
}) => {
  // Live timer — only ticks when clocked in
  const elapsed = useElapsedSeconds(activeEntry ? activeEntry.clockedInAt : null);
  const isClockedIn = activeEntry !== null;

  return (
    <div
      className={`flex items-center justify-between gap-3 mt-3 pt-3 border-t ${dm ? 'border-white/[0.05]' : 'border-slate-100'}`}
      onClick={e => e.stopPropagation()}
    >
      {/* Timer display */}
      <div className="flex items-center gap-2 min-w-0">
        {isClockedIn ? (
          <>
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className={`text-[11px] font-black tabular-nums ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
              {fmtElapsed(elapsed)}
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
              Clocked In
            </span>
          </>
        ) : !entriesLoaded ? (
          <span className={`text-[9px] font-bold uppercase tracking-widest ${dm ? 'text-slate-700' : 'text-slate-300'}`}>
            —
          </span>
        ) : (
          <span className={`text-[9px] font-bold uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
            Not clocked in
          </span>
        )}
      </div>

      {/* Clock In / Out button */}
      {entriesLoaded && (
        isClockedIn ? (
          <button
            onClick={e => { e.stopPropagation(); onClockOut(ticket, activeEntry!.id); }}
            disabled={clocking}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              clocking ? 'opacity-50 cursor-not-allowed' : ''
            } ${dm ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'}`}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            {clocking ? 'Saving…' : 'Clock Out'}
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onClockInRequest(ticket); }}
            disabled={clocking || ticket.status === InboundTicketStatus.COMPLETED}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              clocking || ticket.status === InboundTicketStatus.COMPLETED
                ? 'opacity-50 cursor-not-allowed'
                : ''
            } ${dm ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {clocking ? 'Starting…' : 'Clock In'}
          </button>
        )
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const InboundTechQueue: React.FC<InboundTechQueueProps> = ({ sessionUser, users, isDarkMode }) => {
  const dm = isDarkMode ?? false;

  const [tickets, setTickets] = useState<InboundTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [detailTicket, setDetailTicket] = useState<InboundTicket | null>(null);

  // Active time entries keyed by ticketId — loaded once, then kept in sync
  const [activeEntries, setActiveEntries] = useState<Map<string, InboundTimeEntry>>(new Map());
  const [entriesLoaded, setEntriesLoaded] = useState(false);

  // Per-ticket clock operation in-flight flag
  const [clockingTicketId, setClockingTicketId] = useState<string | null>(null);

  // Conflict dialog state
  const [conflictTarget, setConflictTarget] = useState<InboundTicket | null>(null);

  const loadTickets = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await inboundTicketService.getMyTickets(sessionUser.id);
      setTickets(data);
    } catch (err) {
      setLoadError((err as Error).message ?? 'Failed to load tickets.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadActiveEntries = useCallback(async () => {
    try {
      const entries = await inboundTicketService.getAllActiveEntries(sessionUser.id);
      const map = new Map<string, InboundTimeEntry>();
      for (const e of entries) map.set(e.ticketId, e);
      setActiveEntries(map);
    } catch {
      // Non-fatal — clock buttons will show their initial state
    } finally {
      setEntriesLoaded(true);
    }
  }, [sessionUser.id]);

  useEffect(() => {
    loadTickets();
    loadActiveEntries();
  }, []);

  // Sorted by due date ascending (default)
  const sorted = useMemo(() =>
    [...tickets].sort((a, b) => {
      if (a.dueDate < b.dueDate) return -1;
      if (a.dueDate > b.dueDate) return 1;
      return 0;
    }),
    [tickets],
  );

  const stats = useMemo(() => ({
    total:      tickets.length,
    inProgress: tickets.filter(t => t.status === InboundTicketStatus.IN_PROGRESS).length,
    completed:  tickets.filter(t => t.status === InboundTicketStatus.COMPLETED).length,
    overdue:    tickets.filter(t => {
      if (!t.dueDate || t.status === InboundTicketStatus.COMPLETED) return false;
      return new Date(t.dueDate) < new Date();
    }).length,
  }), [tickets]);

  const handleTicketUpdated = (updated: InboundTicket) => {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (detailTicket?.id === updated.id) setDetailTicket(updated);
  };

  const handleTicketDeleted = (id: string) => {
    setTickets(prev => prev.filter(t => t.id !== id));
    if (detailTicket?.id === id) setDetailTicket(null);
  };

  // ── Clock operations ─────────────────────────────────────────────────────────

  const doClockIn = async (ticket: InboundTicket) => {
    setClockingTicketId(ticket.id);
    try {
      const entry = await inboundTicketService.clockIn(
        ticket.id, ticket.companyId, sessionUser.id, sessionUser.name,
      );
      setActiveEntries(prev => new Map(prev).set(ticket.id, entry));
      if (ticket.status === InboundTicketStatus.ASSIGNED) {
        handleTicketUpdated({ ...ticket, status: InboundTicketStatus.IN_PROGRESS });
      }
    } catch (err) {
      console.error('Clock-in failed:', err);
    } finally {
      setClockingTicketId(null);
    }
  };

  const doClockOut = async (ticket: InboundTicket, entryId: string) => {
    setClockingTicketId(ticket.id);
    try {
      await inboundTicketService.clockOut(entryId);
      setActiveEntries(prev => {
        const next = new Map(prev);
        next.delete(ticket.id);
        return next;
      });
    } catch (err) {
      console.error('Clock-out failed:', err);
    } finally {
      setClockingTicketId(null);
    }
  };

  /** Called when user taps "Clock In" on a ticket card. */
  const handleClockInRequest = (ticket: InboundTicket) => {
    // Already clocked into this ticket — no-op (shouldn't happen)
    if (activeEntries.has(ticket.id)) return;

    // No conflicts — clock in immediately
    if (activeEntries.size === 0) {
      doClockIn(ticket);
      return;
    }

    // One or more active entries — show conflict dialog
    setConflictTarget(ticket);
  };

  /** "Switch": clock out of all active tickets, then clock into target. */
  const handleConflictSwitch = async () => {
    if (!conflictTarget) return;
    setConflictTarget(null);
    // Clock out all currently active entries
    const entries = Array.from(activeEntries.values());
    await Promise.all(entries.map(e => inboundTicketService.clockOut(e.id)));
    setActiveEntries(new Map());
    // Now clock into the target
    await doClockIn(conflictTarget);
  };

  /** "Add": allow clocking into the target without touching existing sessions. */
  const handleConflictAdd = () => {
    if (!conflictTarget) return;
    const target = conflictTarget;
    setConflictTarget(null);
    doClockIn(target);
  };

  // Active tickets list for the conflict dialog
  const activeConflictTickets = useMemo(() => {
    if (!conflictTarget) return [];
    return tickets.filter(t => activeEntries.has(t.id) && t.id !== conflictTarget.id);
  }, [conflictTarget, tickets, activeEntries]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className={`text-3xl font-black uppercase tracking-tight font-display ${dm ? 'text-white' : 'text-slate-900'}`}>
          My Queue
        </h2>
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
          Inbound Locate Tickets — Sorted by Due Date
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Assigned',    value: stats.total,      color: dm ? 'text-slate-100' : 'text-slate-900' },
          { label: 'In Progress', value: stats.inProgress, color: dm ? 'text-amber-400' : 'text-amber-600' },
          { label: 'Completed',   value: stats.completed,  color: 'text-emerald-500' },
          { label: 'Overdue',     value: stats.overdue,    color: dm ? 'text-rose-400' : 'text-rose-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
            <p className={`text-[9px] font-black uppercase tracking-[0.15em] ${dm ? 'text-slate-600' : 'text-slate-400'}`}>{label}</p>
            <p className={`text-3xl font-black mt-1 font-display ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Ticket list */}
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
      ) : sorted.length === 0 ? (
        <div className={`rounded-2xl border p-16 flex flex-col items-center gap-4 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${dm ? 'bg-white/[0.03] border border-white/[0.05]' : 'bg-slate-100'}`}>
            <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className={`text-[12px] font-black uppercase tracking-widest ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
              All clear!
            </p>
            <p className={`text-[11px] mt-1 ${dm ? 'text-slate-600' : 'text-slate-500'}`}>
              No inbound tickets assigned to you right now.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(ticket => (
            <div
              key={ticket.id}
              className={`rounded-2xl border p-5 transition-all ${
                dm
                  ? 'bg-[#0b1629] border-white/[0.06]'
                  : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              {/* Tappable area opens detail */}
              <button
                className="w-full text-left"
                onClick={() => setDetailTicket(ticket)}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: main info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
                        #{ticket.ticketNumber}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${statusBadge(ticket.status, dm)}`}>
                        {INBOUND_STATUS_LABELS[ticket.status]}
                      </span>
                    </div>
                    <p className={`text-[14px] font-bold leading-snug truncate ${dm ? 'text-slate-100' : 'text-slate-900'}`}>
                      {ticket.siteAddress}
                    </p>
                    {ticket.callerName && (
                      <p className={`text-[11px] ${dm ? 'text-slate-500' : 'text-slate-500'}`}>
                        Caller: <span className={`font-semibold ${dm ? 'text-slate-400' : 'text-slate-700'}`}>{ticket.callerName}</span>
                      </p>
                    )}
                    {ticket.utilityTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ticket.utilityTypes.map(u => (
                          <span key={u} className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                            dm ? 'bg-white/[0.04] text-slate-500 border border-white/[0.05]' : 'bg-slate-100 text-slate-500'
                          }`}>{u}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: dates */}
                  <div className="shrink-0 text-right space-y-2">
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-700' : 'text-slate-400'}`}>Due</p>
                      <p className={`text-[13px] font-bold tabular-nums ${urgencyColor(ticket.dueDate, dm) || (dm ? 'text-slate-200' : 'text-slate-800')}`}>
                        {fmtDate(ticket.dueDate)}
                      </p>
                    </div>
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${dm ? 'text-slate-700' : 'text-slate-400'}`}>Dig Start</p>
                      <p className={`text-[12px] font-semibold tabular-nums ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
                        {fmtDate(ticket.digStartDate)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tap indicator */}
                <div className={`flex items-center justify-end mt-2 gap-1 ${dm ? 'text-slate-700' : 'text-slate-400'}`}>
                  <span className="text-[9px] font-black uppercase tracking-widest">View Details</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Clock-in / Clock-out row — stops card click propagation */}
              <ClockRow
                ticket={ticket}
                activeEntry={activeEntries.get(ticket.id) ?? null}
                entriesLoaded={entriesLoaded}
                clocking={clockingTicketId === ticket.id}
                isDarkMode={dm}
                onClockInRequest={handleClockInRequest}
                onClockOut={doClockOut}
              />
            </div>
          ))}
        </div>
      )}

      {/* Clock-in conflict dialog */}
      {conflictTarget && (
        <ClockConflictDialog
          targetTicket={conflictTarget}
          activeTickets={activeConflictTickets}
          isDarkMode={dm}
          onSwitch={handleConflictSwitch}
          onAdd={handleConflictAdd}
          onCancel={() => setConflictTarget(null)}
        />
      )}

      {/* Detail modal */}
      {detailTicket && (
        <InboundTicketDetail
          ticket={detailTicket}
          users={users}
          sessionUser={sessionUser}
          isAdmin={false}
          isDarkMode={dm}
          onClose={() => setDetailTicket(null)}
          onTicketUpdated={handleTicketUpdated}
          onTicketDeleted={handleTicketDeleted}
        />
      )}
    </div>
  );
};

export default InboundTechQueue;
