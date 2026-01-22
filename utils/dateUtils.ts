
import { TicketStatus, DigTicket } from '../types.ts';

/**
 * Helper to parse YYYY-MM-DD strings into local Date objects
 * to avoid UTC timezone shifting.
 */
const parseDateLocal = (dateStr: string, endOfDay: boolean = false): Date => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return new Date(dateStr);
  
  const [year, month, day] = parts;
  if (endOfDay) {
    // Set to 11:59:59.999 PM local time
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  // Set to 12:00:00.000 AM local time
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

/**
 * Calculates the current status of a ticket based on dates and manual request flags.
 */
export const getTicketStatus = (ticket: DigTicket): TicketStatus => {
  if (ticket.refreshRequested) return TicketStatus.REFRESH_NEEDED;

  const now = new Date();
  const start = parseDateLocal(ticket.workDate, false);
  const exp = parseDateLocal(ticket.expires, true);
  
  // Calculate days remaining relative to the start of "now" for simpler day-based logic
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const expDayStart = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate()).getTime();
  const diffTime = expDayStart - todayStart;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 1. EXPIRED: Current time is strictly after 11:59:59 PM of the expiration date
  if (now > exp) return TicketStatus.EXPIRED;
  
  // 2. AUTOMATIC REFRESH WINDOW: Within 3 days of expiration (including today)
  if (diffDays <= 3 && diffDays >= 0) return TicketStatus.EXTENDABLE;
  
  // 3. VALID: Work has started and we aren't in the expiration/refresh window
  if (now >= start) return TicketStatus.VALID;
  
  // 4. PENDING: The work date has not arrived yet
  return TicketStatus.PENDING;
};

export const getStatusColor = (status: TicketStatus): string => {
  switch (status) {
    case TicketStatus.VALID: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case TicketStatus.EXTENDABLE: return 'bg-orange-50 text-orange-700 border-orange-200';
    case TicketStatus.REFRESH_NEEDED: return 'bg-amber-100 text-amber-900 border-amber-400 shadow-sm';
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
