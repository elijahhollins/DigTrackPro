
import React, { useState } from 'react';
import { DigTicket, NoShowRecord } from '../types.ts';

interface NoShowFormProps {
  ticket: DigTicket;
  userName: string;
  onSave: (record: NoShowRecord) => Promise<void>;
  onClose: () => void;
  isDarkMode?: boolean;
}

const UTILITIES = ['All', 'Power', 'Gas', 'Telecom', 'City/Village', 'Private'];

const NoShowForm: React.FC<NoShowFormProps> = ({ ticket, userName, onSave, onClose, isDarkMode }) => {
  const [selectedUtilities, setSelectedUtilities] = useState<string[]>([]);
  const [companies, setCompanies] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleUtility = (utility: string) => {
    setSelectedUtilities(prev => {
      if (utility === 'All') {
        // If selecting All, clear others
        return prev.includes('All') ? [] : ['All'];
      } else {
        // If selecting specific, remove All
        const filtered = prev.filter(u => u !== 'All');
        return filtered.includes(utility) 
          ? filtered.filter(u => u !== utility) 
          : [...filtered, utility];
      }
    });
  };

  // Show company input if selection is not empty AND (selection is more than 1 item OR selection doesn't include All)
  const showCompanyInput = selectedUtilities.length > 0 && !selectedUtilities.includes('All');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUtilities.length === 0) return;

    setIsSubmitting(true);
    try {
      const record: NoShowRecord = {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        jobNumber: ticket.jobNumber,
        utilities: selectedUtilities,
        companies: showCompanyInput ? companies : '',
        author: userName,
        timestamp: Date.now(),
      };
      await onSave(record);
      onClose();
    } catch (err: any) {
      alert("Error saving no-show record: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[180] flex justify-center items-center p-4">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-rose-500/5">
          <div className="flex items-center gap-2">
            <div className="bg-rose-500 p-1.5 rounded-lg">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </div>
            <h2 className="text-sm font-black uppercase tracking-widest text-rose-500">Call No Shows</h2>
          </div>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Which utilities are not marked?</p>
            <div className="grid grid-cols-2 gap-2">
              {UTILITIES.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => toggleUtility(u)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    selectedUtilities.includes(u)
                      ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20'
                      : isDarkMode ? 'bg-white/5 border-white/5 text-slate-400 hover:border-white/10' : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  <div className={`w-3 h-3 rounded flex items-center justify-center border ${selectedUtilities.includes(u) ? 'bg-white border-white' : 'bg-transparent border-current opacity-30'}`}>
                    {selectedUtilities.includes(u) && <svg className="w-2 h-2 text-rose-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                  </div>
                  {u}
                </button>
              ))}
            </div>
          </div>

          {showCompanyInput && (
            <div className="space-y-2 animate-in">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Which company?</label>
              <input
                required
                type="text"
                placeholder="Enter utility names..."
                className={`w-full px-4 py-3 border rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-rose-500/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`}
                value={companies}
                onChange={e => setCompanies(e.target.value)}
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || selectedUtilities.length === 0}
              className="w-full bg-rose-500 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-500/20 disabled:opacity-50 transition-all active:scale-95"
            >
              {isSubmitting ? 'Logging...' : 'Log No Show Event'}
            </button>
            <p className="text-center text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-4 opacity-50">Log ID: {ticket.ticketNo} / {ticket.jobNumber}</p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NoShowForm;
