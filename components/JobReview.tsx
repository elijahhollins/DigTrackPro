import React, { useState, useMemo } from 'react';
import { DigTicket, TicketStatus, JobNote, Job } from '../types.ts';
import { getTicketStatus, getStatusColor, getStatusDotColor } from '../utils/dateUtils.ts';

interface JobReviewProps {
  tickets: DigTicket[];
  jobs: Job[];
  notes: JobNote[];
  isAdmin: boolean;
  onEditJob: (job: Job) => void;
  onToggleComplete: (job: Job) => void;
  onAddNote: (note: Omit<JobNote, 'id' | 'timestamp' | 'author'>) => void;
  onViewPhotos: (jobNumber: string) => void;
}

const JobReview: React.FC<JobReviewProps> = ({ tickets, jobs, notes, isAdmin, onEditJob, onToggleComplete, onAddNote, onViewPhotos }) => {
  const [hideCompleted, setHideCompleted] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [showNotesFor, setShowNotesFor] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState('');

  // Group tickets by JobNumber
  const groupedTickets = useMemo(() => {
    const map: Record<string, DigTicket[]> = {};
    tickets.forEach(t => {
      if (!map[t.jobNumber]) map[t.jobNumber] = [];
      map[t.jobNumber].push(t);
    });
    return map;
  }, [tickets]);

  // Merge formal Job list with inferred Job Numbers from tickets
  const allJobNumbers = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => set.add(j.jobNumber));
    Object.keys(groupedTickets).forEach(num => set.add(num));
    
    return Array.from(set)
      .filter(num => {
        const matchesSearch = num.toLowerCase().includes(jobSearch.toLowerCase());
        const jobEntity = jobs.find(j => j.jobNumber === num);
        const isActuallyComplete = jobEntity?.isComplete || false;
        
        if (hideCompleted && isActuallyComplete) return false;
        return matchesSearch;
      })
      .sort((a, b) => b.localeCompare(a));
  }, [jobs, groupedTickets, jobSearch, hideCompleted]);

  const handleNoteSubmit = (jobNumber: string) => {
    if (!newNoteText.trim()) return;
    onAddNote({ jobNumber, text: newNoteText });
    setNewNoteText('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search Project Database..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 font-medium"
            value={jobSearch}
            onChange={e => setJobSearch(e.target.value)}
          />
          <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        
        <label className="flex items-center gap-3 cursor-pointer select-none px-4">
          <div className="relative">
            <input 
              type="checkbox" 
              className="sr-only" 
              checked={hideCompleted} 
              onChange={() => setHideCompleted(!hideCompleted)} 
            />
            <div className={`w-10 h-6 rounded-full transition-colors ${hideCompleted ? 'bg-orange-600' : 'bg-slate-200'}`}></div>
            <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${hideCompleted ? 'translate-x-4' : ''} shadow-sm`}></div>
          </div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hide Completed</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {allJobNumbers.map(jobNum => {
          const jobEntity = jobs.find(j => j.jobNumber === jobNum);
          const isComplete = jobEntity?.isComplete || false;
          const jobTickets = (groupedTickets[jobNum] || []);
          
          const hasUrgent = !isComplete && jobTickets.some(t => {
            const st = getTicketStatus(t);
            return st === TicketStatus.EXPIRED || st === TicketStatus.EXTENDABLE;
          });

          const jobNotes = notes.filter(n => n.jobNumber === jobNum);

          return (
            <div key={jobNum} className={`bg-white rounded-[2.5rem] shadow-sm border transition-all ${isComplete ? 'opacity-60 grayscale-[0.3]' : hasUrgent ? 'border-rose-300 ring-4 ring-rose-200/50' : 'border-slate-100'}`}>
              <div className="bg-slate-50/30 px-8 py-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-50">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-3">
                    <h3 className={`text-xl font-black tracking-tight leading-none ${isComplete ? 'text-slate-400 line-through' : 'text-slate-800'}`}>Job #{jobNum}</h3>
                    {isComplete ? (
                      <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border border-emerald-200">
                        Project Finalized
                      </span>
                    ) : hasUrgent && (
                      <div className="bg-rose-600 text-white p-1 rounded-full animate-bounce shadow-md shadow-rose-200">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      </div>
                    )}
                  </div>
                  {jobEntity ? (
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs font-black text-slate-600 uppercase tracking-wide">{jobEntity.customer}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{jobEntity.address}, {jobEntity.city}, {jobEntity.state}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] font-bold text-rose-400 uppercase tracking-widest italic">Unregistered Project Profile</p>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {isAdmin && jobEntity && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => onToggleComplete(jobEntity)}
                        title={isComplete ? "Mark as Active" : "Mark as Complete"}
                        className={`p-2.5 rounded-2xl border transition-all shadow-sm ${isComplete ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-300 hover:text-emerald-600 hover:border-emerald-100'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      </button>
                      <button 
                        onClick={() => onEditJob(jobEntity)}
                        className="p-2.5 bg-white text-slate-400 hover:text-orange-600 rounded-2xl border border-slate-100 shadow-sm transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={() => setShowNotesFor(showNotesFor === jobNum ? null : jobNum)}
                    className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-5 py-2.5 rounded-2xl border transition-all ${showNotesFor === jobNum ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 shadow-sm'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    Notes ({jobNotes.length})
                  </button>
                  <button 
                    onClick={() => onViewPhotos(jobNum)}
                    className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-2 px-5 py-2.5 bg-orange-50/50 hover:bg-orange-100 rounded-2xl transition-all border border-orange-100 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Gallery
                  </button>
                </div>
              </div>

              {showNotesFor === jobNum && (
                <div className="bg-slate-50/50 border-b border-slate-50 p-8 animate-in slide-in-from-top duration-500">
                  <div className="flex gap-3 mb-8">
                    <input 
                      type="text" 
                      placeholder="Add a field report or update..."
                      className="flex-1 px-5 py-3.5 bg-white border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 font-medium shadow-sm"
                      value={newNoteText}
                      onChange={e => setNewNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleNoteSubmit(jobNum)}
                    />
                    <button 
                      onClick={() => handleNoteSubmit(jobNum)}
                      className="bg-orange-600 text-white px-8 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-700 transition-all shadow-lg shadow-orange-100"
                    >
                      Post Note
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {jobNotes.map(note => (
                      <div key={note.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{note.author}</span>
                          <span className="text-[9px] font-bold text-slate-300">{new Date(note.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">{note.text}</p>
                      </div>
                    ))}
                    {jobNotes.length === 0 && (
                      <p className="col-span-full text-center py-6 text-xs font-bold text-slate-300 uppercase tracking-[0.2em]">No job notes available.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] bg-white">
                    <tr>
                      <th className="px-8 py-5">Ticket Number</th>
                      <th className="px-8 py-5">Live Status</th>
                      <th className="px-8 py-5">Specific Address</th>
                      <th className="px-8 py-5">Start</th>
                      <th className="px-8 py-5">Expiration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {jobTickets.map(t => {
                      const status = getTicketStatus(t);
                      const isUrgent = !isComplete && (status === TicketStatus.EXPIRED || status === TicketStatus.EXTENDABLE);
                      return (
                        <tr key={t.id} className={`hover:bg-slate-50/30 transition-colors ${isUrgent ? 'bg-rose-100/10' : ''}`}>
                          <td className="px-8 py-5 text-xs font-mono font-bold text-slate-400">{t.ticketNo}</td>
                          <td className="px-8 py-5">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest ${getStatusColor(status)}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${getStatusDotColor(status)}`}></span>
                              {status}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-xs font-bold text-slate-500 truncate max-w-[250px]">{t.address}</td>
                          <td className="px-8 py-5 text-[10px] font-bold text-slate-400">{new Date(t.digStart).toLocaleDateString()}</td>
                          <td className={`px-8 py-5 text-[10px] font-black ${isUrgent ? 'text-rose-700' : 'text-slate-400'}`}>
                            {new Date(t.expirationDate).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                    {jobTickets.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-10 text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                          No locate tickets attached to this project
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {allJobNumbers.length === 0 && (
          <div className="text-center py-40 bg-white rounded-[3rem] border-4 border-dashed border-slate-50">
            <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No Projects Found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobReview;