
import React, { useState, useMemo, useCallback } from 'react';
import { DigTicket } from '../types.ts';
import { addDaysToDateStr } from '../utils/dateUtils.ts';

interface CalendarViewProps {
  tickets: DigTicket[];
  onEditTicket: (ticket: DigTicket) => void;
  onViewDoc?: (url: string) => void;
  onManageNoShow?: (ticket: DigTicket) => void;
  isDarkMode?: boolean;
}

type CalendarEvent = {
  ticket: DigTicket;
  type: 'start' | 'refresh' | 'expire' | 'noShowRequest' | 'manualRefreshRequest';
};

const EVENT_META: Record<CalendarEvent['type'], { label: string; pill: string; dot: string; border: string; accent: string }> = {
  start:                { label: 'Dig Start',      pill: 'bg-blue-500/10 text-blue-600',    dot: 'bg-blue-500',   border: 'border-l-blue-500',   accent: 'text-blue-500' },
  refresh:              { label: 'Refresh Window',  pill: 'bg-orange-400/10 text-orange-600',dot: 'bg-orange-400', border: 'border-l-orange-400', accent: 'text-orange-500' },
  expire:               { label: 'Expires',         pill: 'bg-red-500/10 text-red-600',      dot: 'bg-red-500',    border: 'border-l-red-500',    accent: 'text-red-500' },
  noShowRequest:        { label: 'No Show',         pill: 'bg-rose-500/10 text-rose-600',    dot: 'bg-rose-500',   border: 'border-l-rose-500',   accent: 'text-rose-500' },
  manualRefreshRequest: { label: 'Manual Refresh',  pill: 'bg-amber-400/10 text-amber-600',  dot: 'bg-amber-400',  border: 'border-l-amber-400',  accent: 'text-amber-500' },
};

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENT_LEGEND = Object.entries(EVENT_META) as [CalendarEvent['type'], typeof EVENT_META[CalendarEvent['type']]][];

const DISMISSED_KEY = 'cal_dismissed_events';

const CalendarView: React.FC<CalendarViewProps> = ({ tickets, onEditTicket, onViewDoc, onManageNoShow, isDarkMode }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [dismissedEvents, setDismissedEvents] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(DISMISSED_KEY);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();

  const isViewingCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const isSelectedToday =
    selectedDay !== null &&
    selectedDay === today.getDate() &&
    isViewingCurrentMonth;

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();

  const dismissEvent = useCallback((ticketId: string, eventType: CalendarEvent['type']) => {
    const key = `${ticketId}:${eventType}`;
    setDismissedEvents(prev => {
      const next = new Set(prev);
      next.add(key);
      try {
        sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch { /* sessionStorage may be unavailable in some environments */ }
      return next;
    });
  }, []);

  const getEventsForDate = useCallback((cellDate: Date): CalendarEvent[] => {
    const events: CalendarEvent[] = [];
    const now = new Date();
    tickets.forEach(t => {
      // Ticket clears at 11:59 PM on workDate; first dig day is workDate + 1
      const digStartStr = addDaysToDateStr(t.workDate, 1);
      const [sy, sm, sd] = digStartStr.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd);
      const expireParts = t.expires.split('-').map(Number);
      const expire = expireParts.length === 3
        ? new Date(expireParts[0], expireParts[1] - 1, expireParts[2])
        : new Date(t.expires);
      const refresh = new Date(expire);
      refresh.setDate(refresh.getDate() - 3);
      if (isSameDay(start, cellDate)) events.push({ ticket: t, type: 'start' });
      if (isSameDay(expire, cellDate)) events.push({ ticket: t, type: 'expire' });
      if (isSameDay(refresh, cellDate)) events.push({ ticket: t, type: 'refresh' });
      if (isSameDay(now, cellDate)) {
        if (t.noShowRequested) events.push({ ticket: t, type: 'noShowRequest' });
        if (t.refreshRequested) events.push({ ticket: t, type: 'manualRefreshRequest' });
      }
    });
    return events;
  }, [tickets]);

  const calendarDays = useMemo(() => {
    const count = new Date(year, month + 1, 0).getDate();
    const startOffset = new Date(year, month, 1).getDay();
    const days: (null | { day: number; events: CalendarEvent[] })[] = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let i = 1; i <= count; i++) {
      days.push({ day: i, events: getEventsForDate(new Date(year, month, i)) });
    }
    return days;
  }, [year, month, tickets]);

  const selectedDayEvents = useMemo(() => {
    if (selectedDay === null) return [];
    return getEventsForDate(new Date(year, month, selectedDay));
  }, [selectedDay, month, year, tickets]);

  const activeAlerts = useMemo(
    () => tickets.filter(t => t.noShowRequested || t.refreshRequested),
    [tickets]
  );

  const visibleAlerts = useMemo(
    () => activeAlerts.filter(t =>
      (t.noShowRequested && !dismissedEvents.has(`${t.id}:noShowRequest`)) ||
      (t.refreshRequested && !dismissedEvents.has(`${t.id}:manualRefreshRequest`))
    ),
    [activeAlerts, dismissedEvents]
  );

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const goToToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(now.getDate());
  };

  const selectedDateLabel = useMemo(() => {
    if (selectedDay === null) return null;
    return new Date(year, month, selectedDay).toLocaleDateString('default', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }, [selectedDay, month, year]);

  const priorityEvents = selectedDayEvents.filter(ev =>
    (ev.type === 'noShowRequest' || ev.type === 'manualRefreshRequest') &&
    !dismissedEvents.has(`${ev.ticket.id}:${ev.type}`)
  );
  const standardEvents = selectedDayEvents.filter(ev =>
    ev.type !== 'noShowRequest' &&
    ev.type !== 'manualRefreshRequest' &&
    !dismissedEvents.has(`${ev.ticket.id}:${ev.type}`)
  );

  const divider = isDarkMode ? 'border-white/[0.05]' : 'border-slate-100';
  const subtle = isDarkMode ? 'text-slate-500' : 'text-slate-400';
  const card = isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-100 shadow-sm';

  return (
    <div className="flex flex-col gap-4">

      {/* Alert banner */}
      {visibleAlerts.length > 0 && (
        <div className={`rounded-xl border px-5 py-3 flex items-center gap-3 ${isDarkMode ? 'bg-rose-500/5 border-rose-500/10' : 'bg-rose-50 border-rose-100'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <p className={`text-[11px] font-black uppercase tracking-widest shrink-0 ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>
            {visibleAlerts.length} Active {visibleAlerts.length === 1 ? 'Alert' : 'Alerts'}
          </p>
          <p className={`text-[11px] font-mono truncate ${subtle}`}>
            {visibleAlerts.map(t => t.ticketNo).join(' · ')}
          </p>
          <button
            onClick={goToToday}
            className={`ml-auto shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg transition-all ${isDarkMode ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20' : 'bg-rose-100 text-rose-600 hover:bg-rose-200'}`}
          >
            View Today
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Calendar ── */}
        <div className={`lg:col-span-2 rounded-2xl border overflow-hidden ${card}`}>

          {/* Header */}
          <div className={`px-6 py-4 flex items-center justify-between border-b ${divider}`}>
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{monthName}</h2>
                <span className={`text-lg font-light ${subtle}`}>{year}</span>
              </div>
              {!isViewingCurrentMonth && (
                <button
                  onClick={goToToday}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-brand' : 'text-slate-400 hover:text-brand'}`}
                >
                  ← Back to today
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7">
            {DAY_HEADERS.map(d => (
              <div key={d} className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider ${subtle}`}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((d, i) => {
              const isToday = d !== null && d.day === today.getDate() && isViewingCurrentMonth;
              const isSelected = d?.day === selectedDay;
              const visibleEvents = d?.events.filter(ev =>
                !dismissedEvents.has(`${ev.ticket.id}:${ev.type}`)
              ) ?? [];
              const uniqueEventTypes = [...new Set(visibleEvents.map((ev: CalendarEvent) => ev.type))] as CalendarEvent['type'][];

              return (
                <div
                  key={i}
                  onClick={() => d && setSelectedDay(d.day)}
                  className={`border-t min-h-[76px] p-2 flex flex-col gap-1 transition-colors ${divider} ${
                    d ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? isDarkMode ? 'bg-brand/10' : 'bg-brand/5'
                      : d
                        ? isDarkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'
                        : ''
                  }`}
                >
                  {d && (
                    <>
                      <span className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full self-start ${
                        isToday
                          ? 'bg-brand text-white font-black'
                          : isSelected
                            ? `ring-2 ring-brand font-black ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`
                            : isDarkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {d.day}
                      </span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {visibleEvents.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md leading-tight ${
                              isDarkMode ? 'bg-brand/20 text-brand' : 'bg-brand/10 text-brand'
                            }`}>
                              {visibleEvents.length}
                            </span>
                            <div className="flex gap-0.5 flex-wrap">
                              {uniqueEventTypes.map(type => (
                                <div
                                  key={type}
                                  title={EVENT_META[type].label}
                                  className={`w-1.5 h-1.5 rounded-full ${EVENT_META[type].dot}`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className={`px-5 py-2.5 border-t flex flex-wrap gap-x-4 gap-y-1 ${divider}`}>
            {EVENT_LEGEND.map(([type, meta]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${subtle}`}>{meta.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <div className={`rounded-2xl border flex flex-col ${card}`}>

          {/* Date header */}
          <div className={`px-5 py-5 border-b ${divider}`}>
            {selectedDay ? (
              <>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${subtle}`}>
                  {isSelectedToday ? 'Today' : 'Selected'}
                </p>
                <p className={`text-base font-black leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {selectedDateLabel}
                </p>
              </>
            ) : (
              <p className={`text-sm font-bold ${subtle}`}>Select a day</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar">

            {/* Priority events (alerts) */}
            {priorityEvents.length > 0 && isSelectedToday && (
              <div className={`p-4 border-b ${divider}`}>
                <p className={`text-[9px] font-black uppercase tracking-[0.15em] mb-3 text-rose-500`}>⚠ Needs Action</p>
                <div className="flex flex-col gap-2">
                  {priorityEvents.map((ev: CalendarEvent, idx) => (
                    <div key={idx} className={`relative rounded-xl border-l-4 transition-all ${EVENT_META[ev.type].border} ${isDarkMode ? 'bg-white/[0.03]' : 'bg-slate-50'}`}>
                      <button
                        onClick={() => ev.type === 'noShowRequest' ? onManageNoShow?.(ev.ticket) : onEditTicket(ev.ticket)}
                        className="w-full text-left p-3 pr-8"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[9px] font-black uppercase tracking-wider ${EVENT_META[ev.type].accent}`}>
                            {EVENT_META[ev.type].label}
                          </span>
                          <svg className={`w-3 h-3 ${subtle}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                        </div>
                        <p className={`text-[11px] font-black truncate ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          #{ev.ticket.jobNumber} · {ev.ticket.street}
                        </p>
                        <p className={`text-[9px] font-mono mt-0.5 ${subtle}`}>{ev.ticket.ticketNo}</p>
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          dismissEvent(ev.ticket.id, ev.type);
                        }}
                        title="Acknowledge and hide"
                        className={`absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full transition-all ${isDarkMode ? 'text-slate-600 hover:text-slate-300 hover:bg-white/10' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-200'}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Standard events */}
            {standardEvents.length > 0 ? (
              <div className="p-4 flex flex-col gap-2">
                {standardEvents.map((ev: CalendarEvent, idx) => (
                  <div key={idx} className={`relative rounded-xl border-l-4 transition-all ${EVENT_META[ev.type].border} ${isDarkMode ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    <button
                      onClick={() => onEditTicket(ev.ticket)}
                      className="w-full text-left p-3 pr-8"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-wider ${EVENT_META[ev.type].accent}`}>
                          {EVENT_META[ev.type].label}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); if (ev.ticket.documentUrl) onViewDoc?.(ev.ticket.documentUrl); }}
                          className={`text-[9px] font-mono font-bold transition-colors ${ev.ticket.documentUrl ? (isDarkMode ? 'text-slate-600 hover:text-brand' : 'text-slate-400 hover:text-brand') : `cursor-default ${subtle}`}`}
                        >
                          {ev.ticket.ticketNo}
                        </button>
                      </div>
                      <p className={`text-[11px] font-black truncate ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        #{ev.ticket.jobNumber} · {ev.ticket.street}
                      </p>
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        dismissEvent(ev.ticket.id, ev.type);
                      }}
                      title="Acknowledge and hide"
                      className={`absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full transition-all ${isDarkMode ? 'text-slate-600 hover:text-slate-300 hover:bg-white/10' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-200'}`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : selectedDay !== null && priorityEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6 opacity-30">
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className={`text-[10px] font-bold uppercase tracking-widest text-center ${subtle}`}>Nothing scheduled</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CalendarView;