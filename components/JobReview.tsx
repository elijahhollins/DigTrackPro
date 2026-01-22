
import React, { useState, useMemo } from 'react';
import { Job, DigTicket, TicketStatus } from '../types.ts';
import { getTicketStatus, getStatusColor } from '../utils/dateUtils.ts';

interface JobReviewProps {
  tickets: DigTicket[];
  jobs: Job[];
  isAdmin: boolean;
  isDarkMode?: boolean;
  onEditJob: (job: Job) => void;
  onViewDoc?: (url: string) => void;
}

/**
 * JobReview Component
 * Provides a high-level overview of projects and their associated locate tickets.
 * Supports switching between grid and list views.
 */
export const JobReview: React.FC<JobReviewProps> = ({ tickets, jobs, isAdmin, isDarkMode, onEditJob, onViewDoc }) => {
  const [viewMode, setViewMode] = useState<'thumbnail' | 'list'>('thumbnail');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);

  const groupedTickets = useMemo(() => {
    const groups: Record<string, { active: DigTicket[], archived: DigTicket[] }> = {};
    tickets.forEach(t => {
      if (!groups[t.jobNumber]) groups[t.jobNumber] = { active: [], archived: [] };
      if (t.isArchived) groups[t.jobNumber].archived.push(t);
      else groups[t.jobNumber].active.push(t);
    });
    return groups;
  }, [tickets]);

  const allJobNumbers = useMemo(() => {
    let numbers = Object.keys(groupedTickets);
    if (hideCompleted) {
      const completedJobs = new Set(jobs.filter(j => j.isComplete).map(j => j.jobNumber));
      numbers = numbers.filter(n => !completedJobs.has(n));
    }
    return numbers.sort((a, b) => b.localeCompare(a));
  }, [groupedTickets, hideCompleted, jobs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Project Documentation Review</h2>
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Historical Vault Access</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-black/20' : 'bg-slate-200'}`}>
            <button onClick={() => setViewMode('thumbnail')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'thumbnail' ? (isDarkMode ? 'bg-white/10 text-white shadow-lg' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}>Grid</button>
            <button onClick={() => setViewMode('list')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'list' ? (isDarkMode ? 'bg-white/10 text-white shadow-lg' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}>List</button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded-lg text-brand border-slate-300 focus:ring-brand/10" checked={hideCompleted} onChange={() => setHideCompleted(!hideCompleted)} />
            <span className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${isDarkMode ? 'text-slate-500' : 'text-slate-700'}`}>Hide Completed</span>
          </label>
        </div>
      </div>

      {viewMode === 'thumbnail' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allJobNumbers.map(jobNum => {
            const jobEntity = jobs.find(j => j.jobNumber === jobNum);
            const isComplete = jobEntity?.isComplete || false;
            const jobTicketData = groupedTickets[jobNum] || { active: [], archived: [] };
            const activeTickets = jobTicketData.active;
            const archivedTickets = jobTicketData.archived;
            const isHistoryOpen = showHistoryFor === jobNum;

            return (
              <div key={jobNum} className={`p-5 rounded-2xl border transition-all flex flex-col h-full ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200 shadow-sm'} ${isComplete ? 'opacity-50 grayscale-[0.2]' : ''}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <button 
                      onClick={() => jobEntity && onEditJob(jobEntity)}
                      className={`text-sm font-black uppercase tracking-tight text-left hover:text-brand transition-colors ${isComplete ? (isDarkMode ? 'text-slate-400' : 'text-slate-600') : (isDarkMode ? 'text-white' : 'text-black')}`}
                      title={isAdmin ? "Edit Job Details" : ""}
                    >
                      Job #{jobNum}
                    </button>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 truncate max-w-[180px] ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>{jobEntity?.customer || 'Unknown Client'}</p>
                  </div>
                  {isComplete && <div className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-[8px] font-black uppercase">Complete</div>}
                </div>

                <div className="space-y-1.5 border-t border-black/5 pt-4 flex-1">
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-2 flex justify-between ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>
                    <span>Active Tickets</span>
                    <span>{activeTickets.length}</span>
                  </p>
                  {activeTickets.map(t => {
                    const s = getTicketStatus(t);
                    return (
                      <div key={t.id} className="flex items-center justify-between text-[10px] font-bold py-1">
                        <button 
                          onClick={() => t.documentUrl && onViewDoc?.(t.documentUrl)} 
                          className={`font-mono truncate max-w-[120px] transition-colors ${t.documentUrl ? 'hover:text-brand hover:underline cursor-zoom-in text-brand/80' : isDarkMode ? 'opacity-40 text-slate-500' : 'text-slate-600'}`}
                        >
                          {t.ticketNo}
                        </button>
                        <span className={`px-1.5 py-0.5 rounded-md border uppercase text-[8px] ${getStatusColor(s)}`}>{s}</span>
                      </div>
                    );
                  })}
                  
                  {archivedTickets.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-black/5">
                      <button onClick={() => setShowHistoryFor(isHistoryOpen ? null : jobNum)} className="flex items-center justify-between w-full group">
                         <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-brand">Archive History ({archivedTickets.length})</span>
                         <svg className={`w-3 h-3 text-slate-400 transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {isHistoryOpen && (
                        <div className="mt-2 space-y-1 animate-in slide-in-from-top-2">
                           {archivedTickets.map(t => (
                             <div key={t.id} className="flex items-center justify-between text-[10px] font-bold py-1 opacity-40">
                               <span className="font-mono">{t.ticketNo}</span>
                               <span className="text-[8px] uppercase">{new Date(t.expires).toLocaleDateString()}</span>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
          <table className="w-full text-left">
            <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} border-b border-black/5`}>
              <tr>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Job Reference</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Customer</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Status</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Tickets</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
              {allJobNumbers.map(jobNum => {
                const jobEntity = jobs.find(j => j.jobNumber === jobNum);
                const activeCount = groupedTickets[jobNum]?.active.length || 0;
                return (
                  <tr key={jobNum} className={`transition-all hover:bg-black/5 ${jobEntity?.isComplete ? 'opacity-40' : ''}`}>
                    <td className="px-6 py-4">
                      <button onClick={() => jobEntity && onEditJob(jobEntity)} className={`text-xs font-black uppercase hover:text-brand ${isDarkMode ? 'text-white' : 'text-black'}`}>#{jobNum}</button>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold">{jobEntity?.customer || 'Direct'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${jobEntity?.isComplete ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        {jobEntity?.isComplete ? 'Closed' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-xs font-black">{activeCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default JobReview;
