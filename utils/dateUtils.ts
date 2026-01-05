
import { TicketStatus, DigTicket } from '../types.ts';

export const getTicketStatus = (ticket: DigTicket): TicketStatus => {
  const now = new Date();
  const start = new Date(ticket.digStart);
  const exp = new Date(ticket.expirationDate);
  
  const diffTime = exp.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (now >= exp) return TicketStatus.EXPIRED;
  
  // Manual request takes absolute priority
  if (ticket.refreshRequested) return TicketStatus.REFRESH_NEEDED;
  
  // Automatic "Refresh" window (3 days before expiry)
  if (diffDays <= 3) return TicketStatus.EXTENDABLE;
  
  if (now >= start) return TicketStatus.VALID;
  
  return TicketStatus.PENDING;
};

export const getStatusColor = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.VALID: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case TicketStatus.EXTENDABLE: return 'bg-orange-50 text-orange-700 border-orange-200'; // Automatic Refresh
    case TicketStatus.REFRESH_NEEDED: return 'bg-amber-100 text-amber-900 border-amber-400 shadow-sm'; // Manual Req
    case TicketStatus.EXPIRED: return 'bg-rose-100 text-rose-900 border-rose-300';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export const getRowBgColor = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.EXTENDABLE: return 'bg-orange-50/40 hover:bg-orange-100/60';
    case TicketStatus.REFRESH_NEEDED: return 'bg-amber-50/60 hover:bg-amber-100/60';
    case TicketStatus.EXPIRED: return 'bg-rose-100/40 hover:bg-rose-100/60';
    default: return 'hover:bg-slate-50';
  }
};

export const getStatusDotColor = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.VALID: return 'bg-emerald-500';
    case TicketStatus.EXTENDABLE: return 'bg-orange-500';
    case TicketStatus.REFRESH_NEEDED: return 'bg-amber-500';
    case TicketStatus.EXPIRED: return 'bg-rose-600';
    default: return 'bg-slate-400';
  }
};
