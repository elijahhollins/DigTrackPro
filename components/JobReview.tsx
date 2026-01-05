
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

const JobReview: React.FC<JobReviewProps> = ({ tickets, jobs, notes, isAdmin, isDarkMode, onEditJob, onToggleComplete, onAddNote, onViewPhotos }) => {
  const [hideCompleted, setHideCompleted] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [showNotesFor, setShowNotesFor] = useState<string | null>(null);

  const groupedTickets = useMemo(() => {
    const map: Record<string, DigTicket[]> = {};
    tickets.forEach(t => { if (!map[t.jobNumber]) map[t.jobNumber] = []; map[t.jobNumber].push(t); });
    return map;
  }, [tickets]);

  const allJobNumbers = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => set.add(j.jobNumber));
    Object.keys(groupedTickets).forEach(num => set.add(num));
    return Array.from(set).filter(num => {
      const jobEntity = jobs.find(j => j.jobNumber === num);
      if (hideCompleted && jobEntity?.isComplete) return false;
      return num.toLowerCase().includes(jobSearch.toLowerCase());
    }).sort((a, b) => b.localeCompare(a));
  }, [jobs, groupedTickets, jobSearch, hideCompleted]);

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row gap-4 ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'} shadow-sm`}>
        <div className="relative flex-1">
          <input type="text" placeholder="Search Projects..." className={`w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-100'}`} value={jobSearch} onChange={e => setJobSearch(e.target.value)} />
          <svg className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 rounded-lg border-slate-300 text-brand focus:ring-brand/20" checked={hideCompleted} onChange={() => setHideCompleted(!hideCompleted)} />
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hide Complete</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allJobNumbers.map(jobNum => {
          const jobEntity = jobs.find(j => j.jobNumber === jobNum);
          const isComplete = jobEntity?.isComplete;
          const jobTickets = groupedTickets[jobNum] || [];
          
          return (
            <div key={jobNum} className={`p-5 rounded-2xl border transition-all ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'} ${isComplete ? 'opacity-50 grayscale-[0.2]' : 'shadow-sm'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-black uppercase leading-none">Job #{jobNum}</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase truncate max-w-[200px]">{jobEntity?.customer || 'Unknown Client'}</p>
                </div>
                <div className="flex gap-1.5">
                   <button onClick={() => onViewPhotos(jobNum)} className="p-2 rounded-lg bg-black/5 hover:bg-brand hover:text-slate-900 transition-all">
                     <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" /></svg>
                   </button>
                   {isAdmin && (
                     <button onClick={() => jobEntity && onToggleComplete(jobEntity)} className={`p-2 rounded-lg border ${isComplete ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-black/5 border-transparent text-slate-400'}`}>
                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                     </button>
                   )}
                </div>
              </div>

              <div className="space-y-2">
                {jobTickets.slice(0, 3).map(t => {
                  const s = getTicketStatus(t);
                  return (
                    <div key={t.id} className="flex items-center justify-between text-[10px] font-bold py-1.5 border-b border-black/5 last:border-0">
                      <span className="opacity-50 font-mono">{t.ticketNo}</span>
                      <span className={`px-1.5 py-0.5 rounded-md border uppercase text-[8px] ${getStatusColor(s)}`}>{s}</span>
                    </div>
                  );
                })}
                {jobTickets.length > 3 && (
                  <p className="text-[8px] font-black text-slate-400 uppercase text-center pt-1">+{jobTickets.length - 3} more tickets</p>
                )}
                {jobTickets.length === 0 && (
                  <p className="text-[9px] italic text-slate-400 text-center py-2">No tickets active</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JobReview;
