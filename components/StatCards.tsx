
import React from 'react';
import { DigTicket, TicketStatus } from '../types';
import { getTicketStatus } from '../utils/dateUtils';

export default ({ tickets }: { tickets: DigTicket[] }) => {
  const stats = tickets.reduce((acc, t) => {
    const s = getTicketStatus(t);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const items = [
    { label: 'Live Tickets', value: tickets.length, color: 'border-slate-200 text-slate-800' },
    { label: 'Active (Valid)', value: stats[TicketStatus.VALID] || 0, color: 'border-emerald-100 text-emerald-600' },
    { label: 'Requires Renewal', value: stats[TicketStatus.EXTENDABLE] || 0, color: 'border-amber-100 text-amber-600' },
    { label: 'Expired', value: stats[TicketStatus.EXPIRED] || 0, color: 'border-rose-100 text-rose-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {items.map((it, idx) => (
        <div key={idx} className={`bg-white p-8 rounded-[2rem] border-2 ${it.color.split(' ')[0]} shadow-sm hover:shadow-md transition-shadow`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{it.label}</p>
          <p className={`text-4xl font-black tracking-tighter ${it.color.split(' ')[1]}`}>{it.value}</p>
        </div>
      ))}
    </div>
  );
};
