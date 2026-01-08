
import React, { useState, useMemo } from 'react';
import { DigTicket, TicketStatus } from '../types.ts';
import { getTicketStatus } from '../utils/dateUtils.ts';

interface CalendarViewProps {
  tickets: DigTicket[];
  onEditTicket: (ticket: DigTicket) => void;
}

type CalendarEvent = {
  ticket: DigTicket;
  type: 'start' | 'refresh' | 'expire' | 'noShowRequest' | 'manualRefreshRequest';
};

const CalendarView: React.FC<CalendarViewProps> = ({ tickets, onEditTicket }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

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
    const today = new Date();

    for (let i = 0; i < startOffset; i++) days.push(null);

    for (let i = 1; i <= count; i++) {
      const cellDate = new Date(year, month, i);
      const dayEvents: CalendarEvent[] = [];
      
      tickets.forEach(t => {
        // Standard Date Logic
        const start = new Date(t.digStart);
        const expire = new Date(t.expirationDate);
        const refreshDate = new Date(expire);
        refreshDate.setDate(refreshDate.getDate() - 3);

        if (isSameDay(start, cellDate)) dayEvents.push({ ticket: t, type: 'start' });
        if (isSameDay(expire, cellDate)) dayEvents.push({ ticket: t, type: 'expire' });
        if (isSameDay(refreshDate, cellDate)) dayEvents.push({ ticket: t, type: 'refresh' });

        // Request-based Logic (Show on Today if active)
        if (isSameDay(today, cellDate)) {
          if (t.noShowRequested) dayEvents.push({ ticket: t, type: 'noShowRequest' });
          if (t.refreshRequested) dayEvents.push({ ticket: t, type: 'manualRefreshRequest' });
        }
      });

      days.push({ day: i, events: dayEvents });
    }
    return days;
  }, [year, month, tickets]);

  const selectedDayEvents = useMemo(() => {
    if (selectedDay === null) return [];
    const cellDate = new Date(year, month, selectedDay);
    const today = new Date();
    const results: CalendarEvent[] = [];
    
    tickets.forEach(t => {
      const start = new Date(t.digStart);
      const expire = new Date(t.expirationDate);
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
  }, [selectedDay, month, year, tickets]);

  const activeAlerts = useMemo(() => {
    return tickets.filter(t => t.noShowRequested || t.refreshRequested);
  }, [tickets]);

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-3 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{monthName} {year}</h2>
            {activeAlerts.length > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-500 rounded-full text-[9px] font-black text-white uppercase tracking-widest animate-pulse">
                <span className="w-1.5 h-1.5 bg-white rounded-full" />
                {activeAlerts.length} Action Items
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-white rounded-lg transition-colors border border-slate-200 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-white rounded-lg transition-colors border border-slate-200 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr min-h-[500px]">
          {calendarDays.map((d, i) => (
            <div 
              key={i} 
              onClick={() => d && setSelectedDay(d.day)}
              className={`p-2 border-r border-b border-slate-50 min-h-[100px] cursor-pointer transition-all ${!d ? 'bg-slate-50/20' : 'bg-white hover:bg-slate-50/40'} ${d?.day === selectedDay ? 'ring-2 ring-inset ring-brand bg-brand/5' : ''}`}
            >
              {d && (
                <div className="h-full flex flex-col">
                  <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full ${d.day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear() ? 'text-white bg-slate-900' : 'text-slate-400'}`}>
                    {d.day}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-auto pb-1">
                    {d.events.map((ev, idx) => (
                      <div 
                        key={idx} 
                        className={`w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${
                          ev.type === 'start' ? 'bg-blue-500' : 
                          ev.type === 'expire' ? 'bg-red-600' : 
                          ev.type === 'refresh' ? 'bg-orange-400' :
                          ev.type === 'noShowRequest' ? 'bg-rose-500 ring-2 ring-rose-500/20' : 
                          'bg-amber-400 ring-2 ring-amber-500/20'
                        }`} 
                        title={`${ev.type.toUpperCase()}: ${ev.ticket.ticketNo}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 border-b border-slate-100 pb-4 flex justify-between items-center">
          <span>Schedule & Alerts</span>
          {selectedDay && <span className="text-[10px] text-slate-400 font-bold">{monthName.substring(0,3)} {selectedDay}</span>}
        </h3>
        
        <div className="space-y-6 flex-1 overflow-y-auto no-scrollbar pr-1">
          {/* Priority Alerts Section */}
          {activeAlerts.length > 0 && selectedDay === new Date().getDate() && (
            <div className="space-y-3">
              <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em]">Priority Actions</p>
              {activeAlerts.map(t => (
                 <div key={t.id} onClick={() => onEditTicket(t)} className="p-4 bg-rose-50 rounded-2xl border border-rose-100 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 bg-rose-500/5 rounded-full group-hover:bg-rose-500/10 transition-colors" />
                    <div className="flex items-center gap-2 mb-2">
                       <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${t.noShowRequested ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                          {t.noShowRequested ? 'No Show Event' : 'Refresh Manual'}
                       </span>
                       <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                    </div>
                    <p className="text-xs font-black text-slate-800 truncate mb-1">#{t.jobNumber} • {t.address}</p>
                    <p className="text-[9px] font-mono font-bold text-rose-400 uppercase tracking-tighter">CALL REQUIRED: {t.ticketNo}</p>
                 </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{selectedDayEvents.length > 0 ? 'Standard Schedule' : ''}</p>
            {selectedDayEvents.filter(ev => !['noShowRequest', 'manualRefreshRequest'].includes(ev.type)).length > 0 ? (
              selectedDayEvents.filter(ev => !['noShowRequest', 'manualRefreshRequest'].includes(ev.type)).map((ev, idx) => (
                <div key={idx} onClick={() => onEditTicket(ev.ticket)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-brand/40 hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                      ev.type === 'start' ? 'bg-blue-100 text-blue-700' : 
                      ev.type === 'expire' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-800'
                    }`}>
                      {ev.type === 'start' ? 'Dig Start' : ev.type === 'expire' ? 'Expirations' : 'Refresh Window'}
                    </span>
                    <div className={`w-2.5 h-2.5 rounded-full border border-white shadow-sm ${
                      ev.type === 'start' ? 'bg-blue-500' : 
                      ev.type === 'expire' ? 'bg-red-600' : 'bg-orange-400'
                    }`} />
                  </div>
                  <p className="text-xs font-black text-slate-800 truncate mb-1">#{ev.ticket.jobNumber} • {ev.ticket.address}</p>
                  <p className="text-[9px] font-mono font-bold text-slate-400">TKT: {ev.ticket.ticketNo}</p>
                </div>
              ))
            ) : selectedDay && activeAlerts.length === 0 && (
              <div className="py-20 flex flex-col items-center opacity-30">
                <svg className="w-10 h-10 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">No Activity Scheduled</p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100 mt-auto">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Color Legend</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
                <span>Dig Start Work</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-orange-400 border-2 border-white shadow-sm" />
                <span>Auto Refresh Window</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-white shadow-sm" />
                <span>Ticket Expiration</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-rose-500 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white shadow-sm ring-2 ring-rose-500/20" />
                <span>Active No Show Req</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-amber-500 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow-sm ring-2 ring-amber-500/20" />
                <span>Manual Refresh Req</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
