
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, UserRecord } from '../types.ts';
import { InboundTicket, InboundTicketStatus } from '../services/inboundTypes.ts';
import { inboundTicketService } from '../services/inboundTicketService.ts';
import InboundTicketDetail from './InboundTicketDetail.tsx';

type EventType = 'due' | 'start';

interface CalEvent {
  ticket: InboundTicket;
  type:   EventType;
}

const EVENT_META: Record<EventType, { label: string; dot: string; borderLeft: string; accent: string }> = {
  due:   { label: 'Due Date',   dot: 'bg-rose-500',  borderLeft: 'border-l-rose-500',  accent: 'text-rose-500'  },
  start: { label: 'Dig Start',  dot: 'bg-blue-500',  borderLeft: 'border-l-blue-500',  accent: 'text-blue-500'  },
};

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface InboundCalendarViewProps {
  sessionUser: User;
  users:       UserRecord[];
  isAdmin:     boolean;
  isDarkMode?: boolean;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });

const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const MS_PER_DAY = 86_400_000;

const urgencyDot = (iso: string | undefined, status: InboundTicketStatus) => {
  if (status === InboundTicketStatus.COMPLETED) return 'bg-slate-400';
  if (!iso) return 'bg-slate-400';
  const diff = Math.ceil((parseLocalDate(iso).getTime() - Date.now()) / MS_PER_DAY);
  if (diff < 0)  return 'bg-rose-600';
  if (diff <= 1) return 'bg-amber-500';
  return 'bg-brand';
};

const InboundCalendarView: React.FC<InboundCalendarViewProps> = ({
  sessionUser,
  users,
  isAdmin,
  isDarkMode = false,
}) => {
  const dm = isDarkMode;
  const today = useMemo(() => new Date(), []);

  const [currentDate, setCurrentDate]   = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay]   = useState<number | null>(today.getDate());
  const [tickets, setTickets]           = useState<InboundTicket[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [loadError, setLoadError]       = useState('');
  const [detailTicket, setDetailTicket] = useState<InboundTicket | null>(null);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await inboundTicketService.getTickets();
      setTickets(data);
    } catch (err) {
      setLoadError((err as Error).message ?? 'Failed to load tickets.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const getEventsForDate = useCallback((cellDate: Date): CalEvent[] => {
    const events: CalEvent[] = [];
    tickets.forEach(t => {
      if (t.dueDate && isSameLocalDay(parseLocalDate(t.dueDate), cellDate)) {
        events.push({ ticket: t, type: 'due' });
      }
      if (t.digStartDate && isSameLocalDay(parseLocalDate(t.digStartDate), cellDate)) {
        events.push({ ticket: t, type: 'start' });
      }
    });
    return events;
  }, [tickets]);

  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = new Date(year, month, 1).getDay();
    const cells: (null | { day: number; events: CalEvent[] })[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, events: getEventsForDate(new Date(year, month, d)) });
    }
    return cells;
  }, [year, month, getEventsForDate]);

  const selectedDayEvents = useMemo((): CalEvent[] => {
    if (selectedDay === null) return [];
    return getEventsForDate(new Date(year, month, selectedDay));
  }, [selectedDay, year, month, getEventsForDate]);

  const overdueTickets = useMemo(
    () => tickets.filter(
      t => t.status !== InboundTicketStatus.COMPLETED && t.dueDate && parseLocalDate(t.dueDate) < today
    ),
    [tickets, today]
  );

  const divider = dm ? 'border-white/[0.05]' : 'border-slate-100';
  const subtle  = dm ? 'text-slate-500' : 'text-slate-400';
  const card    = dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-100 shadow-sm';

  const goToToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(today.getDate());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`rounded-2xl border px-6 py-8 text-center ${card}`}>
        <p className={`text-sm font-bold ${dm ? 'text-rose-400' : 'text-rose-600'}`}>{loadError}</p>
        <button onClick={loadTickets} className={`mt-3 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl ${dm ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Overdue alert */}
      {overdueTickets.length > 0 && (
        <div className={`rounded-xl border px-5 py-3 flex items-center gap-3 ${dm ? 'bg-rose-500/5 border-rose-500/10' : 'bg-rose-50 border-rose-100'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <p className={`text-[11px] font-black uppercase tracking-widest shrink-0 ${dm ? 'text-rose-400' : 'text-rose-600'}`}>
            {overdueTickets.length} Overdue {overdueTickets.length === 1 ? 'Ticket' : 'Tickets'}
          </p>
          <p className={`text-[11px] font-mono truncate ${subtle}`}>
            {overdueTickets.map(t => `#${t.ticketNumber}`).join(' · ')}
          </p>
          <button
            onClick={goToToday}
            className={`ml-auto shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg transition-all ${dm ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20' : 'bg-rose-100 text-rose-600 hover:bg-rose-200'}`}
          >
            View Today
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Calendar grid ── */}
        <div className={`lg:col-span-2 rounded-2xl border overflow-hidden ${card}`}>
          {/* Month header */}
          <div className={`px-6 py-4 flex items-center justify-between border-b ${divider}`}>
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className={`text-2xl font-black tracking-tight ${dm ? 'text-white' : 'text-slate-900'}`}>
                  {currentDate.toLocaleString('default', { month: 'long' })}
                </h2>
                <span className={`text-lg font-light ${subtle}`}>{year}</span>
              </div>
              {!isCurrentMonth && (
                <button
                  onClick={goToToday}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${dm ? 'text-slate-500 hover:text-brand' : 'text-slate-400 hover:text-brand'}`}
                >
                  ← Back to today
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${dm ? 'hover:bg-white/5 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${dm ? 'hover:bg-white/5 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7">
            {DAY_HEADERS.map(d => (
              <div key={d} className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider ${subtle}`}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarCells.map((cell, i) => {
              const isToday    = cell !== null && cell.day === today.getDate() && isCurrentMonth;
              const isSelected = cell?.day === selectedDay;
              return (
                <div
                  key={i}
                  onClick={() => cell && setSelectedDay(cell.day)}
                  className={`border-t min-h-[76px] p-2 flex flex-col gap-1 transition-colors ${divider} ${
                    cell ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? dm ? 'bg-brand/10' : 'bg-brand/5'
                      : cell
                        ? dm ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'
                        : ''
                  }`}
                >
                  {cell && (
                    <>
                      <span className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full self-start ${
                        isToday
                          ? 'bg-brand text-white font-black'
                          : isSelected
                            ? `ring-2 ring-brand font-black ${dm ? 'text-slate-300' : 'text-slate-700'}`
                            : dm ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {cell.day}
                      </span>
                      {cell.events.length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          {cell.events.slice(0, 2).map((ev, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${urgencyDot(ev.ticket.dueDate, ev.ticket.status)}`} />
                              <span className={`text-[9px] font-bold truncate leading-tight ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                                #{ev.ticket.ticketNumber}
                              </span>
                            </div>
                          ))}
                          {cell.events.length > 2 && (
                            <span className={`text-[9px] font-bold ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
                              +{cell.events.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className={`px-5 py-2.5 border-t flex flex-wrap gap-x-5 gap-y-1 ${divider}`}>
            {(Object.entries(EVENT_META) as [EventType, typeof EVENT_META[EventType]][]).map(([type, meta]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${subtle}`}>{meta.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className={`rounded-2xl border flex flex-col overflow-hidden ${card}`}>
          <div className={`px-5 py-4 border-b ${divider}`}>
            {selectedDay !== null ? (
              <>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${subtle}`}>
                  {selectedDay === today.getDate() && isCurrentMonth ? 'Today' : 'Selected'}
                </p>
                <p className={`text-sm font-black leading-tight ${dm ? 'text-white' : 'text-slate-900'}`}>
                  {fmtDate(new Date(year, month, selectedDay))}
                </p>
              </>
            ) : (
              <p className={`text-sm font-bold ${subtle}`}>Select a day</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar">
            {selectedDayEvents.length > 0 ? (
              <div className="p-4 flex flex-col gap-2">
                {selectedDayEvents.map((ev, idx) => (
                  <button
                    key={idx}
                    onClick={() => setDetailTicket(ev.ticket)}
                    className={`w-full text-left relative rounded-xl border-l-[3px] transition-all ${EVENT_META[ev.type].borderLeft} ${dm ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-slate-50 hover:bg-slate-100'}`}
                  >
                    <div className="px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-wider ${EVENT_META[ev.type].accent}`}>
                          {EVENT_META[ev.type].label}
                        </span>
                        <span className={`text-[9px] font-mono font-bold ${subtle}`}>#{ev.ticket.ticketNumber}</span>
                      </div>
                      <p className={`text-[11px] font-black truncate ${dm ? 'text-slate-200' : 'text-slate-800'}`}>
                        {ev.ticket.siteAddress}
                      </p>
                      {ev.ticket.callerName && (
                        <p className={`text-[10px] mt-0.5 ${subtle}`}>{ev.ticket.callerName}</p>
                      )}
                      <div className={`flex items-center gap-1 mt-1.5`}>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                          ev.ticket.status === InboundTicketStatus.COMPLETED
                            ? dm ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                            : dm ? 'bg-brand/10 text-brand' : 'bg-brand/10 text-brand'
                        }`}>
                          {ev.ticket.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : selectedDay !== null ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 opacity-30">
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className={`text-[10px] font-bold uppercase tracking-widest text-center ${subtle}`}>Nothing scheduled</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {detailTicket && (
        <InboundTicketDetail
          ticket={detailTicket}
          users={users}
          sessionUser={sessionUser}
          isAdmin={isAdmin}
          isDarkMode={dm}
          onClose={() => setDetailTicket(null)}
          onTicketUpdated={updated => {
            setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
            setDetailTicket(updated);
          }}
          onTicketDeleted={id => {
            setTickets(prev => prev.filter(t => t.id !== id));
            setDetailTicket(null);
          }}
        />
      )}
    </div>
  );
};

export default InboundCalendarView;
