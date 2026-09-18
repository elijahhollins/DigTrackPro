import { DigTicket, TicketFieldChange, TicketUpdate, TicketUpdateKind } from '../types.ts';

/**
 * The subset of DigTicket an admin can change from the dashboard's focused
 * "Update Ticket" modal — the fields that actually move in the field. Full
 * record edits (street, extent, geotag, …) still live in TicketForm.
 */
export const UPDATABLE_TICKET_FIELDS = [
  { field: 'ticketNo',  label: 'Ticket #',   kind: 'text' as const },
  { field: 'workDate',  label: 'Work Date',  kind: 'date' as const },
  { field: 'digByDate', label: 'Dig By',     kind: 'date' as const },
  { field: 'expires',   label: 'Expires',    kind: 'date' as const },
  { field: 'workBegun', label: 'Work Begun', kind: 'tri'  as const },
  { field: 'isArchived', label: 'Archived',  kind: 'bool' as const },
];

/**
 * Render a ticket value for the log.
 *
 * The three kinds treat "missing" differently, and conflating them produces
 * phantom diffs:
 *  - 'bool' (isArchived) is two-state — an absent flag simply means No.
 *  - 'tri'  (workBegun) is three-state — absent means "not answered yet" and
 *    must stay distinct from an explicit No.
 *  - text / date fall back to an em dash when blank.
 */
const displayValue = (value: unknown, kind: 'text' | 'date' | 'tri' | 'bool'): string => {
  if (kind === 'bool') return value ? 'Yes' : 'No';
  if (value === undefined || value === null || value === '') return '—';
  if (kind === 'tri') return value ? 'Yes' : 'No';
  return String(value);
};

/**
 * Compare two versions of a ticket across UPDATABLE_TICKET_FIELDS and return one
 * TicketFieldChange per field that actually moved. An empty result means the
 * save was a no-op and nothing should be logged.
 */
export const diffTicket = (before: DigTicket, after: DigTicket): TicketFieldChange[] => {
  const changes: TicketFieldChange[] = [];
  UPDATABLE_TICKET_FIELDS.forEach(({ field, label, kind }) => {
    const prev = (before as unknown as Record<string, unknown>)[field];
    const next = (after as unknown as Record<string, unknown>)[field];
    // Normalise so undefined / '' / false differences don't register as edits.
    const prevOut = displayValue(prev, kind);
    const nextOut = displayValue(next, kind);
    if (prevOut !== nextOut) changes.push({ field, label, before: prevOut, after: nextOut });
  });
  return changes;
};

/** Short headline for a log entry, e.g. "Ticket updated by Dana". */
export const describeTicketUpdate = (u: TicketUpdate): string => {
  const who = u.author || 'Someone';
  switch (u.kind) {
    case TicketUpdateKind.CREATED:           return `Ticket created by ${who}`;
    case TicketUpdateKind.UPDATED:           return `Ticket updated by ${who}`;
    case TicketUpdateKind.NO_SHOW_LOGGED:    return `No show logged by ${who}`;
    case TicketUpdateKind.NO_SHOW_CLEARED:   return `No show cleared by ${who}`;
    case TicketUpdateKind.REFRESH_REQUESTED: return `Refresh requested by ${who}`;
    case TicketUpdateKind.REFRESH_CLEARED:   return `Refresh cleared by ${who}`;
    case TicketUpdateKind.ARCHIVED:          return `Ticket archived by ${who}`;
    case TicketUpdateKind.UNARCHIVED:        return `Ticket restored by ${who}`;
    default:                                 return `Ticket changed by ${who}`;
  }
};

/** "Expires 2026-03-04 → 2026-04-12" lines for a log entry. */
export const summarizeChanges = (changes: TicketFieldChange[]): string[] =>
  changes.map(c => `${c.label} ${c.before} → ${c.after}`);

/** One-line form used by compact feeds like the Job Hub timeline. */
export const ticketUpdateOneLiner = (u: TicketUpdate): string => {
  const parts = [describeTicketUpdate(u)];
  const changes = summarizeChanges(u.changes);
  if (changes.length) parts.push(changes.join(', '));
  if (u.reason) parts.push(`“${u.reason}”`);
  return parts.join(' — ');
};

/** Accent colour token per event kind, shared by the notes modal and Job Hub. */
export const ticketUpdateTone = (kind: TicketUpdateKind): 'brand' | 'rose' | 'amber' | 'slate' => {
  switch (kind) {
    case TicketUpdateKind.NO_SHOW_LOGGED:
    case TicketUpdateKind.NO_SHOW_CLEARED:
      return 'rose';
    case TicketUpdateKind.REFRESH_REQUESTED:
    case TicketUpdateKind.REFRESH_CLEARED:
      return 'amber';
    case TicketUpdateKind.ARCHIVED:
    case TicketUpdateKind.UNARCHIVED:
      return 'slate';
    default:
      return 'brand';
  }
};
