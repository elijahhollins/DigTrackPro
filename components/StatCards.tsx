
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
    { 
      label: 'Sites Valid', 
      value: stats[TicketStatus.VALID] || 0, 
      color: 'text-emerald-500', 
      darkBorder: 'border-emerald-500/20' 
    },
    { 
      label: 'Refresh', 
      value: stats[TicketStatus.EXTENDABLE] || 0, 
      color: 'text-orange-500', 
      description: 'Expiring Soon',
      darkBorder: 'border-orange-500/20' 
    },
    { 
      label: 'Refresh Req', 
      value: stats[TicketStatus.REFRESH_NEEDED] || 0, 
      color: 'text-amber-500', 
      description: 'Manual Request',
      darkBorder: 'border-amber-500/20' 
    },
    { 
      label: 'Expirations', 
      value: stats[TicketStatus.EXPIRED] || 0, 
      color: 'text-rose-500', 
      darkBorder: 'border-rose-500/20' 
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((it, idx) => (
        <div key={idx} className={`p-4 rounded-xl border transition-all ${isDarkMode ? `bg-[#1e293b] ${it.darkBorder}` : `bg-white border-slate-200`} shadow-sm`}>
          <div className="flex justify-between items-start">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{it.label}</p>
            {it.value > 0 && <div className={`w-1.5 h-1.5 rounded-full ${it.color.replace('text', 'bg')}`} />}
          </div>
          <p className={`text-2xl font-black tracking-tight ${it.color}`}>{it.value}</p>
          {it.description && <p className="text-[8px] font-bold text-slate-500 uppercase mt-0.5 opacity-60">{it.description}</p>}
        </div>
      ))}
    </div>
  );
};

export default StatCards;
