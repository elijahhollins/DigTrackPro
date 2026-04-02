
import React, { useState, useMemo } from 'react';
import { DigTicket } from '../types.ts';

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

const LEGEND = [
  { type: 'start', color: 'bg-blue-500', label: 'Dig Start' },
  { type: 'refresh', color: 'bg-orange-400', label: 'Refresh Window' },
  { type: 'expire', color: 'bg-red-600', label: 'Expires' },
  { type: 'noShowRequest', color: 'bg-rose-500', label: 'No Show' },
  { type: 'manualRefreshRequest', color: 'bg-amber-400', label: 'Manual Refresh' },
] as const;

const CalendarView: React.FC<CalendarViewProps> = ({ tickets, onEditTicket, onViewDoc, onManageNoShow, isDarkMode }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const today = useMemo(() => new Date(), []);

  const isViewingCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const isSelectedToday =
    selectedDay !== null &&
    selectedDay === today.getDate() &&
    isViewingCurrentMonth;

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();

  const calendarDays = useMemo(() => {
    const days = [];
    const count = daysInMonth(year, month);
    const startOffset = firstDayOfMonth(year, month);

    for (let i = 0; i < startOffset; i++) days.push(null);

    for (let i = 1; i <= count; i++) {
      const cellDate = new Date(year, month, i);
      const dayEvents: CalendarEvent[] = [];

      tickets.forEach(t => {
        const start = new Date(t.workDate);
        const expire = new Date(t.expires);
        const refreshDate = new Date(expire);
        refreshDate.setDate(refreshDate.getDate() - 3);

        if (isSameDay(start, cellDate)) dayEvents.push({ ticket: t, type: 'start' });
        if (isSameDay(expire, cellDate)) dayEvents.push({ ticket: t, type: 'expire' });
        if (isSameDay(refreshDate, cellDate)) dayEvents.push({ ticket: t, type: 'refresh' });

        if (isSameDay(today, cellDate)) {
          if (t.noShowRequested) dayEvents.push({ ticket: t, type: 'noShowRequest' });
          if (t.refreshRequested) dayEvents.push({ ticket: t, type: 'manualRefreshRequest' });
        }
      });

      days.push({ day: i, events: dayEvents });
    }
    return days;
  }, [year, month, tickets, today]);

  const selectedDayEvents = useMemo(() => {
    if (selectedDay === null) return [];
    const cellDate = new Date(year, month, selectedDay);
    const results: CalendarEvent[] = [];

    tickets.forEach(t => {
      const start = new Date(t.workDate);
      const expire = new Date(t.expires);
      const refreshDate = new Date(expire);
      refreshDate.setDate(refreshDate.getDate() - 3);

      if (isSameDay(start, cellDate)) results.push({ ticket: t, type: 'start' });
      if (isSameDay(expire, cellDate)) results.push({ ticket: t, type: 'expire' });
      if (isSameDay(refreshDate, cellDate)) results.push({ ticket: t, type: 'refresh' });

      if (isSameDay(today, cellDate)) {
        if (t.noShowRequested) results.push({ ticket: t, type: 'noShowRequest' });
        if (t.refreshRequested) results.push({ ticket: t, type: 'manualRefreshRequest' });
      }
    });
    return results;
  }, [selectedDay, month, year, tickets, today]);

  const activeAlerts = useMemo(() => {
    return tickets.filter(t => t.noShowRequested || t.refreshRequested);
  }, [tickets]);

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(new Date().getDate());
  };

  const standardEvents = selectedDayEvents.filter(ev => !['noShowRequest', 'manualRefreshRequest'].includes(ev.type));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Calendar grid */}
      <div className={`lg:col-span-3 rounded-3xl shadow-sm border overflow-hidden ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200'}`}>
        <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50/50 border-slate-100'}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className={`text-xl font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{monthName} {year}</h2>
            {activeAlerts.length > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-500 rounded-full text-[9px] font-black text-white uppercase tracking-widest animate-pulse">
                <span className="w-1.5 h-1.5 bg-white rounded-full" />
                {activeAlerts.length} Action {activeAlerts.length === 1 ? 'Item' : 'Items'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isViewingCurrentMonth && (
              <button
                onClick={goToToday}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${isDarkMode ? 'border-white/10 text-slate-400 hover:text-white hover:border-white/20 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:text-brand hover:border-brand/30 bg-white'}`}
              >
                Today
              </button>
            )}
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className={`p-2 rounded-lg transition-colors border shadow-sm ${isDarkMode ? 'border-white/10 hover:bg-white/5 text-slate-400' : 'border-slate-200 hover:bg-white text-slate-600'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className={`p-2 rounded-lg transition-colors border shadow-sm ${isDarkMode ? 'border-white/10 hover:bg-white/5 text-slate-400' : 'border-slate-200 hover:bg-white text-slate-600'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-7 border-b ${isDarkMode ? 'border-white/[0.06]' : 'border-slate-100'}`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className={`py-3 text-center text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-fr min-h-[500px]">
          {calendarDays.map((d, i) => {
            const isToday = d !== null && d.day === today.getDate() && isViewingCurrentMonth;
            const isSelected = d?.day === selectedDay;
            return (
              <div
                key={i}
                onClick={() => d && setSelectedDay(d.day)}
                className={`p-2 border-r border-b min-h-[100px] transition-all ${
                  isDarkMode ? 'border-white/[0.04]' : 'border-slate-50'
                } ${
                  !d
                    ? isDarkMode ? 'bg-white/[0.01]' : 'bg-slate-50/20'
                    : isDarkMode ? 'bg-transparent hover:bg-white/[0.03] cursor-pointer' : 'bg-white hover:bg-slate-50/40 cursor-pointer'
                } ${
                  isSelected ? (isDarkMode ? 'ring-2 ring-inset ring-brand bg-brand/10' : 'ring-2 ring-inset ring-brand bg-brand/5') : ''
                }`}
              >
                {d && (
                  <div className="h-full flex flex-col">
                    <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'text-white bg-slate-900'
                        : isDarkMode ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {d.day}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-auto pb-1">
                      {d.events.map((ev, idx) => (
                        <div
                          key={idx}
                          className={`w-2.5 h-2.5 rounded-full border-2 shadow-sm ${
                            isDarkMode ? 'border-[#0b1629]' : 'border-white'
                          } ${
                            ev.type === 'start' ? 'bg-blue-500' :
                            ev.type === 'expire' ? 'bg-red-600' :
                            ev.type === 'refresh' ? 'bg-orange-400' :
                            ev.type === 'noShowRequest' ? 'bg-rose-500 ring-2 ring-rose-500/30' :
                            'bg-amber-400 ring-2 ring-amber-500/30'
                          }`}
                          title={`${ev.type.toUpperCase()}: ${ev.ticket.ticketNo}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className={`px-6 py-3 border-t flex flex-wrap gap-x-5 gap-y-1.5 ${isDarkMode ? 'border-white/[0.06]' : 'border-slate-100'}`}>
          {LEGEND.map(item => (
            <div key={item.type} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${item.color}`} />
              <span className={`text-[9px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div className={`rounded-3xl shadow-sm border p-6 flex flex-col ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200'}`}>
        <h3 className={`text-sm font-black uppercase tracking-widest mb-6 border-b pb-4 flex justify-between items-center ${isDarkMode ? 'text-white border-white/[0.06]' : 'text-slate-800 border-slate-100'}`}>
          <span>Schedule & Alerts</span>
          {selectedDay && (
            <span className={`text-[10px] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {monthName.substring(0, 3).toUpperCase()} {selectedDay}
            </span>
          )}
        </h3>

        <div className="space-y-6 flex-1 overflow-y-auto no-scrollbar pr-1">
          {/* Priority Actions — only shown when today is the selected day */}
          {activeAlerts.length > 0 && isSelectedToday && (
            <div className="space-y-3">
              <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em]">Priority Actions</p>
              {activeAlerts.map(t => (
                <div
                  key={t.id}
                  onClick={() => t.noShowRequested ? onManageNoShow?.(t) : onEditTicket(t)}
                  className={`p-4 rounded-2xl border hover:shadow-md transition-all cursor-pointer group relative overflow-hidden ${isDarkMode ? 'bg-rose-500/5 border-rose-500/10 hover:border-rose-500/30' : 'bg-rose-50 border-rose-100 hover:border-rose-300'}`}
                >
                  <div className="absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 bg-rose-500/5 rounded-full group-hover:bg-rose-500/10 transition-colors" />
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${t.noShowRequested ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                      {t.noShowRequested ? 'No Show Event' : 'Refresh Required'}
                    </span>
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                  </div>
                  <p className={`text-xs font-black truncate mb-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>#{t.jobNumber} • {t.street}</p>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); if (t.documentUrl) onViewDoc?.(t.documentUrl); }}
                      className={`text-[9px] font-mono font-bold uppercase tracking-tighter transition-colors ${t.documentUrl ? 'text-rose-400 hover:text-brand hover:underline cursor-zoom-in' : 'text-rose-400 cursor-default'}`}
                    >
                      CALL REQUIRED: {t.ticketNo}
                    </button>
                    {t.noShowRequested && (
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-white/5 text-slate-500' : 'bg-rose-100 text-rose-400'}`}>
                        Tap to Manage →
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Standard Schedule */}
          <div className="space-y-4">
            {standardEvents.length > 0 && (
              <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                Standard Schedule
              </p>
            )}
            {standardEvents.length > 0 ? (
              standardEvents.map((ev, idx) => (
                <div
                  key={idx}
                  onClick={() => onEditTicket(ev.ticket)}
                  className={`p-4 rounded-2xl border hover:shadow-md transition-all cursor-pointer group ${isDarkMode ? 'bg-white/[0.03] border-white/[0.06] hover:border-brand/30' : 'bg-slate-50 border-slate-100 hover:border-brand/40'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                      ev.type === 'start' ? 'bg-blue-100 text-blue-700' :
                      ev.type === 'expire' ? 'bg-red-100 text-red-700' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {ev.type === 'start' ? 'Dig Start' : ev.type === 'expire' ? 'Expires' : 'Refresh Window'}
                    </span>
                    <div className={`w-2.5 h-2.5 rounded-full border border-white shadow-sm ${
                      ev.type === 'start' ? 'bg-blue-500' :
                      ev.type === 'expire' ? 'bg-red-600' :
                      'bg-orange-400'
                    }`} />
                  </div>
                  <p className={`text-xs font-black truncate mb-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>#{ev.ticket.jobNumber} • {ev.ticket.street}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (ev.ticket.documentUrl) onViewDoc?.(ev.ticket.documentUrl); }}
                    className={`text-[9px] font-mono font-bold transition-colors ${ev.ticket.documentUrl ? (isDarkMode ? 'text-slate-600 hover:text-brand hover:underline cursor-zoom-in' : 'text-slate-400 hover:text-brand hover:underline cursor-zoom-in') : (isDarkMode ? 'text-slate-700 cursor-default' : 'text-slate-400 cursor-default')}`}
                  >
                    TKT: {ev.ticket.ticketNo}
                  </button>
                </div>
              ))
            ) : selectedDay && (activeAlerts.length === 0 || !isSelectedToday) && standardEvents.length === 0 && (
              <div className="py-20 flex flex-col items-center opacity-30">
                <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className={`text-[10px] font-black uppercase tracking-widest text-center ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>No Activity Scheduled</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;