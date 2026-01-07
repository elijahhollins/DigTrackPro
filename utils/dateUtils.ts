
import { TicketStatus, DigTicket } from '../types.ts';

/**
 * Calculates the current status of a ticket based on dates and manual request flags.
 * Priority: 
 * 1. Manual Refresh Requested (Crew manually clicked the refresh button)
 * 2. Expired (System date is past expiration)
 * 3. Extendable (System window: 3 days before expiration)
 * 4. Valid (Work is currently authorized)
 * 5. Pending (Start date is in the future)
 */
export const getTicketStatus = (ticket: DigTicket): TicketStatus => {
  // 1. MANUAL OVERRIDE: If a user manually requested a refresh, this is the highest priority.
  // This allows even expired or pending tickets to be tracked in the "Refresh Req" queue.
  if (ticket.refreshRequested) return TicketStatus.REFRESH_NEEDED;

  const now = new Date();
  const start = new Date(ticket.digStart);
  const exp = new Date(ticket.expirationDate);
  
  // Normalize expiration to the end of the day (11:59:59 PM)
  // This matches construction standards where tickets are valid through the day they expire.
  exp.setHours(23, 59, 59, 999);

  // Calculate days remaining
  const diffTime = exp.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // 2. EXPIRED: If past the end of the expiration day
  if (now > exp) return TicketStatus.EXPIRED;
  
  // 3. AUTOMATIC REFRESH WINDOW: Within 3 days of expiration
  if (diffDays <= 3 && diffDays >= 0) return TicketStatus.EXTENDABLE;
  
  // 4. VALID: Between start date and expiration
  if (now >= start) return TicketStatus.VALID;
  
  // 5. PENDING: Hasn't reached start date yet
  return TicketStatus.PENDING;
};

export const getStatusColor = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.VALID: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case TicketStatus.EXTENDABLE: return 'bg-orange-50 text-orange-700 border-orange-200'; // "Refresh" (Auto)
    case TicketStatus.REFRESH_NEEDED: return 'bg-amber-100 text-amber-900 border-amber-400 shadow-sm'; // "Refresh Req" (Manual)
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
