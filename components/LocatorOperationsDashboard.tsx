import { DigTicket, Job, UserRecord, UserRole } from '../types.ts';
import { formatDateStr } from '../utils/dateUtils.ts';

interface LocatorOperationsDashboardProps {
  tickets: DigTicket[];
  jobs: Job[];
  users: UserRecord[];
  isDarkMode: boolean;
  isAdmin: boolean;
  onAssignTicket: (ticketId: string, crewId: string | null) => Promise<void>;
}

const LocatorOperationsDashboard = ({
  tickets,
  jobs,
  users,
  isDarkMode,
  isAdmin,
  onAssignTicket,
}: LocatorOperationsDashboardProps) => {
  const crewMembers = users.filter(u => u.role === UserRole.CREW);
  const activeTickets = tickets.filter(t => !t.isArchived);
  const inboundRequests = activeTickets.filter(t => t.refreshRequested || t.noShowRequested);
  const unassignedTickets = activeTickets.filter(t => !t.assignedCrewId);

  const dispatchList = [...activeTickets].sort((a, b) => {
    const aTime = a.assignedAt || 0;
    const bTime = b.assignedAt || 0;
    if (!a.assignedCrewId && b.assignedCrewId) return -1;
    if (a.assignedCrewId && !b.assignedCrewId) return 1;
    return bTime - aTime;
  });

  const getClientLabel = (ticket: DigTicket) =>
    jobs.find(j => j.jobNumber === ticket.jobNumber)?.customer || ticket.siteContact || 'Field Request';

  const getAssignedDate = (value?: number) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return formatDateStr(parsed.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className={`text-3xl font-black uppercase tracking-tight font-display ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Locate Operations
          </h2>
          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
            Inbound Queue + Crew Dispatch
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Bucket', value: activeTickets.length, tone: 'text-brand border-brand/20 bg-brand/10' },
          { label: 'Inbound Requests', value: inboundRequests.length, tone: 'text-amber-500 border-amber-500/20 bg-amber-500/10' },
          { label: 'Unassigned', value: unassignedTickets.length, tone: 'text-rose-500 border-rose-500/20 bg-rose-500/10' },
          { label: 'Crew Active', value: crewMembers.length, tone: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10' },
        ].map(card => (
          <div
            key={card.label}
            className={`rounded-2xl border p-4 ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}
          >
            <p className={`text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{card.label}</p>
            <p className={`mt-2 inline-flex px-2.5 py-1 rounded-lg text-2xl font-black tracking-tight border ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className={`border-b ${isDarkMode ? 'border-white/[0.05] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/80'}`}>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Job / Ticket</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Client / Location</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Inbound</th>
                <th className={`px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>Assign Crew</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/[0.03]' : 'divide-slate-50'}`}>
              {dispatchList.map(ticket => {
                const assignedDate = getAssignedDate(ticket.assignedAt);
                return (
                  <tr key={ticket.id} className={`${isDarkMode ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/70'} transition-colors`}>
                  <td className="px-5 py-3">
                    <p className={`text-[11px] font-black ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>#{ticket.jobNumber}</p>
                    <p className={`text-[10px] font-mono ${isDarkMode ? 'text-brand' : 'text-brand'}`}>{ticket.ticketNo}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className={`text-[11px] font-semibold truncate max-w-[280px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{getClientLabel(ticket)}</p>
                    <p className={`text-[10px] truncate max-w-[280px] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{ticket.street}</p>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {ticket.refreshRequested && <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-500 border-amber-500/25">Refresh</span>}
                      {ticket.noShowRequested && <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border bg-rose-500/10 text-rose-500 border-rose-500/25">No Show</span>}
                      {!ticket.refreshRequested && !ticket.noShowRequested && <span className={`inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${isDarkMode ? 'bg-white/5 text-slate-600 border-white/10' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>Ticket</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={ticket.assignedCrewId || ''}
                        disabled={!isAdmin}
                        onChange={(e) => onAssignTicket(ticket.id, e.target.value || null)}
                        className={`w-full min-w-[180px] px-3 py-2 rounded-xl border text-[11px] font-semibold outline-none transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                      >
                        <option value="">Unassigned</option>
                        {crewMembers.map(crew => (
                          <option key={crew.id} value={crew.id}>{crew.name || crew.username}</option>
                        ))}
                      </select>
                      {assignedDate && (
                        <span className={`text-[9px] font-bold uppercase tracking-widest shrink-0 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                          {assignedDate}
                        </span>
                      )}
                    </div>
                  </td>
                  </tr>
                );
              })}
              {dispatchList.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-16 text-center">
                    <p className={`text-[11px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>No tickets in the operations bucket.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LocatorOperationsDashboard;
