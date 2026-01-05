
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DigTicket, UserRecord } from '../types.ts';
import { parseTicketData } from '../services/geminiService.ts';

interface TicketFormProps {
  onAdd: (ticket: Omit<DigTicket, 'id' | 'createdAt'>) => Promise<void>;
  onClose: () => void;
  initialData?: DigTicket;
  users: UserRecord[];
  isDarkMode?: boolean;
}

const TicketForm: React.FC<TicketFormProps> = ({ onAdd, onClose, initialData, users = [], isDarkMode }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'batch' | 'pdf'>('manual');
  const [formData, setFormData] = useState({
    jobNumber: '',
    ticketNo: '',
    address: '',
    county: '',
    city: '',
    state: '',
    callInDate: '',
    digStart: '',
    expirationDate: '',
    siteContact: '',
  });

  const [batchInput, setBatchInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [pdfQueue, setPdfQueue] = useState<{file: File, status: 'pending' | 'processing' | 'success' | 'error', message?: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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
    }
  }, [initialData]);

  const crewSuggestions = useMemo(() => {
    const query = (formData.siteContact || '').toLowerCase().trim();
    if (!query || query.length < 1) return [];
    
    return (users || []).filter(u => {
      if (!u) return false;
      const name = (u.name || '').toLowerCase();
      const email = (u.username || '').toLowerCase();
      return name.includes(query) || email.includes(query);
    }).slice(0, 5);
  }, [formData.siteContact, users]);

  const handleAiParse = async () => {
    if (!batchInput.trim()) return;
    setIsParsing(true);
    try {
      const parsed = await parseTicketData(batchInput);
      setFormData(prev => ({
        ...prev,
        ...parsed,
        callInDate: parsed.callInDate ? new Date(parsed.callInDate).toISOString().split('T')[0] : prev.callInDate,
        digStart: parsed.digStart ? new Date(parsed.digStart).toISOString().split('T')[0] : prev.digStart,
        expirationDate: parsed.expirationDate ? new Date(parsed.expirationDate).toISOString().split('T')[0] : prev.expirationDate,
      }));
      setActiveTab('manual');
    } catch (err: any) {
      alert(`AI Parsing failed: ${err.message || 'Check your ticket text format.'}`);
    } finally {
      setIsParsing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const processPdfQueue = async () => {
    if (isParsing) return;
    setIsParsing(true);

    const updatedQueue = [...pdfQueue];
    
    for (let i = 0; i < updatedQueue.length; i++) {
      if (updatedQueue[i].status !== 'pending') continue;

      try {
        updatedQueue[i].status = 'processing';
        setPdfQueue([...updatedQueue]);

        const base64 = await fileToBase64(updatedQueue[i].file);
        const parsed = await parseTicketData({ data: base64, mimeType: 'application/pdf' });
        
        // Auto-save the parsed ticket
        await onAdd({
          jobNumber: parsed.jobNumber || 'BULK-PDF',
          ticketNo: parsed.ticketNo || 'UNKNOWN',
          address: parsed.address || 'Address not found',
          county: parsed.county || '',
          city: parsed.city || '',
          state: parsed.state || '',
          callInDate: parsed.callInDate ? new Date(parsed.callInDate).toISOString().split('T')[0] : '',
          digStart: parsed.digStart ? new Date(parsed.digStart).toISOString().split('T')[0] : '',
          expirationDate: parsed.expirationDate ? new Date(parsed.expirationDate).toISOString().split('T')[0] : '',
          siteContact: parsed.siteContact || '',
        });

        updatedQueue[i].status = 'success';
      } catch (err: any) {
        updatedQueue[i].status = 'error';
        updatedQueue[i].message = err.message;
      }
      setPdfQueue([...updatedQueue]);
    }
    setIsParsing(false);
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newItems = files.map(f => ({ file: f, status: 'pending' as const }));
    setPdfQueue(prev => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[150] overflow-y-auto pt-6 pb-20 px-4 flex justify-center items-start">
      <div className={`w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
        <div className={`p-8 border-b flex justify-between items-center ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
          <div>
            <h2 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {initialData ? 'Update Ticket' : 'Import Dig Tickets'}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">Locate Management System</p>
          </div>
          <button onClick={onClose} className={`p-3 rounded-full shadow-sm transition-all border ${isDarkMode ? 'bg-white/5 text-slate-400 hover:text-white border-white/5' : 'bg-white text-slate-400 hover:text-rose-500 border-slate-200'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!initialData && (
          <div className="flex p-2 gap-2 bg-slate-500/5 mx-8 mt-6 rounded-2xl">
            <button onClick={() => setActiveTab('manual')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'manual' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500'}`}>Manual</button>
            <button onClick={() => setActiveTab('batch')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'batch' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500'}`}>Text AI</button>
            <button onClick={() => setActiveTab('pdf')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'pdf' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500'}`}>Bulk PDF</button>
          </div>
        )}

        <div className="p-8">
          {activeTab === 'pdf' ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className={`p-10 border-2 border-dashed rounded-[2rem] text-center transition-all ${isDarkMode ? 'border-white/10 bg-black/10' : 'border-slate-200 bg-slate-50'}`}>
                <input type="file" multiple accept=".pdf" className="hidden" id="pdf-bulk" onChange={handlePdfSelect} />
                <label htmlFor="pdf-bulk" className="cursor-pointer block">
                  <svg className="w-12 h-12 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  <p className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Select Multiple PDF Tickets</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-2">AI will automatically extract details and save to cloud</p>
                </label>
              </div>

              {pdfQueue.length > 0 && (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 no-scrollbar">
                  {pdfQueue.map((item, idx) => (
                    <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl border ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${item.status === 'success' ? 'bg-emerald-100 text-emerald-600' : item.status === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                          {item.status === 'processing' ? <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /> : (idx + 1)}
                        </div>
                        <span className={`text-[11px] font-bold truncate max-w-[200px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{item.file.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                         {item.status === 'success' && <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Imported</span>}
                         {item.status === 'error' && <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest" title={item.message}>Failed</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pdfQueue.some(i => i.status === 'pending') && (
                <button onClick={processPdfQueue} disabled={isParsing} className="w-full bg-brand text-[#0f172a] py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand/20">
                  {isParsing ? 'Processing Batch...' : 'Start Batch Import'}
                </button>
              )}
            </div>
          ) : activeTab === 'batch' ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              <textarea rows={10} className={`w-full px-5 py-4 border rounded-[1.5rem] text-sm font-semibold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white placeholder:text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-950 placeholder:text-slate-400'}`} placeholder="Paste ticket text here..." value={batchInput} onChange={e => setBatchInput(e.target.value)} />
              <button onClick={handleAiParse} disabled={isParsing || !batchInput.trim()} className="w-full bg-brand text-[#0f172a] py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand/20 flex items-center justify-center gap-3">
                {isParsing ? <div className="w-4 h-4 border-2 border-[#0f172a] border-t-transparent rounded-full animate-spin" /> : 'Extract Ticket Details'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Job Number</label>
                  <input required className={`w-full px-5 py-4 border rounded-xl text-sm font-black outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.jobNumber} onChange={e => setFormData({...formData, jobNumber: e.target.value})} placeholder="e.g. 25-001" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Ticket Number</label>
                  <input required className={`w-full px-5 py-4 border rounded-xl text-sm font-black font-mono outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.ticketNo} onChange={e => setFormData({...formData, ticketNo: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Address / Site</label>
                <input required className={`w-full px-5 py-4 border rounded-xl text-sm font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Call Date</label>
                  <input type="date" className={`w-full px-4 py-4 border rounded-xl text-xs font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.callInDate} onChange={e => setFormData({...formData, callInDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Dig Start</label>
                  <input type="date" className={`w-full px-4 py-4 border rounded-xl text-xs font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.digStart} onChange={e => setFormData({...formData, digStart: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Expiration</label>
                  <input type="date" className={`w-full px-4 py-4 border rounded-xl text-xs font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.expirationDate} onChange={e => setFormData({...formData, expirationDate: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2 relative" ref={suggestionsRef}>
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-slate-500">Site Contact</label>
                <input autoComplete="off" className={`w-full px-5 py-4 border rounded-xl text-sm font-bold outline-none ${isDarkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={formData.siteContact} onFocus={() => setShowSuggestions(true)} onChange={e => setFormData({...formData, siteContact: e.target.value})} />
                {showSuggestions && crewSuggestions.length > 0 && (
                  <div className={`absolute bottom-full left-0 right-0 mb-2 rounded-2xl shadow-2xl border overflow-hidden z-[100] ${isDarkMode ? 'bg-[#1e293b] border-white/10' : 'bg-white border-slate-200'}`}>
                    {crewSuggestions.map(user => (
                      <button key={user.id} type="button" onClick={() => { setFormData({...formData, siteContact: user.name}); setShowSuggestions(false); }} className={`w-full px-5 py-3 text-left text-sm font-bold flex items-center gap-3 ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-slate-50 text-slate-900'}`}>
                        {user.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="pt-6 flex flex-col sm:flex-row gap-4">
                <button type="submit" className="flex-1 bg-brand text-[#0f172a] py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand/20">Save Record</button>
                <button type="button" onClick={onClose} className="px-8 py-5 border border-slate-200 text-slate-600 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest">Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default TicketForm;
