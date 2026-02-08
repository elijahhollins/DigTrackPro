
import React, { useState, useEffect } from 'react';
import { DigTicket, NoShowRecord } from '../types.ts';
import { apiService } from '../services/apiService.ts';

interface NoShowFormProps {
  ticket: DigTicket;
  userName: string;
  onSave: (record: NoShowRecord) => Promise<void>;
  onDelete?: () => Promise<boolean>;
  onClose: () => void;
  isDarkMode?: boolean;
}

const UTILITIES = ['All', 'Power', 'Gas', 'Telecom', 'City/Village', 'Private'];

const NoShowForm: React.FC<NoShowFormProps> = ({ ticket, userName, onSave, onDelete, onClose, isDarkMode }) => {
  // Store selections as an object where key is utility and value is company name
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [existingRecord, setExistingRecord] = useState<NoShowRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const fetchExisting = async () => {
      if (!ticket.noShowRequested) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fixed: apiService.getNoShows now exists
        const all = await apiService.getNoShows();
        if (!isMounted) return;
        
        const match = all.find(r => r.ticketId === ticket.id);
        if (match) {
          setExistingRecord(match);
        }
      } catch (err) {
        console.error("Failed to load existing no-show record", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchExisting();

    return () => {
      isMounted = false;
    };
  }, [ticket.id, ticket.noShowRequested]);

  const toggleUtility = (utility: string) => {
    setSelections(prev => {
      const newSelections = { ...prev };
      if (utility === 'All') {
        // If "All" is already there, remove it. If not, set ONLY "All".
        return prev['All'] !== undefined ? {} : { 'All': '' };
      } else {
        // Remove "All" if selecting a specific utility
        delete newSelections['All'];
        
        if (newSelections[utility] !== undefined) {
          delete newSelections[utility];
        } else {
          newSelections[utility] = ''; // Initialize with empty company
        }
        return newSelections;
      }
    });
  };

  const updateCompany = (utility: string, value: string) => {
    setSelections(prev => ({
      ...prev,
      [utility]: value
    }));
  };

  const hasSelections = Object.keys(selections).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSelections) return;

    setIsSubmitting(true);
    try {
      const selectedKeys = Object.keys(selections);
      
      // Format the company info into a single string for storage
      const companiesInfo = selectedKeys
        .filter(k => k !== 'All' && selections[k].trim() !== '')
        .map(k => `${k}: ${selections[k].trim()}`)
        .join(', ');

      // Fixed: handleSubmit now includes companyId in NoShowRecord to satisfy type requirement
      const record: NoShowRecord = {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        companyId: ticket.companyId,
        jobNumber: ticket.jobNumber,
        utilities: selectedKeys,
        companies: companiesInfo,
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

  const handleClearNoShow = async () => {
    if (!onDelete) return;
    
    // Explicit confirmation as requested by user
    if (!window.confirm(`Clear the No Show alert for Ticket #${ticket.ticketNo}? This incident will be resolved and archived.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      // Calling onDelete (handleRemoveNoShow in App.tsx)
      const success = await onDelete();
      if (success) {
        onClose();
      }
    } catch (err: any) {
      alert("Error clearing no-show: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[180] flex justify-center items-center p-4">
        <div className={`w-full max-w-md p-10 rounded-2xl flex flex-col items-center justify-center ${isDarkMode ? 'bg-[#1e293b]' : 'bg-white'}`}>
           <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
           <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Retrieving Log...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[180] flex justify-center items-center p-4">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-rose-50/50">
          <div className="flex items-center gap-2">
            <div className="bg-rose-500 p-1.5 rounded-lg shadow-lg shadow-rose-500/20">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </div>
            <h2 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-rose-500' : 'text-rose-600'}`}>
              {existingRecord ? 'Manage No Show' : 'Call No Shows'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {existingRecord ? (
          <div className="p-6 space-y-6">
            <div className="space-y-4">
               <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? 'bg-rose-500/5 border-rose-500/10' : 'bg-rose-50 border-rose-100'}`}>
                  <div className="flex items-center justify-between">
                     <p className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-rose-500' : 'text-rose-700'}`}>Active Incident Log</p>
                     <span className={`text-[9px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-900'}`}>{new Date(existingRecord.timestamp).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="space-y-1">
                    <p className={`text-[9px] font-black uppercase tracking-tight ${isDarkMode ? 'text-slate-400' : 'text-slate-900'}`}>Reported Utilities</p>
                    <div className="flex flex-wrap gap-1.5">
                      {existingRecord.utilities.map(u => (
                        <span key={u} className="px-2 py-0.5 bg-rose-500 text-white rounded text-[9px] font-black uppercase tracking-tighter shadow-sm">{u}</span>
                      ))}
                    </div>
                  </div>

                  {existingRecord.companies && (
                    <div className="space-y-1 pt-1">
                      <p className={`text-[9px] font-black uppercase tracking-tight ${isDarkMode ? 'text-slate-400' : 'text-slate-900'}`}>Contractor Info</p>
                      <p className={`text-[11px] font-bold italic ${isDarkMode ? 'text-slate-300' : 'text-slate-900'}`}>"{existingRecord.companies}"</p>
                    </div>
                  )}

                  <div className={`pt-2 border-t flex items-center justify-between ${isDarkMode ? 'border-rose-500/10' : 'border-rose-200'}`}>
                     <p className={`text-[9px] font-bold uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>Logged By: <span className="font-black text-rose-600">{existingRecord.author}</span></p>
                  </div>
               </div>
            </div>

            <div className="space-y-3">
               <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleClearNoShow}
                  className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-[0.98] hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Clearing...
                    </>
                  ) : 'Clear No Show Alert'}
                </button>
                <p className={`text-[9px] font-bold uppercase tracking-tighter text-center px-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>Clicking clear will resolve the status and archive this specific incident log from the vault.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>Which utilities are not marked?</p>
              
              <div className="space-y-2">
                {UTILITIES.map(u => {
                  const isSelected = selections[u] !== undefined;
                  return (
                    <div key={u} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleUtility(u)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                          isSelected
                            ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20'
                            : isDarkMode ? 'bg-white/5 border-white/5 text-slate-400 hover:border-white/10' : 'bg-slate-50 border-slate-300 text-slate-900 hover:border-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded flex items-center justify-center border ${isSelected ? 'bg-white border-white' : 'bg-transparent border-current opacity-30'}`}>
                            {isSelected && <svg className="w-2.5 h-2.5 text-rose-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                          </div>
                          {u}
                        </div>
                        {isSelected && u !== 'All' && <span className="text-[8px] opacity-70">Define Owner below</span>}
                      </button>
                      
                      {isSelected && u !== 'All' && (
                        <div className="px-1 animate-in">
                          <input
                            autoFocus
                            type="text"
                            placeholder={`Enter ${u} Company Name...`}
                            className={`w-full px-4 py-2.5 border rounded-xl text-[11px] font-bold outline-none focus:ring-4 focus:ring-rose-500/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-600' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500'}`}
                            value={selections[u]}
                            onChange={e => updateCompany(u, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !hasSelections}
                className="w-full bg-rose-500 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-500/20 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {isSubmitting ? 'Processing Event...' : 'Log No Show Event'}
              </button>
              <div className="flex justify-between items-center mt-6 opacity-40">
                  <span className={`text-[8px] font-black uppercase tracking-tighter ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>ID: {ticket.ticketNo}</span>
                  <span className={`text-[8px] font-black uppercase tracking-tighter ${isDarkMode ? 'text-slate-400' : 'text-slate-950'}`}>JOB: {ticket.jobNumber}</span>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default NoShowForm;
