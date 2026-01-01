
import React, { useState, useMemo } from 'react';
import { DigTicket } from '../types';
import { getTicketStatus, getStatusDotColor } from '../utils/dateUtils';

interface CalendarViewProps {
  tickets: DigTicket[];
  onEditTicket: (ticket: DigTicket) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ tickets, onEditTicket }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const calendarDays = useMemo(() => {
    const days = [];
    const count = daysInMonth(year, month);
    const startOffset = firstDayOfMonth(year, month);

    for (let i = 0; i < startOffset; i++) days.push(null);

    for (let i = 1; i <= count; i++) {
      const dayTickets = tickets.filter(t => {
        const d = new Date(t.digStart);
        return d.getDate() === i && d.getMonth() === month && d.getFullYear() === year;
      });
      days.push({ day: i, tickets: dayTickets });
    }
    return days;
  }, [year, month, tickets]);

  const selectedTickets = useMemo(() => {
    if (selectedDay === null) return [];
    return tickets.filter(t => {
      const d = new Date(t.digStart);
      return d.getDate() === selectedDay && d.getMonth() === month && d.getFullYear() === year;
    });
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
              className={`p-2 border-r border-b border-slate-50 min-h-[100px] cursor-pointer transition-all ${!d ? 'bg-slate-50/20' : 'bg-white hover:bg-blue-50/20'} ${d?.day === selectedDay ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30' : ''}`}
            >
              {d && (
                <div className="h-full flex flex-col">
                  <span className={`text-xs font-black ${d.day === new Date().getDate() && month === new Date().getMonth() ? 'text-blue-600 bg-blue-50 w-6 h-6 flex items-center justify-center rounded-full' : 'text-slate-400'}`}>
                    {d.day}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {d.tickets.map(t => (
                      <div key={t.id} className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(getTicketStatus(t))}`} />
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
          {selectedDay ? `${monthName} ${selectedDay} Schedule` : 'Select a date'}
        </h3>
        <div className="space-y-4">
          {selectedTickets.map(t => (
            <div key={t.id} onClick={() => onEditTicket(t)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black text-blue-600 uppercase">Job #{t.jobNumber}</span>
                <div className={`w-2 h-2 rounded-full ${getStatusDotColor(getTicketStatus(t))}`} />
              </div>
              <p className="text-xs font-bold text-slate-800 truncate mb-1">{t.address}</p>
              <p className="text-[9px] font-mono text-slate-400 uppercase">{t.ticketNo}</p>
            </div>
          ))}
          {selectedDay && selectedTickets.length === 0 && (
            <p className="text-xs text-slate-400 italic text-center py-10">No dig starts scheduled.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
