import React, { useState } from 'react';
import { DigTicket } from '../types.ts';
import { useModalDismiss } from '../utils/useModalDismiss.ts';

interface RefreshRequestFormProps {
  ticket: DigTicket;
  onSubmit: (utilities: string[], notes: string) => Promise<void>;
  onClose: () => void;
  isDarkMode?: boolean;
}

const UTILITIES = ['All', 'Power', 'Gas', 'Telecom', 'City/Village', 'Private'];

const RefreshRequestForm: React.FC<RefreshRequestFormProps> = ({ ticket, onSubmit, onClose, isDarkMode }) => {
  const backdropRef = useModalDismiss<HTMLDivElement>(onClose);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleUtility = (utility: string) => {
    setSelected(prev => {
      if (utility === 'All') {
        return prev.includes('All') ? [] : ['All'];
      }
      const withoutAll = prev.filter(u => u !== 'All');
      return withoutAll.includes(utility)
        ? withoutAll.filter(u => u !== utility)
        : [...withoutAll, utility];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(selected, notes);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[180] flex justify-center items-center p-4">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-amber-50/50">
          <div className="flex items-center gap-2">
            <div className="bg-amber-500 p-1.5 rounded-lg shadow-lg shadow-amber-500/20">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </div>
            <h2 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-amber-500' : 'text-amber-600'}`}>
              Request Refresh
            </h2>
          </div>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>Which utilities need a refresh? <span className="opacity-50">(optional)</span></p>

            <div className="space-y-2">
              {UTILITIES.map(u => {
                const isSelected = selected.includes(u);
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => toggleUtility(u)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                      isSelected
                        ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20'
                        : isDarkMode ? 'bg-white/5 border-white/5 text-slate-400 hover:border-white/10' : 'bg-slate-50 border-slate-300 text-slate-900 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded flex items-center justify-center border ${isSelected ? 'bg-white border-white' : 'bg-transparent border-current opacity-30'}`}>
                        {isSelected && <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                      </div>
                      {u}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>Notes <span className="opacity-50">(optional)</span></p>
            <textarea
              rows={3}
              placeholder="Add any details for the admin (why a refresh is needed, contacts, etc.)..."
              className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-amber-500/10 transition-all resize-none ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-600' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500'}`}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-500 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-amber-500/20 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {isSubmitting ? 'Sending Request...' : 'Send Refresh Request'}
            </button>
            <div className="flex justify-between items-center mt-6 opacity-40">
              <span className={`text-[8px] font-black uppercase tracking-tighter ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>ID: {ticket.ticketNo}</span>
              <span className={`text-[8px] font-black uppercase tracking-tighter ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>JOB: {ticket.jobNumber}</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RefreshRequestForm;
