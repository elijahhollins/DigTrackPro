
import { TicketStatus, DigTicket } from '../types';

export const getTicketStatus = (ticket: DigTicket): TicketStatus => {
  const now = new Date();
  const start = new Date(ticket.digStart);
  const exp = new Date(ticket.expirationDate);
  const diffTime = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (now >= exp) return TicketStatus.EXPIRED;
  // Standard 28 day cycle logic
  if (diffDays >= 28) return TicketStatus.EXPIRED;
  // Extendable window (typically 3-5 days before expiration)
  if (diffDays >= 21 && diffDays <= 25) return TicketStatus.EXTENDABLE;
  if (now >= start && diffDays < 28) return TicketStatus.VALID;
  
  return TicketStatus.PENDING;
};

export const getStatusColor = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.VALID: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case TicketStatus.EXTENDABLE: return 'bg-amber-50 text-amber-700 border-amber-200';
    case TicketStatus.EXPIRED: return 'bg-rose-50 text-rose-700 border-rose-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export const getStatusDotColor = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.VALID: return 'bg-emerald-500';
    case TicketStatus.EXTENDABLE: return 'bg-amber-500';
    case TicketStatus.EXPIRED: return 'bg-rose-500';
    default: return 'bg-slate-400';
  }
};
