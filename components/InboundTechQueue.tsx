
import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRecord } from '../types.ts';
import {
  InboundTicket,
  InboundTicketStatus,
  INBOUND_STATUS_LABELS,
} from '../services/inboundTypes.ts';
import { inboundTicketService } from '../services/inboundTicketService.ts';
import InboundTicketDetail from './InboundTicketDetail.tsx';
import { statusBadge } from './InboundTicketRow.tsx';

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

const InboundTechQueue: React.FC<InboundTechQueueProps> = ({ sessionUser, users, isDarkMode }) => {
  const dm = isDarkMode ?? false;

  const [tickets, setTickets] = useState<InboundTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [detailTicket, setDetailTicket] = useState<InboundTicket | null>(null);

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

  useEffect(() => { loadTickets(); }, []);

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
            <button
              key={ticket.id}
              onClick={() => setDetailTicket(ticket)}
              className={`w-full text-left rounded-2xl border p-5 transition-all hover:scale-[1.005] active:scale-[0.998] ${
                dm
                  ? 'bg-[#0b1629] border-white/[0.06] hover:border-white/10 hover:bg-white/[0.025]'
                  : 'bg-white border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md'
              }`}
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
              <div className={`flex items-center justify-end mt-3 gap-1 ${dm ? 'text-slate-700' : 'text-slate-400'}`}>
                <span className="text-[9px] font-black uppercase tracking-widest">View Details</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
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
