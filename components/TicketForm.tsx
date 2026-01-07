
import React, { useState, useEffect } from 'react';
import { DigTicket, UserRecord } from '../types.ts';
import { parseTicketData } from '../services/geminiService.ts';

interface TicketFormProps {
  onAdd: (ticket: Omit<DigTicket, 'id' | 'createdAt'>, archiveOld: boolean) => Promise<void>;
  onClose: () => void;
  initialData?: DigTicket;
  users: UserRecord[];
  isDarkMode?: boolean;
}

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users = [], isDarkMode }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'batch' | 'pdf'>('manual');
  const [archiveOld, setArchiveOld] = useState(false);
  const [formData, setFormData] = useState({
    jobNumber: '', ticketNo: '', address: '', county: '', city: '', state: '',
    callInDate: '', digStart: '', expirationDate: '', siteContact: '',
  });

  const [batchInput, setBatchInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        jobNumber: initialData.jobNumber || '',
        ticketNo: initialData.ticketNo || '',
        address: initialData.address || '',
        county: initialData.county || '',
        city: initialData.city || '',
        state: initialData.state || '',
        callInDate: initialData.callInDate || '',
        digStart: initialData.digStart || '',
        expirationDate: initialData.expirationDate || '',
        siteContact: initialData.siteContact || '',
      });
      // Default archiveOld to true if editing, since most date changes are refreshes
      setArchiveOld(true);
    }
  }, [initialData]);

  const handleAiParse = async () => {
    if (!batchInput.trim()) return;
    setIsParsing(true);
    try {
      const parsed = await parseTicketData(batchInput);
      setFormData(prev => ({ ...prev, ...parsed }));
      setActiveTab('manual');
    } catch (err: any) {
      alert("AI Analysis failed. Please check the format.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData, archiveOld);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[150] flex justify-center items-center p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border animate-in ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-black/5">
          <h2 className="text-sm font-black uppercase tracking-widest">
            {initialData ? 'Update Ticket' : 'Import Ticket'}
          </h2>
          <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!initialData && (
          <div className="flex p-1.5 gap-1 bg-black/5 mx-6 mt-4 rounded-xl">
            {['manual', 'batch', 'pdf'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab ? 'bg-brand text-slate-900 shadow-sm' : 'text-slate-500'}`}>{tab}</button>
            ))}
          </div>
        )}

        <div className="p-6">
          {activeTab === 'manual' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Job #</label>
                  <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Ticket #</label>
                  <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold font-mono outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Address / Location</label>
                <input required className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Start Date</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.digStart} onChange={e => setFormData({...formData, digStart: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Expiration</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.expirationDate} onChange={e => setFormData({...formData, expirationDate: e.target.value})} />
                </div>
              </div>

              {initialData && (
                <div className="flex items-center gap-2 p-3 bg-black/5 rounded-xl border border-white/5">
                  <input
                    type="checkbox"
                    id="archiveOld"
                    className="w-4 h-4 rounded text-brand focus:ring-brand/20"
                    checked={archiveOld}
                    onChange={e => setArchiveOld(e.target.checked)}
                  />
                  <label htmlFor="archiveOld" className="text-[10px] font-black uppercase text-slate-400 cursor-pointer">
                    Keep previous version as history
                  </label>
                </div>
              )}

              <button type="submit" className="w-full bg-brand text-[#0f172a] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 mt-2 transition-all hover:scale-[1.01]">Save Ticket</button>
            </form>
          ) : (
            <div className="space-y-4">
              <textarea rows={8} className={`w-full px-4 py-3 border rounded-xl text-xs font-semibold outline-none focus:ring-4 focus:ring-brand/10 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'}`} placeholder="Paste ticket text here for AI extraction..." value={batchInput} onChange={e => setBatchInput(e.target.value)} />
              <button onClick={handleAiParse} disabled={isParsing || !batchInput.trim()} className="w-full bg-brand text-[#0f172a] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand/10 flex items-center justify-center gap-2">
                {isParsing ? <div className="w-3 h-3 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" /> : 'Run AI Analysis'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketForm;
