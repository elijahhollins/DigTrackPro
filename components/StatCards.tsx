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
    { label: 'Total Active', value: tickets.length, color: 'text-brand', darkBorder: 'border-brand/30' },
    { label: 'Sites Valid', value: stats[TicketStatus.VALID] || 0, color: 'text-emerald-500', darkBorder: 'border-emerald-500/20' },
    { label: 'Renewals', value: stats[TicketStatus.EXTENDABLE] || 0, color: 'text-orange-500', darkBorder: 'border-orange-500/20' },
    { label: 'Expirations', value: stats[TicketStatus.EXPIRED] || 0, color: 'text-rose-500', darkBorder: 'border-rose-500/20' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((it, idx) => (
        <div key={idx} className={`p-4 rounded-xl border transition-all ${isDarkMode ? `bg-[#1e293b] ${it.darkBorder}` : `bg-white border-slate-200`} shadow-sm`}>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{it.label}</p>
          <p className={`text-2xl font-black tracking-tight ${it.color}`}>{it.value}</p>
        </div>
      ))}
    </div>
  );
};

export default StatCards;