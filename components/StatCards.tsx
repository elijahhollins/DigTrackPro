
import React from 'react';
import { DigTicket, TicketStatus } from '../types.ts';
import { getTicketStatus } from '../utils/dateUtils.ts';

interface StatCardsProps {
  tickets: DigTicket[];
  isDarkMode?: boolean;
  activeFilter: TicketStatus | 'NO_SHOW' | null;
  onFilterClick: (filter: TicketStatus | 'NO_SHOW' | null) => void;
}

const StatCards = ({ tickets, isDarkMode, activeFilter, onFilterClick }: StatCardsProps) => {
  const stats = tickets.reduce((acc, t) => {
    const s = getTicketStatus(t);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const noShowCount = tickets.filter(t => t.noShowRequested).length;

  const items = [
    { 
      id: TicketStatus.VALID,
      label: 'Sites Valid', 
      value: stats[TicketStatus.VALID] || 0, 
      color: 'text-emerald-500', 
      darkBorder: 'border-emerald-500/20',
      activeBg: 'bg-emerald-500/10 border-emerald-500'
    },
    { 
      id: TicketStatus.EXTENDABLE,
      label: 'Refresh', 
      value: stats[TicketStatus.EXTENDABLE] || 0, 
      color: 'text-orange-500', 
      description: 'Expiring Soon',
      darkBorder: 'border-orange-500/20',
      activeBg: 'bg-orange-500/10 border-orange-500'
    },
    { 
      id: TicketStatus.REFRESH_NEEDED,
      label: 'Refresh Req', 
      value: stats[TicketStatus.REFRESH_NEEDED] || 0, 
      color: 'text-amber-500', 
      description: 'Manual Request',
      darkBorder: 'border-amber-500/20',
      activeBg: 'bg-amber-500/10 border-amber-500'
    },
    { 
      id: 'NO_SHOW' as const,
      label: 'No Shows Req', 
      value: noShowCount, 
      color: 'text-rose-500', 
      description: 'Call Ins Required',
      darkBorder: 'border-rose-500/20',
      activeBg: 'bg-rose-500/10 border-rose-500'
    },
    { 
      id: TicketStatus.EXPIRED,
      label: 'Expirations', 
      value: stats[TicketStatus.EXPIRED] || 0, 
      color: 'text-rose-600', 
      darkBorder: 'border-rose-600/20',
      activeBg: 'bg-rose-600/10 border-rose-600'
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {items.map((it) => {
        const isActive = activeFilter === it.id;
        
        return (
          <button 
            key={it.label} 
            onClick={() => onFilterClick(isActive ? null : it.id)}
            className={`p-4 rounded-xl border transition-all text-left group relative cursor-pointer
              ${isDarkMode 
                ? `${isActive ? it.activeBg : `bg-[#1e293b] ${it.darkBorder}`} hover:border-white/20` 
                : `${isActive ? it.activeBg : `bg-white border-slate-300`} hover:border-slate-500`
              } shadow-sm active:scale-[0.98]`}
          >
            <div className="flex justify-between items-start">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 transition-colors ${isActive ? it.color : isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>
                {it.label}
              </p>
              {it.value > 0 && <div className={`w-1.5 h-1.5 rounded-full ${it.color.replace('text', 'bg')}`} />}
            </div>
            <p className={`text-2xl font-black tracking-tight ${it.color}`}>{it.value}</p>
            {it.description && <p className={`text-[8px] font-bold uppercase mt-0.5 transition-all ${isDarkMode ? 'text-slate-500 opacity-60' : 'text-slate-900'}`}>{it.description}</p>}
            
            {isActive && (
              <div className="absolute bottom-2 right-2">
                <svg className={`w-3 h-3 ${it.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default StatCards;
