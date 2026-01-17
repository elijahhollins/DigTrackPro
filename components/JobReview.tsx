
import React, { useState, useMemo } from 'react';
import { DigTicket, TicketStatus, JobNote, Job } from '../types.ts';
import { getTicketStatus, getStatusColor, getStatusDotColor } from '../utils/dateUtils.ts';

interface JobReviewProps {
  tickets: DigTicket[];
  jobs: Job[];
  notes: JobNote[];
  isAdmin: boolean;
  isDarkMode?: boolean;
  onEditJob: (job: Job) => void;
  onToggleComplete: (job: Job) => void;
  onAddNote: (note: Omit<JobNote, 'id' | 'timestamp' | 'author'>) => void;
  onViewPhotos: (jobNumber: string) => void;
}

type ViewMode = 'thumbnail' | 'list';

const JobReview: React.FC<JobReviewProps> = ({ tickets, jobs, notes, isAdmin, isDarkMode, onEditJob, onToggleComplete, onAddNote, onViewPhotos }) => {
  const [hideCompleted, setHideCompleted] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('thumbnail');

  const groupedTickets = useMemo(() => {
    const map: Record<string, { active: DigTicket[], archived: DigTicket[] }> = {};
    tickets.forEach(t => {
      if (!map[t.jobNumber]) map[t.jobNumber] = { active: [], archived: [] };
      if (t.isArchived) {
        map[t.jobNumber].archived.push(t);
      } else {
        map[t.jobNumber].active.push(t);
      }
    });
    // Sort archived by expiration date descending
    Object.values(map).forEach(group => {
      // Fix: Use the correct property 'expires' from DigTicket interface
      group.archived.sort((a, b) => new Date(b.expires).getTime() - new Date(a.expires).getTime());
    });
    return map;
  }, [tickets]);

  const allJobNumbers = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => set.add(j.jobNumber));
    Object.keys(groupedTickets).forEach(num => set.add(num));
    
    return Array.from(set)
      .filter(num => {
        const matchesSearch = num.toLowerCase().includes(jobSearch.toLowerCase());
        const jobEntity = jobs.find(j => j.jobNumber === num);
        if (hideCompleted && jobEntity?.isComplete) return false;
        return matchesSearch;
      })
      .sort((a, b) => b.localeCompare(a));
  }, [jobs, groupedTickets, jobSearch, hideCompleted]);

  return (
    <div className="space-y-4 animate-in">
      <div className={`p-4 rounded-2xl shadow-sm border flex flex-col md:flex-row items-center gap-4 ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100'}`}>
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Search Jobs..."
            className={`w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl outline-none focus:ring-4 focus:ring-brand/5 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-100'}`}
            value={jobSearch}
            onChange={e => setJobSearch(e.target.value)}
          />
          <svg className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-black/20' : 'bg-slate-100'}`}>
            <button 
              onClick={() => setViewMode('thumbnail')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'thumbnail' ? 'bg-white shadow-sm text-brand' : 'text-slate-400 hover:text-slate-600'}`}
              title="Thumbnail View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-brand' : 'text-slate-400 hover:text-slate-600'}`}
              title="List View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded-lg text-brand border-slate-300 focus:ring-brand/10" checked={hideCompleted} onChange={() => setHideCompleted(!hideCompleted)} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Hide Completed</span>
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
              <div key={jobNum} className={`p-5 rounded-2xl border transition-all flex flex-col h-full ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'} ${isComplete ? 'opacity-50 grayscale-[0.2]' : ''}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className={`text-sm font-black uppercase tracking-tight ${isComplete ? 'text-slate-400' : ''}`}>Job #{jobNum}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate max-w-[180px]">{jobEntity?.customer || 'Unknown Client'}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => onViewPhotos(jobNum)} title="View Media" className="p-2 rounded-lg bg-black/5 hover:bg-brand hover:text-white transition-all text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16" /></svg>
                    </button>
                    {isAdmin && jobEntity && (
                      <button onClick={() => onToggleComplete(jobEntity)} title={isComplete ? "Mark Active" : "Mark Complete"} className={`p-2 rounded-lg border transition-all ${isComplete ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-black/5 border-transparent text-slate-300'}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-black/5 pt-4 flex-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                    <span>Active Tickets</span>
                    <span>{activeTickets.length}</span>
                  </p>
                  {activeTickets.map(t => {
                    const s = getTicketStatus(t);
                    return (
                      <div key={t.id} className="flex items-center justify-between text-[10px] font-bold py-1">
                        <span className="opacity-40 font-mono truncate max-w-[120px]">{t.ticketNo}</span>
                        <span className={`px-1.5 py-0.5 rounded-md border uppercase text-[8px] ${getStatusColor(s)}`}>{s}</span>
                      </div>
                    );
                  })}
                  {activeTickets.length === 0 && (
                    <p className="text-[9px] italic text-slate-400 text-center py-2">No active tickets</p>
                  )}

                  {archivedTickets.length > 0 && (
                    <div className="mt-4 border-t border-black/5 pt-4">
                      <button 
                        onClick={() => setShowHistoryFor(isHistoryOpen ? null : jobNum)}
                        className="w-full flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-brand transition-colors"
                      >
                        <span>Ticket History ({archivedTickets.length})</span>
                        <svg className={`w-3 h-3 transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      
                      {isHistoryOpen && (
                        <div className="mt-2 space-y-1 animate-in">
                          {archivedTickets.map(t => (
                            <div key={t.id} className="flex items-center justify-between text-[9px] font-bold p-1.5 bg-black/5 rounded-lg opacity-60">
                              <span className="font-mono">{t.ticketNo}</span>
                              {/* Fix: Use the correct property 'expires' instead of 'expirationDate' */}
                              <span className="text-slate-400">Exp: {new Date(t.expires).toLocaleDateString()}</span>
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
        <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className={`${isDarkMode ? 'bg-black/20' : 'bg-slate-50'} border-b border-black/5`}>
                <tr>
                  <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Job #</th>
                  <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Customer</th>
                  <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Active Tkts</th>
                  <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Status</th>
                  <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                {allJobNumbers.map(jobNum => {
                  const jobEntity = jobs.find(j => j.jobNumber === jobNum);
                  const isComplete = jobEntity?.isComplete || false;
                  const activeTickets = groupedTickets[jobNum]?.active || [];
                  
                  return (
                    <tr key={jobNum} className={`group hover:bg-slate-500/5 transition-all ${isComplete ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3 text-xs font-black">#{jobNum}</td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-500 truncate max-w-[200px]">{jobEntity?.customer || 'Unknown Client'}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${activeTickets.length > 0 ? 'bg-brand/10 border-brand/20 text-brand' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                          {activeTickets.length}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                         <div className={`mx-auto w-2 h-2 rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onViewPhotos(jobNum)} className="p-1.5 rounded-lg bg-black/5 hover:text-brand transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16" /></svg>
                          </button>
                          {isAdmin && jobEntity && (
                            <button onClick={() => onToggleComplete(jobEntity)} className={`p-1.5 rounded-lg border transition-all ${isComplete ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-black/5 border-transparent text-slate-400 hover:text-emerald-500'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {allJobNumbers.length === 0 && (
        <div className="py-20 text-center opacity-20">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" /></svg>
          <p className="text-sm font-black uppercase tracking-widest">No Projects Found</p>
        </div>
      )}
    </div>
  );
};

export default JobReview;
