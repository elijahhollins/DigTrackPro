
import React, { useState, useMemo } from 'react';
import { DigTicket } from '../types.ts';

interface CalendarViewProps {
  tickets: DigTicket[];
  onEditTicket: (ticket: DigTicket) => void;
}

type CalendarEvent = {
  ticket: DigTicket;
  type: 'start' | 'refresh' | 'expire';
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

    for (let i = 0; i < startOffset; i++) days.push(null);

    for (let i = 1; i <= count; i++) {
      const cellDate = new Date(year, month, i);
      const dayEvents: CalendarEvent[] = [];
      
      tickets.forEach(t => {
        const start = new Date(t.digStart);
        const expire = new Date(t.expirationDate);
        // Refresh eligibility is typically 3 days before expiry
        const refreshDate = new Date(expire);
        refreshDate.setDate(refreshDate.getDate() - 3);

        if (isSameDay(start, cellDate)) dayEvents.push({ ticket: t, type: 'start' });
        if (isSameDay(expire, cellDate)) dayEvents.push({ ticket: t, type: 'expire' });
        if (isSameDay(refreshDate, cellDate)) dayEvents.push({ ticket: t, type: 'refresh' });
      });

      days.push({ day: i, events: dayEvents });
    }
    return days;
  }, [year, month, tickets]);

  const selectedDayEvents = useMemo(() => {
    if (selectedDay === null) return [];
    const cellDate = new Date(year, month, selectedDay);
    const results: CalendarEvent[] = [];
    
    tickets.forEach(t => {
      const start = new Date(t.digStart);
      const expire = new Date(t.expirationDate);
      const refreshDate = new Date(expire);
      refreshDate.setDate(refreshDate.getDate() - 3);

      if (isSameDay(start, cellDate)) results.push({ ticket: t, type: 'start' });
      if (isSameDay(expire, cellDate)) results.push({ ticket: t, type: 'expire' });
      if (isSameDay(refreshDate, cellDate)) results.push({ ticket: t, type: 'refresh' });
    });
    return results;
  }, [selectedDay, month, year, tickets]);

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-3 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{monthName} {year}</h2>
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
                        className={`w-2 h-2 rounded-full border border-white shadow-sm ${
                          ev.type === 'start' ? 'bg-blue-500' : 
                          ev.type === 'expire' ? 'bg-red-600' : 'bg-yellow-400'
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

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 border-b border-slate-100 pb-4">
          {selectedDay ? `${monthName} ${selectedDay} Activity` : 'Select a date'}
        </h3>
        
        <div className="space-y-6">
          <div className="space-y-4">
            {selectedDayEvents.length > 0 ? (
              selectedDayEvents.map((ev, idx) => (
                <div key={idx} onClick={() => onEditTicket(ev.ticket)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-brand/40 hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                      ev.type === 'start' ? 'bg-blue-100 text-blue-700' : 
                      ev.type === 'expire' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {ev.type === 'start' ? 'Dig Start' : ev.type === 'expire' ? 'Expirations' : 'Refresh Needed'}
                    </span>
                    <div className={`w-2.5 h-2.5 rounded-full border border-white shadow-sm ${
                      ev.type === 'start' ? 'bg-blue-500' : 
                      ev.type === 'expire' ? 'bg-red-600' : 'bg-yellow-400'
                    }`} />
                  </div>
                  <p className="text-xs font-black text-slate-800 truncate mb-1">#{ev.ticket.jobNumber} • {ev.ticket.address}</p>
                  <p className="text-[9px] font-mono font-bold text-slate-400">TKT: {ev.ticket.ticketNo}</p>
                </div>
              ))
            ) : selectedDay && (
              <div className="py-20 flex flex-col items-center opacity-30">
                <svg className="w-10 h-10 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">No Activity Scheduled</p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Legend</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border border-white shadow-sm" />
                <span>Dig Start Work</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-400 border border-white shadow-sm" />
                <span>Refresh Eligibility</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 uppercase">
                <div className="w-3.5 h-3.5 rounded-full bg-red-600 border border-white shadow-sm" />
                <span>Ticket Expiration</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
