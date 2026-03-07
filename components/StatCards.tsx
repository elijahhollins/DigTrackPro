
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
  const total = tickets.filter(t => !t.isArchived).length;

  const items = [
    {
      id: TicketStatus.VALID,
      label: 'Active & Clear',
      value: stats[TicketStatus.VALID] || 0,
      accent: '#10b981',
      iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      bg: 'from-emerald-500/8 to-transparent',
      border: 'border-emerald-500/15',
      activeBorder: 'border-emerald-500/50',
      textColor: 'text-emerald-400',
    },
    {
      id: TicketStatus.EXTENDABLE,
      label: 'Expiring Soon',
      value: stats[TicketStatus.EXTENDABLE] || 0,
      accent: '#f97316',
      iconPath: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
      bg: 'from-orange-500/8 to-transparent',
      border: 'border-orange-500/15',
      activeBorder: 'border-orange-500/50',
      textColor: 'text-orange-400',
      sub: 'Renewal Required',
    },
    {
      id: TicketStatus.REFRESH_NEEDED,
      label: 'Refresh Needed',
      value: stats[TicketStatus.REFRESH_NEEDED] || 0,
      accent: '#f59e0b',
      iconPath: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
      bg: 'from-amber-500/8 to-transparent',
      border: 'border-amber-500/15',
      activeBorder: 'border-amber-500/50',
      textColor: 'text-amber-400',
      sub: 'Call-In Required',
    },
    {
      id: 'NO_SHOW' as const,
      label: 'No Shows',
      value: noShowCount,
      accent: '#f43f5e',
      iconPath: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
      bg: 'from-rose-500/8 to-transparent',
      border: 'border-rose-500/15',
      activeBorder: 'border-rose-500/50',
      textColor: 'text-rose-400',
      sub: 'Utility Call-Ins Due',
    },
    {
      id: TicketStatus.EXPIRED,
      label: 'Expired',
      value: stats[TicketStatus.EXPIRED] || 0,
      accent: '#ef4444',
      iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
      bg: 'from-red-500/10 to-transparent',
      border: 'border-red-500/15',
      activeBorder: 'border-red-500/50',
      textColor: 'text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((it) => {
        const isActive = activeFilter === it.id;
        const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;

        return (
          <button
            key={it.label}
            onClick={() => onFilterClick(isActive ? null : it.id)}
            style={isActive ? { borderColor: it.accent + '60', boxShadow: `0 0 0 1px ${it.accent}30, 0 4px 20px ${it.accent}15` } : {}}
            className={`relative p-4 rounded-2xl border text-left transition-all active:scale-[0.97] overflow-hidden group
              bg-gradient-to-br ${it.bg}
              ${isActive
                ? it.activeBorder
                : isDarkMode
                  ? `bg-[#0c1829] ${it.border} hover:border-white/15`
                  : `bg-white ${it.border} hover:border-slate-300`
              }
              ${isDarkMode ? '' : 'shadow-sm'}
            `}
          >
            {/* Background glow on active */}
            {isActive && (
              <div
                className="absolute inset-0 opacity-5 pointer-events-none"
                style={{ background: `radial-gradient(circle at top left, ${it.accent}, transparent 70%)` }}
              />
            )}

            {/* Icon */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
              style={{ background: it.accent + '15', border: `1px solid ${it.accent}25` }}
            >
              <svg className="w-4 h-4" style={{ color: it.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={it.iconPath} />
              </svg>
            </div>

            {/* Number */}
            <p className={`text-3xl font-black tracking-tight font-display ${it.textColor}`}>
              {it.value}
            </p>

            {/* Label */}
            <p className={`text-[9px] font-black uppercase tracking-[0.15em] mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {it.label}
            </p>

            {/* Sub-label */}
            {it.sub && (
              <p className={`text-[8px] font-medium mt-0.5 ${isDarkMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {it.sub}
              </p>
            )}

            {/* Progress bar */}
            {total > 0 && it.value > 0 && (
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: it.accent }}
                />
              </div>
            )}

            {/* Active close indicator */}
            {isActive && (
              <div className="absolute top-2 right-2">
                <svg className="w-3 h-3" style={{ color: it.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
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
