
import React from 'react';
import { UserRecord } from '../types.ts';
import {
  InboundTicket,
  InboundTicketStatus,
  INBOUND_STATUS_LABELS,
} from '../services/inboundTypes.ts';

interface InboundTicketRowProps {
  ticket:      InboundTicket;
  users:       UserRecord[];
  isSelected:  boolean;
  isDarkMode?: boolean;
  isAdmin:     boolean;
  onSelect:    (id: string, checked: boolean) => void;
  onAssign:    (ticketId: string, userId: string | null) => void;
  onOpenDetail:(ticket: InboundTicket) => void;
}

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

const fmt = (dateStr: string): string => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return '—';
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString();
};

const InboundTicketRow: React.FC<InboundTicketRowProps> = ({
  ticket,
  users,
  isSelected,
  isDarkMode,
  isAdmin,
  onSelect,
  onAssign,
  onOpenDetail,
}) => {
  const dm = isDarkMode ?? false;
  const assignedUser = users.find(u => u.id === ticket.assignedTo);
  const crewUsers = users.filter(u => u.role === 'CREW' || u.role === 'ADMIN');

  return (
    <tr
      className={`group transition-colors cursor-pointer border-l-2 ${
        isSelected
          ? 'border-l-brand ' + (dm ? 'bg-brand/5' : 'bg-brand/5')
          : 'border-l-transparent ' + (dm ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/70')
      }`}
      onClick={() => onOpenDetail(ticket)}
    >
      {/* Checkbox */}
      {isAdmin && (
        <td className="px-4 py-3.5 w-10" onClick={e => e.stopPropagation()}>
          {(ticket.status === InboundTicketStatus.UNASSIGNED || ticket.status === InboundTicketStatus.ASSIGNED) && (
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
      <td className="px-5 py-3.5">
        <span className={`text-[12px] font-black font-display ${dm ? 'text-slate-100' : 'text-slate-900'}`}>
          #{ticket.ticketNumber}
        </span>
      </td>

      {/* Address */}
      <td className="px-5 py-3.5 max-w-[200px]">
        <p className={`text-[11px] font-semibold truncate ${dm ? 'text-slate-200' : 'text-slate-800'}`}>
          {ticket.siteAddress}
        </p>
      </td>

      {/* Due Date */}
      <td className={`px-5 py-3.5 text-[11px] font-semibold tabular-nums ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
        {fmt(ticket.dueDate)}
      </td>

      {/* Dig Start Date */}
      <td className={`px-5 py-3.5 text-[11px] font-semibold tabular-nums ${dm ? 'text-slate-400' : 'text-slate-600'}`}>
        {fmt(ticket.digStartDate)}
      </td>

      {/* Assigned Tech — dropdown for admin, read-only label for crew */}
      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
        {isAdmin ? (
          <select
            value={ticket.assignedTo ?? ''}
            onChange={e => onAssign(ticket.id, e.target.value || null)}
            className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-xl border outline-none transition-all cursor-pointer ${
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

      {/* Status */}
      <td className="px-5 py-3.5">
        <span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${statusBadge(ticket.status, dm)}`}>
          {INBOUND_STATUS_LABELS[ticket.status]}
        </span>
      </td>

      {/* Utilities */}
      <td className="px-5 py-3.5 max-w-[160px]">
        <div className="flex flex-wrap gap-1">
          {ticket.utilityTypes.length === 0 ? (
            <span className={`text-[9px] ${dm ? 'text-slate-700' : 'text-slate-400'}`}>—</span>
          ) : (
            ticket.utilityTypes.slice(0, 3).map(u => (
              <span
                key={u}
                className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wide border ${
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

      {/* Actions */}
      <td className="px-5 py-3.5 text-right">
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
