
import React, { useState, useEffect } from 'react';
import { Job, JobPrint } from '../types.ts';
import { apiService } from '../services/apiService.ts';

interface JobSummaryModalProps {
  job: Job;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => Promise<void>;
  onViewMedia: () => void;
  onViewMarkup: () => void;
  isDarkMode?: boolean;
}

export const JobSummaryModal: React.FC<JobSummaryModalProps> = ({
  job,
  onClose,
  onEdit,
  onDelete,
  onToggleComplete,
  onViewMedia,
  onViewMarkup,
  isDarkMode
}) => {
  const [pinnedPrint, setPinnedPrint] = useState<JobPrint | null>(null);

  const isPdf = (url?: string) => url?.toLowerCase().split('?')[0].endsWith('.pdf');

  useEffect(() => {
    apiService.getJobPrints(job.jobNumber).then(prints => {
      setPinnedPrint(prints.find(p => p.isPinned) || null);
    });
  }, [job.jobNumber]);

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
              <p className={`text-base font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{job.customer}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Base Location</label>
                <p className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-950'}`}>{job.address}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Jurisdiction</label>
                <p className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-950'}`}>{job.city}, {job.state}</p>
              </div>
            </div>
          </div>

          {/* Blueprint Pinned Preview */}
          <div className={`p-5 rounded-[2rem] border relative group overflow-hidden ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Project Blueprint</p>
            {pinnedPrint ? (
              <div className="relative aspect-video rounded-xl overflow-hidden border border-black/10 bg-slate-900 flex items-center justify-center">
                {isPdf(pinnedPrint.url) ? (
                  <div className="flex flex-col items-center gap-2 text-rose-500">
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6.363zM12 2H5c-1.103 0-2 .897-2 2v16c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2V9l-7-7z"/><path d="M19 9h-7V2l7 7z"/></svg>
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-60">PDF Blueprint</span>
                  </div>
                ) : (
                  <img src={pinnedPrint.url} className="w-full h-full object-cover" alt="Blueprint" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <button onClick={onViewMarkup} className="px-6 py-2 bg-brand text-slate-900 rounded-full font-black text-[9px] uppercase tracking-widest transform translate-y-2 group-hover:translate-y-0 transition-all">Launch Markup</button>
                </div>
              </div>
            ) : (
              <button 
                onClick={onViewMarkup}
                className="w-full aspect-video rounded-xl border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-2 hover:border-brand/40 hover:bg-brand/5 transition-all"
              >
                <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Add Blueprint</span>
              </button>
            )}
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
          </div>
        </div>
      </div>
    </div>
  );
};
