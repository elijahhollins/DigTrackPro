
import React from 'react';
import { Job, DigTicket, TicketStatus } from '../types.ts';
import { getTicketStatus } from '../utils/dateUtils.ts';

interface JobSummaryModalProps {
  job: Job;
  tickets: DigTicket[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => Promise<void>;
  onViewMedia: () => void;
  isDarkMode?: boolean;
}

export const JobSummaryModal: React.FC<JobSummaryModalProps> = ({
  job,
  tickets,
  onClose,
  onEdit,
  onDelete,
  onToggleComplete,
  onViewMedia,
  isDarkMode
}) => {
  const activeTickets = tickets.filter(t => !t.isArchived);
  const expiredCount = activeTickets.filter(t => getTicketStatus(t) === TicketStatus.EXPIRED).length;
  const validCount = activeTickets.length - expiredCount;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[170] overflow-y-auto pt-10 pb-20 px-4">
      <div className={`w-full max-w-md mx-auto rounded-[2.5rem] shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        {/* Header Section */}
        <div className="px-8 py-6 border-b flex justify-between items-center bg-black/5">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-brand">Project Brief</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Job #{job.jobNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Main Info Card */}
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Customer / Entity</label>
              <p className={`text-base font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{job.customer}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Base Location</label>
                <p className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{job.address}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Jurisdiction</label>
                <p className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{job.city}, {job.state}</p>
              </div>
            </div>
          </div>

          {/* Asset Health Bar */}
          <div className={`p-5 rounded-[2rem] border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
             <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Vault Asset Health</p>
             <div className="flex gap-4">
               <div className="flex-1">
                 <div className="text-xl font-black text-emerald-500">{validCount}</div>
                 <div className="text-[8px] font-black uppercase tracking-widest opacity-40">Valid Assets</div>
               </div>
               <div className="w-px h-8 bg-black/10 self-center" />
               <div className="flex-1">
                 <div className="text-xl font-black text-rose-500">{expiredCount}</div>
                 <div className="text-[8px] font-black uppercase tracking-widest opacity-40">Expired Logs</div>
               </div>
             </div>
          </div>

          {/* Action Grid */}
          <div className="grid grid-cols-2 gap-3">
             <button 
              onClick={onEdit}
              className={`flex flex-col items-center justify-center p-4 rounded-3xl border transition-all hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-slate-200 hover:border-brand/40 shadow-sm'}`}
             >
               <svg className="w-5 h-5 mb-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
               <span className="text-[9px] font-black uppercase tracking-widest">Edit Details</span>
             </button>
             <button 
              onClick={onViewMedia}
              className={`flex flex-col items-center justify-center p-4 rounded-3xl border transition-all hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-slate-200 hover:border-brand/40 shadow-sm'}`}
             >
               <svg className="w-5 h-5 mb-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               <span className="text-[9px] font-black uppercase tracking-widest">Job Media</span>
             </button>
             <button 
              onClick={onDelete}
              className={`col-span-2 flex items-center justify-center gap-3 p-4 rounded-3xl border transition-all hover:scale-105 active:scale-95 ${isDarkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white' : 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white shadow-sm'}`}
             >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
               <span className="text-[9px] font-black uppercase tracking-widest">Delete Project Folder</span>
             </button>
          </div>

          {/* Critical Toggle */}
          <div className="pt-4 border-t border-black/5">
            <button 
              onClick={onToggleComplete}
              className={`w-full py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl flex items-center justify-center gap-3 ${
                job.isComplete 
                  ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                  : isDarkMode ? 'bg-white text-slate-950 shadow-white/10' : 'bg-slate-900 text-white shadow-slate-900/20'
              }`}
            >
              {job.isComplete ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  Re-Open Project
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Mark Job Complete
                </>
              )}
            </button>
            <p className="text-[8px] font-bold text-slate-500 text-center uppercase tracking-widest mt-4 leading-relaxed">
              {job.isComplete 
                ? 'Project is archived. Assets hidden from main dashboard.' 
                : 'Project is active. All associated assets tracked in real-time.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
