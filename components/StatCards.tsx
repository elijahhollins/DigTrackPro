
import React from 'react';
import { DigTicket, TicketStatus } from '../types.ts';
import { getTicketStatus } from '../utils/dateUtils.ts';

interface StatCardsProps {
  tickets: DigTicket[];
  isDarkMode?: boolean;
}

const StatCards = ({ tickets, isDarkMode }: StatCardsProps) => {
  const stats = tickets.reduce((acc, t) => {
    const s = getTicketStatus(t);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const items = [
    { label: 'Total Tickets', value: tickets.length, color: 'border-brand text-brand', darkBorder: 'border-brand/40' },
    { label: 'Valid Sites', value: stats[TicketStatus.VALID] || 0, color: 'border-emerald-200 text-emerald-600', darkBorder: 'border-emerald-500/20' },
    { label: 'Renewals', value: stats[TicketStatus.EXTENDABLE] || 0, color: 'border-orange-200 text-orange-600', darkBorder: 'border-orange-500/20' },
    { label: 'Expired', value: stats[TicketStatus.EXPIRED] || 0, color: 'border-rose-200 text-rose-600', darkBorder: 'border-rose-500/20' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {items.map((it, idx) => (
        <div key={idx} className={`p-6 md:p-8 rounded-[2rem] border-2 transition-all ${isDarkMode ? `bg-[#1e293b] ${it.darkBorder}` : `bg-white ${it.color.split(' ')[0]}`} shadow-sm`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{it.label}</p>
          <p className={`text-3xl md:text-5xl font-black tracking-tighter ${it.color.split(' ')[1]}`}>{it.value}</p>
        </div>
      ))}
    </div>
  );
};

export default StatCards;
