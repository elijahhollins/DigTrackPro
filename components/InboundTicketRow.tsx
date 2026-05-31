
import React from 'react';
import { UserRecord } from '../types.ts';
import {
  InboundTicket,
  InboundTicketStatus,
  INBOUND_STATUS_LABELS,
} from '../services/inboundTypes.ts';

// ── Urgency helpers (exported for use in Dashboard + TechQueue) ───────────────

export const MS_PER_DAY = 86_400_000;

export type UrgencyLevel = 'overdue' | 'critical' | 'warning' | 'normal' | 'done';

/** Returns the urgency level of a ticket based on its due date and status. */
export function getUrgencyLevel(ticket: InboundTicket): UrgencyLevel {
  if (ticket.status === InboundTicketStatus.COMPLETED) return 'done';
  if (!ticket.dueDate) return 'normal';
  const diff = Math.ceil((new Date(ticket.dueDate).getTime() - Date.now()) / MS_PER_DAY);
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'critical';
  if (diff <= 3) return 'warning';
  return 'normal';
}

// ── Status badge class helper ─────────────────────────────────────────────────

export const statusBadge = (status: InboundTicketStatus, dm: boolean): string => {
  switch (status) {
    case InboundTicketStatus.UNASSIGNED:
      return dm
        ? 'bg-white/5 text-slate-500 border-white/10'
        : 'bg-slate-100 text-slate-600 border-slate-200';
    case InboundTicketStatus.ASSIGNED:
      return 'bg-brand/10 text-brand border-brand/20';
    case InboundTicketStatus.IN_PROGRESS:
      return dm
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        : 'bg-amber-50 text-amber-700 border-amber-200';
    case InboundTicketStatus.COMPLETED:
      return dm
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:
      return dm ? 'bg-white/5 text-slate-500 border-white/10' : 'bg-slate-100 text-slate-500 border-slate-200';
  }
};

// ── Row component ─────────────────────────────────────────────────────────────

interface InboundTicketRowProps {
  ticket:           InboundTicket;
  users:            UserRecord[];
  isSelected:       boolean;
  isDarkMode?:      boolean;
  isAdmin:          boolean;
  onSelect:         (id: string, checked: boolean) => void;
  onAssign:         (ticketId: string, userId: string | null) => void;
  onStatusChange?:  (ticketId: string, newStatus: InboundTicketStatus) => void;
  onOpenDetail:     (ticket: InboundTicket) => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (dateStr: string): string => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return '—';
  const [, m, d] = parts;
  return `${MONTHS[m - 1]} ${d}`;
};

const URGENCY_BORDER: Record<UrgencyLevel, string> = {
  overdue:  'border-l-rose-500',
  critical: 'border-l-rose-500',
  warning:  'border-l-amber-400',
  normal:   'border-l-transparent',
  done:     'border-l-emerald-500/40',
};

function getDueBadge(
  isCompleted: boolean,
  level: UrgencyLevel,
  dueDate: string,
  dm: boolean,
): { label: string; cls: string } | null {
  if (isCompleted) return null;
  const roseCls = dm ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-rose-100 text-rose-600 border-rose-200';
  if (level === 'overdue')  return { label: 'OVERDUE', cls: roseCls };
  if (level === 'critical') return { label: 'TODAY',   cls: roseCls };
  if (level === 'warning') {
    const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / MS_PER_DAY);
    return { label: `${diff}d`, cls: dm ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-600 border-amber-200' };
  }
  return null;
}

const InboundTicketRow: React.FC<InboundTicketRowProps> = ({
  ticket,
  users,
  isSelected,
  isDarkMode,
  isAdmin,
  onSelect,
  onAssign,
  onStatusChange,
  onOpenDetail,
}) => {
  const dm = isDarkMode ?? false;
  const assignedUser = users.find(u => u.id === ticket.assignedTo);
  const crewUsers = users.filter(u => u.role === 'CREW' || u.role === 'ADMIN');

  const level = getUrgencyLevel(ticket);
  const isCompleted = ticket.status === InboundTicketStatus.COMPLETED;

  // Left-border + row background based on urgency / selection state
  const borderCls = isSelected ? 'border-l-brand' : URGENCY_BORDER[level];
  const rowBgCls = isSelected
    ? (dm ? 'bg-brand/5' : 'bg-brand/5')
    : level === 'overdue'
      ? (dm ? 'bg-rose-500/[0.04]' : 'bg-rose-50/60')
      : '';

  const badge = getDueBadge(isCompleted, level, ticket.dueDate, dm);

  const dueDateColor =
    level === 'overdue' || level === 'critical'
      ? (dm ? 'text-rose-400' : 'text-rose-600')
      : level === 'warning'
        ? (dm ? 'text-amber-400' : 'text-amber-600')
        : (dm ? 'text-slate-400' : 'text-slate-600');

  return (
    <tr
      className={`group transition-colors cursor-pointer border-l-2 ${borderCls} ${rowBgCls} ${
        !isSelected && level !== 'overdue'
          ? (dm ? 'hover:bg-white/[0.025]' : 'hover:bg-slate-50/80')
          : ''
      } ${isCompleted ? 'opacity-60' : ''}`}
      onClick={() => onOpenDetail(ticket)}
    >
      {/* Checkbox */}
      {isAdmin && (
        <td className="pl-4 pr-2 py-3 w-10" onClick={e => e.stopPropagation()}>
          {(ticket.status === InboundTicketStatus.UNASSIGNED ||
            ticket.status === InboundTicketStatus.ASSIGNED) && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={e => onSelect(ticket.id, e.target.checked)}
              className="w-3.5 h-3.5 accent-brand rounded"
            />
          )}
        </td>
      )}

      {/* Ticket # */}
      <td className="px-4 py-3">
        <span className={`text-[11px] font-black font-display ${dm ? 'text-slate-100' : 'text-slate-900'}`}>
          #{ticket.ticketNumber}
        </span>
      </td>

      {/* Address + caller name */}
      <td className="px-4 py-3 max-w-[200px]">
        <p className={`text-[11px] font-semibold truncate ${dm ? 'text-slate-200' : 'text-slate-800'}`}>
          {ticket.siteAddress}
        </p>
        {ticket.callerName && (
          <p className={`text-[10px] truncate mt-0.5 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
            {ticket.callerName}
          </p>
        )}
      </td>

      {/* Due Date + urgency badge */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className={`text-[11px] font-semibold tabular-nums ${dueDateColor}`}>
            {fmt(ticket.dueDate)}
          </span>
          {badge && (
            <span className={`self-start px-1.5 py-px rounded border text-[8px] font-black uppercase tracking-widest ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>
      </td>

      {/* Dig Start Date */}
      <td className={`px-4 py-3 text-[11px] font-semibold tabular-nums ${dm ? 'text-slate-500' : 'text-slate-500'}`}>
        {fmt(ticket.digStartDate)}
      </td>

      {/* Assigned Tech — dropdown (admin) or read-only (crew) */}
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        {isAdmin ? (
          <select
            value={ticket.assignedTo ?? ''}
            onChange={e => onAssign(ticket.id, e.target.value || null)}
            className={`text-[10px] font-semibold px-2 py-1.5 rounded-lg border outline-none transition-all cursor-pointer max-w-[130px] w-full ${
              dm
                ? 'bg-white/5 border-white/10 text-slate-300 hover:border-brand/30 focus:border-brand/40'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-brand/30 focus:border-brand/50'
            }`}
          >
            <option value="">Unassigned</option>
            {crewUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        ) : (
          <span className={`text-[11px] font-semibold ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
            {assignedUser?.name ?? '—'}
          </span>
        )}
      </td>

      {/* Status — inline dropdown for admin, badge for crew */}
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        {isAdmin && onStatusChange ? (
          <select
            value={ticket.status}
            onChange={e => onStatusChange(ticket.id, e.target.value as InboundTicketStatus)}
            className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest outline-none cursor-pointer transition-all ${statusBadge(ticket.status, dm)}`}
          >
            {Object.values(InboundTicketStatus).map(s => (
              <option key={s} value={s} className={`normal-case text-[11px] font-normal ${dm ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'}`}>
                {INBOUND_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        ) : (
          <span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${statusBadge(ticket.status, dm)}`}>
            {INBOUND_STATUS_LABELS[ticket.status]}
          </span>
        )}
      </td>

      {/* Utilities */}
      <td className="px-4 py-3 max-w-[150px]">
        <div className="flex flex-wrap gap-1">
          {ticket.utilityTypes.length === 0 ? (
            <span className={`text-[9px] ${dm ? 'text-slate-700' : 'text-slate-400'}`}>—</span>
          ) : (
            ticket.utilityTypes.slice(0, 3).map(u => (
              <span
                key={u}
                className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${
                  dm ? 'bg-white/5 text-slate-500 border-white/10' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {u}
              </span>
            ))
          )}
          {ticket.utilityTypes.length > 3 && (
            <span className={`text-[9px] font-bold ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
              +{ticket.utilityTypes.length - 3}
            </span>
          )}
        </div>
      </td>

      {/* Open detail */}
      <td className="px-4 py-3 text-right">
        <button
          onClick={e => { e.stopPropagation(); onOpenDetail(ticket); }}
          className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all ${
            dm ? 'text-slate-500 hover:text-brand hover:bg-brand/10' : 'text-slate-400 hover:text-brand hover:bg-brand/10'
          }`}
          title="Open detail"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </td>
    </tr>
  );
};

export default InboundTicketRow;
